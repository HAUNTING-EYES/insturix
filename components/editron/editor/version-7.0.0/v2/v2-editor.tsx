'use client';

import { Editor } from '../components/core/editor';

/* ═══ Editron editor · v2 shell ═══════════════════════════════════════
   The redesigned editor shell (editron-editor-v6.jsx) ported onto the real
   editor's providers/contexts — a re-skin, no logic forked. Mounted by
   react-video-editor.tsx when variant="v2", inside the exact same provider
   stack as v1, so every context/hook is already in scope.

   PHASE 1 (this commit): passthrough — renders the real <Editor/> unchanged
   so the /v2 route + the variant plumbing are proven to boot a real project
   before any re-skin. Phases 2+ replace this with the v6-styled header /
   tool-rail / canvas / props panel / timeline, each delegating to the
   existing panel components + hooks. */
export function V2Editor() {
  return <Editor />;
}
