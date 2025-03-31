import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Storage } from '@google-cloud/storage';
import { logger } from "../../utils/logger";
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Check if we have GCS credentials
const hasGCSCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS && process.env.GOOGLE_CLOUD_BUCKET;

// Initialize Google Cloud Storage if credentials are available
const storage = hasGCSCredentials ? new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  credentials: JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}')
}) : null;

const bucket = hasGCSCredentials ? storage?.bucket(process.env.GOOGLE_CLOUD_BUCKET || '') : null;

// Function to create local uploads directory
async function ensureDirectory(path: string) {
  try {
    await mkdir(path, { recursive: true });
  } catch (error) {
    if ((error as any).code !== 'EEXIST') {
      throw error;
    }
  }
}

// Function to generate presigned URL for local storage
async function generateLocalUploadUrl(userId: string, filename: string) {
  const uploadsDir = await ensureDirectory(join(process.cwd(), 'uploads', 'alyzitron', `user_${userId}`));
  const timestamp = Date.now();
  const cleanFilename = timestamp + '_' + filename.replace(/[^a-zA-Z0-9-_.]/g, '_');
  const localPath = join('uploads', 'alyzitron', `user_${userId}`, cleanFilename).replace(/\\/g, '/');
  const fullPath = join(process.cwd(), localPath);
  
  return {
    url: `/api/services/alyzitron/upload/${userId}/${cleanFilename}`,
    localPath,
    fullPath
  };
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { filename, contentType, fileSize } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (hasGCSCredentials && bucket) {
      // Use Google Cloud Storage
      const gcsPath = `services/alyzitron/user_${session.userId}/${Date.now()}_${filename}`;
      const file = bucket.file(gcsPath);

      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType,
      });

      return NextResponse.json({
        url: signedUrl,
        gcsPath,
        storage: 'gcs'
      });

    } else {
      // Use local storage
      const { url, localPath } = await generateLocalUploadUrl(session.userId, filename);

      return NextResponse.json({
        url,
        gcsPath: localPath,
        storage: 'local'
      });
    }

  } catch (error) {
    logger.error('Failed to generate upload URL', {
      data: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}