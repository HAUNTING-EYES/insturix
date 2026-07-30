"use client";

/**
 * ShootKitDiagram — a top-down technical shot diagram for one setup group.
 *
 * It ONLY projects the exact ShotPlan coordinates to screen space (a uniform,
 * geometry-preserving fit). It never recalculates or invents camera/light/audio
 * geometry — that is the backend's job (resolve-scene-shot-plan.ts). The plan's
 * coordinate system is x = camera-right, y = up, z = toward-background, so the
 * floor plan plots (x, z): +x to screen-right, +z (background) to screen-top.
 *
 * Display-only projection decisions (not geometry): bounds are padded so marks
 * never touch the plot frame, sparse setups get a minimum display span so two
 * marks don't stretch across the whole frame, and a faint grid is drawn at a
 * round world step derived from the same projection.
 *
 * Palette per design-system v1 (design-tokens.css). Camera is the single gold
 * (focal) element; light roles use the category colors so nothing competes.
 */

import type { ShotPlan } from "@/lib/thinkforge/production/shot-plan";

type SetupGroup = ShotPlan["setupGroups"][number];
type SceneShot = ShotPlan["scenes"][number];
type Vector3 = SetupGroup["cameraMarks"][number]["position"];

interface ShootKitDiagramProps {
  setup: SetupGroup;
  /** When provided, marks active in this scene are emphasised and the rest dimmed. */
  scene?: SceneShot | null;
  coordinateSystem: ShotPlan["coordinateSystem"];
}

const VIEW_W = 400;
const VIEW_H = 300;
/** Outer margin holding axis hints; the plot frame sits inside it. */
const MARGIN = 24;
const FRAME_L = MARGIN;
const FRAME_T = MARGIN;
const FRAME_R = VIEW_W - MARGIN;
const FRAME_B = VIEW_H - MARGIN;
/** Inner breathing room so marks + their labels never touch the frame. */
const INNER_PAD = 26;

/** Light-role colors — design-system category palette only. */
const LIGHT_ROLE_COLOR: Record<string, string> = {
  key: "#D088B4",
  fill: "#5CB8CC",
  rim: "#9088D4",
  background: "#5EC97E",
  practical: "#B5B2A8",
  ambient: "#7A776E",
};
const CAMERA_COLOR = "#D4A652";
const PERFORMER_COLOR = "#ECE9E1";

interface Projector {
  project: (p: Vector3) => { sx: number; sy: number };
  /** World step of the background grid, chosen so lines land 32–120px apart. */
  gridStep: number;
  gridLines: { xs: number[]; zs: number[] };
}

/**
 * Uniform, aspect-preserving projection from plan (x, z) into the plot frame.
 * Bounds are padded (display margin) and floored to a minimum span so sparse
 * mark sets stay readable — pure viewport math, the coordinates are untouched.
 */
