'use client';

import { useEditorContext } from '../../contexts/editor-context';
import { VideoPlayer } from '../../components/core/video-player';

/* ═══ Editron editor v2 · canvas ═════════════════════════════════════
   The v6 dark canvas stage. Embeds the REAL <VideoPlayer/> (one Remotion
   Player only — never a second one) so the player, aspect box, and its
   container ids (.video-container / remotion-player-container) are untouched.

   Backdrop: the real player paints a graph-paper grid on
   #remotion-player-container. We override JUST its background here with a
   clean warm radial stage — scoped by the id, which only exists on this v2
   route, so video-player.tsx (v1) is not touched. An unlayered <style> beats
   Tailwind's layered utilities. */

export function V2Canvas() {
  const { playerRef } = useEditorContext();
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#080807] p-5">
      <style>{`#remotion-player-container{background-image:radial-gradient(ellipse at center,#17150F 0%,#0B0B0A 72%)!important;background-color:#0B0B0A!important;background-size:auto!important;}`}</style>
      <VideoPlayer playerRef={playerRef} />
    </div>
  );
}
