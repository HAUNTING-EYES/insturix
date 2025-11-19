import { NextRequest, NextResponse } from 'next/server';
import { assetResolver } from '@/lib/services/asset-resolver';

/**
 * POST /api/services/editron/assets/create-public
 * 
 * Create a media asset record for public/stock media (Pexels, default sounds, etc.)
 * Returns assetId that can be used in overlays
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { publicUrl, type, filename, userId, duration, thumbnail, dimensions } = body;

    // Validate required fields
    if (!publicUrl || !type || !filename || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: publicUrl, type, filename, userId' },
        { status: 400 }
      );
    }

    // Validate type
    if (!['video', 'audio', 'image'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be video, audio, or image' },
        { status: 400 }
      );
    }

    // Create or get existing public asset
    const asset = await assetResolver.createPublicAsset({
      publicUrl,
      type,
      filename,
      userId,
      duration,
      thumbnail,
      dimensions,
    });

    return NextResponse.json({
      success: true,
      assetId: asset.assetId,
      asset,
    });
  } catch (error) {
    console.error('Error creating public asset:', error);
    return NextResponse.json(
      { error: 'Failed to create public asset' },
      { status: 500 }
    );
  }
}
