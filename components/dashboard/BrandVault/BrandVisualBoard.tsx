'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, ExternalLink, Image as ImageIcon, Palette, Type } from 'lucide-react';
import type {
  BrandVaultFontPreview,
  BrandVaultVisualAssetPreview,
  BrandVaultVisualIdentitySummary,
  BrandVaultVisualSwatch,
} from './brand-vault-types';

interface BrandVisualBoardProps {
  visualIdentity: BrandVaultVisualIdentitySummary | null | undefined;
  brandName: string;
}

const EMPTY_VISUAL_IDENTITY: BrandVaultVisualIdentitySummary = {
  colors: [],
  fonts: [],
  logos: [],
  images: [],
};

export function BrandVisualBoard({ visualIdentity, brandName }: BrandVisualBoardProps) {
  const visual = visualIdentity ?? EMPTY_VISUAL_IDENTITY;
  const colors = useMemo(() => visual.colors.slice(0, 12), [visual.colors]);
  const fonts = useMemo(() => visual.fonts.slice(0, 6), [visual.fonts]);
  const logos = useMemo(() => visual.logos.slice(0, 6), [visual.logos]);
  const images = useMemo(() => visual.images.slice(0, 8), [visual.images]);
  const visualCount = colors.length + fonts.length + logos.length + images.length;

  if (visualCount === 0) {
    return (
      <section className="border-b border-[#1C1B19] py-6" aria-label="Brand visual evidence">
        <BoardHeader
          title="Brand visuals"
          countLabel="0 stored"
          detail="Refresh scan to store palette, font, logo, and product previews."
        />
        <div className="flex min-h-[92px] items-center gap-3 rounded-[8px] border border-dashed border-[#282724] bg-[#0F0F0E] px-4 py-4 text-[12px] leading-5 text-[#7A776E]">
          <ImageIcon size={17} className="flex-none text-[#5F5E5A]" />
          <span>
            {visualIdentity ? 'No renderable visual previews were found in this draft.' : 'This draft was created before visual previews were stored.'}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-[#1C1B19] py-6" aria-label="Brand visual evidence">
      <BoardHeader
        title="Brand visuals"
        countLabel={`${visualCount} previews`}
        detail={`${colors.length} colors / ${fonts.length} fonts / ${logos.length + images.length} assets`}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        <div className="grid content-start gap-4">
          <VisualSection title="Palette" count={colors.length} icon="palette">
            {colors.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {colors.map((swatch) => (
                  <ColorCard key={swatch.id} swatch={swatch} />
                ))}
              </div>
            ) : (
              <EmptyLane label="No palette swatches stored." />
            )}
          </VisualSection>

          <VisualSection title="Typography" count={fonts.length} icon="type">
            {fonts.length > 0 ? (
              <div className="grid gap-3">
                {fonts.map((font) => (
                  <FontCard key={font.id} font={font} brandName={brandName} />
                ))}
              </div>
            ) : (
              <EmptyLane label="No font previews stored." />
            )}
          </VisualSection>
        </div>

        <div className="grid content-start gap-4">
          <VisualSection title="Logo system" count={logos.length} icon="image">
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

          <VisualSection title="Product and media" count={images.length} icon="image">
            {images.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {images.map((asset) => (
                  <VisualAssetTile key={asset.id} asset={asset} />
                ))}
              </div>
            ) : (
              <EmptyLane label="No product or media previews stored." />
            )}
          </VisualSection>
        </div>
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
        <span className="bv-c1-mono">Visual board</span>
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
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: 'palette' | 'type' | 'image';
  children: ReactNode;
}) {
  const Icon = icon === 'palette' ? Palette : icon === 'type' ? Type : ImageIcon;
  return (
    <div className="min-w-0 rounded-[8px] border border-[#1C1B19] bg-[#0F0F0E] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] border border-[#282724] bg-[#131312] text-[#D4A652]">
            <Icon size={15} />
          </span>
          <strong className="truncate text-[13px] font-extrabold text-[#ECE9E1]">{title}</strong>
        </div>
        <span className="font-['JetBrains_Mono'] text-[10px] uppercase text-[#7A776E]">{count}</span>
      </div>
      {children}
    </div>
  );
}

