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
  Pencil,
  Plus,
  Search,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import type { SignalGroupId, SignalRow } from './brand-vault-types';
import { formatValue, groupMeta, isActionable, signalTone } from './brand-vault-data';

interface SignalTableProps {
  signals: SignalRow[];
  editedValues?: Record<string, unknown>;
  disabled?: boolean;
  onAccept: (path: string) => void;
  onEdit: (path: string, value: unknown) => void;
}

type SortField = 'signal' | 'confidence' | 'authority';
type SortDir = 'asc' | 'desc';
type EditorKind = 'text' | 'number' | 'boolean' | 'array' | 'json';

const GROUP_ICON: Record<SignalGroupId, LucideIcon> = {
  identity: Fingerprint,
  palette: Palette,
  typography: Type,
  visual: Sparkles,
  motion: Activity,
  voice: Mic2,
  warnings: AlertTriangle,
};

const SIGNAL_EDIT_INPUT_STYLE = {
  width: '100%',
  border: '1px solid #282724',
  borderRadius: 8,
  background: '#0b0b0a',
  color: '#ece9e1',
  padding: '9px 10px',
  font: 'inherit',
  fontSize: 12,
  outline: 'none',
} as const;

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

export function SignalTable({ signals, editedValues = {}, disabled = false, onAccept, onEdit }: SignalTableProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('signal');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set());
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
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

  function startEdit(signal: SignalRow) {
    if (disabled) return;
    setEditingPath(signal.path);
    setDraftValue(draftValueForSignal(signal.value));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingPath(null);
    setDraftValue('');
    setEditError(null);
  }

  function saveEdit(signal: SignalRow) {
    const parsed = parseDraftValue(signal, draftValue);
    if (!parsed.ok) {
      setEditError(parsed.message);
      return;
    }
    onEdit(signal.path, parsed.value);
    cancelEdit();
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
              const editing = editingPath === signal.path;
              const edited = Object.prototype.hasOwnProperty.call(editedValues, signal.path);
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
                        <div className="flex flex-wrap items-center gap-2" style={{ color: actionable ? '#ECE9E1' : '#7A776E', fontSize: 14, fontWeight: 500 }}>
                          {signal.label}
                          {edited && (
                            <span
                              style={{
                                border: '1px solid rgba(94, 201, 126, 0.28)',
                                borderRadius: 5,
                                background: 'rgba(94, 201, 126, 0.08)',
                                color: '#5ec97e',
                                padding: '2px 6px',
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 9,
                                textTransform: 'uppercase',
                              }}
                            >
                              edited
                            </span>
                          )}
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
                      {editing ? (
                        <SignalValueEditor
                          kind={editorKindForValue(signal.value)}
                          value={draftValue}
                          disabled={disabled}
                          error={editError}
                          onChange={setDraftValue}
                          onCancel={cancelEdit}
                          onSave={() => saveEdit(signal)}
                        />
                      ) : (
                        <SignalValuePreview value={signal.value} />
                      )}
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
                    <div className="flex justify-end gap-2">
                      {signal.fallbackReason ? (
                        <button type="button" className="bv-c1-button" disabled={disabled} onClick={() => startEdit(signal)}>
                          <Plus size={13} /> Add
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(signal)}
                          aria-label={`Edit ${signal.label}`}
                          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px]"
                          disabled={disabled}
                          style={{
                            border: '1px solid #282724',
                            background: edited ? 'rgba(94,201,126,0.08)' : '#1B1A18',
                            color: edited ? '#5EC97E' : '#B5B2A8',
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {actionable ? (
                        <button
                          type="button"
                          onClick={() => acceptSignal(signal.path)}
                          aria-label={`Accept ${signal.label}`}
                          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px]"
                          disabled={disabled}
                          style={{
                            border: '1px solid rgba(212,166,82,0.25)',
                            background: acceptedSignal ? '#D4A652' : 'rgba(212,166,82,0.08)',
                            color: acceptedSignal ? '#0B0B0A' : '#D4A652',
                          }}
                        >
                          <Check size={15} />
                        </button>
                      ) : !signal.fallbackReason ? (
                        <span
                          style={{
                            alignSelf: 'center',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 9,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: '#5F5E5A',
                          }}
                        >
                          review only
                        </span>
                      ) : null}
                    </div>
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

function SignalValuePreview({ value }: { value: unknown }) {
  const text = formatValue(value);
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
    return (
      <span className="inline-flex items-center gap-2">
        <i className="h-4 w-4 rounded-[4px] border border-[#282724]" style={{ background: value }} />
        {text}
      </span>
    );
  }
  return <>{text}</>;
}

function SignalValueEditor({
  kind,
  value,
  disabled,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  kind: EditorKind;
  value: string;
  disabled: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="grid max-w-[620px] gap-2">
      {kind === 'boolean' ? (
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          style={SIGNAL_EDIT_INPUT_STYLE}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : kind === 'array' || kind === 'json' ? (
        <textarea
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          rows={kind === 'json' ? 5 : 4}
          className="min-h-[92px] resize-y"
          style={SIGNAL_EDIT_INPUT_STYLE}
          placeholder={kind === 'array' ? 'One value per line' : '{ "value": true }'}
        />
      ) : (
        <input
          value={value}
          disabled={disabled}
          type={kind === 'number' ? 'number' : 'text'}
          min={kind === 'number' ? 0 : undefined}
          max={kind === 'number' ? 1 : undefined}
          step={kind === 'number' ? 0.01 : undefined}
          onChange={(event) => onChange(event.target.value)}
          style={SIGNAL_EDIT_INPUT_STYLE}
        />
      )}
      {error && <span className="text-[11px] text-[#D46A5C]">{error}</span>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="bv-c1-button" disabled={disabled} onClick={onSave}>
          <Check size={13} /> Save edit
        </button>
        <button type="button" className="bv-c1-button danger" disabled={disabled} onClick={onCancel}>
          <X size={13} /> Cancel
        </button>
      </div>

    </div>
  );
}

function editorKindForValue(value: unknown): EditorKind {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value && typeof value === 'object') return 'json';
  return 'text';
}

function draftValueForSignal(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join('\n');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return value === null || value === undefined ? '' : String(value);
}

function parseDraftValue(signal: SignalRow, draft: string): { ok: true; value: unknown } | { ok: false; message: string } {
  const currentValue = signal.value;
  if (Array.isArray(currentValue)) {
    const values = draft
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    return { ok: true, value: values };
  }

  if (typeof currentValue === 'number') {
    const numeric = Number(draft);
    if (!Number.isFinite(numeric)) return { ok: false, message: 'Enter a finite number.' };
    if (numeric < 0 || numeric > 1) return { ok: false, message: 'Use a value between 0 and 1.' };
    return { ok: true, value: numeric };
  }

  if (typeof currentValue === 'boolean') return { ok: true, value: draft === 'true' };

  if (currentValue && typeof currentValue === 'object') {
    try {
      return { ok: true, value: JSON.parse(draft) as unknown };
    } catch {
      return { ok: false, message: 'Enter valid JSON for this value.' };
    }
  }

  const text = draft.trim();
  if (!text) return { ok: false, message: 'Value cannot be empty.' };
  return { ok: true, value: text };
}