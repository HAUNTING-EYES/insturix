/**
 * POST /api/services/editron/media/upload
 *
 * Registers a media asset that has been uploaded directly to GCS.
 * The client first obtains a signed URL via /upload/url, uploads the file
 * to GCS directly, then calls this endpoint to persist the asset metadata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fileExists } from '@/lib/editron/services/gcs-service';
import { getDatabase, COLLECTIONS } from '@/lib/editron/db/mongodb';
import { auth } from '@clerk/nextjs/server';
import type { MediaAsset } from '@/lib/editron/services/asset-resolver';
import { checkCredits, type CreditCheckResult } from '@/lib/services/creditsMiddleware';
import { persistMediaUploadBatchAsset } from '@/lib/editron/services/media-upload-batch';
import {
  NativeVideoAudioRightsError,
  buildNativeVideoAudioRights,
} from '@/lib/editron/services/native-video-audio-rights';
import type { AudioRightsContract } from '@/lib/editron/shared/render-request-payload';
import { createMediaSourceQualificationV1 } from '@/lib/editron/services/media-source-qualification-v1';
import { dispatchMediaSourceQualificationV1 } from '@/lib/editron/services/media-source-qualification-runtime-v1';

export const runtime = 'nodejs';

type ThumbnailStorageFields = {
  thumbnailSize?: number;
  thumbnailR2Key?: string;
  thumbnailGcsPath?: string;
  thumbnailUrlExpiresAt?: Date;
};

type StoredThumbnail = {
  url: string;
  size: number;
  r2Key: string | null;
  gcsPath: string | null;
  urlExpiresAt: Date | null;
};

export async function POST(request: NextRequest) {
  let analysisCreditCheck: CreditCheckResult | null = null;
  let analysisQueued = false;
  let analysisCreditTransactionId: string | undefined;
  let analysisChargedCredits: number | undefined;
  let uploadedThumbnail: StoredThumbnail | null = null;
  let mediaAssetInserted = false;

  try {
    // Hard limit at 3GB to prevent abuse (user footage can be large)
    // Files >100MB cost extra credits (handled by billing, not blocked here)
    const contentLength = parseInt(request.headers.get('content-length') || '0');
    if (contentLength > 3 * 1024 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 3GB.' }, { status: 413 });
    }

    const { userId, orgId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      assetId,
      gcsPath,
      readUrl,
      readUrlExpiresAt,
      filename,
      contentType,
      size,
      type,
      projectId,
      thumbnail,
      duration,
      dimensions,
      isProxy,
      uploadBatchId,
      uploadBatchIntake,
      sourceMediaRightsAttestation,
    } = body;

    // Validate required fields — gcsPath is optional (R2 uploads don't have one)
    if (!assetId || !readUrl || !filename || !contentType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: assetId, readUrl, filename, contentType' },
        { status: 400 }
      );
    }
    if (typeof assetId !== 'string' || !/^[A-Za-z0-9_-]{3,200}$/.test(assetId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid assetId' },
        { status: 400 },
      );
    }

    // Verify file exists in storage (GCS or R2)
    let exists = false;
    if (gcsPath) {
      exists = await fileExists(gcsPath);
    } else {
      // R2 upload — verify via HEAD request to CDN URL
      try {
        const headRes = await fetch(readUrl, { method: 'HEAD' });
        exists = headRes.ok;
      } catch (err: unknown) {
        console.warn('[Upload] HEAD check failed, assuming exists:', err instanceof Error ? err.message : err);
        exists = true; // Assume exists if HEAD fails (CDN might not support HEAD)
      }
    }
    if (!exists) {
      return NextResponse.json(
        { success: false, error: 'File not found in storage. Please upload the file first.' },
        { status: 404 }
      );
    }

    // ── Server-side object-size enforcement (presigned uploads carry no size cap) ──
    // The signed URL from /upload/url can PUT any size straight to storage, so the real 3GB cap
    // is enforced HERE against the ACTUAL object — not the client-declared `size`.
    let actualSize: number | null = null;
    try {
      if (gcsPath) {
        const { getGcsObjectSize } = await import('@/lib/editron/services/gcs-service');
        actualSize = await getGcsObjectSize(gcsPath);
      } else {
        const { getR2ObjectSize } = await import('@/lib/editron/services/r2-service');
        actualSize = await getR2ObjectSize(assetId);
      }
    } catch (sizeErr: unknown) {
      // Fail open: a transient storage error must not block a legitimate upload.
      console.warn('[Upload] object-size check failed (non-fatal):', sizeErr instanceof Error ? sizeErr.message : sizeErr);
    }
    const { exceedsPresignedUploadCap, MAX_PRESIGNED_UPLOAD_BYTES } = await import('@/lib/editron/services/upload-size-guard');
    if (exceedsPresignedUploadCap(actualSize)) {
      // Delete the oversized object so the bypass can't consume storage/quota.
      try {
        if (gcsPath) {
          const { deleteFromGCS } = await import('@/lib/editron/services/gcs-service');
          await deleteFromGCS(gcsPath);
        } else {
          const { deleteFromR2 } = await import('@/lib/editron/services/r2-service');
          await deleteFromR2(assetId);
        }
      } catch (delErr: unknown) {
        console.error('[Upload] failed to delete oversized object:', delErr instanceof Error ? delErr.message : delErr);
      }
      const maxGb = Math.round(MAX_PRESIGNED_UPLOAD_BYTES / (1024 * 1024 * 1024));
      return NextResponse.json(
        { success: false, error: `File exceeds the ${maxGb}GB upload limit.`, code: 'file_too_large' },
        { status: 413 }
      );
    }

    const db = await getDatabase();
    const completedMultipartUpload = await db.collection(COLLECTIONS.MEDIA_UPLOADS).findOne({
      assetId,
      userId,
      status: 'completed',
      storageUsageRecordedAt: { $exists: true },
    });
    const storageAlreadyRecorded = Boolean(completedMultipartUpload);
    const storedSizeBytes = actualSize ?? (typeof size === 'number' ? size : Number(size) || 0);
    let normalizedThumbnail = await normalizeThumbnailDataUrl(thumbnail);

    if (!storageAlreadyRecorded && storedSizeBytes > 0) {
      const { reserveStorageForUpload } = await import('@/lib/services/storage-reserve-service');
      const { formatStorageBytes } = await import('@/lib/services/storage-quota-service');
      // Over cap → LRU-evict non-protected assets (or allow paid overage if the
      // owner enabled it). Only blocks when everything left is protected/in-use.
      const reservation = await reserveStorageForUpload(userId, orgId, storedSizeBytes);
      if (!reservation.allowed) {
        try {
          await deleteUploadedObject(gcsPath, assetId);
        } catch (delErr: unknown) {
          console.error('[Upload] failed to delete over-quota object:', delErr instanceof Error ? delErr.message : delErr);
        }

        return NextResponse.json(
          {
            success: false,
            error: `Storage full (${formatStorageBytes(reservation.usedBytes)} of ${formatStorageBytes(reservation.limitBytes)} used) — the rest is pinned or in use. Delete/unpin assets, enable extra storage, or upgrade your plan.`,
            code: 'storage_quota_exceeded',
          },
          { status: 413 },
        );
      }
      if (reservation.evictedAssetIds.length) {
        console.log(`[Upload] LRU-evicted ${reservation.evictedAssetIds.length} asset(s) to fit ${assetId}`);
      }
    }

    if (normalizedThumbnail) {
      const { reserveStorageForUpload } = await import('@/lib/services/storage-reserve-service');
      const thumbnailReservation = await reserveStorageForUpload(userId, orgId, normalizedThumbnail.length);
      if (!thumbnailReservation.allowed) {
        normalizedThumbnail = null;
        console.warn(`[Upload] Thumbnail omitted for ${assetId}: storage quota is full`);
      } else if (thumbnailReservation.evictedAssetIds.length) {
        console.log(
          `[Upload] LRU-evicted ${thumbnailReservation.evictedAssetIds.length} asset(s) to fit the ${assetId} thumbnail`,
        );
      }
    }

    // Determine file type
    let fileType: 'video' | 'audio' | 'image';
    if (type) {
      fileType = type;
    } else if (contentType.startsWith('video/')) {
      fileType = 'video';
    } else if (contentType.startsWith('image/')) {
      fileType = 'image';
    } else if (contentType.startsWith('audio/')) {
      fileType = 'audio';
    } else {
      return NextResponse.json(
        { success: false, error: 'Unsupported file type' },
        { status: 400 }
      );
    }

    // ── Server-side audio byte verification ──
    // The client's declared content-type is untrusted: a corrupt, non-audio, or
    // mislabeled file must never be persisted as an audio asset. Verify the actual
    // stored bytes are a recognized audio container before registering.
    let verifiedAudio: { mime: string; extension: string; bytesChecked: number } | null = null;
    if (fileType === 'audio') {
      const { verifyUploadedAudioPrefix } = await import('@/lib/editron/services/media/verify-uploaded-audio');
      const verification = await verifyUploadedAudioPrefix(readUrl);
      if (!verification.verified) {
        try {
          await deleteUploadedObject(gcsPath, assetId);
        } catch (delErr: unknown) {
          console.error('[Upload] failed to delete non-audio object:', delErr instanceof Error ? delErr.message : delErr);
        }
        return NextResponse.json(
          {
            success: false,
            error: verification.reason === 'not-audio'
              ? 'Uploaded file is not a recognized audio format'
              : 'Uploaded audio could not be read from storage',
            code: verification.reason === 'not-audio' ? 'audio_verification_failed' : 'audio_read_failed',
          },
          { status: 422 },
        );
      }
      verifiedAudio = {
        mime: verification.mime,
        extension: verification.extension,
        bytesChecked: verification.bytesChecked,
      };
      console.log(`[Upload] Server-verified audio ${assetId} as ${verification.mime} (${verification.bytesChecked} bytes checked)`);
    }
    let nativeVideoAudioRights: AudioRightsContract | undefined;
    if (fileType === 'video' && sourceMediaRightsAttestation !== undefined) {
      try {
        nativeVideoAudioRights = buildNativeVideoAudioRights({
          sourceAssetId: assetId,
          userId,
          attestation: sourceMediaRightsAttestation,
        });
      } catch (error) {
        if (error instanceof NativeVideoAudioRightsError) {
          return NextResponse.json(
            { success: false, error: error.message, code: error.code },
            { status: 400 },
          );
        }
        throw error;
      }
    }

    // ── Server-side video duration verification ──
    // Browser's HTMLVideoElement.duration is unreliable for improperly indexed MP4s.
    // Parse the moov/mvhd atom from R2 to get the real duration.
    let verifiedDuration = duration ? parseFloat(duration) : undefined;
    if (fileType === 'video' && assetId) {
      try {
        const { getR2PresignedReadUrl } = await import('@/lib/editron/services/r2-service');
        const presignedUrl = await getR2PresignedReadUrl(assetId);
        const { extractMP4Duration } = await import('@/lib/editron/services/mp4-duration-service');
        const serverDuration = await extractMP4Duration(presignedUrl);
        if (serverDuration && serverDuration > 0) {
          if (verifiedDuration && Math.abs(serverDuration - verifiedDuration) > 5) {
            console.warn(`[Upload] Duration mismatch: browser=${verifiedDuration?.toFixed(1)}s, server=${serverDuration.toFixed(1)}s — using server value`);
          }
          verifiedDuration = serverDuration;
          console.log(`[Upload] Server-verified duration: ${serverDuration.toFixed(1)}s for ${assetId}`);
        }
      } catch (err: any) {
        console.warn(`[Upload] Server-side duration verification failed (non-fatal): ${err.message}`);
      }
    }

    // Save metadata to MongoDB
    const parsedDimensions =
      dimensions &&
      typeof dimensions.width === 'number' &&
      typeof dimensions.height === 'number'
        ? {
            width: Math.round(dimensions.width),
            height: Math.round(dimensions.height),
          }
        : undefined;

    const cleanUploadBatchId =
      typeof uploadBatchId === 'string' && uploadBatchId.trim()
        ? uploadBatchId.trim().slice(0, 128)
        : undefined;

    if (normalizedThumbnail) {
      try {
        const { uploadMedia } = await import('@/lib/editron/services/upload-service');
        const thumbnailUpload = await uploadMedia(
          normalizedThumbnail,
          userId,
          `${assetId}.thumbnail.webp`,
          'image/webp',
          { customAssetId: `thumb_${assetId}` },
        );
        uploadedThumbnail = {
          url: thumbnailUpload.signedUrl,
          size: thumbnailUpload.size,
          r2Key: thumbnailUpload.r2Key,
          gcsPath: thumbnailUpload.gcsPath,
          urlExpiresAt: thumbnailUpload.urlExpiresAt,
        };
      } catch (thumbnailError: unknown) {
        console.warn(
          `[Upload] Thumbnail storage failed for ${assetId}; original asset remains usable:`,
          thumbnailError instanceof Error ? thumbnailError.message : thumbnailError,
        );
      }
    }

    const now = new Date();
    const sourceQualification = createMediaSourceQualificationV1({
      asset: {
        assetId,
        source: 'user-upload',
        r2Key: gcsPath ? null : assetId,
        gcsPath: typeof gcsPath === 'string' ? gcsPath : null,
      },
      now,
    });
    const mediaAsset: MediaAsset & ThumbnailStorageFields & {
      audioRights?: AudioRightsContract;
    } = {
      assetId,
      userId,
      orgId: orgId || undefined, // org-shared storage pool (undefined for solo users)
      projectId: projectId || undefined,
      type: fileType,
      source: 'user-upload',
      filename,
      gcsPath,
      cachedUrl: readUrl,
      urlExpiresAt: new Date(readUrlExpiresAt),
      size: storedSizeBytes,
      thumbnail: uploadedThumbnail?.url,
      thumbnailSize: uploadedThumbnail?.size,
      thumbnailR2Key: uploadedThumbnail?.r2Key || undefined,
      thumbnailGcsPath: uploadedThumbnail?.gcsPath || undefined,
      thumbnailUrlExpiresAt: uploadedThumbnail?.urlExpiresAt || undefined,
      duration: verifiedDuration,
      dimensions: parsedDimensions,
      uploadedAt: now,
      lastUsedAt: now, // seed the LRU signal at upload time
      ...(nativeVideoAudioRights && { audioRights: nativeVideoAudioRights }),
      ...(verifiedAudio && {
        serverVerifiedAudio: {
          mime: verifiedAudio.mime,
          extension: verifiedAudio.extension,
          bytesChecked: verifiedAudio.bytesChecked,
          verifiedAt: now.toISOString(),
        },
      }),
      ...(cleanUploadBatchId && { uploadBatchId: cleanUploadBatchId }),
      ...(!gcsPath && { r2Key: assetId }),
      ...(isProxy && { isProxy: true }),
      ...(sourceQualification.disposition === 'CREATED'
        ? { sourceQualificationV1: sourceQualification.record }
        : {}),
    };

    await db.collection(COLLECTIONS.MEDIA_ASSETS).insertOne(mediaAsset);
    mediaAssetInserted = true;
    if (sourceQualification.disposition === 'CREATED') {
      try {
        const qualificationDispatch = await dispatchMediaSourceQualificationV1({
          assetId,
          userId,
          sourceBindingSha256: sourceQualification.record.sourceBindingSha256,
        });
        if (!qualificationDispatch.dispatched) {
          const qualificationDiagnostic = qualificationDispatch.error ?? 'MEDIA_SOURCE_PROBE_DISPATCH_FAILED';
          await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
            {
              assetId,
              userId,
              'sourceQualificationV1.sourceBindingSha256': sourceQualification.record.sourceBindingSha256,
              'sourceQualificationV1.status': 'PENDING',
            },
            { $set: { 'sourceQualificationV1.diagnostic': qualificationDiagnostic } },
          );
          console.error(`[Upload] Source qualification was not dispatched for ${assetId}: ${qualificationDiagnostic}`);
        }
      } catch (qualificationDispatchError: unknown) {
        console.error(
          `[Upload] Source qualification scheduling failed for ${assetId}:`,
          qualificationDispatchError instanceof Error ? qualificationDispatchError.name : 'unknown',
        );
      }
    }
    if (cleanUploadBatchId) {
      try {
        await persistMediaUploadBatchAsset(db, {
          uploadBatchId: cleanUploadBatchId,
          userId,
          orgId: orgId || undefined,
          projectId: projectId || undefined,
          intake: uploadBatchIntake,
          asset: {
            assetId,
            filename,
            type: fileType,
            size: storedSizeBytes,
            duration: verifiedDuration,
            dimensions: parsedDimensions,
            thumbnail: uploadedThumbnail?.url,
          },
        }, now);
      } catch (batchErr: unknown) {
        console.warn('[Upload] batch manifest update failed:', batchErr instanceof Error ? batchErr.message : batchErr);
      }
    }
    if (!storageAlreadyRecorded && storedSizeBytes > 0) {
      const { recordStorageUsage, resolveStorageOwner } = await import('@/lib/services/storage-quota-service');
      await recordStorageUsage(resolveStorageOwner(userId, orgId), storedSizeBytes);
    }
    if (uploadedThumbnail?.size) {
      const { recordStorageUsage, resolveStorageOwner } = await import('@/lib/services/storage-quota-service');
      await recordStorageUsage(resolveStorageOwner(userId, orgId), uploadedThumbnail.size);
    }

    // ── Trigger async asset analysis via QStash ──
    // Runs 5-Track analysis (video), Gemini Vision (image), or basic tagging (audio)
    // in background. Does NOT block upload response.
    try {
      const qstashToken = process.env.QSTASH_TOKEN;
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

      if (qstashToken) {
        const analysisCreditOptions = {
          durationMinutes: getBillableAssetAnalysisMinutes(fileType, verifiedDuration),
          requestType: getAssetAnalysisRequestType(fileType),
        };
        analysisCreditCheck = await checkCredits(userId, 'editron', 'asset_analysis', analysisCreditOptions);
        if (!analysisCreditCheck.allowed) {
          if (analysisCreditCheck.errorResponse?.status === 402) {
            await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
              { assetId, userId },
              {
                $set: {
                  analysisStatus: 'skipped_insufficient_credits',
                  analysisSkippedAt: new Date(),
                  analysisSkipReason: 'insufficient_credits',
                },
              },
            );

            return NextResponse.json({
              success: true,
              assetId,
              url: readUrl,
              type: fileType,
              filename,
              size: storedSizeBytes,
              thumbnail: uploadedThumbnail?.url,
              analysisQueued: false,
              analysisSkippedReason: 'insufficient_credits',
              uploadBatchId: cleanUploadBatchId,
            });
          }

          return analysisCreditCheck.errorResponse!;
        }

        try {
          const deductResult = await analysisCreditCheck.deduct();
          analysisCreditTransactionId = deductResult.transactionId;
          const { getCreditCost } = await import('@/lib/config/creditCosts');
          analysisChargedCredits = getCreditCost('editron', 'asset_analysis', analysisCreditOptions);
        } catch (error) {
          console.error('[Upload] asset-analysis credit deduction failed:', error);
          await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
            { assetId, userId },
            {
              $set: {
                analysisStatus: 'skipped_credit_deduction_failed',
                analysisSkippedAt: new Date(),
                analysisSkipReason: 'credit_deduction_failed',
              },
            },
          );

          return NextResponse.json({
            success: true,
            assetId,
            url: readUrl,
            type: fileType,
            filename,
            size: storedSizeBytes,
            thumbnail: uploadedThumbnail?.url,
            analysisQueued: false,
            analysisSkippedReason: 'credit_deduction_failed',
            uploadBatchId: cleanUploadBatchId,
          });
        }

        await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
          { assetId, userId },
          { $set: { analysisStatus: 'queued', analysisQueuedAt: new Date() } },
        );

        const analysisWorkerPath = fileType === 'image'
          ? '/api/internal/workers/asset-analysis'
          : '/api/internal/workers/asset-transcription';
        const analysisRes = await fetch(`${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${baseUrl}${analysisWorkerPath}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${qstashToken}`,
            'Content-Type': 'application/json',
            'Upstash-Retries': '2',
            'Upstash-Timeout': '300s',
          },
          body: JSON.stringify({
            assetId,
            userId,
            orgId: orgId || undefined,
            type: fileType,
            url: readUrl,
            duration: verifiedDuration,
            filename,
            creditTransactionId: analysisCreditTransactionId,
            chargedCredits: analysisChargedCredits,
          }),
        });

        if (!analysisRes.ok) {
          const errBody = await analysisRes.text().catch(() => 'no body');
          const errMsg = `Asset analysis dispatch failed: HTTP ${analysisRes.status} - ${errBody}`;
          await refundAssetAnalysisCredits(analysisCreditCheck, 'Asset analysis dispatch failed before worker queueing');
          analysisCreditCheck = null;
          await db.collection(COLLECTIONS.MEDIA_ASSETS).updateOne(
            { assetId, userId },
            { $set: { analysisStatus: 'dispatch_failed', analysisError: errMsg } },
          );
          console.warn(`[Upload] ${errMsg}`);
        } else {
          analysisQueued = true;
          console.log(`[Upload] Dispatched analysis worker for ${assetId}`);
        }

        if (analysisQueued) {
          const graphRes = await fetch(`${process.env.QSTASH_URL || 'https://qstash.upstash.io'}/v2/publish/${baseUrl}/api/internal/workers/graph-sync`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${qstashToken}`,
              'Content-Type': 'application/json',
              'Upstash-Retries': '3',
            },
            body: JSON.stringify({
              action: 'asset_created',
              data: {
                assetId,
                userId,
                type: fileType,
                duration: verifiedDuration,
              },
            }),
          });
          if (!graphRes.ok) {
            console.warn(`[Upload] Graph sync dispatch failed for ${assetId}: HTTP ${graphRes.status}`);
          } else {
            console.log(`[Upload] Dispatched graph-sync for ${assetId}`);
          }
        }
      }
    } catch (qErr: any) {
      if (analysisCreditCheck && !analysisQueued) {
        await refundAssetAnalysisCredits(analysisCreditCheck, 'Asset analysis dispatch failed before worker queueing');
      }
      // Non-fatal — asset is uploaded even if analysis/graph dispatch fails
      console.warn(`[Upload] Worker dispatch failed: ${qErr.message}`);
    }

    return NextResponse.json({
      success: true,
      assetId,
      url: readUrl,
      type: fileType,
      filename,
      size: storedSizeBytes,
      thumbnail: uploadedThumbnail?.url,
      analysisQueued,
      uploadBatchId: cleanUploadBatchId,
      ...(verifiedAudio ? { serverVerifiedAudio: verifiedAudio } : {}),
    });
  } catch (error: any) {
    if (uploadedThumbnail && !mediaAssetInserted) {
      try {
        await deleteStoredThumbnail(uploadedThumbnail);
      } catch (cleanupError: unknown) {
        console.error(
          '[Upload] Failed to clean up unregistered thumbnail:',
          cleanupError instanceof Error ? cleanupError.message : cleanupError,
        );
      }
    }
    console.error('Error registering media asset:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to register media asset' },
      { status: 500 }
    );
  }
}

const MAX_THUMBNAIL_INPUT_BYTES = 3 * 1024 * 1024;
const MAX_THUMBNAIL_OUTPUT_BYTES = 160 * 1024;

async function normalizeThumbnailDataUrl(value: unknown): Promise<Buffer | null> {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    console.warn('[Upload] Ignoring non-string thumbnail payload');
    return null;
  }

  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) {
    console.warn('[Upload] Ignoring thumbnail payload outside the supported data-image contract');
    return null;
  }

  const estimatedBytes = Math.floor(match[1].length * 0.75);
  if (estimatedBytes > MAX_THUMBNAIL_INPUT_BYTES) {
    console.warn(`[Upload] Ignoring oversized thumbnail payload (${estimatedBytes} bytes)`);
    return null;
  }

  try {
    const input = Buffer.from(match[1], 'base64');
    const sharp = (await import('sharp')).default;
    for (const attempt of [
      { edge: 480, quality: 74 },
      { edge: 360, quality: 58 },
      { edge: 240, quality: 46 },
    ]) {
      const output = await sharp(input, { limitInputPixels: 40_000_000, sequentialRead: true })
        .rotate()
        .resize({
          width: attempt.edge,
          height: attempt.edge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: attempt.quality, effort: 4 })
        .toBuffer();
      if (output.length <= MAX_THUMBNAIL_OUTPUT_BYTES) return output;
    }
  } catch (error: unknown) {
    console.warn(
      '[Upload] Thumbnail payload could not be decoded:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }

  console.warn(`[Upload] Thumbnail could not be normalized below ${MAX_THUMBNAIL_OUTPUT_BYTES} bytes`);
  return null;
}

async function deleteStoredThumbnail(thumbnail: StoredThumbnail): Promise<void> {
  if (thumbnail.r2Key) {
    const { deleteFromR2 } = await import('@/lib/editron/services/r2-service');
    await deleteFromR2(thumbnail.r2Key);
    return;
  }
  if (thumbnail.gcsPath) {
    const { deleteFromGCS } = await import('@/lib/editron/services/gcs-service');
    await deleteFromGCS(thumbnail.gcsPath);
  }
}

async function deleteUploadedObject(gcsPath: string | null | undefined, r2Key: string): Promise<void> {
  if (gcsPath) {
    const { deleteFromGCS } = await import('@/lib/editron/services/gcs-service');
    await deleteFromGCS(gcsPath);
    return;
  }

  const { deleteFromR2 } = await import('@/lib/editron/services/r2-service');
  await deleteFromR2(r2Key);
}

type AssetAnalysisRequestType = 'video' | 'image' | 'audio';

function getBillableAssetAnalysisMinutes(fileType: AssetAnalysisRequestType, durationSeconds?: number): number {
  if (fileType !== 'video') return 1;
  const sourceMinutes = durationSeconds && durationSeconds > 0 ? durationSeconds / 60 : 1;
  return Math.max(1, Math.ceil(sourceMinutes * 100) / 100);
}

function getAssetAnalysisRequestType(fileType: AssetAnalysisRequestType): AssetAnalysisRequestType {
  return fileType;
}

async function refundAssetAnalysisCredits(creditCheck: CreditCheckResult, reason: string): Promise<void> {
  try {
    await creditCheck.refund(reason);
  } catch (error) {
    console.error('[Upload] asset-analysis credit refund failed:', error);
  }
}
