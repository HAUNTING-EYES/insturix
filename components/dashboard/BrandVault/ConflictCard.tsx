'use client';

/**
 * ConflictCard — "Pick what fits"
 *
 * When a few different values were found for one piece of brand info, the user picks the one that fits.
 * Deliberately plain: it shows the candidate VALUES (deduped) as selectable options with one suggested —
 * never the signal path, source type, authority/trust tier, confidence %, or "N sources disagree". The
 * user decides; they never see the voting mechanics behind the disagreement (founder IP directive).
 */

import { useMemo, useState } from 'react';
import type { SignalConflict } from './brand-vault-types';
import { formatValue } from './brand-vault-data';

interface ConflictCardProps {
  conflict: SignalConflict | null;
  resolved?: boolean;
  disabled?: boolean;
  onAccept: (path: string, value: unknown) => void;
  onEdit: (path: string) => void;
  onReject: (path: string) => void;
}

function isColorValue(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value.trim());
}

function candidateValue(candidate: SignalConflict['candidates'][number]): unknown {
  return candidate.normalizedValue ?? candidate.rawValue;
}

export function ConflictCard({ conflict, resolved = false, disabled = false, onAccept, onEdit, onReject }: ConflictCardProps) {
  // Distinct candidate values, highest-confidence first (candidates arrive pre-sorted). Hooks run before
  // the null guard so the order is stable.
  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: { value: unknown; label: string; isColor: boolean }[] = [];
    for (const candidate of conflict?.candidates ?? []) {
      const value = candidateValue(candidate);
      const label = formatValue(value);
      const key = label.trim().toLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      out.push({ value, label, isColor: isColorValue(value) });
    }
    return out;
  }, [conflict]);
  const [selected, setSelected] = useState(0);

  if (!conflict) return null;
  const chosen = options[selected] ?? options[0];

  return (
    <div
      style={{
        marginBottom: resolved ? 0 : 40,
        maxHeight: resolved ? 0 : 640,
        opacity: resolved ? 0 : 1,
        overflow: 'hidden',
        transition:
          'max-height 0.6s cubic-bezier(.16,1,.3,1), opacity 0.5s cubic-bezier(.16,1,.3,1), margin 0.6s cubic-bezier(.16,1,.3,1)',
      }}
    >
      <div className="mb-3" style={{ fontSize: 13, fontWeight: 500, color: '#D4A652' }}>Needs your pick</div>

      <article
        className="relative overflow-hidden rounded-[14px]"
        style={{ background: '#0F0F0E', border: '1px solid rgba(212,166,82,0.22)', padding: '22px 24px' }}
      >
        <div className="absolute left-0 right-0 top-0 h-0.5" style={{ background: '#D4A652' }} />

        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 500, color: '#ECE9E1' }}>
          {conflict.label} - which fits?
        </h2>
        <p style={{ margin: '4px 0 16px', fontSize: 13, color: '#9A978E', lineHeight: 1.5 }}>
          We saw a few possibilities across your content. Pick the one that sounds like you.
        </p>

        <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">
          {options.map((option, index) => {
            const isSelected = index === selected;
            const isSuggested = index === 0;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => setSelected(index)}
                disabled={disabled}
                className="flex min-w-0 items-center gap-3 text-left"
                style={{
                  padding: '11px 13px',
                  borderRadius: 9,
                  border: isSelected ? '1px solid rgba(212,166,82,0.45)' : '1px solid #1C1B19',
                  background: isSelected ? 'rgba(212,166,82,0.08)' : 'transparent',
                  color: '#ECE9E1',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 16,
                    height: 16,
                    flex: '0 0 auto',
                    borderRadius: '50%',
                    border: isSelected ? '4px solid #D4A652' : '1px solid #5F5E5A',
                  }}
                />
                {option.isColor && (
                  <span
                    aria-hidden="true"
                    style={{ width: 18, height: 18, flex: '0 0 auto', borderRadius: 5, border: '1px solid #282724', background: String(option.value) }}
                  />
                )}
                <span className="min-w-0 flex-1 break-words line-clamp-2" style={{ fontSize: 13, lineHeight: 1.4 }}>{option.label}</span>
                {isSuggested && (
                  <span
                    style={{
                      flex: '0 0 auto',
                      fontSize: 11,
                      color: '#D4A652',
                      background: 'rgba(212,166,82,0.14)',
                      borderRadius: 999,
                      padding: '2px 9px',
                    }}
                  >
                    Suggested
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => onAccept(conflict.path, chosen?.value)}
            disabled={disabled}
            className="inline-flex min-h-8 items-center gap-2 rounded-[7px] px-4"
            style={{ background: '#D4A652', border: '1px solid #D4A652', color: '#0B0B0A', fontSize: 13, fontWeight: 500 }}
          >
            Use this
          </button>
          <button type="button" onClick={() => onEdit(conflict.path)} disabled={disabled} className="bv-c1-button">
            Edit
          </button>
          <button
            type="button"
            onClick={() => onReject(conflict.path)}
            disabled={disabled}
            className="bv-c1-button"
            style={{ color: '#9A978E', borderColor: '#282724', background: 'transparent' }}
          >
            Skip
          </button>
        </div>
      </article>
    </div>
  );
}
