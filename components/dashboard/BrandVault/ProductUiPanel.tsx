'use client';

/**
 * ProductUiPanel — renders the vision-decoded Product UI Model (what the scan SAW in the rendered
 * screenshots): brand tokens, positioning, the detected product screens and their key elements, and the
 * aha-flow. Present only after vision-decode ran (it's a post-save enrichment); renders nothing otherwise.
 */

import { Eye, Layout } from 'lucide-react';
import type { BrandProductUiModel } from '@/lib/shared/brand-vault-vision-decode';

interface ProductUiPanelProps {
  model: BrandProductUiModel | null | undefined;
}

export function ProductUiPanel({ model }: ProductUiPanelProps) {
  if (!model) return null;

  const brand = model.brand;
  const swatches = (
    brand
      ? [
          { name: 'bg', value: brand.bg },
          { name: 'surface', value: brand.surface },
          { name: 'accent', value: brand.accent },
          { name: 'text', value: brand.text },
        ]
      : []
  ).filter((entry): entry is { name: string; value: string } => Boolean(entry.value));
  const screens = model.screens ?? [];
  const features = model.features ?? [];
  const aha = model.ahaFlow ?? [];

  return (
    <section className="border-b border-[#1C1B19] py-6" aria-label="Product UI">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="bv-c1-mono">Product UI</span>
          <h2 className="mt-1 text-[18px] font-extrabold leading-tight text-[#ECE9E1]">What the scan saw</h2>
        </div>
        <span className="rounded-[6px] border border-[#282724] bg-[#1B1A18] px-2.5 py-1 font-['JetBrains_Mono'] text-[10px] uppercase text-[#B5B2A8]">
          decoded from screenshots
        </span>
      </div>

      <div className="grid gap-3">
        {(brand || model.positioning) && (
          <div className="rounded-[8px] border border-[#1C1B19] bg-[#0F0F0E] p-3">
            {model.positioning?.oneLiner && (
              <p className="text-[14px] font-bold leading-snug text-[#ECE9E1]">&ldquo;{model.positioning.oneLiner}&rdquo;</p>
            )}
            {model.positioning?.whatItDoes && (
              <p className="mt-1 text-[12px] leading-5 text-[#9B988E]">{model.positioning.whatItDoes}</p>
            )}
            {(swatches.length > 0 || brand?.vibe || brand?.fontFamily) && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {swatches.map(({ name, value }) => (
                  <span key={name} className="flex items-center gap-1.5" title={`${name}: ${value}`}>
                    <span className="h-4 w-4 flex-none rounded-[4px] border border-[#282724]" style={{ background: value }} />
                    <span className="font-['JetBrains_Mono'] text-[10px] uppercase text-[#7A776E]">{value}</span>
                  </span>
                ))}
                {brand?.fontFamily && <Chip label={brand.fontFamily} />}
                {brand?.vibe && <span className="text-[11px] italic text-[#7A776E]">{brand.vibe}</span>}
              </div>
            )}
          </div>
        )}

        {features.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {features.slice(0, 12).map((feature) => (
              <Chip key={feature} label={feature} />
            ))}
          </div>
        )}

        {screens.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {screens.map((screen) => (
              <div key={screen.name} className="min-w-0 rounded-[8px] border border-[#1C1B19] bg-[#0F0F0E] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[7px] border border-[#282724] bg-[#131312] text-[#D4A652]">
                    <Layout size={13} />
                  </span>
                  <strong className="min-w-0 truncate text-[13px] font-extrabold text-[#ECE9E1]">
                    {screen.name.replace(/[-_]/g, ' ')}
                  </strong>
                  {screen.shell && (
                    <span className="flex-none font-['JetBrains_Mono'] text-[10px] uppercase text-[#7A776E]">{screen.shell}</span>
                  )}
                </div>
                {screen.whatItShows && <p className="text-[12px] leading-5 text-[#9B988E]">{screen.whatItShows}</p>}
                {screen.keyElements && screen.keyElements.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {screen.keyElements.slice(0, 8).map((element) => (
                      <Chip key={element} label={element} muted />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {aha.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#9B988E]">
            <Eye size={13} className="flex-none text-[#5F5E5A]" />
            {aha.map((step, index) => (
              <span key={`${index}-${step}`} className="flex items-center gap-2">
                {index > 0 && <span className="text-[#5F5E5A]">&rarr;</span>}
                <span>{step}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Chip({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <span
      className={`rounded-[6px] border px-2 py-1 text-[11px] ${
        muted ? 'border-[#1C1B19] bg-[#131312] text-[#9B988E]' : 'border-[#282724] bg-[#1B1A18] text-[#B5B2A8]'
      }`}
    >
      {label}
    </span>
  );
}
