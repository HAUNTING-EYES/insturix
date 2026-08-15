import { auth } from '@clerk/nextjs/server';
import { fileTypeFromBuffer } from 'file-type';
import { NextRequest } from 'next/server';

import { EpidemicMusicCatalogProvider } from '@/lib/editron/music-catalog/epidemic-provider';
import {
  ingestMusicCatalogTrack,
  MongoMusicCatalogIngestStore,
} from '@/lib/editron/music-catalog/ingest-service';
import { handleMusicCatalogIngest } from '@/lib/editron/http/music-route-handlers';
import { projectService } from '@/lib/editron/services/project-service';
import { deleteFromGCS } from '@/lib/editron/services/gcs-service';
import { deleteFromR2 } from '@/lib/editron/services/r2-service';
import { uploadMedia, type UploadResult } from '@/lib/editron/services/upload-service';
import { inspectEncodedMusicAudio } from '@/lib/pipeline/audio-conditioning';

export const runtime = 'nodejs';
export const maxDuration = 300;

const productionStore = new MongoMusicCatalogIngestStore();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  return handleMusicCatalogIngest(request, context, {
    authenticate: auth,
    ingest: (input) =>
      ingestMusicCatalogTrack(input, {
        provider: new EpidemicMusicCatalogProvider(),
        providerAgreementId: process.env.EPIDEMIC_SOUND_LICENSE_AGREEMENT_ID,
        loadProject: (userId, projectId) => projectService.loadProject(userId, projectId),
        inspectAudio: inspectEncodedMusicAudio,
        detectFileType: fileTypeFromBuffer,
        upload: uploadMedia,
        cleanupUpload: cleanupControlledUpload,
        store: productionStore,
      }),
  });
}

async function cleanupControlledUpload(upload: UploadResult): Promise<void> {
  if (upload.r2Key) {
    await deleteFromR2(upload.r2Key);
    return;
  }
  if (upload.gcsPath) {
    await deleteFromGCS(upload.gcsPath);
    return;
  }
  throw new Error(`Controlled upload ${upload.assetId} has no deletable storage key`);
}
