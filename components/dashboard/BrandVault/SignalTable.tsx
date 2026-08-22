'use client';

/**
 * SignalTable — "Your brand info"
 *
 * User-facing review of the brand's details. Deliberately shows ONLY the info (friendly name + value)
 * and a confirm/edit action — never the internal signal path, confidence score, or authority/trust tier.
 * The review surface must not reveal how the signals engine works (founder IP directive): a user sees
 * WHAT their brand is, never HOW the system decided it.
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
  Search,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import type { SignalGroupId, SignalRow } from './brand-vault-types';
import { formatValue, groupMeta, isActionable } from './brand-vault-data';

interface SignalTableProps {
  signals: SignalRow[];
  editedValues?: Record<string, unknown>;
  confirmedSignalPaths?: readonly string[];
  disabled?: boolean;
  onAccept: (path: string) => void | Promise<void>;
  onEdit: (path: string, value: unknown) => void | Promise<void>;
}

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

export function SignalTable({
  signals,
  editedValues = {},
  confirmedSignalPaths = [],
  disabled = false,
  onAccept,
  onEdit,
}: SignalTableProps) {
  const [search, setSearch] = useState('');
  const accepted = useMemo(() => new Set(confirmedSignalPaths), [confirmedSignalPaths]);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingPath, setSavingPath] = useState<string | null>(null);
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

  // Search matches only the friendly name + the value — never internal fields (path, trust level).
  const processed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return signals;
    return signals.filter((signal) => [signal.label, formatValue(signal.value)].join(' ').toLowerCase().includes(q));
  }, [search, signals]);

  async function acceptSignal(path: string) {
    if (disabled || accepted.has(path) || savingPath) return;
    setActionError(null);
    setSavingPath(path);
    try {
      await onAccept(path);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not save that confirmation.');
    } finally {
      setSavingPath(null);
    }
  }

  function startEdit(signal: SignalRow) {
    if (disabled || savingPath) return;
    setEditingPath(signal.path);
    setDraftValue(draftValueForSignal(signal.value));
    setEditError(null);
    setActionError(null);
  }

  function cancelEdit() {
    setEditingPath(null);
    setDraftValue('');
    setEditError(null);
  }

  async function saveEdit(signal: SignalRow) {
    const parsed = parseDraftValue(signal, draftValue);
    if (!parsed.ok) {
      setEditError(parsed.message);
      return;
    }
    setActionError(null);
    setSavingPath(signal.path);
    try {
      await onEdit(signal.path, parsed.value);
      cancelEdit();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Could not save that edit.');
    } finally {
      setSavingPath(null);
    }
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
        <span style={{ fontSize: 14, fontWeight: 500, color: '#ECE9E1' }}>Your brand info</span>
        <label className="relative block">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" color="#5F5E5A" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search..."
            style={{
              width: 220,
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

      {actionError && (
        <div className="mb-3 rounded-[8px] border border-[rgba(212,106,92,0.3)] bg-[rgba(212,106,92,0.06)] px-3 py-2 text-[12px] text-[#D46A5C]">
          {actionError}
        </div>
      )}

      <div ref={rootRef} className="overflow-hidden rounded-[14px]" style={{ background: '#0F0F0E', border: '1px solid #1C1B19' }}>
        {processed.map((signal, index) => {
          const meta = groupMeta(signal.group);
          const Icon = GROUP_ICON[signal.group] ?? AlertTriangle;
          const actionable = isActionable(signal);
          const acceptedSignal = accepted.has(signal.path);
          const editing = editingPath === signal.path;
          const edited = Object.prototype.hasOwnProperty.call(editedValues, signal.path);
          return (
            <div
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
              <div className="flex items-start justify-between gap-3" style={{ padding: '13px 18px' }}>
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px]"
                    style={{ color: meta.color, background: `${meta.color}1F`, border: `1px solid ${meta.color}38` }}
                  >
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2" style={{ color: '#ECE9E1', fontSize: 14, fontWeight: 500 }}>
                      {signal.label}
                      {edited && (
                        <span
                          style={{
                            border: '1px solid rgba(94, 201, 126, 0.28)',
                            borderRadius: 5,
                            background: 'rgba(94, 201, 126, 0.08)',
                            color: '#5ec97e',
                            padding: '2px 7px',
                            fontSize: 10,
                          }}
                        >
                          edited
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 3, color: '#9A978E', fontSize: 13, lineHeight: 1.5 }}>
                      {editing ? (
                        <SignalValueEditor
                          kind={editorKindForValue(signal.value)}
                          value={draftValue}
                          disabled={disabled || Boolean(savingPath)}
                          error={editError}
                          onChange={setDraftValue}
                          onCancel={cancelEdit}
                          onSave={() => void saveEdit(signal)}
                        />
                      ) : (
                        <SignalValuePreview value={signal.value} />
                      )}
                    </div>
                  </div>
                </div>
                {!editing && (
                  <div className="flex flex-none items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(signal)}
                      aria-label={`Edit ${signal.label}`}
                      className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px]"
                      disabled={disabled || Boolean(savingPath)}
                      style={{
                        border: '1px solid #282724',
                        background: edited ? 'rgba(94,201,126,0.08)' : '#1B1A18',
                        color: edited ? '#5EC97E' : '#B5B2A8',
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    {actionable && (
                      <button
                        type="button"
                        onClick={() => void acceptSignal(signal.path)}
                        aria-label={`Confirm ${signal.label} looks right`}
                        className="inline-flex h-[30px] items-center gap-1.5 rounded-[7px] px-2.5"
                        disabled={disabled || acceptedSignal || Boolean(savingPath)}
                        style={{
                          border: acceptedSignal ? '1px solid #5EC97E' : '1px solid rgba(94,201,126,0.35)',
                          background: acceptedSignal ? 'rgba(94,201,126,0.18)' : 'rgba(94,201,126,0.06)',
                          color: '#5EC97E',
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Check size={13} /> {acceptedSignal ? 'Confirmed' : savingPath === signal.path ? 'Saving...' : 'Looks right'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {processed.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#5F5E5A', fontSize: 13 }}>
            {signals.length ? 'Nothing matches your search.' : 'No brand info yet.'}
          </div>
        )}
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
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : kind === 'array' || kind === 'json' ? (
        <textarea
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          rows={kind === 'json' ? 5 : 4}
          className="min-h-[92px] resize-y"
          style={SIGNAL_EDIT_INPUT_STYLE}
          placeholder={kind === 'array' ? 'One value per line' : ''}
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
          <Check size={13} /> Save
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
    if (!Number.isFinite(numeric)) return { ok: false, message: 'Enter a number.' };
    if (numeric < 0 || numeric > 1) return { ok: false, message: 'Use a value between 0 and 1.' };
    return { ok: true, value: numeric };
  }

  if (typeof currentValue === 'boolean') return { ok: true, value: draft === 'true' };

  if (currentValue && typeof currentValue === 'object') {
    try {
      return { ok: true, value: JSON.parse(draft) as unknown };
    } catch {
      return { ok: false, message: 'That value isn’t valid.' };
    }
  }

  const text = draft.trim();
  if (!text) return { ok: false, message: 'Value cannot be empty.' };
  return { ok: true, value: text };
}
