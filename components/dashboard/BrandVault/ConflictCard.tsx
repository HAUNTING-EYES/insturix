'use client';

/**
 * ConflictCard
 *
 * The C1 decision focal point: one signal path, multiple disagreeing evidence
 * candidates, and a clear local resolution action.
 */

import { AlertTriangle } from 'lucide-react';
import type { SignalConflict } from './brand-vault-types';
import { formatValue } from './brand-vault-data';

interface ConflictCardProps {
  conflict: SignalConflict | null;
  resolved?: boolean;
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

function authorityLabel(candidate: SignalConflict['candidates'][number]): string {
  const authority = candidate.authorityClass.replace(/_/g, ' ');
  return `${authority} / ${Math.round(candidate.confidence * 100)}%`;
}

function sourceLabel(candidate: SignalConflict['candidates'][number]): string {
  return candidate.sourceType.replace(/_/g, ' ');
}

export function ConflictCard({
  conflict,
  resolved = false,
  onAccept,
  onEdit,
  onReject,
}: ConflictCardProps) {
  if (!conflict) return null;

  const recommended = conflict.candidates[0];
  const recommendation = recommended ? candidateValue(recommended) : undefined;
  const recommendationLabel = formatValue(recommendation);
  const swatchColor = isColorValue(recommendation) ? recommendation : '#282724';

  return (
    <div
      style={{
        marginBottom: resolved ? 0 : 40,
        maxHeight: resolved ? 0 : 560,
        opacity: resolved ? 0 : 1,
        overflow: 'hidden',
        transition:
          'max-height 0.6s cubic-bezier(.16,1,.3,1), opacity 0.5s cubic-bezier(.16,1,.3,1), margin 0.6s cubic-bezier(.16,1,.3,1)',
      }}
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#D4A652',
          }}
        >
          Needs decision
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 6,
            background: '#1B1A18',
            border: '1px solid #1C1B19',
            color: '#7A776E',
          }}
        >
          1
        </span>
      </div>

      <article
        className="relative overflow-hidden rounded-[14px]"
        style={{
          background: '#0F0F0E',
          border: '1px solid rgba(212,166,82,0.22)',
          padding: '22px 24px',
        }}
      >
        <div className="absolute left-0 right-0 top-0 h-0.5" style={{ background: '#D4A652' }} />

        <div className="mb-4 flex items-center gap-3.5">
          <span
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              flex: '0 0 auto',
              borderRadius: 5,
              border: '1px solid #282724',
              background: swatchColor,
            }}
          />
          <div className="min-w-0 flex-1">
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 500, color: '#ECE9E1' }}>
              {conflict.label}
            </h2>
            <div style={{ marginTop: 2, fontSize: 12, color: '#7A776E' }}>
              {conflict.path} / {conflict.candidates.length} sources disagree
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1.5"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              padding: '4px 9px',
              borderRadius: 6,
              border: '1px solid rgba(212,106,92,0.35)',
              background: 'rgba(212,106,92,0.08)',
              color: '#D46A5C',
              whiteSpace: 'nowrap',
            }}
          >
            <AlertTriangle size={12} /> conflict
          </span>
        </div>

        <div>
          {conflict.candidates.map((candidate) => {
            const value = candidateValue(candidate);
            const color = isColorValue(value) ? value : '#282724';
            return (
              <div
                key={candidate.id}
                className="flex items-center gap-3"
                style={{
                  padding: '11px 0',
                  borderTop: '1px solid #131312',
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5" style={{ color: '#B5B2A8', fontSize: 13 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 18,
                      height: 18,
                      flex: '0 0 auto',
                      borderRadius: 5,
                      border: '1px solid #282724',
                      background: color,
                    }}
                  />
                  <span className="truncate">
                    {sourceLabel(candidate)} / {formatValue(value)}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    padding: '4px 9px',
                    borderRadius: 6,
                    border: candidate === recommended ? '1px solid rgba(94,201,126,0.35)' : '1px solid #282724',
                    background: candidate === recommended ? 'rgba(94,201,126,0.08)' : 'transparent',
                    color: candidate === recommended ? '#5EC97E' : '#7A776E',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {authorityLabel(candidate)}
                </span>
              </div>
            );
          })}
        </div>

        <p
          style={{
            margin: '16px 0 0',
            paddingTop: 14,
            borderTop: '1px solid #131312',
            color: '#B5B2A8',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          Highest-confidence evidence recommends{' '}
          <b style={{ color: '#5EC97E', fontWeight: 500 }}>{recommendationLabel}</b>. Resolving here clears the review anomaly; accepting the profile still publishes the full draft.
        </p>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => onAccept(conflict.path, recommendation)}
            className="inline-flex min-h-8 items-center gap-2 rounded-[7px] px-3"
            style={{
              background: '#D4A652',
              border: '1px solid #D4A652',
              color: '#0B0B0A',
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            Accept {recommendationLabel}
          </button>
          <button type="button" onClick={() => onEdit(conflict.path)} className="bv-c1-button">
            Edit
          </button>
          <button
            type="button"
            onClick={() => onReject(conflict.path)}
            className="bv-c1-button"
            style={{
              color: '#D46A5C',
              borderColor: 'rgba(212,106,92,0.3)',
              background: 'transparent',
            }}
          >
            Reject
          </button>
        </div>
      </article>
    </div>
  );
}
