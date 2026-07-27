"use client";

/**
 * ShootKitResult — renders a ready ShotPlan produced by the deterministic backend.
 * It DISPLAYS the plan only. No camera/light/cost/fallback/optimization logic lives
 * here; every value shown is read straight off the ShotPlan the server returned.
 */

import React from "react";
import { AlertTriangle, ArrowUpRight, Info, Pencil } from "lucide-react";
import type { ShotPlan } from "@/lib/thinkforge/production/shot-plan";
import { ShootKitDiagram } from "./ShootKitDiagram";

type SceneShot = ShotPlan["scenes"][number];
type SetupGroup = ShotPlan["setupGroups"][number];
type PlanResource = ShotPlan["resources"][number];

interface ShootKitResultProps {
  plan: ShotPlan;
  onEditInputs: () => void;
  refreshing?: boolean;
}

const SOURCE_LABEL: Record<PlanResource["source"], string> = {
  owned: "Owned",
  borrowed: "Borrowed",
  household: "Household",
  natural: "Natural",
  rent: "Rented",
  buy: "Purchased",
};
const SOURCE_ORDER: PlanResource["source"][] = ["owned", "borrowed", "household", "natural", "rent", "buy"];

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function minutes(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} min`;
}

export function ShootKitResult({ plan, onEditInputs, refreshing }: ShootKitResultProps) {
  const sceneById = React.useMemo(() => new Map(plan.scenes.map((s) => [s.sceneId, s])), [plan.scenes]);
  const resourceById = React.useMemo(() => new Map(plan.resources.map((r) => [r.id, r])), [plan.resources]);
  const [selectedScene, setSelectedScene] = React.useState<Record<string, string>>({});

  const narrativeOrder = plan.optimization?.originalSceneOrder
    ?? [...plan.scenes].sort((a, b) => a.sidecarSceneIndex - b.sidecarSceneIndex).map((s) => s.sceneId);

  return (
    <div className="space-y-4" aria-busy={refreshing || undefined}>
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Setup time" value={minutes(plan.totalSetupMinutes)} />
        <Stat label="Incremental cost" value={money(plan.totalIncrementalCost, plan.currency)} />
        <Stat
          label="Feasibility"
          value={`${Math.round(plan.feasibility.score * 100)}%`}
          hint={plan.feasibility.status === "ready" ? "Ready" : "Ready with assumptions"}
        />
        {plan.optimization && (
          <>
            <Stat label="Setup changes" value={String(plan.optimization.setupChangeCount)} />
            <Stat label="Location changes" value={String(plan.optimization.locationChangeCount)} />
            <Stat label="Saved setup time" value={minutes(plan.optimization.savedSetupMinutes)} />
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-[#6B6860]">
          {plan.tier} · {plan.currency}
          {refreshing ? " · updating…" : ""}
        </span>
        <button
          type="button"
          onClick={onEditInputs}
          className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#34322E] px-2.5 py-1 text-[11px] text-[#B5B2A8] transition-colors hover:text-[#ECE9E1] hover:border-[#4A4842]"
        >
          <Pencil className="h-3 w-3" /> Edit inputs
        </button>
      </div>

      {/* Warnings + assumptions */}
      {plan.feasibility.warnings.length > 0 && (
        <Notice tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" />} title="Warnings" items={plan.feasibility.warnings} />
      )}
      {plan.feasibility.assumptions.length > 0 && (
        <Notice tone="info" icon={<Info className="h-3.5 w-3.5" />} title="Assumptions" items={plan.feasibility.assumptions} />
      )}

      {/* Orders */}
      <Section title="Shoot order">
        <OrderRow label="Narrative" ids={narrativeOrder} />
        <OrderRow label="Optimized" ids={plan.shootOrder} emphasise />
        {plan.optimization && plan.optimization.reasons.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 pl-3">
            {plan.optimization.reasons.map((r, i) => (
              <li key={i} className="list-disc text-[11px] leading-relaxed text-[#8B887F]">{r}</li>
            ))}
          </ul>
        )}
      </Section>

      {/* Required resources, grouped by source */}
      <Section title="Required resources">
        <div className="space-y-2">
          {SOURCE_ORDER.map((source) => {
            const rows = plan.resources.filter((r) => r.source === source);
            if (rows.length === 0) return null;
            return (
              <div key={source}>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-[#6B6860]">
                  {SOURCE_LABEL[source]}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {rows.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-[#282724] bg-[#0F0F0E] px-2 py-1 text-[11px] text-[#D8D5CC]"
                      title={r.notes.join(" · ") || undefined}
                    >
                      {r.label}
                      {r.quantity > 1 && <span className="text-[#7A776E]">×{r.quantity}</span>}
                      {r.incrementalCost > 0 && (
                        <span className="text-[#D4A652]">{money(r.incrementalCost, plan.currency)}</span>
                      )}
                      {!r.required && <span className="text-[#6B6860]">(optional)</span>}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Setup groups with scenes, diagram, and per-scene detail */}
      <Section title="Setups">
        <div className="space-y-3">
          {plan.setupGroups.map((setup) => {
            const scenes = setup.sceneIds.map((id) => sceneById.get(id)).filter((s): s is SceneShot => Boolean(s));
            const selectedId = selectedScene[setup.id] ?? scenes[0]?.sceneId;
            const activeScene = scenes.find((s) => s.sceneId === selectedId) ?? scenes[0] ?? null;
            return (
              <div key={setup.id} className="rounded-md border border-[#282724] bg-[#0F0F0E] p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="text-[13px] font-semibold text-[#ECE9E1]">{setup.label}</h4>
                  <span className="font-mono text-[10px] text-[#7A776E]">
                    setup {minutes(setup.setupMinutes)}
                    {setup.resetMinutes > 0 ? ` · reset ${minutes(setup.resetMinutes)}` : ""}
                    {setup.spaceId ? ` · ${setup.spaceId}` : ""}
                  </span>
                </div>

                {scenes.length > 1 && (
                  <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label={`Scenes in ${setup.label}`}>
                    {scenes.map((s) => {
                      const on = s.sceneId === activeScene?.sceneId;
                      return (
                        <button
                          key={s.sceneId}
                          role="tab"
                          aria-selected={on}
                          type="button"
                          onClick={() => setSelectedScene((prev) => ({ ...prev, [setup.id]: s.sceneId }))}
                          className={`rounded-[6px] border px-2 py-0.5 text-[11px] transition-colors ${
                            on ? "border-[#D4A652] text-[#D4A652]" : "border-[#34322E] text-[#8B887F] hover:text-[#ECE9E1]"
                          }`}
                        >
                          {s.sceneId}
                        </button>
                      );
                    })}
                  </div>
                )}

                <ShootKitDiagram setup={setup} scene={activeScene} coordinateSystem={plan.coordinateSystem} />

                {setup.instructions.length > 0 && (
                  <ul className="mt-2 space-y-0.5 pl-3">
                    {setup.instructions.map((ins, i) => (
                      <li key={i} className="list-disc text-[11px] leading-relaxed text-[#B5B2A8]">{ins}</li>
                    ))}
                  </ul>
                )}

                {activeScene && (
                  <SceneDetail scene={activeScene} setup={setup} resourceById={resourceById} />
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Upgrade options */}
      {plan.upgradeOptions.length > 0 && (
        <Section title="Optional upgrades">
          <div className="space-y-1.5">
            {plan.upgradeOptions.map((u) => (
              <div key={u.id} className="flex items-start justify-between gap-3 rounded-md border border-[#282724] bg-[#0F0F0E] px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#ECE9E1]">
                    <ArrowUpRight className="h-3.5 w-3.5 text-[#D4A652] shrink-0" />
                    {u.label}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#8B887F]">{u.benefit}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#6B6860]">
                    {u.resourceLabels.join(", ")} · scenes {u.affectedSceneIds.join(", ")}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[12px] text-[#D4A652]">
                  +{money(u.incrementalCost, plan.currency)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function SceneDetail({
  scene,
  setup,
  resourceById,
}: {
  scene: SceneShot;
  setup: SetupGroup;
  resourceById: Map<string, PlanResource>;
}) {
  const performerStance = new Map(setup.performerMarks.map((m) => [m.id, m]));
  const activeLights = setup.lightMarks.filter((m) => scene.activeLightMarkIds.includes(m.id));
  const activeAudio = setup.audioMarks.filter((m) => scene.activeAudioMarkIds.includes(m.id));
  const c = scene.continuity;

  return (
    <div className="mt-2 space-y-2 border-t border-[#1C1B19] pt-2">
      <p className="text-[11px] leading-relaxed text-[#B5B2A8]">
        <span className="text-[#ECE9E1]">{scene.intent.narrativePurpose}</span>
        {" — "}{scene.intent.emotionalBeat} · energy {Math.round(scene.intent.energy * 100)}% · {scene.intent.visualPriority}
      </p>

      <Kv label="Camera">
        {scene.camera.framing} · {scene.camera.angle} · {scene.camera.movement}
        {scene.camera.focalLengthEquivalentMm ? ` · ${scene.camera.focalLengthEquivalentMm}mm eq` : ""} · {Math.round(scene.durationSec * 10) / 10}s
      </Kv>

      {scene.performance.map((p) => (
        <Kv key={p.performerMarkId} label={`Performer ${p.characterId}`}>
          {performerStance.get(p.performerMarkId)?.stance ?? "custom"} · {p.emotion} @ {Math.round(p.intensity * 100)}% · gaze {p.gaze} · {p.posture} · {p.gesture} · {p.movement}
        </Kv>
      ))}

      {activeLights.length > 0 && (
        <Kv label="Lighting">
          {activeLights.map((m) => {
            const res = resourceById.get(m.resourceId);
            return `${m.role}${res ? ` (${res.label})` : ""}${m.intensityPercent !== undefined ? ` @${m.intensityPercent}%` : ""}${m.colorTemperatureK ? ` ${m.colorTemperatureK}K` : ""}`;
          }).join(" · ")}
        </Kv>
      )}

      {activeAudio.length > 0 && (
        <Kv label="Audio">
          {activeAudio.map((m) => {
            const res = resourceById.get(m.resourceId);
            return `${res ? res.label : m.resourceId}: ${m.placementInstruction}`;
          }).join(" · ")}
        </Kv>
      )}

      {(c.wardrobe.length > 0 || c.props.length > 0 || c.screenDirection || c.previousSceneIds.length > 0) && (
        <Kv label="Continuity">
          {[
            c.wardrobe.length ? `wardrobe: ${c.wardrobe.join(", ")}` : "",
            c.props.length ? `props: ${c.props.join(", ")}` : "",
            c.screenDirection ? `screen: ${c.screenDirection}` : "",
            c.previousSceneIds.length ? `after: ${c.previousSceneIds.join(", ")}` : "",
          ].filter(Boolean).join(" · ")}
        </Kv>
      )}

      {scene.fallback && (
        <div className="rounded-[6px] border border-[#3A3320] bg-[#181509] px-2.5 py-1.5">
          <div className="font-mono text-[10px] uppercase tracking-wide text-[#C9A24A]">Resolver fallback</div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#D8D5CC]">
            <span className="text-[#ECE9E1]">{scene.fallback.framing}</span> — {scene.fallback.instruction}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[#8B887F]">Reason: {scene.fallback.reason}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-[#282724] bg-[#0F0F0E] px-2.5 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wide text-[#6B6860]">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold text-[#ECE9E1]">{value}</div>
      {hint && <div className="text-[10px] text-[#7A776E]">{hint}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-[#8B887F]">{title}</h3>
      {children}
    </section>
  );
}

function OrderRow({ label, ids, emphasise }: { label: string; ids: string[]; emphasise?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase text-[#6B6860]">{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {ids.map((id, i) => (
          <React.Fragment key={`${id}-${i}`}>
            <span className={`font-mono text-[11px] ${emphasise ? "text-[#D4A652]" : "text-[#B5B2A8]"}`}>{id}</span>
            {i < ids.length - 1 && <span className="text-[#4A4842]">→</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-relaxed text-[#B5B2A8]">
      <span className="font-mono text-[10px] uppercase tracking-wide text-[#6B6860]">{label}: </span>
      {children}
    </p>
  );
}

function Notice({ tone, icon, title, items }: { tone: "warn" | "info"; icon: React.ReactNode; title: string; items: string[] }) {
  const border = tone === "warn" ? "#3A3320" : "#25303A";
  const bg = tone === "warn" ? "#171307" : "#0C1418";
  const fg = tone === "warn" ? "#C9A24A" : "#5CB8CC";
  return (
    <div className="rounded-md border px-3 py-2" style={{ borderColor: border, background: bg }}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: fg }}>
        {icon} {title}
      </div>
      <ul className="mt-1 space-y-0.5 pl-3">
        {items.map((it, i) => (
          <li key={i} className="list-disc text-[11px] leading-relaxed text-[#B5B2A8]">{it}</li>
        ))}
      </ul>
    </div>
  );
}