function makeProjector(points: Vector3[], unit: string): Projector {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minZ = Math.min(...zs);
  let maxZ = Math.max(...zs);

  const minSpan = unit === "meters" ? 1.5 : 0.5;
  if (maxX - minX < minSpan) {
    const c = (minX + maxX) / 2;
    minX = c - minSpan / 2;
    maxX = c + minSpan / 2;
  }
  if (maxZ - minZ < minSpan) {
    const c = (minZ + maxZ) / 2;
    minZ = c - minSpan / 2;
    maxZ = c + minSpan / 2;
  }
  const worldMargin = 0.12 * Math.max(maxX - minX, maxZ - minZ);
  minX -= worldMargin; maxX += worldMargin;
  minZ -= worldMargin; maxZ += worldMargin;

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const usableW = FRAME_R - FRAME_L - INNER_PAD * 2;
  const usableH = FRAME_B - FRAME_T - INNER_PAD * 2;
  const scale = Math.min(usableW / spanX, usableH / spanZ);
  const offsetX = FRAME_L + INNER_PAD + (usableW - spanX * scale) / 2;
  const offsetY = FRAME_T + INNER_PAD + (usableH - spanZ * scale) / 2;

  const project = (p: Vector3) => ({
    sx: offsetX + (p.x - minX) * scale,
    // Flip z so +z (toward-background) points up on screen.
    sy: offsetY + (maxZ - p.z) * scale,
  });

  // Grid step: the round world value whose projected spacing lands in 32–120px.
  let gridStep = 0;
  for (const step of [0.25, 0.5, 1, 2, 5, 10]) {
    const px = step * scale;
    if (px >= 32 && px <= 120) { gridStep = step; break; }
    if (px > 120) { gridStep = step; break; }
  }
  const gridLines = { xs: [] as number[], zs: [] as number[] };
  if (gridStep > 0) {
    for (let gx = Math.ceil(minX / gridStep) * gridStep; gx <= maxX; gx += gridStep) gridLines.xs.push(gx);
    for (let gz = Math.ceil(minZ / gridStep) * gridStep; gz <= maxZ; gz += gridStep) gridLines.zs.push(gz);
  }
  return { project, gridStep, gridLines };
}

function fmtCoord(p: Vector3, unit: string): string {
  const u = unit === "meters" ? "m" : "";
  return `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})${u}`;
}

/** Deterministic label placement: above the mark unless too close to the frame top. */
function labelPos(sx: number, sy: number, markHalf: number): { lx: number; ly: number } {
  const ly = sy - markHalf - 6 < FRAME_T + 12 ? sy + markHalf + 13 : sy - markHalf - 6;
  const lx = Math.min(Math.max(sx, FRAME_L + 34), FRAME_R - 34);
  return { lx, ly };
}

