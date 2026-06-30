'use client';

import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { DEFAULT_CADENCE } from '@/lib/calos/cadence';
import { CALOS_CAMPAIGN_PLATFORMS, MAX_CAMPAIGN_POSTS_PER_WEEK } from '@/lib/calos/campaign-cadence';
import { CALOS_OBJECTIVES, DEFAULT_OBJECTIVE, type CalosObjective } from '@/lib/calos/campaign-intent';

export interface CadenceRule {
  platform: string;
  perWeek: number;
  preferredDays: number[]; // 0=Sun..6=Sat
}

const PLATFORMS = CALOS_CAMPAIGN_PLATFORMS;
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function clampPerWeek(value: number) {
  return Math.max(0, Math.min(MAX_CAMPAIGN_POSTS_PER_WEEK, Number.isFinite(value) ? Math.floor(value) : 0));
}

function normalizePreferredDays(days: number[]) {
  return [...new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

/**
 * Edit a campaign's per-platform cadence (posts/week + which days). Auto-fill consumes
 * these rules. Saves via the campaigns PATCH API.
 */
export default function CadenceEditor({
  campaignId,
  brandId,
  campaignName,
  initialRules,
  initialObjective,
  initialTheme,
  isCreate = false,
  onClose,
  onSaved,
}: {
  campaignId: string;
  brandId: string;
  campaignName: string;
  initialRules: CadenceRule[];
  initialObjective?: CalosObjective;
  initialTheme?: string;
  isCreate?: boolean;
  onClose: () => void;
  onSaved: (newCampaignId?: string) => void;
}) {
  const [name, setName] = useState(campaignName);
  const [rules, setRules] = useState<CadenceRule[]>(
    (initialRules.length ? initialRules : DEFAULT_CADENCE).map((r) => ({
      platform: typeof r.platform === 'string' && r.platform.trim() ? r.platform.trim().toLowerCase() : 'instagram',
      perWeek: clampPerWeek(r.perWeek),
      preferredDays: normalizePreferredDays(r.preferredDays),
    }))
  );
  const [objective, setObjective] = useState<CalosObjective>(initialObjective ?? DEFAULT_OBJECTIVE);
  const [theme, setTheme] = useState(initialTheme ?? '');
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<CadenceRule>) =>
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const toggleDay = (i: number, d: number) =>
    update(i, {
      preferredDays: rules[i].preferredDays.includes(d)
        ? rules[i].preferredDays.filter((x) => x !== d)
        : normalizePreferredDays([...rules[i].preferredDays, d]),
    });

  const addRule = () => {
    const nextPlatform = PLATFORMS.find((platform) => !rules.some((r) => r.platform === platform)) ?? 'instagram';
    setRules((rs) => [...rs, { platform: nextPlatform, perWeek: 1, preferredDays: [2, 4] }]);
  };
  const removeRule = (i: number) => setRules((rs) => rs.filter((_, idx) => idx !== i));
  const platformOptions = Array.from(new Set([...PLATFORMS, ...rules.map((r) => r.platform).filter(Boolean)]));

  const save = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (saving) return;
    if (isCreate && !name.trim()) {
      toast({ title: 'Name your campaign first', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = isCreate
        ? await fetch('/api/services/calos/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandId, name: name.trim(), objective, theme, cadenceRules: rules }),
          })
        : await fetch(`/api/services/calos/campaigns/${campaignId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandId, updates: { cadenceRules: rules, objective, theme } }),
          });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Failed (${res.status})`);
      }
      toast({ title: isCreate ? 'Campaign created' : 'Cadence saved' });
      onSaved(isCreate ? data?.campaign?._id : undefined);
      onClose();
    } catch (err) {
      toast({
        title: isCreate ? 'Failed to create campaign' : 'Failed to save cadence',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 px-3 py-6 backdrop-blur-sm sm:px-4 sm:py-8"
      onClick={onClose}
    >
      <form
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cadence-editor-title"
        className="my-auto flex max-h-[calc(100dvh-3rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#1C1B19]/70 bg-[#0B0B0A] shadow-2xl sm:max-h-[calc(100dvh-4rem)] lg:max-h-[640px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-5">
          <h2 id="cadence-editor-title" className="text-sm font-semibold text-[#ECE9E1]">
            {isCreate ? 'New campaign' : `Cadence - ${campaignName}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-[#ECE9E1]"
          >
            <X size={18} />
          </button>
        </div>
        <p className="shrink-0 px-5 pb-4 text-[11px] text-[#7A776E]">
          Objective + theme steer the AI plan; cadence sets posts/week per platform.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {isCreate && (
            <div className="flex items-center gap-2 mb-2">
              <label className="text-[11px] text-[#7A776E] w-16 shrink-0">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q3 launch"
                aria-label="Campaign name"
                autoFocus
                className="flex-1 bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-2 py-1.5"
              />
            </div>
          )}

          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[#7A776E] w-16 shrink-0">Objective</label>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value as CalosObjective)}
                aria-label="Campaign objective"
                className="flex-1 bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-2 py-1.5 capitalize"
              >
                {CALOS_OBJECTIVES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[#7A776E] w-16 shrink-0">Theme</label>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="The big idea every post ladders up to"
                aria-label="Campaign theme"
                className="flex-1 bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-2 py-1.5"
              />
            </div>
          </div>

          <div className="space-y-3">
            {rules.map((r, i) => (
              <div key={i} className="p-3 rounded-xl bg-[#0F0F0E]/50 border border-[#1C1B19]/60 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={r.platform}
                    onChange={(e) => update(i, { platform: e.target.value })}
                    aria-label="Platform"
                    className="bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-2 py-1.5 flex-1"
                  >
                    {platformOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={MAX_CAMPAIGN_POSTS_PER_WEEK}
                    step={1}
                    value={r.perWeek}
                    onChange={(e) => update(i, { perWeek: clampPerWeek(Number(e.target.value) || 0) })}
                    aria-label="Posts per week"
                    className="w-16 bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-2 py-1.5"
                  />
                  <span className="text-[11px] text-neutral-400">/wk</span>
                  <button
                    type="button"
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
                      type="button"
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
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-[#1C1B19]/70 bg-[#0B0B0A] px-5 py-4">
          <button type="button" onClick={addRule} className="text-xs text-[#5CCCB8] hover:underline">
            + Add platform
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs text-neutral-300 border border-neutral-700/70 hover:bg-[#1C1B19]/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#5CCCB8]/15 border border-[#5CCCB8]/40 text-[#5CCCB8] hover:bg-[#5CCCB8]/25 disabled:opacity-50"
            >
              {saving ? (isCreate ? 'Creating...' : 'Saving...') : isCreate ? 'Create campaign' : 'Save cadence'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}