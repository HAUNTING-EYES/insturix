"use client";

/**
 * ShootKitProfileForm — the production-capability editor.
 *
 * It ONLY edits capability inputs. It never plans a shot, computes geometry, or
 * estimates cost — that is the backend's job. Inputs are validated against the SAME
 * ProductionCapabilityProfileSchema the server uses (single source of truth, not a
 * re-implementation), so predictable 400s surface inline before submit.
 *
 * It starts empty: no room, phone, tripod, light, mic, operator, or performer is assumed.
 *
 * Styling follows design-system v1 (design-tokens.css): palette tokens only, type
 * scale 10/11/13, weights 400/500, radii 4 (inputs/tags) / 7 (buttons/cards), 4px
 * rhythm, gold reserved for decisions (the CTA, selected states).
 */

import React from "react";
import { Camera, Clapperboard, Lightbulb, Mic, Plus, Sliders, Square, Trash2 } from "lucide-react";
import { Select, type SelectOption } from "@/components/primitives";
import {
  ProductionCapabilityProfileSchema,
  PRODUCTION_CAPABILITY_PROFILE_VERSION,
  type ProductionCapabilityProfile,
} from "@/lib/thinkforge/production/production-capability-profile";
import type { ScriptShotPlanIssue, ShootKitAspectRatio } from "@/lib/thinkforge/production/build-script-shot-plan";

type Tier = ProductionCapabilityProfile["preferences"]["defaultPlanTier"];
type EquipmentCategory = "camera" | "support" | "light" | "audio" | "modifier" | "accessory";

export interface ShootKitSettings {
  aspectRatio: ShootKitAspectRatio;
  tier: Tier;
}

interface ShootKitProfileFormProps {
  initialProfile: ProductionCapabilityProfile | null;
  initialSettings: ShootKitSettings | null;
  issues: ScriptShotPlanIssue[];
  submitting: boolean;
  onGenerate: (profile: ProductionCapabilityProfile, settings: ShootKitSettings) => void;
}

const ASPECT_RATIOS: ShootKitAspectRatio[] = ["16:9", "9:16", "1:1", "4:5"];
const TIERS: Tier[] = ["no-spend", "minimum-upgrade", "enhanced"];
const NOISE_FLOORS = ["quiet", "moderate", "noisy", "unknown"] as const;
const AVAILABILITIES = ["owned", "borrowed", "rental-approved", "purchase-approved"] as const;
type CostBasis = "none" | "one-time" | "per-shoot";
const PRIORITIES = ["cost", "setup-time", "image-quality", "audio-quality", "mobility"] as const;
const LIGHT_DIRECTIONS = ["north", "south", "east", "west", "unknown"] as const;

const CATEGORY_KINDS: Record<EquipmentCategory, readonly string[]> = {
  camera: ["phone", "webcam", "mirrorless", "dslr", "cinema", "action-camera"],
  support: ["tripod", "light-stand", "phone-clamp", "gimbal", "slider", "shoulder-rig", "tabletop-stand"],
  light: ["led-panel", "ring-light", "softbox", "tube", "bulb", "practical"],
  audio: ["built-in", "wired-lav", "wireless-lav", "shotgun", "usb", "field-recorder"],
  modifier: ["reflector", "diffusion", "softbox-grid", "flag", "bounce-board", "blackout-curtain"],
  accessory: ["accessory"],
};

/** Option tables for the shared Select; values double as labels, as the former <option>s did. */
const toOptions = (values: readonly string[]): SelectOption[] => values.map((value) => ({ value, label: value }));
const NOISE_FLOOR_OPTIONS = toOptions(NOISE_FLOORS);
const LIGHT_KIND_OPTIONS = toOptions(["window", "doorway", "skylight"]);
const LIGHT_DIRECTION_OPTIONS = toOptions(LIGHT_DIRECTIONS);
const AVAILABILITY_OPTIONS = toOptions(AVAILABILITIES);
const COST_BASIS_OPTIONS = toOptions(["one-time", "per-shoot"]);
const MODIFIER_SIZE_OPTIONS = toOptions(["small", "medium", "large", "unknown"]);
const CATEGORY_KIND_OPTIONS: Record<EquipmentCategory, SelectOption[]> = {
  camera: toOptions(CATEGORY_KINDS.camera),
  support: toOptions(CATEGORY_KINDS.support),
  light: toOptions(CATEGORY_KINDS.light),
  audio: toOptions(CATEGORY_KINDS.audio),
  modifier: toOptions(CATEGORY_KINDS.modifier),
  accessory: toOptions(CATEGORY_KINDS.accessory),
};
const CATEGORY_ICON: Record<EquipmentCategory, React.ReactNode> = {
  camera: <Camera className="h-3.5 w-3.5" />,
  support: <Sliders className="h-3.5 w-3.5" />,
  light: <Lightbulb className="h-3.5 w-3.5" />,
  audio: <Mic className="h-3.5 w-3.5" />,
  modifier: <Square className="h-3.5 w-3.5" />,
  accessory: <Plus className="h-3.5 w-3.5" />,
};

