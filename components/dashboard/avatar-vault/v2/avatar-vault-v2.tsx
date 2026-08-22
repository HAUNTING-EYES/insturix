'use client';

import React, { useState } from 'react';
import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';
import { C, SANS } from './av-tokens';
import { Mono, Btn } from './av-atoms';
import { AvatarVaultGallery } from './av-vault-gallery';
import { AvatarForge } from './av-forge';
import { AvatarRenderPlanner } from './av-render-planner';

/* ═══ Avatar Vault v2 · shell ═════════════════════════════════════════
   The founder's avatar-vault.jsx, wired to the real avatar types/hook.
   Screen switch: vault (gallery) | create (forge) | render (planner).
   Built in passes — the forge and planner land next; this pass ships the
   Vault gallery on a preview route so nothing on the live vault changes. */

type Screen = 'vault' | 'create' | 'render';

export default function AvatarVaultV2() {
  const [screen, setScreen] = useState<Screen>('vault');
  const [active, setActive] = useState<AvatarProfileRecord | null>(null);

  const goCreate = (record: AvatarProfileRecord | null) => { setActive(record); setScreen('create'); };
  const goRender = (record: AvatarProfileRecord) => { setActive(record); setScreen('render'); };

  return (
    <div className="avault" style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: SANS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap');
        .avault *{box-sizing:border-box}
        .av-fr:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
        .av-ns::-webkit-scrollbar{width:7px;height:7px}.av-ns::-webkit-scrollbar-thumb{background:${C.bs};border-radius:4px}
        .av-forge{display:grid;grid-template-columns:214px minmax(0,1fr) 300px;gap:20px;align-items:start}
        .av-vaultgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
        .av-rendergrid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start}
        .av-spin{animation:av-spin-rot .8s linear infinite}@keyframes av-spin-rot{to{transform:rotate(360deg)}}
        @media(max-width:1080px){.av-forge{grid-template-columns:1fr}.av-forge-side,.av-forge-rail{display:none}.av-rendergrid{grid-template-columns:1fr}}
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px clamp(14px,3vw,32px) 70px' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Mono s={12} c={C.gold} st={{ fontWeight: 700, letterSpacing: '0.16em' }}>AVATAR VAULT</Mono>
            {screen !== 'vault' && (
              <>
                <span style={{ color: C.faint }}>/</span>
                <Mono s={10} c={C.muted}>{screen === 'create' ? 'Create virtual person' : 'Render'}</Mono>
              </>
            )}
          </div>
          {screen === 'vault'
            ? <Btn variant="primary" onClick={() => goCreate(null)}>+ Create virtual person</Btn>
            : <Btn onClick={() => setScreen('vault')}>◂ Vault</Btn>}
        </div>

        {screen === 'vault' && (
          <AvatarVaultGallery onCreate={() => goCreate(null)} onRender={goRender} onEdit={goCreate} />
        )}
        {screen === 'create' && <AvatarForge record={active} onDone={() => { setActive(null); setScreen('vault'); }} />}
        {screen === 'render' && active && <AvatarRenderPlanner record={active} />}
      </div>
    </div>
  );
}
