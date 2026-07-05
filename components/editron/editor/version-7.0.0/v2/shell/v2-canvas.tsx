'use client';

import { useEditorContext } from '../../contexts/editor-context';
import { VideoPlayer } from '../../components/core/video-player';

/* ═══ Editron editor v2 · canvas ═════════════════════════════════════
   The v6 dark canvas stage. Embeds the REAL <VideoPlayer/> (one Remotion
   Player only — never a second one) so the player, aspect box, and its
   container ids (.video-container / remotion-player-container) are untouched.
   // TODO(Phase 5): AI-generated-scene banner + rendering overlay chrome. */

export function V2Canvas() {
  const { playerRef } = useEditorContext();
  return (
    <div className="flex flex-1 items-center justify-center overflow-hidden bg-[#080807] p-5">
      <VideoPlayer playerRef={playerRef} />
    </div>
  );
}