/** System motion: micro 0.25s, one easing. */
const EASE = "transition-colors duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)]";
/** Mono system-label recipe (10px / 500 / dim / 0.08em / caps). */
const MONO_LABEL = "font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[#5F5E5A]";
const FOCUS_RING = "focus:outline-none focus-visible:shadow-[0_0_0_2px_#D4A65240]";

// ── Draft shapes (form-friendly; built into a real profile on submit) ──
interface DraftSpace {
  id: string; label: string;
  width: string; depth: string; height: string; usableDepth: string;
  noiseFloor: (typeof NOISE_FLOORS)[number];
  powerAvailable: boolean;
  naturalLight: { id: string; kind: "window" | "doorway" | "skylight"; direction: (typeof LIGHT_DIRECTIONS)[number]; controllable: boolean }[];
  backgrounds: { id: string; description: string; widthM: string; movable: boolean }[];
  constraints: string;
}
interface DraftEquipment {
  id: string; category: EquipmentCategory; label: string; quantity: number;
  availability: (typeof AVAILABILITIES)[number]; preferred: boolean;
  cost: string; costBasis: CostBasis; notes: string;
  kind: string;
  focalMin: string; focalMax: string;
  maxHeight: string;
  dimmable: boolean; colorTempMin: string; colorTempMax: string; battery: boolean;
  wireless: boolean; maxSubjects: number;
  size: "small" | "medium" | "large" | "unknown";
}
interface Draft {
  people: { performers: number; operators: number; assistants: number; selfShoot: boolean };
  currency: string; maxSpend: string; rentalAllowed: boolean; purchaseAllowed: boolean;
  maxSetupMinutes: string; maxSetupChanges: string; maxLocationChanges: string;
  householdSubstitutionsAllowed: boolean; prioritize: (typeof PRIORITIES)[number][];
  spaces: DraftSpace[]; equipment: DraftEquipment[];
}

let idSeq = 0;
const nextId = (prefix: string) => `${prefix}_${(++idSeq).toString(36)}`;
const numOrUndef = (s: string): number | undefined => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

function emptyDraft(): Draft {
  return {
    people: { performers: 0, operators: 0, assistants: 0, selfShoot: false },
    currency: "USD", maxSpend: "0", rentalAllowed: false, purchaseAllowed: false,
    maxSetupMinutes: "", maxSetupChanges: "", maxLocationChanges: "0",
    householdSubstitutionsAllowed: false, prioritize: ["cost", "setup-time"],
    spaces: [], equipment: [],
  };
}

function profileToDraft(p: ProductionCapabilityProfile): Draft {
  return {
    people: {
      performers: p.people.performersAvailable,
      operators: p.people.cameraOperatorsAvailable,
      assistants: p.people.assistantsAvailable,
      selfShoot: p.people.selfShoot,
    },
    currency: p.constraints.currency,
    maxSpend: String(p.constraints.maxIncrementalSpend),
    rentalAllowed: p.constraints.rentalAllowed,
    purchaseAllowed: p.constraints.purchaseAllowed,
    maxSetupMinutes: p.constraints.maxSetupMinutes !== undefined ? String(p.constraints.maxSetupMinutes) : "",
    maxSetupChanges: p.constraints.maxSetupChanges !== undefined ? String(p.constraints.maxSetupChanges) : "",
    maxLocationChanges: String(p.constraints.maxLocationChanges),
    householdSubstitutionsAllowed: p.preferences.householdSubstitutionsAllowed,
    prioritize: [...p.preferences.prioritize],
    spaces: p.spaces.map((s) => ({
      id: s.id, label: s.label,
      width: s.dimensionsM?.width !== undefined ? String(s.dimensionsM.width) : "",
      depth: s.dimensionsM?.depth !== undefined ? String(s.dimensionsM.depth) : "",
      height: s.dimensionsM?.height !== undefined ? String(s.dimensionsM.height) : "",
      usableDepth: s.usableDepthM !== undefined ? String(s.usableDepthM) : "",
      noiseFloor: s.noiseFloor,
      powerAvailable: s.powerAvailable,
      naturalLight: s.naturalLightSources.map((n) => ({ id: n.id, kind: n.kind, direction: n.direction, controllable: n.controllable })),
      backgrounds: s.backgrounds.map((b) => ({ id: b.id, description: b.description, widthM: b.widthM !== undefined ? String(b.widthM) : "", movable: b.movable })),
      constraints: s.constraints.join(", "),
    })),
    equipment: p.equipment.map((e) => ({
      id: e.id, category: e.category, label: e.label, quantity: e.quantity,
      availability: e.availability, preferred: e.preferred,
      cost: String(e.estimatedIncrementalCost), costBasis: e.costBasis, notes: e.notes.join(", "),
      kind: "kind" in e ? String(e.kind) : "accessory",
      focalMin: e.category === "camera" && e.focalLengthEquivalentMm ? String(e.focalLengthEquivalentMm.min) : "",
      focalMax: e.category === "camera" && e.focalLengthEquivalentMm ? String(e.focalLengthEquivalentMm.max) : "",
      maxHeight: e.category === "support" && e.maxHeightM !== undefined ? String(e.maxHeightM) : "",
      dimmable: e.category === "light" ? e.dimmable : false,
      colorTempMin: e.category === "light" && e.colorTemperatureK ? String(e.colorTemperatureK.min) : "",
      colorTempMax: e.category === "light" && e.colorTemperatureK ? String(e.colorTemperatureK.max) : "",
      battery: e.category === "light" ? e.batteryPowered : false,
      wireless: e.category === "audio" ? e.wireless : false,
      maxSubjects: e.category === "audio" ? e.maxSubjects : 1,
      size: e.category === "modifier" ? e.size : "unknown",
    })),
  };
}