export function ShootKitDiagram({ setup, scene, coordinateSystem }: ShootKitDiagramProps) {
  const points: Vector3[] = [];
  setup.cameraMarks.forEach((m) => { points.push(m.position); points.push(m.target); });
  setup.performerMarks.forEach((m) => points.push(m.position));
  setup.lightMarks.forEach((m) => { points.push(m.position); if (m.target) points.push(m.target); });
  setup.audioMarks.forEach((m) => { if (m.position) points.push(m.position); });

  const unit = coordinateSystem.unit;
  const unitLabel = unit === "meters" ? "meters" : "normalized units";

  if (points.length === 0) {
    return (
      <div className="rounded-[7px] border border-[#282724] bg-[#0F0F0E] px-3 py-4 text-[11px] text-[#7A776E]">
        No spatial marks were provided for this setup.
      </div>
    );
  }

  const { project, gridStep, gridLines } = makeProjector(points, unit);
  const activeCameraMarkId = scene?.camera.markId;
  const activeLight = new Set(scene?.activeLightMarkIds ?? []);
  const activeAudio = new Set(scene?.activeAudioMarkIds ?? []);
  const activePerformer = new Set((scene?.performance ?? []).map((p) => p.performerMarkId));
  const hasScene = Boolean(scene);
  const dim = (isActive: boolean) => (hasScene && !isActive ? 0.32 : 1);

  const rolesPresent = Array.from(new Set(setup.lightMarks.map((m) => m.role)));
  const hasPerformers = setup.performerMarks.length > 0;
  const hasAudio = setup.audioMarks.some((m) => m.position);

  return (
    <figure className="m-0">
      <div
        className="w-full overflow-hidden rounded-[7px] border border-[#282724] bg-[#0B0B0A]"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Top-down shot diagram for setup ${setup.label}, coordinates in ${unitLabel}, x is camera-right and z is toward background.`}
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <defs>
            <marker id="sk-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#B5B2A8" />
            </marker>
          </defs>

          {/* World grid (projection-derived round step) + plot frame */}
          {gridLines.xs.map((gx) => {
            const { sx } = project({ x: gx, y: 0, z: 0 });
            if (sx <= FRAME_L + 1 || sx >= FRAME_R - 1) return null;
            return <line key={`gx${gx}`} x1={sx} y1={FRAME_T} x2={sx} y2={FRAME_B} stroke="#1C1B19" strokeWidth={1} />;
          })}
          {gridLines.zs.map((gz) => {
            const { sy } = project({ x: 0, y: 0, z: gz });
            if (sy <= FRAME_T + 1 || sy >= FRAME_B - 1) return null;
            return <line key={`gz${gz}`} x1={FRAME_L} y1={sy} x2={FRAME_R} y2={sy} stroke="#1C1B19" strokeWidth={1} />;
          })}
          <rect x={FRAME_L} y={FRAME_T} width={FRAME_R - FRAME_L} height={FRAME_B - FRAME_T}
            fill="none" stroke="#282724" strokeWidth={1} rx={4} />

          {/* Axis hints — in the outer margin, never inside the plot */}
          <text x={VIEW_W / 2} y={FRAME_T - 9} textAnchor="middle" fill="#5F5E5A" fontSize={9} letterSpacing="0.08em">
            BACKGROUND +Z ↑
          </text>
          <text x={FRAME_R} y={VIEW_H - 8} textAnchor="end" fill="#5F5E5A" fontSize={9} letterSpacing="0.08em">
            +X →
          </text>
          {gridStep > 0 && (
            <text x={FRAME_L} y={VIEW_H - 8} textAnchor="start" fill="#5F5E5A" fontSize={9} letterSpacing="0.08em">
              GRID {gridStep}{unit === "meters" ? "M" : ""}
            </text>
          )}

          {/* Lights */}
          {setup.lightMarks.map((m) => {
            const s = project(m.position);
            const color = LIGHT_ROLE_COLOR[m.role] ?? "#B5B2A8";
            const isActive = activeLight.has(m.id);
            const t = m.target ? project(m.target) : null;
            const { lx, ly } = labelPos(s.sx, s.sy, 6);
            return (
              <g key={m.id} opacity={dim(isActive)}>
                {t && <line x1={s.sx} y1={s.sy} x2={t.sx} y2={t.sy} stroke={color} strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />}
                <rect x={s.sx - 6} y={s.sy - 6} width={12} height={12} fill={color} rx={2} />
                <title>{`${m.role} light${m.intensityPercent !== undefined ? ` @${m.intensityPercent}%` : ""}${m.colorTemperatureK ? `, ${m.colorTemperatureK}K` : ""} — ${fmtCoord(m.position, unit)}`}</title>
                <text x={s.sx} y={s.sy + 3.5} textAnchor="middle" fill="#0B0B0A" fontSize={9} fontWeight={500}>
                  {m.role.charAt(0).toUpperCase()}
                </text>
                <text x={lx} y={ly} textAnchor="middle" fill="#7A776E" fontSize={9}>
                  {fmtCoord(m.position, unit)}
                </text>
              </g>
            );
          })}

          {/* Audio (diamond, outlined — distinct from light squares) */}
          {setup.audioMarks.map((m) => {
            if (!m.position) return null;
            const s = project(m.position);
            const isActive = activeAudio.has(m.id);
            const { lx, ly } = labelPos(s.sx, s.sy, 7);
            return (
              <g key={m.id} opacity={dim(isActive)}>
                <path d={`M${s.sx} ${s.sy - 6} L${s.sx + 6} ${s.sy} L${s.sx} ${s.sy + 6} L${s.sx - 6} ${s.sy} Z`}
                  fill="#131312" stroke="#5CB8CC" strokeWidth={1.5} />
                <title>{`Audio — ${m.placementInstruction}`}</title>
                <text x={lx} y={ly} textAnchor="middle" fill="#5CB8CC" fontSize={9}>mic</text>
              </g>
            );
          })}

          {/* Performers */}
          {setup.performerMarks.map((m) => {
            const s = project(m.position);
            const isActive = activePerformer.has(m.id);
            // bodyAngleDeg is measured in the plan; draw a facing tick, do not derive geometry.
            const rad = (m.bodyAngleDeg * Math.PI) / 180;
            const fx = s.sx + Math.sin(rad) * 13;
            const fy = s.sy - Math.cos(rad) * 13;
            const { lx, ly } = labelPos(s.sx, s.sy + 4, 12);
            return (
              <g key={m.id} opacity={dim(isActive)}>
                <line x1={s.sx} y1={s.sy} x2={fx} y2={fy} stroke={PERFORMER_COLOR} strokeWidth={1.5} />
                <circle cx={s.sx} cy={s.sy} r={7.5} fill={PERFORMER_COLOR} />
                <title>{`${m.characterId} — ${m.stance}, body ${m.bodyAngleDeg}°, ${fmtCoord(m.position, unit)}`}</title>
                <text x={s.sx} y={s.sy + 3.5} textAnchor="middle" fill="#0B0B0A" fontSize={9} fontWeight={500}>P</text>
                <text x={lx} y={ly} textAnchor="middle" fill="#B5B2A8" fontSize={9}>
                  {m.characterId}
                </text>
              </g>
            );
          })}

          {/* Cameras (drawn last, on top — the single gold focal element) */}
          {setup.cameraMarks.map((m) => {
            const s = project(m.position);
            const t = project(m.target);
            const isActive = !hasScene || m.id === activeCameraMarkId;
            const { lx, ly } = labelPos(s.sx, s.sy, 8);
            return (
              <g key={m.id} opacity={dim(isActive)}>
                <line x1={s.sx} y1={s.sy} x2={t.sx} y2={t.sy} stroke="#B5B2A8" strokeWidth={1.25} markerEnd="url(#sk-arrow)" />
                <rect x={s.sx - 8} y={s.sy - 7} width={16} height={14} fill={CAMERA_COLOR} rx={2} />
                <title>{`Camera ${m.id} — ${m.orientation}${m.heightM ? `, ${m.heightM}m high` : ""} — ${fmtCoord(m.position, unit)}`}</title>
                <text x={s.sx} y={s.sy + 4} textAnchor="middle" fill="#0B0B0A" fontSize={10} fontWeight={500}>C</text>
                <text x={lx} y={ly} textAnchor="middle" fill="#B5B2A8" fontSize={9}>
                  {fmtCoord(m.position, unit)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend — built from what is actually in this setup */}
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#7A776E]">
        <LegendSwatch color={CAMERA_COLOR} label="Camera" />
        {rolesPresent.map((role) => (
          <LegendSwatch key={role} color={LIGHT_ROLE_COLOR[role] ?? "#B5B2A8"} label={role} square />
        ))}
        {hasPerformers && <LegendSwatch color={PERFORMER_COLOR} label="Performer" round />}
        {hasAudio && <LegendSwatch color="#5CB8CC" label="Audio" diamond />}
        <span className="ml-auto font-mono text-[10px] tracking-[0.08em] text-[#5F5E5A]">
          {coordinateSystem.origin.toUpperCase()} · {unitLabel.toUpperCase()}
        </span>
      </figcaption>
      {scene && (
        <p className="mt-1 font-mono text-[10px] text-[#7A776E]">
          {scene.camera.framing} · {scene.camera.angle} · {scene.camera.movement}
          {scene.camera.focalLengthEquivalentMm ? ` · ${scene.camera.focalLengthEquivalentMm}mm eq` : ""}
        </p>
      )}
    </figure>
  );
}

function LegendSwatch({ color, label, square, round, diamond }: {
  color: string; label: string; square?: boolean; round?: boolean; diamond?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className="inline-block h-2 w-2"
        style={{
          background: diamond ? "transparent" : color,
          border: diamond ? `1.5px solid ${color}` : undefined,
          borderRadius: round ? "50%" : square ? 1 : 2,
          transform: diamond ? "rotate(45deg)" : undefined,
        }}
      />
      {label}
    </span>
  );
}
