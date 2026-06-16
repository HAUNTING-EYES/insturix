'use client';

/**
 * SignalTable
 *
 * Flat C1 signal-review table. Search/sort are local UI affordances; signal
 * authority and actionability still come from the shared Brand Vault helpers.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  Check,
  Fingerprint,
  Mic2,
  Palette,
  Plus,
  Search,
  Sparkles,
  Type,
} from 'lucide-react';
import type { SignalGroupId, SignalRow } from './brand-vault-types';
import { formatValue, groupMeta, isActionable, signalTone } from './brand-vault-data';

interface SignalTableProps {
  signals: SignalRow[];
  onAccept: (path: string) => void;
}

type SortField = 'signal' | 'confidence' | 'authority';
type SortDir = 'asc' | 'desc';

const GROUP_ICON: Record<SignalGroupId, LucideIcon> = {
  identity: Fingerprint,
  palette: Palette,
  typography: Type,
  visual: Sparkles,
  motion: Activity,
  voice: Mic2,
  warnings: AlertTriangle,
};

function toneColor(signal: SignalRow): string {
  const tone = signalTone(signal);
  if (tone === 'good') return '#5EC97E';
  if (tone === 'warn') return '#D4A652';
  if (tone === 'risk') return '#5F5E5A';
  return '#7A776E';
}

function authorityLabel(signal: SignalRow): string {
  if (signal.fallbackReason) return 'fallback';
  return signal.trustLevel.replace(/_/g, ' ');
}

function sortArrow(active: boolean, direction: SortDir): string {
  if (!active) return '';
  return direction === 'asc' ? 'up' : 'down';
}

export function SignalTable({ signals, onAccept }: SignalTableProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('signal');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set());
  const [inView, setInView] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const processed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? signals.filter((signal) =>
          [signal.label, signal.path, formatValue(signal.value), signal.trustLevel]
            .join(' ')
            .toLowerCase()
            .includes(q),
        )
      : [...signals];

    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'confidence') comparison = a.confidence - b.confidence;
      if (sortField === 'authority') comparison = authorityLabel(a).localeCompare(authorityLabel(b));
      if (sortField === 'signal') comparison = a.path.localeCompare(b.path);
      return sortDir === 'asc' ? comparison : -comparison;
    });
    return filtered;
  }, [search, signals, sortDir, sortField]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDir(field === 'confidence' ? 'desc' : 'asc');
  }

  function acceptSignal(path: string) {
    setAccepted((current) => new Set(current).add(path));
    onAccept(path);
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@keyframes brandVault-rowSlide {
  from { opacity: 0; transform: translateX(-14px); }
  to { opacity: 1; transform: translateX(0); }
}`,
        }}
      />
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#7A776E',
            }}
          >
            Signal review
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
            {processed.length} signals
          </span>
        </div>
        <label className="relative block">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            color="#5F5E5A"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search signals..."
            style={{
              width: 240,
              borderRadius: 8,
              border: '1px solid #1C1B19',
              background: '#0F0F0E',
              color: '#ECE9E1',
              fontSize: 13,
              padding: '9px 14px 9px 34px',
              outline: 'none',
            }}
          />
        </label>
      </div>

      <div
        ref={rootRef}
        className="overflow-hidden rounded-[14px]"
        style={{ background: '#0F0F0E', border: '1px solid #1C1B19' }}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[
                ['signal', 'Signal'],
                ['confidence', 'Confidence'],
                ['authority', 'Authority'],
              ].map(([field, label]) => (
                <th
                  key={field}
                  onClick={() => handleSort(field as SortField)}
                  className="cursor-pointer select-none text-left"
                  style={{
                    padding: '13px 20px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: sortField === field ? '#D4A652' : '#5F5E5A',
                    borderBottom: '1px solid #1C1B19',
                    background: '#131312',
                  }}
                >
                  {label} {sortArrow(sortField === field, sortDir)}
                </th>
              ))}
              <th
                style={{
                  padding: '13px 20px',
                  borderBottom: '1px solid #1C1B19',
                  background: '#131312',
                }}
              />
            </tr>
          </thead>
          <tbody>
            {processed.map((signal, index) => {
              const meta = groupMeta(signal.group);
              const Icon = GROUP_ICON[signal.group] ?? AlertTriangle;
              const actionable = isActionable(signal);
              const confidence = Math.round(signal.confidence * 100);
              const acceptedSignal = accepted.has(signal.path);
              return (
                <tr
                  key={signal.path}
                  style={{
                    borderBottom: index < processed.length - 1 ? '1px solid #1C1B19' : 'none',
                    opacity: inView ? undefined : 0,
                    animation: inView
                      ? `brandVault-rowSlide 0.5s cubic-bezier(.16,1,.3,1) ${0.12 + index * 0.07}s both`
                      : undefined,
                    transition: 'background 0.2s cubic-bezier(.16,1,.3,1)',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = '#131312';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = '';
                  }}
                >
                  <td style={{ padding: '13px 20px', verticalAlign: 'middle' }}>
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px]"
                        style={{
                          color: meta.color,
                          background: `${meta.color}1F`,
                          border: `1px solid ${meta.color}38`,
                        }}
                      >
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0">
                        <div style={{ color: actionable ? '#ECE9E1' : '#7A776E', fontSize: 14, fontWeight: 500 }}>
                          {signal.label}
                        </div>
                        <div
                          className="truncate"
                          style={{
                            marginTop: 2,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10,
                            letterSpacing: '0.04em',
                            color: '#5F5E5A',
                          }}
                        >
                          {signal.path}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, color: '#7A776E', fontSize: 13 }}>
                      {formatValue(signal.value)}
                    </div>
                  </td>
                  <td style={{ padding: '13px 20px', verticalAlign: 'middle' }}>
                    <div className="flex items-center gap-2.5">
                      <span
                        style={{
                          width: 34,
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11,
                          color: '#B5B2A8',
                        }}
                      >
                        {signal.confidence ? `${confidence}%` : '-'}
                      </span>
                      <span
                        className="block overflow-hidden rounded"
                        style={{ width: 70, height: 5, background: '#282724' }}
                      >
                        <i
                          className="block h-full"
                          style={{
                            width: `${confidence}%`,
                            background: toneColor(signal),
                          }}
                        />
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '13px 20px', verticalAlign: 'middle' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        minHeight: 24,
                        borderRadius: 6,
                        border: actionable ? '1px solid rgba(94,201,126,0.35)' : '1px dashed #282724',
                        background: actionable ? 'rgba(94,201,126,0.08)' : 'transparent',
                        color: actionable ? '#5EC97E' : '#5F5E5A',
                        padding: '0 8px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10,
                        textTransform: 'uppercase',
                      }}
                    >
                      {authorityLabel(signal)}
                    </span>
                  </td>
                  <td style={{ padding: '13px 20px', verticalAlign: 'middle', textAlign: 'right' }}>
                    {actionable ? (
                      <button
                        type="button"
                        onClick={() => acceptSignal(signal.path)}
                        aria-label={`Accept ${signal.label}`}
                        className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px]"
                        style={{
                          border: '1px solid rgba(212,166,82,0.25)',
                          background: acceptedSignal ? '#D4A652' : 'rgba(212,166,82,0.08)',
                          color: acceptedSignal ? '#0B0B0A' : '#D4A652',
                        }}
                      >
                        <Check size={15} />
                      </button>
                    ) : signal.fallbackReason ? (
                      <button type="button" className="bv-c1-button">
                        <Plus size={13} /> Add
                      </button>
                    ) : (
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 9,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: '#5F5E5A',
                        }}
                      >
                        review only
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {processed.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#5F5E5A', fontSize: 13 }}>
                  {signals.length ? 'No signals match your search.' : 'No draft signals yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