function buildProfileObject(draft: Draft): unknown {
  const isPaid = (a: DraftEquipment["availability"]) => a === "rental-approved" || a === "purchase-approved";
  return {
    version: PRODUCTION_CAPABILITY_PROFILE_VERSION,
    spaces: draft.spaces.map((s) => {
      const dims = numOrUndef(s.width) !== undefined && numOrUndef(s.depth) !== undefined
        ? { width: numOrUndef(s.width), depth: numOrUndef(s.depth), ...(numOrUndef(s.height) !== undefined ? { height: numOrUndef(s.height) } : {}) }
        : undefined;
      return {
        id: s.id, label: s.label,
        ...(dims ? { dimensionsM: dims } : {}),
        ...(numOrUndef(s.usableDepth) !== undefined ? { usableDepthM: numOrUndef(s.usableDepth) } : {}),
        backgrounds: s.backgrounds.map((b) => ({
          id: b.id, description: b.description, movable: b.movable,
          ...(numOrUndef(b.widthM) !== undefined ? { widthM: numOrUndef(b.widthM) } : {}),
        })),
        naturalLightSources: s.naturalLight.map((n) => ({ id: n.id, kind: n.kind, direction: n.direction, controllable: n.controllable })),
        powerAvailable: s.powerAvailable,
        noiseFloor: s.noiseFloor,
        constraints: s.constraints.split(",").map((c) => c.trim()).filter(Boolean),
      };
    }),
    equipment: draft.equipment.map((e) => {
      const paid = isPaid(e.availability);
      const base = {
        id: e.id, label: e.label, quantity: e.quantity, availability: e.availability, preferred: e.preferred,
        estimatedIncrementalCost: paid ? Number(e.cost) || 0 : 0,
        costBasis: paid ? e.costBasis : "none",
        notes: e.notes.split(",").map((n) => n.trim()).filter(Boolean),
      };
      switch (e.category) {
        case "camera":
          return {
            ...base, category: "camera", kind: e.kind,
            ...(numOrUndef(e.focalMin) !== undefined && numOrUndef(e.focalMax) !== undefined
              ? { focalLengthEquivalentMm: { min: numOrUndef(e.focalMin), max: numOrUndef(e.focalMax) } } : {}),
          };
        case "support":
          return { ...base, category: "support", kind: e.kind, ...(numOrUndef(e.maxHeight) !== undefined ? { maxHeightM: numOrUndef(e.maxHeight) } : {}) };
        case "light":
          return {
            ...base, category: "light", kind: e.kind, dimmable: e.dimmable, batteryPowered: e.battery,
            ...(numOrUndef(e.colorTempMin) !== undefined && numOrUndef(e.colorTempMax) !== undefined
              ? { colorTemperatureK: { min: numOrUndef(e.colorTempMin), max: numOrUndef(e.colorTempMax) } } : {}),
          };
        case "audio":
          return { ...base, category: "audio", kind: e.kind, wireless: e.wireless, maxSubjects: e.maxSubjects };
        case "modifier":
          return { ...base, category: "modifier", kind: e.kind, size: e.size };
        default:
          return { ...base, category: "accessory", kind: e.kind || "accessory" };
      }
    }),
    people: {
      performersAvailable: draft.people.performers,
      cameraOperatorsAvailable: draft.people.operators,
      assistantsAvailable: draft.people.assistants,
      selfShoot: draft.people.selfShoot,
    },
    constraints: {
      currency: draft.currency,
      maxIncrementalSpend: Number(draft.maxSpend) || 0,
      rentalAllowed: draft.rentalAllowed,
      purchaseAllowed: draft.purchaseAllowed,
      ...(numOrUndef(draft.maxSetupMinutes) !== undefined ? { maxSetupMinutes: numOrUndef(draft.maxSetupMinutes) } : {}),
      ...(numOrUndef(draft.maxSetupChanges) !== undefined ? { maxSetupChanges: numOrUndef(draft.maxSetupChanges) } : {}),
      maxLocationChanges: numOrUndef(draft.maxLocationChanges) ?? 0,
    },
    preferences: {
      defaultPlanTier: "no-spend",
      prioritize: draft.prioritize.length > 0 ? draft.prioritize : ["cost", "setup-time"],
      householdSubstitutionsAllowed: draft.householdSubstitutionsAllowed,
    },
    provenance: {},
  };
}

