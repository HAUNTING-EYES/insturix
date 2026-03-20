/**
 * Reference Image Generation Service
 *
 * Generates reference images for key visual subjects identified by the LLM.
 * These references are used during storyboard generation (via IP-adapter)
 * to maintain visual consistency across scenes.
 */

import { fal } from '@fal-ai/client';
import { nanoid } from 'nanoid';
import { uploadToGCS } from '@/lib/editron/services/gcs-service';
import { saveReferenceImageSet, updateSubjectReference } from './reference-image-db';
import type { ReferenceImageSet, SubjectReference } from './schemas/reference-image';
import type { ExtractedSubject } from './llm-scene-parser';

// Configure fal.ai
let _falConfigured = false;
function ensureFalConfig() {
  if (_falConfigured) return;
  if (process.env.FAL_AI_API_KEY) {
    fal.config({ credentials: process.env.FAL_AI_API_KEY });
    _falConfigured = true;
  }
}

const DEFAULT_MODEL = 'fal-ai/flux/schnell';

/**
 * Generate a single reference image for a subject.
 */
export async function generateReferenceImage(
  subject: SubjectReference,
  userId: string,
  options: { artStyle?: string; modelId?: string } = {},
): Promise<{ imageUrl: string; assetId: string; gcsPath: string }> {
  ensureFalConfig();

  const modelId = options.modelId || DEFAULT_MODEL;
  const prompt = `${subject.visualDescription}. Reference sheet style, clean background, studio lighting, highly detailed, sharp focus${options.artStyle ? `, ${options.artStyle} style` : ''}`;

  const result = await fal.subscribe(modelId, {
    input: {
      prompt,
      image_size: { width: 1024, height: 1024 },
      num_images: 1,
      enable_safety_checker: false,
    },
    logs: false,
  });

  const data = result.data as any;
  if (!data?.images?.[0]?.url) {
    throw new Error('No reference image generated from fal.ai');
  }

  const generatedUrl = data.images[0].url;

  // Download and upload to GCS
  const response = await fetch(generatedUrl);
  if (!response.ok) throw new Error('Failed to download generated reference image');
  const buffer = Buffer.from(await response.arrayBuffer());

  const assetId = `ref_${nanoid(12)}`;
  const filename = `${assetId}.png`;
  const uploadResult = await uploadToGCS(buffer, userId, filename, 'image/png');

  return {
    imageUrl: uploadResult.signedUrl,
    assetId,
    gcsPath: uploadResult.gcsPath,
  };
}

/**
 * Generate reference images for all subjects in a set.
 */
export async function generateAllReferenceImages(
  subjects: ExtractedSubject[],
  userId: string,
  options: { artStyle?: string; sourceScriptId?: string } = {},
): Promise<ReferenceImageSet> {
  const refSetId = `refs_${nanoid(12)}`;

  const refSet: ReferenceImageSet = {
    refSetId,
    userId,
    sourceScriptId: options.sourceScriptId,
    subjects: subjects.map((s) => ({
      subjectId: s.id,
      name: s.name,
      category: s.category,
      visualDescription: s.visualDescription,
      scenesAppearingIn: s.scenesAppearingIn,
      status: 'pending' as const,
      generationHistory: [],
    })),
    status: 'generating',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await saveReferenceImageSet(refSet);

  // Generate with concurrency limit of 3
  const CONCURRENCY = 3;
  const queue = [...refSet.subjects];
  const running: Promise<void>[] = [];
  let completed = 0;
  let errors = 0;

  const generateForSubject = async (subject: SubjectReference) => {
    try {
      subject.status = 'generating';
      await updateSubjectReference(refSetId, subject.subjectId, { status: 'generating' });

      const result = await generateReferenceImage(subject, userId, {
        artStyle: options.artStyle,
      });

      subject.imageUrl = result.imageUrl;
      subject.imageAssetId = result.assetId;
      subject.imageGcsPath = result.gcsPath;
      subject.status = 'generated';
      subject.generationHistory.push({
        assetId: result.assetId,
        imageUrl: result.imageUrl,
        timestamp: new Date(),
      });

      await updateSubjectReference(refSetId, subject.subjectId, {
        imageUrl: result.imageUrl,
        imageAssetId: result.assetId,
        imageGcsPath: result.gcsPath,
        status: 'generated',
        generationHistory: subject.generationHistory,
      });

      completed++;
    } catch (err) {
      console.error(`[RefImage] Subject ${subject.subjectId} failed:`, err);
      subject.status = 'pending';
      errors++;
    }
  };

  while (queue.length > 0 || running.length > 0) {
    while (running.length < CONCURRENCY && queue.length > 0) {
      const subject = queue.shift()!;
      const p = generateForSubject(subject).then(() => {
        running.splice(running.indexOf(p), 1);
      });
      running.push(p);
    }
    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  refSet.status = errors === 0 ? 'ready' : completed > 0 ? 'partial' : 'error';
  refSet.updatedAt = new Date();
  await saveReferenceImageSet(refSet);

  return refSet;
}
