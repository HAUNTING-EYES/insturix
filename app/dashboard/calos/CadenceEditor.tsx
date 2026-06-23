'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { DEFAULT_CADENCE } from '@/lib/calos/cadence';

export interface CadenceRule {
  platform: string;
  perWeek: number;
  preferredDays: number[]; // 0=Sun..6=Sat
}

const PLATFORMS = ['linkedin', 'instagram', 'youtube', 'facebook', 'twitter'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Edit a campaign's per-platform cadence (posts/week + which days). Auto-fill consumes
 * these rules. Saves via the campaigns PATCH API.
 */
export default function CadenceEditor({
  campaignId,
  brandId,
  campaignName,
  initialRules,
  onClose,
  onSaved,
}: {
  campaignId: string;
  brandId: string;
  campaignName: string;
  initialRules: CadenceRule[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rules, setRules] = useState<CadenceRule[]>(
    (initialRules.length ? initialRules : DEFAULT_CADENCE).map((r) => ({
      platform: r.platform,
      perWeek: r.perWeek,
      preferredDays: [...r.preferredDays],
    }))
  );
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<CadenceRule>) =>
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const toggleDay = (i: number, d: number) =>
    update(i, {
      preferredDays: rules[i].preferredDays.includes(d)
        ? rules[i].preferredDays.filter((x) => x !== d)
        : [...rules[i].preferredDays, d].sort((a, b) => a - b),
    });

  const addRule = () =>
    setRules((rs) => [...rs, { platform: 'instagram', perWeek: 1, preferredDays: [2, 4] }]);
  const removeRule = (i: number) => setRules((rs) => rs.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/services/calos/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, updates: { cadenceRules: rules } }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      toast({ title: 'Cadence saved' });
      onSaved();
      onClose();
    } catch (err) {
      toast({
        title: 'Failed to save cadence',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0B0B0A] border border-[#1C1B19]/70 rounded-2xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#ECE9E1]">Cadence — {campaignName}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-neutral-400 hover:text-[#ECE9E1]">
            <X size={18} />
          </button>
        </div>
        <p className="text-[11px] text-[#7A776E] mb-4">
          Posts per week, per platform, on which days. Auto-fill uses this.
        </p>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {rules.map((r, i) => (
            <div key={i} className="p-3 rounded-xl bg-[#0F0F0E]/50 border border-[#1C1B19]/60 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={r.platform}
                  onChange={(e) => update(i, { platform: e.target.value })}
                  aria-label="Platform"
                  className="bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-2 py-1.5 flex-1"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={14}
                  value={r.perWeek}
                  onChange={(e) => update(i, { perWeek: Math.max(0, Math.min(14, Number(e.target.value) || 0)) })}
                  aria-label="Posts per week"
                  className="w-16 bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-2 py-1.5"
                />
                <span className="text-[11px] text-neutral-400">/wk</span>
                <button
                  onClick={() => removeRule(i)}
                  aria-label="Remove platform"
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-[#D46A5C]"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex gap-1">
                {DAYS.map((d, di) => (
                  <button
                    key={di}
                    onClick={() => toggleDay(i, di)}
                    className={`w-8 h-7 rounded text-[10px] font-medium border transition-colors ${
                      r.preferredDays.includes(di)
                        ? 'bg-[#5CCCB8]/20 border-[#5CCCB8]/40 text-[#5CCCB8]'
                        : 'bg-[#1C1B19]/40 border-neutral-700/60 text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4">
          <button onClick={addRule} className="text-xs text-[#5CCCB8] hover:underline">
            + Add platform
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-neutral-300 border border-neutral-700/70 hover:bg-[#1C1B19]/60"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#5CCCB8]/15 border border-[#5CCCB8]/40 text-[#5CCCB8] hover:bg-[#5CCCB8]/25 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save cadence'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