function readableIssuePath(path: PropertyKey[]): string {
  return path.map((p) => (typeof p === "number" ? `#${p + 1}` : String(p))).join(" › ");
}

export function ShootKitProfileForm({ initialProfile, initialSettings, issues, submitting, onGenerate }: ShootKitProfileFormProps) {
  const [draft, setDraft] = React.useState<Draft>(() => (initialProfile ? profileToDraft(initialProfile) : emptyDraft()));
  const [settings, setSettings] = React.useState<ShootKitSettings>(() => initialSettings ?? { aspectRatio: "9:16", tier: "no-spend" });

  const patch = React.useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);

  // Validate against the real schema (reuse, no duplicated rules). Coerce tier into the profile default.
  const validation = React.useMemo(() => {
    const obj = buildProfileObject(draft);
    (obj as { preferences: { defaultPlanTier: Tier } }).preferences.defaultPlanTier = settings.tier;
    return ProductionCapabilityProfileSchema.safeParse(obj);
  }, [draft, settings.tier]);

  const errors = validation.success
    ? []
    : validation.error.issues.map((iss) => `${readableIssuePath(iss.path)}: ${iss.message}`);

  const handleGenerate = () => {
    if (submitting || !validation.success) return;
    onGenerate(validation.data, settings);
  };

  return (
    <div className="space-y-4">
      {issues.length > 0 && (
        <div className="rounded-[7px] px-3 py-2" style={{ background: "#D4A65214" }}>
          <div className="text-[11px] font-medium text-[#D4A652]">The script needs adjustments before a plan can be built</div>
          <ul className="mt-1 space-y-1 pl-3">
            {issues.map((iss, i) => (
              <li key={i} className="list-disc text-[11px] leading-relaxed text-[#B5B2A8]">
                {iss.sceneTitle ? <span className="font-medium text-[#ECE9E1]">{iss.sceneTitle}: </span> : iss.sceneId ? <span className="font-medium text-[#ECE9E1]">{iss.sceneId}: </span> : null}
                {iss.message}
                {iss.questions.length > 0 && (
                  <span className="block text-[10px] text-[#7A776E]">{iss.questions.join(" ")}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Output settings */}
      <Group title="Output">
        <Field label="Aspect ratio">
          <Segmented options={ASPECT_RATIOS} value={settings.aspectRatio} onChange={(v) => setSettings((s) => ({ ...s, aspectRatio: v }))} />
        </Field>
        <Field label="Plan tier" hint="no-spend never rents or buys">
          <Segmented options={TIERS} value={settings.tier} onChange={(v) => setSettings((s) => ({ ...s, tier: v }))} />
        </Field>
      </Group>

      {/* People */}
      <Group title="People">
        <div className="grid grid-cols-3 gap-2">
          <Stepper label="Performers" value={draft.people.performers} min={0} onChange={(n) => patch({ people: { ...draft.people, performers: n } })} />
          <Stepper label="Camera ops" value={draft.people.operators} min={0} onChange={(n) => patch({ people: { ...draft.people, operators: n } })} />
          <Stepper label="Assistants" value={draft.people.assistants} min={0} onChange={(n) => patch({ people: { ...draft.people, assistants: n } })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Toggle label="Self-shoot" checked={draft.people.selfShoot} onChange={(v) => patch({ people: { ...draft.people, selfShoot: v } })} title="You operate the camera and appear yourself" />
          <Toggle label="Allow household items" checked={draft.householdSubstitutionsAllowed} onChange={(v) => patch({ householdSubstitutionsAllowed: v })} title="The planner may substitute household objects for gear you don't own" />
        </div>
      </Group>

      {/* Budget & approvals */}
      <Group title="Budget & approvals">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Currency">
            <input value={draft.currency} maxLength={3} onChange={(e) => patch({ currency: e.target.value.toUpperCase() })} className={inputCls} aria-label="Currency code" placeholder="USD" />
          </Field>
          <Field label="Max spend">
            <input type="number" min={0} value={draft.maxSpend} onChange={(e) => patch({ maxSpend: e.target.value })} className={inputCls} aria-label="Maximum incremental spend" />
          </Field>
          <Field label="Max setup (min)">
            <input type="number" min={0} value={draft.maxSetupMinutes} onChange={(e) => patch({ maxSetupMinutes: e.target.value })} className={inputCls} placeholder="none" aria-label="Maximum setup minutes" />
          </Field>
          <Field label="Max setup changes">
            <input type="number" min={0} value={draft.maxSetupChanges} onChange={(e) => patch({ maxSetupChanges: e.target.value })} className={inputCls} placeholder="none" aria-label="Maximum setup changes" />
          </Field>
          <Field label="Max location changes">
            <input type="number" min={0} value={draft.maxLocationChanges} onChange={(e) => patch({ maxLocationChanges: e.target.value })} className={inputCls} aria-label="Maximum location changes" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Toggle label="Allow rentals" checked={draft.rentalAllowed} onChange={(v) => patch({ rentalAllowed: v })} title="Permit rental-approved equipment (requires a spend limit)" />
          <Toggle label="Allow purchases" checked={draft.purchaseAllowed} onChange={(v) => patch({ purchaseAllowed: v })} title="Permit purchase-approved equipment (requires a spend limit)" />
        </div>
      </Group>

      {/* Spaces */}
      <Group title="Spaces" action={<AddButton label="Add space" onClick={() => patch({ spaces: [...draft.spaces, newSpace()] })} />}>
        {draft.spaces.length === 0
          ? <Empty text="No rooms added. Add the spaces you can actually shoot in." />
          : draft.spaces.map((s, i) => (
            <SpaceRow key={s.id} space={s}
              onChange={(next) => patch({ spaces: draft.spaces.map((x, xi) => (xi === i ? next : x)) })}
              onRemove={() => patch({ spaces: draft.spaces.filter((_, xi) => xi !== i) })} />
          ))}
      </Group>

      {/* Equipment */}
      <Group title="Equipment" action={
        <div className="flex flex-wrap gap-1">
          {(Object.keys(CATEGORY_KINDS) as EquipmentCategory[]).map((cat) => (
            <button key={cat} type="button" title={`Add ${cat}`} onClick={() => patch({ equipment: [...draft.equipment, newEquipment(cat)] })}
              className={`inline-flex items-center gap-1 rounded-[7px] border border-[#282724] px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[#7A776E] ${EASE} hover:text-[#ECE9E1] ${FOCUS_RING}`}>
              {CATEGORY_ICON[cat]} {cat}
            </button>
          ))}
        </div>
      }>
        {draft.equipment.length === 0
          ? <Empty text="No gear added. Add only what you own, can borrow, or have approved to rent or buy." />
          : draft.equipment.map((e, i) => (
            <EquipmentRow key={e.id} item={e} rentalAllowed={draft.rentalAllowed} purchaseAllowed={draft.purchaseAllowed}
              onChange={(next) => patch({ equipment: draft.equipment.map((x, xi) => (xi === i ? next : x)) })}
              onRemove={() => patch({ equipment: draft.equipment.filter((_, xi) => xi !== i) })} />
          ))}
      </Group>

      {/* Preferences */}
      <Group title="Prioritize">
        <div className="flex flex-wrap gap-1">
          {PRIORITIES.map((p) => {
            const on = draft.prioritize.includes(p);
            return (
              <button key={p} type="button" onClick={() => patch({ prioritize: on ? draft.prioritize.filter((x) => x !== p) : [...draft.prioritize, p] })}
                aria-pressed={on}
                className={`rounded-[4px] border px-2 py-1 text-[11px] ${EASE} ${FOCUS_RING} ${on ? "border-[#D4A652] text-[#D4A652]" : "border-[#282724] text-[#7A776E] hover:text-[#ECE9E1]"}`}>
                {p}
              </button>
            );
          })}
        </div>
      </Group>

      {/* Validation + submit */}
      {errors.length > 0 && (
        <ul className="space-y-1 rounded-[7px] px-3 py-2" style={{ background: "#D46A5C14" }}>
          {errors.slice(0, 6).map((e, i) => (
            <li key={i} className="text-[11px] leading-relaxed text-[#D46A5C]">{e}</li>
          ))}
          {errors.length > 6 && <li className="text-[10px] text-[#7A776E]">+{errors.length - 6} more</li>}
        </ul>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={submitting || !validation.success}
        className={`flex w-full items-center justify-center gap-2 rounded-[7px] px-4 py-2 text-[13px] font-medium ${EASE} ${FOCUS_RING} disabled:cursor-not-allowed`}
        style={{ background: !submitting && validation.success ? "#D4A652" : "#1B1A18", color: !submitting && validation.success ? "#0B0B0A" : "#7A776E" }}
      >
        <Clapperboard className="h-4 w-4" />
        {submitting ? "Building your shoot plan" : "Generate shoot plan"}
      </button>
    </div>
  );
}

// ── Row editors ──
function newSpace(): DraftSpace {
  return { id: nextId("sp"), label: "", width: "", depth: "", height: "", usableDepth: "", noiseFloor: "unknown", powerAvailable: true, naturalLight: [], backgrounds: [], constraints: "" };
}
function newEquipment(category: EquipmentCategory): DraftEquipment {
  return {
    id: nextId("eq"), category, label: "", quantity: 1, availability: "owned", preferred: false,
    cost: "0", costBasis: "none", notes: "", kind: CATEGORY_KINDS[category][0],
    focalMin: "", focalMax: "", maxHeight: "", dimmable: false, colorTempMin: "", colorTempMax: "",
    battery: false, wireless: false, maxSubjects: 1, size: "unknown",
  };
}

function SpaceRow({ space, onChange, onRemove }: { space: DraftSpace; onChange: (s: DraftSpace) => void; onRemove: () => void }) {
  const set = (p: Partial<DraftSpace>) => onChange({ ...space, ...p });
  return (
    <div className="rounded-[7px] border border-[#1C1B19] bg-[#0F0F0E] p-3">
      <div className="mb-2 flex items-center gap-2">
        <input value={space.label} onChange={(e) => set({ label: e.target.value })} placeholder="Room name (e.g. home office)" className={`${inputCls} flex-1`} aria-label="Space name" />
        <IconButton onClick={onRemove} label="Remove space"><Trash2 className="h-3.5 w-3.5" /></IconButton>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini label="Width (m)"><input type="number" min={0} step="0.1" value={space.width} onChange={(e) => set({ width: e.target.value })} className={inputCls} aria-label="Width in meters" /></Mini>
        <Mini label="Depth (m)"><input type="number" min={0} step="0.1" value={space.depth} onChange={(e) => set({ depth: e.target.value })} className={inputCls} aria-label="Depth in meters" /></Mini>
        <Mini label="Height (m)"><input type="number" min={0} step="0.1" value={space.height} onChange={(e) => set({ height: e.target.value })} className={inputCls} aria-label="Height in meters" /></Mini>
        <Mini label="Usable depth (m)"><input type="number" min={0} step="0.1" value={space.usableDepth} onChange={(e) => set({ usableDepth: e.target.value })} className={inputCls} aria-label="Usable depth in meters" /></Mini>
        <Mini label="Noise floor" as="div">
          <Select size="sm" value={space.noiseFloor} onChange={(v) => set({ noiseFloor: v as DraftSpace["noiseFloor"] })} options={NOISE_FLOOR_OPTIONS} aria-label="Noise floor" />
        </Mini>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Toggle label="Power" checked={space.powerAvailable} onChange={(v) => set({ powerAvailable: v })} title="Mains power is available" />
        <AddButton label="Add background" onClick={() => set({ backgrounds: [...space.backgrounds, { id: nextId("bg"), description: "", widthM: "", movable: false }] })} />
        <AddButton label="Add natural light" onClick={() => set({ naturalLight: [...space.naturalLight, { id: nextId("nl"), kind: "window", direction: "unknown", controllable: false }] })} />
      </div>
      {space.backgrounds.map((b, bi) => (
        <div key={b.id} className="mt-2 flex items-center gap-2">
          <input value={b.description} onChange={(e) => set({ backgrounds: space.backgrounds.map((x, xi) => (xi === bi ? { ...x, description: e.target.value } : x)) })} placeholder="Background (e.g. plain wall)" className={`${inputCls} flex-1`} aria-label="Background description" />
          <Toggle label="Movable" checked={b.movable} onChange={(v) => set({ backgrounds: space.backgrounds.map((x, xi) => (xi === bi ? { ...x, movable: v } : x)) })} />
          <IconButton onClick={() => set({ backgrounds: space.backgrounds.filter((_, xi) => xi !== bi) })} label="Remove background"><Trash2 className="h-3 w-3" /></IconButton>
        </div>
      ))}
      {space.naturalLight.map((n, ni) => (
        <div key={n.id} className="mt-2 flex flex-wrap items-center gap-2">
          <Select size="sm" className="w-full" value={n.kind} onChange={(v) => set({ naturalLight: space.naturalLight.map((x, xi) => (xi === ni ? { ...x, kind: v as typeof x.kind } : x)) })} options={LIGHT_KIND_OPTIONS} aria-label="Natural light kind" />
          <Select size="sm" className="w-full" value={n.direction} onChange={(v) => set({ naturalLight: space.naturalLight.map((x, xi) => (xi === ni ? { ...x, direction: v as typeof x.direction } : x)) })} options={LIGHT_DIRECTION_OPTIONS} aria-label="Natural light direction" />
          <Toggle label="Controllable" checked={n.controllable} onChange={(v) => set({ naturalLight: space.naturalLight.map((x, xi) => (xi === ni ? { ...x, controllable: v } : x)) })} title="You can block or dim it (blinds, curtains)" />
          <IconButton onClick={() => set({ naturalLight: space.naturalLight.filter((_, xi) => xi !== ni) })} label="Remove natural light"><Trash2 className="h-3 w-3" /></IconButton>
        </div>
      ))}
      <input value={space.constraints} onChange={(e) => set({ constraints: e.target.value })} placeholder="Constraints, comma-separated (e.g. low ceiling, echoey)" className={`${inputCls} mt-2 w-full`} aria-label="Space constraints" />
    </div>
  );
}

function EquipmentRow({ item, rentalAllowed, purchaseAllowed, onChange, onRemove }: {
  item: DraftEquipment; rentalAllowed: boolean; purchaseAllowed: boolean; onChange: (e: DraftEquipment) => void; onRemove: () => void;
}) {
  const set = (p: Partial<DraftEquipment>) => onChange({ ...item, ...p });
  const paid = item.availability === "rental-approved" || item.availability === "purchase-approved";
  return (
    <div className="rounded-[7px] border border-[#1C1B19] bg-[#0F0F0E] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[#7A776E]" title={item.category}>{CATEGORY_ICON[item.category]}</span>
        <input value={item.label} onChange={(e) => set({ label: e.target.value })} placeholder={`${item.category} name (e.g. iPhone 14)`} className={`${inputCls} flex-1`} aria-label="Equipment name" />
        <IconButton onClick={onRemove} label="Remove equipment"><Trash2 className="h-3.5 w-3.5" /></IconButton>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {item.category !== "accessory" ? (
          <Mini label="Kind" as="div">
            <Select size="sm" value={item.kind} onChange={(v) => set({ kind: v })} options={CATEGORY_KIND_OPTIONS[item.category]} aria-label="Equipment kind" />
          </Mini>
        ) : (
          <Mini label="Kind"><input value={item.kind} onChange={(e) => set({ kind: e.target.value })} placeholder="e.g. clapperboard" className={inputCls} aria-label="Accessory kind" /></Mini>
        )}
        <Mini label="Availability" as="div">
          <Select size="sm" value={item.availability} onChange={(v) => set({ availability: v as DraftEquipment["availability"] })} options={AVAILABILITY_OPTIONS} aria-label="Availability" />
        </Mini>
        <Stepper label="Qty" value={item.quantity} min={1} onChange={(n) => set({ quantity: n })} />
        {paid && (
          <>
            <Mini label="Cost"><input type="number" min={0} value={item.cost} onChange={(e) => set({ cost: e.target.value })} className={inputCls} aria-label="Incremental cost" /></Mini>
            <Mini label="Cost basis" as="div">
              <Select size="sm" value={item.costBasis} onChange={(v) => set({ costBasis: v as CostBasis })} options={COST_BASIS_OPTIONS} aria-label="Cost basis" />
            </Mini>
          </>
        )}
      </div>

      {/* Category-specific */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {item.category === "camera" && (
          <>
            <Mini label="Focal min (mm)"><input type="number" min={0} value={item.focalMin} onChange={(e) => set({ focalMin: e.target.value })} className={inputCls} aria-label="Focal length min" /></Mini>
            <Mini label="Focal max (mm)"><input type="number" min={0} value={item.focalMax} onChange={(e) => set({ focalMax: e.target.value })} className={inputCls} aria-label="Focal length max" /></Mini>
          </>
        )}
        {item.category === "support" && (
          <Mini label="Max height (m)"><input type="number" min={0} step="0.1" value={item.maxHeight} onChange={(e) => set({ maxHeight: e.target.value })} className={inputCls} aria-label="Max height" /></Mini>
        )}
        {item.category === "light" && (
          <>
            <Mini label="Color temp min (K)"><input type="number" value={item.colorTempMin} onChange={(e) => set({ colorTempMin: e.target.value })} className={inputCls} aria-label="Color temperature min" /></Mini>
            <Mini label="Color temp max (K)"><input type="number" value={item.colorTempMax} onChange={(e) => set({ colorTempMax: e.target.value })} className={inputCls} aria-label="Color temperature max" /></Mini>
            <Toggle label="Dimmable" checked={item.dimmable} onChange={(v) => set({ dimmable: v })} />
            <Toggle label="Battery" checked={item.battery} onChange={(v) => set({ battery: v })} />
          </>
        )}
        {item.category === "audio" && (
          <>
            <Stepper label="Max subjects" value={item.maxSubjects} min={1} onChange={(n) => set({ maxSubjects: n })} />
            <Toggle label="Wireless" checked={item.wireless} onChange={(v) => set({ wireless: v })} />
          </>
        )}
        {item.category === "modifier" && (
          <Mini label="Size" as="div">
            <Select size="sm" value={item.size} onChange={(v) => set({ size: v as DraftEquipment["size"] })} options={MODIFIER_SIZE_OPTIONS} aria-label="Modifier size" />
          </Mini>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Toggle label="Preferred" checked={item.preferred} onChange={(v) => set({ preferred: v })} title="Prefer this item when the planner has a choice" />
        <input value={item.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Notes, comma-separated" className={`${inputCls} flex-1`} aria-label="Equipment notes" />
      </div>
      {item.availability === "rental-approved" && !rentalAllowed && <InlineWarn text="Enable “Allow rentals” above for this item." />}
      {item.availability === "purchase-approved" && !purchaseAllowed && <InlineWarn text="Enable “Allow purchases” above for this item." />}
    </div>
  );
}

// ── Primitives ──
const inputCls = `h-8 w-full rounded-[4px] border border-[#282724] bg-[#0B0B0A] px-2 text-[11px] text-[#ECE9E1] placeholder:text-[#5F5E5A] transition-colors duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none focus:border-[#D4A652] focus:shadow-[0_0_0_2px_#D4A65240]`;

function Group({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className={`w-full sm:w-auto ${MONO_LABEL}`}>{title}</h3>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[11px] text-[#B5B2A8]">{label}</span>
        {hint && <span className="text-[10px] text-[#5F5E5A]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
// `as="div"` hosts composite controls (the Select listbox): a wrapping <label> forwards clicks on
// non-interactive descendants — the options — to the trigger button and re-opens the list.
// Those controls carry aria-label instead.
function Mini({ label, children, as: Tag = "label" }: { label: string; children: React.ReactNode; as?: "label" | "div" }) {
  return (
    <Tag className="block">
      <span className={`mb-1 block ${MONO_LABEL}`}>{label}</span>
      {children}
    </Tag>
  );
}
function Segmented<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-[7px] border border-[#1C1B19] p-1" role="group">
      {options.map((o) => {
        const on = o === value;
        return (
          <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={on}
            className={`rounded-[4px] px-2 py-1 text-[11px] ${EASE} ${FOCUS_RING} ${on ? "bg-[#D4A652] font-medium text-[#0B0B0A]" : "text-[#7A776E] hover:text-[#ECE9E1]"}`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}
function Stepper({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className={`mb-1 block ${MONO_LABEL}`}>{label}</span>
      <div className="flex items-center rounded-[4px] border border-[#282724] bg-[#0B0B0A]">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))}
          className={`px-2 py-1 text-[13px] text-[#7A776E] ${EASE} hover:text-[#ECE9E1] ${FOCUS_RING}`}>−</button>
        <span className="flex-1 text-center font-mono text-[11px] text-[#ECE9E1]">{value}</span>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(value + 1)}
          className={`px-2 py-1 text-[13px] text-[#7A776E] ${EASE} hover:text-[#ECE9E1] ${FOCUS_RING}`}>+</button>
      </div>
    </label>
  );
}
function Toggle({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} title={title}
      className={`inline-flex items-center gap-1 rounded-[7px] border border-[#282724] px-2 py-1 text-[11px] ${EASE} ${FOCUS_RING} ${checked ? "text-[#ECE9E1]" : "text-[#7A776E] hover:text-[#ECE9E1]"}`}>
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${checked ? "bg-[#D4A652]" : "bg-[#454340]"}`} />
      {label}
    </button>
  );
}
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-[7px] border border-[#282724] px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[#7A776E] ${EASE} hover:text-[#ECE9E1] ${FOCUS_RING}`}>
      <Plus className="h-3 w-3" /> {label}
    </button>
  );
}
function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`shrink-0 rounded-[4px] p-1 text-[#7A776E] ${EASE} hover:text-[#D46A5C] ${FOCUS_RING}`}>
      {children}
    </button>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-[7px] border border-dashed border-[#282724] px-3 py-3 text-[11px] text-[#5F5E5A]">{text}</p>;
}
function InlineWarn({ text }: { text: string }) {
  return <p className="mt-2 text-[10px] text-[#D4A652]">{text}</p>;
}
