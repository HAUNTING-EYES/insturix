'use client';

import React, { useEffect, useState } from 'react';
import type { CalosCampaignReference } from '@/schemas/calos-campaign';
import { Sheet, Mono } from './calos-atoms';
import { C } from './calos-view-model';
import { CalosReferencesPanel } from './calos-references-panel';

/* ═══ CalOS v3 · brand references ═════════════════════════════════════
   Attach source material to the BRAND itself — no campaign required. Every
   post/script for this brand is generated from these (campaign references
   layer on top). This is the home for references when the user never makes
   a campaign. */

export function CalosBrandReferencesModal({
  brandId, brandName, onClose,
}: {
  brandId: string;
  brandName: string;
  onClose: () => void;
}) {
  const [refs, setRefs] = useState<CalosCampaignReference[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/services/calos/brand-references?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (alive) setRefs(Array.isArray(data?.references) ? data.references : []);
      } catch {
        if (alive) setRefs([]);
      }
    })();
    return () => { alive = false; };
  }, [brandId]);

  return (
    <Sheet title={`${brandName} · references`} onClose={onClose} w={560}>
      <Mono s={9} c={C.muted} st={{ display: 'block', marginBottom: 14 }}>
        Source material every post &amp; script for this brand is written from — links, PDFs, docs, notes. Applies with or without a campaign.
      </Mono>
      {refs === null ? (
        <Mono s={12} c={C.dim}>Loading…</Mono>
      ) : (
        <CalosReferencesPanel
          addUrl={`/api/services/calos/brand-references?brandId=${encodeURIComponent(brandId)}`}
          delUrl={(id) => `/api/services/calos/brand-references?brandId=${encodeURIComponent(brandId)}&refId=${encodeURIComponent(id)}`}
          initialRefs={refs}
        />
      )}
    </Sheet>
  );
}
