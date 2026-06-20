'use client';

/**
 * BrandVisualBoard — brand ASSETS (logos, product imagery, video).
 *
 * Palette and typography now live in BrandHero (the summary), so this board is
 * the asset gallery only — no longer repeats colours/fonts. Video assets render
 * as a poster + click-to-play (no autoloaded black <video> players); a missing
 * poster degrades to a clean placeholder instead of a black box.
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ExternalLink, Film, Image as ImageIcon, Play } from 'lucide-react';
import type {
  BrandVaultVisualAssetPreview,
  BrandVaultVisualIdentitySummary,
} from './brand-vault-types';

interface BrandVisualBoardProps {
  visualIdentity: BrandVaultVisualIdentitySummary | null | undefined;
}

const EMPTY_VISUAL_IDENTITY: BrandVaultVisualIdentitySummary = {
  colors: [],
  fonts: [],
  logos: [],
  images: [],
};

export function BrandVisualBoard({ visualIdentity }: BrandVisualBoardProps) {
  const visual = visualIdentity ?? EMPTY_VISUAL_IDENTITY;
  const logos = useMemo(() => visual.logos.slice(0, 6), [visual.logos]);
  const images = useMemo(() => visual.images.slice(0, 8), [visual.images]);
  const assetCount = logos.length + images.length;

  if (assetCount === 0) {
    return (
      <section className="border-b border-[#1C1B19] py-6" aria-label="Brand assets">
        <BoardHeader
          title="Brand assets"
          countLabel="0 stored"
          detail="Logos, product imagery, and video appear here once a scan stores them."
        />
        <div className="flex min-h-[92px] items-center gap-3 rounded-[8px] border border-dashed border-[#282724] bg-[#0F0F0E] px-4 py-4 text-[12px] leading-5 text-[#7A776E]">
          <ImageIcon size={17} className="flex-none text-[#5F5E5A]" />
          <span>
            {visualIdentity
              ? 'No logo, product, or video previews were found in this draft.'
              : 'This draft was created before assets were stored.'}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-[#1C1B19] py-6" aria-label="Brand assets">
      <BoardHeader
        title="Brand assets"
        countLabel={`${assetCount} stored`}
        detail={`${logos.length} logos / ${images.length} product & media`}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <VisualSection title="Logo system" count={logos.length}>
          {logos.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {logos.map((asset) => (
                <VisualAssetTile key={asset.id} asset={asset} compact />
              ))}
            </div>
          ) : (
            <EmptyLane label="No logo previews stored." />
          )}
        </VisualSection>

        <VisualSection title="Product, media & video" count={images.length}>
          {images.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {images.map((asset) => (
                <VisualAssetTile key={asset.id} asset={asset} />
              ))}
            </div>
          ) : (
            <EmptyLane label="No product, media, or video previews stored." />
          )}
        </VisualSection>
      </div>
    </section>
  );
}

function BoardHeader({
  title,
  countLabel,
  detail,
}: {
  title: string;
  countLabel: string;
  detail: string;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <span className="bv-c1-mono">Assets</span>
        <h2 className="mt-1 text-[18px] font-extrabold leading-tight text-[#ECE9E1]">{title}</h2>
      </div>
      <div className="grid justify-items-end gap-1 text-right">
        <span className="rounded-[6px] border border-[#282724] bg-[#1B1A18] px-2.5 py-1 font-['JetBrains_Mono'] text-[10px] uppercase text-[#B5B2A8]">
          {countLabel}
        </span>
        <span className="text-[11px] text-[#7A776E]">{detail}</span>
      </div>
    </div>
  );
}

function VisualSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[8px] border border-[#1C1B19] bg-[#0F0F0E] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] border border-[#282724] bg-[#131312] text-[#D4A652]">
            <ImageIcon size={15} />
          </span>
          <strong className="truncate text-[13px] font-extrabold text-[#ECE9E1]">{title}</strong>
        </div>
        <span className="font-['JetBrains_Mono'] text-[10px] uppercase text-[#7A776E]">{count}</span>
      </div>
      {children}
    </div>
  );
}

function VisualAssetTile({ asset, compact = false }: { asset: BrandVaultVisualAssetPreview; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const isVideo = asset.mediaType === 'video' && asset.kind === 'video';
  const posterUrl = isVideo ? asset.thumbnailUrl : asset.thumbnailUrl ?? asset.url;
  const status = asset.availability?.status ?? 'unknown';
  const frameUrls = asset.sampledFrameUrls?.filter((url) => url !== posterUrl).slice(0, 3) ?? [];

  return (
    <div className="group grid min-w-0 gap-2 rounded-[8px] border border-[#1C1B19] bg-[#131312] p-2 transition hover:border-[#282724]">
      <div className={`relative overflow-hidden rounded-[7px] border border-[#1C1B19] bg-[#0B0B0A] ${compact ? 'aspect-[4/2.6]' : 'aspect-[4/3]'}`}>
        {isVideo && playing ? (
          <video
            src={asset.url}
            poster={asset.thumbnailUrl}
            controls
            autoPlay
            muted
            playsInline
            className="h-full w-full object-contain"
          />
        ) : isVideo ? (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="relative block h-full w-full"
            aria-label={`Play ${asset.label}`}
          >
            {posterUrl && !failed ? (
              <img
                src={posterUrl}
                alt={asset.label}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={() => setFailed(true)}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[#0F0F0E] text-[#5F5E5A]">
                <Film size={18} />
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center transition group-hover:bg-black/10">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/50 text-white backdrop-blur">
                <Play size={16} />
              </span>
            </span>
          </button>
        ) : !failed ? (
          <img
            src={posterUrl}
            alt={asset.label}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 px-3 text-center text-[11px] text-[#7A776E]">
            <ImageIcon size={15} />
            Preview unavailable
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-[5px] border border-black/20 bg-black/45 px-2 py-1 font-['JetBrains_Mono'] text-[10px] uppercase text-white backdrop-blur">
          {(isVideo ? 'video' : asset.kind).replace(/_/g, ' ')}
        </span>
      </div>
      {frameUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {frameUrls.map((url) => (
            <img
              key={url}
              src={url}
              alt={`${asset.label} frame`}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="aspect-video min-w-0 rounded-[5px] border border-[#1C1B19] object-cover"
            />
          ))}
        </div>
      )}
      <div className="grid min-w-0 gap-1 px-1 pb-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <strong className="min-w-0 truncate text-[12px] font-bold text-[#ECE9E1]">{asset.label}</strong>
          <a href={asset.url} target="_blank" rel="noreferrer" aria-label={`Open ${asset.label}`}>
            <ExternalLink size={13} className="flex-none text-[#5F5E5A]" />
          </a>
        </div>
        <EvidenceLine
          confidence={asset.confidence}
          source={asset.platform ?? asset.evidenceOrigin ?? asset.sourceType ?? asset.signalPath ?? status}
        />
      </div>
    </div>
  );
}

function EvidenceLine({ confidence, source }: { confidence: number; source: string }) {
  const color = confidence >= 0.65 ? '#5EC97E' : confidence >= 0.5 ? '#D4A652' : '#7A776E';
  return (
    <span className="grid gap-0.5 font-['JetBrains_Mono'] text-[10px] uppercase">
      <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{Math.round(confidence * 100)}%</span>
      <span className="max-w-full truncate text-[#5F5E5A]">{source.replace(/_/g, ' ')}</span>
    </span>
  );
}

function EmptyLane({ label }: { label: string }) {
  return (
    <div className="flex min-h-[58px] items-center gap-2 rounded-[8px] border border-dashed border-[#282724] bg-[#0B0B0A] px-3 py-3 text-[12px] text-[#7A776E]">
      <AlertTriangle size={14} className="flex-none text-[#5F5E5A]" />
      <span>{label}</span>
    </div>
  );
}
