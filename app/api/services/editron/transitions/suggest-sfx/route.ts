/**
 * POST /api/services/editron/transitions/suggest-sfx
 *
 * When user manually adds a transition in the editor, this endpoint
 * suggests a matching SFX based on KB Part 9 transition-sound pairings.
 *
 * Returns: suggested SFX token + Freesound search query + preview URL.
 * User accepts → SFX overlay placed. User declines → nothing happens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

const TRANSITION_SFX_MAP: Record<string, { token: string; query: string; volume: number }> = {
  'dissolve': { token: 'whoosh', query: 'soft whoosh transition', volume: 0.30 },
  'wipe-left': { token: 'whoosh', query: 'swoosh left transition', volume: 0.30 },
  'wipe-right': { token: 'whoosh', query: 'swoosh right transition', volume: 0.30 },
  'slide-up': { token: 'whoosh', query: 'upward swoosh transition', volume: 0.30 },
  'slide-down': { token: 'whoosh', query: 'downward swoosh transition', volume: 0.30 },
  'iris-wipe': { token: 'whoosh', query: 'circular swoosh transition', volume: 0.30 },
  'blur-transition': { token: 'whoosh', query: 'blur whoosh transition', volume: 0.25 },
  'whip-pan': { token: 'whoosh', query: 'fast whip pan swoosh', volume: 0.40 },
  'zoom-punch': { token: 'impact', query: 'bass impact hit thud', volume: 0.55 },
  'flash': { token: 'impact', query: 'camera flash impact stinger', volume: 0.55 },
  'glitch': { token: 'impact', query: 'digital glitch impact', volume: 0.40 },
};

// These get silence — no SFX suggestion
const SILENT_TRANSITIONS = ['dip-to-black', 'dip-to-white', 'soft-cut', 'film-burn', 'hard-cut'];

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { transitionType } = await request.json();
    if (!transitionType) {
      return NextResponse.json({ success: false, error: 'transitionType required' }, { status: 400 });
    }

    // Silent transitions → no suggestion
    if (SILENT_TRANSITIONS.includes(transitionType)) {
      return NextResponse.json({
        success: true,
        suggestion: null,
        reason: `${transitionType} works best with silence — no SFX recommended`,
      });
    }

    const mapping = TRANSITION_SFX_MAP[transitionType];
    if (!mapping) {
      return NextResponse.json({
        success: true,
        suggestion: null,
        reason: `No SFX mapping for transition type: ${transitionType}`,
      });
    }

    // Search Freesound for a matching SFX
    let previewUrl: string | null = null;
    let sfxAssetId: string | null = null;
    try {
      const { searchAndDownloadSFX, isSFXLibraryAvailable } = await import('@/lib/pipeline/sfx-library-service');
      if (isSFXLibraryAvailable()) {
        const result = await searchAndDownloadSFX(mapping.query, userId, 3);
        if (result) {
          previewUrl = result.audioUrl;
          sfxAssetId = result.audioAssetId;
        }
      }
    } catch {
      // Non-fatal — still return suggestion without preview
    }

    return NextResponse.json({
      success: true,
      suggestion: {
        token: mapping.token,
        query: mapping.query,
        volume: mapping.volume,
        previewUrl,
        sfxAssetId,
        transitionType,
      },
      reason: `${mapping.token} SFX pairs with ${transitionType} (KB Part 9)`,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