function ColorCard({ swatch }: { swatch: BrandVaultVisualSwatch }) {
  const textColor = readableTextColor(swatch.value);
  const contrastWarnings = [
    swatch.unsafeOnDark ? 'dark' : '',
    swatch.unsafeOnLight ? 'light' : '',
  ].filter(Boolean);

  return (
    <div className="min-w-0 overflow-hidden rounded-[8px] border border-[#1C1B19] bg-[#131312]">
      <div className="flex min-h-[82px] items-end justify-between gap-3 p-3" style={{ background: swatch.value, color: textColor }}>
        <span className="rounded-[5px] bg-black/20 px-2 py-1 font-['JetBrains_Mono'] text-[10px] uppercase backdrop-blur">
          {swatch.role}
        </span>
        {contrastWarnings.length > 0 && (
          <span className="rounded-[5px] bg-black/20 px-2 py-1 font-['JetBrains_Mono'] text-[10px] uppercase backdrop-blur">
            check {contrastWarnings.join('/')}
          </span>
        )}
      </div>
      <div className="grid gap-2 p-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <strong className="min-w-0 truncate text-[12px] font-bold text-[#ECE9E1]">{swatch.label}</strong>
          <code className="font-['JetBrains_Mono'] text-[10px] text-[#D4A652]">{swatch.value}</code>
        </div>
        <EvidenceLine confidence={swatch.confidence} source={swatch.sourceTrust ?? swatch.signalPath} />
      </div>
    </div>
  );
}

function FontCard({ font, brandName }: { font: BrandVaultFontPreview; brandName: string }) {
  const sample = font.sampleText || brandName || 'Brand system';
  return (
    <div className="grid min-w-0 gap-3 rounded-[8px] border border-[#1C1B19] bg-[#131312] p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block truncate text-[12px] font-bold text-[#ECE9E1]">{font.family}</strong>
          <span className="mt-1 block font-['JetBrains_Mono'] text-[10px] uppercase text-[#7A776E]">{font.role}</span>
        </div>
        <EvidenceLine confidence={font.confidence} source={font.sourceTrust ?? font.signalPath} align="right" />
      </div>
      <p
        className="m-0 min-h-[58px] break-words rounded-[8px] border border-[#1C1B19] bg-[#0B0B0A] px-3 py-3 text-[25px] leading-tight text-[#ECE9E1]"
        style={{ fontFamily: font.cssFontFamily }}
      >
        {sample}
      </p>
    </div>
  );
}

function VisualAssetTile({ asset, compact = false }: { asset: BrandVaultVisualAssetPreview; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = asset.thumbnailUrl ?? asset.url;
  const status = asset.availability?.status ?? 'unknown';
  const isPlayableVideo = asset.mediaType === 'video' && asset.kind === 'video';
  const frameUrls = asset.sampledFrameUrls?.filter((url) => url !== imageUrl).slice(0, 3) ?? [];

  return (
    <div className="group grid min-w-0 gap-2 rounded-[8px] border border-[#1C1B19] bg-[#131312] p-2 transition hover:border-[#282724]">
      <div className={`relative overflow-hidden rounded-[7px] border border-[#1C1B19] bg-[#0B0B0A] ${compact ? 'aspect-[4/2.6]' : 'aspect-[4/3]'}`}>
        {!failed && isPlayableVideo ? (
          <video
            src={asset.url}
            poster={asset.thumbnailUrl}
            controls
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
            onError={() => setFailed(true)}
          />
        ) : !failed ? (
          <img
            src={imageUrl}
            alt={asset.label}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.02]"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 px-3 text-center text-[11px] text-[#7A776E]">
            <ImageIcon size={15} />
            Preview unavailable
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-[5px] border border-black/20 bg-black/45 px-2 py-1 font-['JetBrains_Mono'] text-[10px] uppercase text-white backdrop-blur">
          {(isPlayableVideo ? 'video' : asset.kind).replace(/_/g, ' ')}
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

function EvidenceLine({
  confidence,
  source,
  align = 'left',
}: {
  confidence: number;
  source: string;
  align?: 'left' | 'right';
}) {
  const color = confidence >= 0.65 ? '#5EC97E' : confidence >= 0.5 ? '#D4A652' : '#7A776E';
  return (
    <span className={`grid gap-0.5 font-['JetBrains_Mono'] text-[10px] uppercase ${align === 'right' ? 'justify-items-end text-right' : ''}`}>
      <span style={{ color }}>{Math.round(confidence * 100)}%</span>
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

function readableTextColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ECE9E1';
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.58 ? '#0B0B0A' : '#FFFFFF';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const raw = match[1];
  if (!raw) return null;
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
}
