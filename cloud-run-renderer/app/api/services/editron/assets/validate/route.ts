import { NextRequest, NextResponse } from 'next/server';
import { assetResolver } from '@/lib/editron/services/asset-resolver';
import type { Overlay } from '@/components/editron/editor/version-7.0.0/types';

/**
 * POST /api/services/editron/assets/validate
 * 
 * Validate all media assets in a project before export
 * Checks for missing assets, expired URLs, and accessibility issues
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { overlays, autoFix = false } = body;

    if (!Array.isArray(overlays)) {
      return NextResponse.json(
        { error: 'overlays must be an array' },
        { status: 400 }
      );
    }

    // If autoFix is requested, attempt to fix issues automatically
    if (autoFix) {
      const fixResult = await assetResolver.fixValidationIssues(overlays as Overlay[]);
      
      return NextResponse.json({
        success: fixResult.remaining.length === 0,
        fixed: fixResult.fixed,
        remaining: fixResult.remaining,
        message: fixResult.remaining.length === 0
          ? `All ${fixResult.fixed} issues fixed successfully`
          : `Fixed ${fixResult.fixed} issues, ${fixResult.remaining.length} remain`,
      });
    }

    // Just validate without fixing
    const validation = await assetResolver.validateProjectAssets(overlays as Overlay[]);

    return NextResponse.json({
      success: true,
      valid: validation.valid,
      issues: validation.issues,
      message: validation.valid
        ? 'All assets are valid'
        : `Found ${validation.issues.length} validation issues`,
    });
  } catch (error) {
    console.error('Error validating assets:', error);
    return NextResponse.json(
      { error: 'Failed to validate assets' },
      { status: 500 }
    );
  }
}
