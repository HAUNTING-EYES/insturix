'use client';

import { useState } from 'react';
import { Download, Loader2, Smartphone } from 'lucide-react';
import { Modal, Mono, Btn } from '@/components/primitives';
import { useEditorContext } from '../../contexts/editor-context';
import { QualityReviewPanel } from '../../components/quality-review/quality-review-panel';

/* ═══ Editron editor v2 · modals ═════════════════════════════════════
   Render / Recovery / Quality / Mobile, each wrapped in the shared Modal
   primitive. Quality wraps the REAL context-only panel unchanged. Render
   is a v2-native read of the real render `state` from context (never
   forks useRendering). Recovery is v2-native over context save/load.
   Mobile is a deferred placeholder — no real mobile-preview provider
   exists (v6's phone frame is mock). No logic forked. */

export type V2ModalKind = 'render' | 'recovery' | 'quality' | 'mobile' | null;

type RenderState =
  | { status: 'init' }
  | { status: 'invoking' }
  | { status: 'rendering'; progress?: number }
  | { status: 'error'; error?: { message?: string } }
  | { status: 'done'; url: string; size?: number };

function RenderModal({ onClose }: { onClose: () => void }) {
  const ctx = useEditorContext();
  const { renderMedia, cancelRender, aspectRatio } = ctx;
  const st = (ctx.state ?? { status: 'init' }) as RenderState;

  return (
    <Modal title="Export" sub="Render your project to video" width="md" onClose={onClose}>
      {st.status === 'init' && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-[13px] text-ds-secondary">Ready to export at {aspectRatio} · 1080p.</p>
          <Btn variant="primary" onClick={() => renderMedia()}>Start render</Btn>
        </div>
      )}

      {st.status === 'invoking' && (
        <div className="flex items-center gap-2.5 py-2">
          <Loader2 className="h-4 w-4 animate-spin text-gold" />
          <span className="text-[13px] text-ds-secondary">Preparing render…</span>
        </div>
      )}

      {st.status === 'rendering' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-status-danger" />
            <Mono size="9" className="text-ds-secondary">Rendering</Mono>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-well">
            <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${Math.round(st.progress ?? 0)}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <Mono size="8" className="text-ds-dim">{aspectRatio} · 1080p · {Math.round(st.progress ?? 0)}%</Mono>
            <Btn size="sm" variant="danger" onClick={() => cancelRender()}>Cancel</Btn>
          </div>
        </div>
      )}

      {st.status === 'done' && (
        <div className="flex flex-col items-start gap-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-status-success" />
            <span className="text-[13px] font-semibold text-ds-primary">Render complete</span>
          </div>
          <a
            href={st.url}
            download
            className="inline-flex items-center gap-2 rounded-button border border-gold bg-gold px-4 py-2 text-[12.5px] font-extrabold text-[#241B08] transition-colors hover:bg-[#E0B86A] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gold/60"
          >
            <Download size={14} /> Download video
          </a>
        </div>
      )}

      {st.status === 'error' && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-[13px] text-status-danger">{st.error?.message ?? 'Render failed.'}</p>
          <Btn variant="primary" onClick={() => renderMedia()}>Retry</Btn>
        </div>
      )}
    </Modal>
  );
}

function RecoveryModal({ onClose }: { onClose: () => void }) {
  const ctx = useEditorContext();
  const overlayCount = ctx.overlays.length;
  // loadState is added to context in Phase 5c (additive). Read defensively so
  // this modal is informative now and becomes functional after the lift.
  const loadState = (ctx as { loadState?: () => Promise<unknown> }).loadState;
  const [loading, setLoading] = useState(false);

  const recover = async () => {
    if (!loadState) return;
    setLoading(true);
    try {
      await loadState();
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Modal title="Recover work" sub="Autosave keeps a backup of every edit" width="sm" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
          <span className="text-[13px] text-ds-secondary">Your project is backed up locally on every change.</span>
        </div>
        <div className="rounded-card border border-ds-subtle bg-surface-deeper px-3 py-2.5">
          <Mono size="8" className="text-ds-dim">Current project</Mono>
          <div className="mt-1 text-[13px] text-ds-primary">{overlayCount} overlays</div>
        </div>
        <div className="flex justify-end gap-2">
          <Btn size="sm" onClick={onClose}>Keep current</Btn>
          {loadState ? (
            <Btn size="sm" variant="primary" onClick={recover} disabled={loading}>
              {loading ? 'Recovering…' : 'Recover last saved'}
            </Btn>
          ) : (
            <Mono size="8" className="self-center text-ds-faint">Version recovery coming soon</Mono>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function V2Modals({ modal, onClose }: { modal: V2ModalKind; onClose: () => void }) {
  if (!modal) return null;

  if (modal === 'quality') {
    return (
      <Modal title="Quality review" sub="Automatic checks on your edit" width="md" onClose={onClose}>
        <div className="h-[min(70vh,560px)]">
          <QualityReviewPanel />
        </div>
      </Modal>
    );
  }

  if (modal === 'render') return <RenderModal onClose={onClose} />;
  if (modal === 'recovery') return <RecoveryModal onClose={onClose} />;

  if (modal === 'mobile') {
    return (
      <Modal title="Mobile preview" width="sm" onClose={onClose}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Smartphone size={28} className="text-ds-muted" />
          <p className="text-[13px] text-ds-secondary">Mobile preview is coming.</p>
          <p className="text-[12px] text-ds-faint">Use the aspect toggle (9:16) to preview vertical framing on the canvas in the meantime.</p>
        </div>
      </Modal>
    );
  }

  return null;
}
