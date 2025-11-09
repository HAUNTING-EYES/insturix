import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import { logger } from "../../utils/logger";

// Check if we have complete GCS configuration
const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
  ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
  : null;
const hasGCSConfig = !!(gcsCredentials && process.env.GCS_BUCKET_NAME);

// Initialize storage with credentials if available
const storage = hasGCSConfig ? new Storage({
  projectId: gcsCredentials.project_id,
  credentials: gcsCredentials,
}) : null;

const bucket = hasGCSConfig ? storage?.bucket(process.env.GCS_BUCKET_NAME!) : null;

// Track if CORS has been configured
let corsConfigured = false;
let corsConfiguring = false;

async function ensureCorsConfigured() {
  if (!bucket || corsConfigured || corsConfiguring) return;

  corsConfiguring = true;
  
  try {
    // Build list of allowed origins
    const allowedOrigins = [
      // Production domains
      'https://www.insturix.com',
      'https://insturix.com',
    ];

    // Allow common localhost ports for development (3000-3010 covers most dev scenarios)
    for (let port = 3000; port <= 3010; port++) {
      allowedOrigins.push(`http://localhost:${port}`);
      allowedOrigins.push(`https://localhost:${port}`);
      allowedOrigins.push(`http://127.0.0.1:${port}`);
    }

    // Add environment-specific URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl && !allowedOrigins.includes(appUrl)) {
      allowedOrigins.push(appUrl);
    }

    // Add all Vercel deployment URLs (these are dynamic)
    const vercelUrls = [
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.NEXT_PUBLIC_VERCEL_URL,
    ];

    vercelUrls.forEach(url => {
      if (url) {
        const httpsUrl = `https://${url}`;
        if (!allowedOrigins.includes(httpsUrl)) {
          allowedOrigins.push(httpsUrl);
        }
      }
    });

    // For development/preview environments, also add wildcard Vercel pattern
    // This will match ALL *.vercel.app domains
    const isDev = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';
    if (isDev || process.env.VERCEL_URL) {
      allowedOrigins.push('https://*.vercel.app');
    }

    await bucket.setCorsConfiguration([
      {
        maxAgeSeconds: 3600,
        method: ['PUT', 'GET', 'HEAD', 'POST', 'OPTIONS'],
        origin: allowedOrigins,
        responseHeader: [
          'Content-Type',
          'Content-Length',
          'Accept',
          'Origin',
          'Authorization',
          'Host',
          'Access-Control-Allow-Origin',
          'Access-Control-Allow-Methods',
          'Access-Control-Allow-Headers',
          'x-goog-meta-upload-source'
        ],
      },
    ]);

    corsConfigured = true;
    logger.info('GCS CORS configuration updated successfully', {
      data: { 
        bucket: process.env.GCS_BUCKET_NAME,
        originsCount: allowedOrigins.length,
        includesLocalhost: true,
        includesVercelWildcard: allowedOrigins.includes('https://*.vercel.app')
      }
    });
  } catch (error) {
    logger.error('Failed to update GCS CORS configuration', {
      data: { 
        bucket: process.env.GCS_BUCKET_NAME,
        error: error instanceof Error ? error.message : String(error) 
      }
    });
  } finally {
    corsConfiguring = false;
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.userId) {
      logger.warn('Unauthorized upload attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      logger.warn('Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if GCS is properly configured
    if (!hasGCSConfig || !bucket) {
      logger.error('GCS configuration missing or invalid');
      return NextResponse.json(
        { error: 'Storage configuration error' },
        { status: 500 }
      );
    }

    // Ensure CORS is configured before generating signed URL
    await ensureCorsConfigured();

    try {
      // Generate GCS path with timestamp for easy cleanup
      const timestamp = Date.now();
      const cleanFilename = filename.replace(/[^a-zA-Z0-9-_.]/g, '_');
      const userId = session.userId.replace('user_', '');
      
      // Include timestamp in path for easy age-based cleanup
      const gcsPath = `user_${userId}/alyzitron-uploads/${timestamp}_${cleanFilename}`;
      
      // Get signed URL
      const file = bucket.file(gcsPath);

      // Signed URL config with explicit headers that will be sent by client
      const signUrlConfig: GetSignedUrlConfig = {
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: contentType,
        extensionHeaders: {
          'x-goog-meta-upload-source': 'alyzitron-web'
        }
      };

      const [signedUrl] = await file.getSignedUrl(signUrlConfig);
      const publicUrl = `https://storage.googleapis.com/${process.env.GCS_BUCKET_NAME}/${gcsPath}`;

      return NextResponse.json({
        url: signedUrl,
        gcsPath,
        publicUrl,
        storage: 'gcs',
        contentType
      });

    } catch (error) {
      logger.error('GCS signed URL generation failed', { 
        data: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }

  } catch (error) {
    logger.error('Failed to generate upload URL', {
      data: { error: error instanceof Error ? error.message : String(error) }
    });
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}