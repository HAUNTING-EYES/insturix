'use client';

import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  EDITORIAL_FAMILIES,
  type EditorialFamily,
  type EditorialFamilyPreference,
  type EditorialPreferences,
  type EditorialPreferenceMode,
} from '@/lib/editron/production-brief/editorial-preferences';

interface EditorialPreferenceControlsProps {
  value: EditorialPreferences;
  onChange: (value: EditorialPreferences) => void;
}

const FAMILY_LABELS: Record<EditorialFamily, string> = {
  captions: 'Captions',
  motionGraphics: 'Motion graphics',
  zoom: 'Camera motion',
  transitions: 'Transitions',
  sfx: 'Sound effects',
  music: 'Background music',
};

const DEFAULT_PREFERENCE: EditorialFamilyPreference = { mode: 'auto' };

export function EditorialPreferenceControls({ value, onChange }: EditorialPreferenceControlsProps) {
  const setFamilyMode = (family: EditorialFamily, mode: EditorialPreferenceMode) => {
    const families = { ...(value.families ?? {}) };
    if (mode === 'auto') {
      delete families[family];
    } else if (mode === 'off') {
      families[family] = { mode: 'off' };
    } else {
      const current = families[family];
      families[family] = {
        mode: 'prefer',
        frequency: current?.frequency ?? 0.5,
        intensity: current?.intensity ?? 0.5,
      };
    }

    const next = { ...value, families: Object.keys(families).length > 0 ? families : undefined };
    if (family === 'music' && mode !== 'prefer') delete next.musicPrompt;
    onChange(next);
  };

  const setFamilyValue = (family: EditorialFamily, key: 'frequency' | 'intensity', nextValue: number) => {
    const current = value.families?.[family] ?? DEFAULT_PREFERENCE;
    onChange({
      ...value,
      families: {
        ...(value.families ?? {}),
        [family]: { ...current, mode: 'prefer', [key]: nextValue },
      },
    });
  };

  const setPacingMode = (mode: 'auto' | 'prefer') => {
    onChange({
      ...value,
      pacing: mode === 'prefer'
        ? { mode: 'prefer', intensity: value.pacing?.intensity ?? 0.5 }
        : undefined,
    });
  };

  return (
    <div className="mt-3.5 border-t border-[#1C1B19] pt-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#5F5E5A]">
        Creative direction
      </p>
      <div className="divide-y divide-[#1C1B19]">
        {EDITORIAL_FAMILIES.map((family) => {
          const preference = value.families?.[family] ?? DEFAULT_PREFERENCE;
          return (
            <div key={family} className="py-2.5 first:pt-0">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12px] font-medium text-[#D8D4CA]">{FAMILY_LABELS[family]}</p>
                <div className="grid shrink-0 grid-cols-3 overflow-hidden rounded border border-[#282724]" role="group" aria-label={FAMILY_LABELS[family] + ' policy'}>
                  {(['auto', 'off', 'prefer'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={preference.mode === mode}
                      onClick={() => setFamilyMode(family, mode)}
                      className={'h-7 px-2.5 text-[10px] font-medium transition-colors ' + (preference.mode === mode ? 'bg-[#D4A652] text-[#0B0B0A]' : 'bg-[#1B1A18] text-[#77736A] hover:text-[#D4A652]')}
                    >
                      {mode === 'auto' ? 'AI + brand' : mode === 'off' ? 'Off' : 'Prefer'}
                    </button>
                  ))}
                </div>
              </div>
              {preference.mode === 'prefer' && (
                <div className="mt-2 grid grid-cols-2 gap-5 px-1">
                  <PreferenceSlider label="Frequency" value={preference.frequency ?? 0.5} onChange={(next) => setFamilyValue(family, 'frequency', next)} />
                  <PreferenceSlider label="Intensity" value={preference.intensity ?? 0.5} onChange={(next) => setFamilyValue(family, 'intensity', next)} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-[#1C1B19] pt-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] font-medium text-[#D8D4CA]">Pacing</p>
          <div className="grid grid-cols-2 overflow-hidden rounded border border-[#282724]">
            {(['auto', 'prefer'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={(value.pacing?.mode ?? 'auto') === mode}
                onClick={() => setPacingMode(mode)}
                className={'h-7 px-3 text-[10px] font-medium transition-colors ' + ((value.pacing?.mode ?? 'auto') === mode ? 'bg-[#D4A652] text-[#0B0B0A]' : 'bg-[#1B1A18] text-[#77736A] hover:text-[#D4A652]')}
              >
                {mode === 'auto' ? 'AI + brand' : 'Prefer'}
              </button>
            ))}
          </div>
        </div>
        {value.pacing?.mode === 'prefer' && (
          <div className="mt-2 px-1">
            <PreferenceSlider label="Calm to fast" value={value.pacing.intensity ?? 0.5} onChange={(intensity) => onChange({ ...value, pacing: { mode: 'prefer', intensity } })} />
          </div>
        )}
      </div>

      {value.families?.music?.mode === 'prefer' && (
        <Textarea
          aria-label="Music preference"
          placeholder="Music mood, instruments, or uploaded-track direction"
          value={value.musicPrompt ?? ''}
          onChange={(event) => onChange({ ...value, musicPrompt: event.target.value })}
          rows={2}
          maxLength={500}
          className="mt-2 resize-none border-[#282724] bg-[#1B1A18] text-[12px] text-[#ECE9E1] placeholder:text-[#454340]"
        />
      )}
      <Textarea
        aria-label="Additional creative direction"
        placeholder="Additional creative direction (optional)"
        value={value.notes ?? ''}
        onChange={(event) => onChange({ ...value, notes: event.target.value })}
        rows={2}
        maxLength={500}
        className="mt-2 resize-none border-[#282724] bg-[#1B1A18] text-[12px] text-[#ECE9E1] placeholder:text-[#454340]"
      />
    </div>
  );
}

function PreferenceSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.06em] text-[#5F5E5A]">
        <span>{label}</span>
        <span>{Math.round(value * 100)}</span>
      </div>
      <Slider
        aria-label={label}
        min={0}
        max={100}
        step={1}
        value={[Math.round(value * 100)]}
        onValueChange={([next]) => onChange(next / 100)}
        className="[&_[role=slider]]:border-[#D4A652]/60 [&_[role=slider]]:bg-[#151411] [&_[data-orientation=horizontal]>span]:bg-[#D4A652]"
      />
    </div>
  );
}
