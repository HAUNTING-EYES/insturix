/**
 * POST /api/services/pipeline/reference-images/[refSetId]/subject/[subjectId]/upload
 *
 * Upload a real image (product photo, character photo) as the reference
 * for a subject. Replaces the AI-generated reference with the user's upload.
 *
 * Uses Gemini Vision to analyze the uploaded image and update the subject's
 * visualDescription with accurate details from the actual photo — so the
 * storyboard IP-adapter and video prompts match the REAL product, not a
 * hallucinated version.
 *
 * Accepts: multipart/form-data with 'file' field (image/png, image/jpeg, image/webp)
 * Returns: { success, imageUrl, visualDescription }
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getReferenceImageSet, updateSubjectReference } from '@/lib/pipeline/reference-image-db';
import { uploadToGCS } from '@/lib/editron/services/gcs-service';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Gemini Vision for image analysis
async function analyzeUploadedImage(
  imageBuffer: Buffer,
  mimeType: string,
  subjectName: string,
  subjectCategory: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('[upload] No Gemini API key — skipping image analysis');
    return '';
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType,
        },
      },
      {
        text: `You are a visual reference analyst for AI video production.

Analyze this image of "${subjectName}" (category: ${subjectCategory}).

Write a detailed visual description that an AI image generator can use to recreate this EXACT subject in different scenes. Include:
- Exact colors (use specific names like "cobalt blue", "brushed silver", not generic "blue")
- Materials and textures (matte, glossy, brushed metal, leather, etc.)
- Shape, proportions, distinctive design elements
- Key identifying features that must be consistent across scenes
- For products: finish, branding elements, size relative to context
- For people: face shape, hair, skin tone, clothing, accessories

Write as a single dense paragraph. Be exhaustively specific — this description will be used by IP-adapter for cross-scene visual consistency.`,
      },
    ]);

    const description = result.response.text()?.trim();
    console.log(`[upload] Gemini Vision analyzed "${subjectName}": ${description?.substring(0, 100)}...`);
    return description || '';
  } catch (err: any) {
    console.error('[upload] Gemini Vision analysis failed:', err.message);
    return '';
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ refSetId: string; subjectId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { refSetId, subjectId } = await params;

    // Get existing reference set and subject
    const refSet = await getReferenceImageSet(refSetId, userId);
    if (!refSet) return NextResponse.json({ error: 'Reference set not found' }, { status: 404 });

    const subject = refSet.subjects.find((s: any) => s.subjectId === subjectId);
    if (!subject) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Accepted: PNG, JPEG, WebP' }, { status: 400 });
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const filename = `ref_upload_${nanoid(8)}.${ext}`;

    console.log(`[upload] Uploading reference image for "${subject.name}" (${file.size} bytes, ${file.type})`);

    // Upload to GCS
    const uploadResult = await uploadToGCS(buffer, userId, filename, file.type);

    // Analyze uploaded image with Gemini Vision to get accurate visual description
    const analyzedDescription = await analyzeUploadedImage(
      buffer,
      file.type,
      subject.name,
      (subject as any).category || 'product',
    );

    // Update the subject's reference image and optionally its visual description
    const update: any = {
      imageUrl: uploadResult.signedUrl,
      imageAssetId: uploadResult.assetId,
      imageGcsPath: uploadResult.gcsPath,
      source: 'user-upload', // Mark as user-uploaded (not AI-generated)
      generationHistory: [
        ...((subject as any).generationHistory || []),
        {
          assetId: uploadResult.assetId,
          imageUrl: uploadResult.signedUrl,
          timestamp: new Date(),
          feedback: 'User uploaded reference image',
          source: 'upload',
        },
      ],
    };

    // If Gemini Vision provided a better description, update it
    // This is crucial: the visual description now reflects the REAL product,
    // not the AI's imagination. Storyboard prompts will use this description.
    if (analyzedDescription) {
      update.visualDescription = analyzedDescription;
    }

    await updateSubjectReference(refSetId, subjectId, update);

    console.log(`[upload] Reference image updated for "${subject.name}": ${uploadResult.assetId}`);

    return NextResponse.json({
      success: true,
      imageUrl: uploadResult.signedUrl,
      assetId: uploadResult.assetId,
      visualDescription: analyzedDescription || subject.visualDescription,
      source: 'user-upload',
    });
  } catch (error: any) {
    console.error('[upload] Error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
