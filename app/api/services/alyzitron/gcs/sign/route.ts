import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { logger } from "../../utils/logger";
import { AlyzitronR2Manager } from "../../utils/r2-manager";

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

    if (!AlyzitronR2Manager.isR2Available()) {
      logger.error('R2 is not configured');
      return NextResponse.json(
        { error: 'Storage configuration error: R2 credentials not set' },
        { status: 500 }
      );
    }

    // CORS is configured once via Cloudflare dashboard — not on every request

    const { url, r2Key, publicUrl } = await AlyzitronR2Manager.getSignedUploadUrl(
      session.userId.replace('user_', ''),
      filename,
      contentType
    );

    logger.info('Generated R2 signed URL for Alyzitron upload', {
      data: {
        userId: session.userId,
        filename,
        r2Key,
        publicUrl
      }
    });

    return NextResponse.json({
      url,
      storageKey: r2Key, // Renamed from storagePath/gcsPath for consistency
      publicUrl,
      storage: 'r2',
      contentType
    });

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
