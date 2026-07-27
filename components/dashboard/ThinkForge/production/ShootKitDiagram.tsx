"use client";

/**
 * ShootKitDiagram — a top-down technical shot diagram for one setup group.
 *
 * It ONLY projects the exact ShotPlan coordinates to screen space (a uniform,
 * geometry-preserving fit). It never recalculates or invents camera/light/audio
 * geometry — that is the backend's job (resolve-scene-shot-plan.ts). The plan's
 * coordinate system is x = camera-right, y = up, z = toward-background, so the
 * floor plan plots (x, z): +x to screen-right, +z (background) to screen-top.
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
const PAD = 34;

const LIGHT_ROLE_COLOR: Record<string, string> = {
  key: "#E3B341",
  fill: "#5CB8CC",
  rim: "#B98CE0",
  background: "#6FA76F",
  practical: "#D08C5A",
  ambient: "#8B887F",
};

/** Uniform, aspect-preserving projection from plan (x, z) to the fixed viewBox. */
function makeProjector(points: Vector3[]) {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  // Guard degenerate spans (single point / collinear) so nothing divides by zero.
  const spanX = Math.max(maxX - minX, 0.001);
  const spanZ = Math.max(maxZ - minZ, 0.001);
  const usableW = VIEW_W - PAD * 2;
  const usableH = VIEW_H - PAD * 2;
  const scale = Math.min(usableW / spanX, usableH / spanZ);
  const drawnW = spanX * scale;
  const drawnH = spanZ * scale;
  const offsetX = PAD + (usableW - drawnW) / 2;
  const offsetY = PAD + (usableH - drawnH) / 2;
  return (p: Vector3): { sx: number; sy: number } => ({
    sx: offsetX + (p.x - minX) * scale,
    // Flip z so +z (toward-background) points up on screen.
    sy: offsetY + (maxZ - p.z) * scale,
  });
}

function fmtCoord(p: Vector3, unit: string): string {
  const u = unit === "meters" ? "m" : "";
  return `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})${u}`;
}

export function ShootKitDiagram({ setup, scene, coordinateSystem }: ShootKitDiagramProps) {
  const points: Vector3[] = [];
  setup.cameraMarks.forEach((m) => { points.push(m.position); points.push(m.target); });
  setup.performerMarks.forEach((m) => points.push(m.position));
  setup.lightMarks.forEach((m) => { points.push(m.position); if (m.target) points.push(m.target); });
  setup.audioMarks.forEach((m) => { if (m.position) points.push(m.position); });

  const unitLabel = coordinateSystem.unit === "meters" ? "meters" : "normalized units";

  if (points.length === 0) {
    return (
      <div className="rounded-md border border-[#282724] bg-[#0F0F0E] px-3 py-4 text-[11px] text-[#7A776E]">
        No spatial marks were provided for this setup.
      </div>
    );
  }

  const project = makeProjector(points);
  const activeCameraMarkId = scene?.camera.markId;
  const activeLight = new Set(scene?.activeLightMarkIds ?? []);
  const activeAudio = new Set(scene?.activeAudioMarkIds ?? []);
  const activePerformer = new Set((scene?.performance ?? []).map((p) => p.performerMarkId));
  const hasScene = Boolean(scene);
  const dim = (isActive: boolean) => (hasScene && !isActive ? 0.35 : 1);

  return (
    <figure className="m-0">
      <div
        className="w-full overflow-hidden rounded-md border border-[#282724] bg-[#0C0C0B]"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`Top-down shot diagram for setup ${setup.label}, coordinates in ${unitLabel}, x is camera-right and z is toward background.`}
        >
          <defs>
            <marker id="sk-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#B5B2A8" />
            </marker>
          </defs>

          {/* Plot frame + axis hints (background at top, camera-right to the right). */}
          <rect x={PAD - 10} y={PAD - 10} width={VIEW_W - (PAD - 10) * 2} height={VIEW_H - (PAD - 10) * 2}
            fill="none" stroke="#1C1B19" strokeWidth={1} rx={4} />
          <text x={VIEW_W / 2} y={14} textAnchor="middle" fill="#6B6860" fontSize={9} fontFamily="monospace">
            background (+z) ↑
          </text>
          <text x={VIEW_W - 8} y={VIEW_H / 2} textAnchor="end" fill="#6B6860" fontSize={9} fontFamily="monospace">
            +x →
          </text>

          {/* Lights */}
          {setup.lightMarks.map((m) => {
            const s = project(m.position);
            const color = LIGHT_ROLE_COLOR[m.role] ?? "#8B887F";
            const isActive = activeLight.has(m.id);
            const t = m.target ? project(m.target) : null;
            return (
              <g key={m.id} opacity={dim(isActive)}>
                {t && <line x1={s.sx} y1={s.sy} x2={t.sx} y2={t.sy} stroke={color} strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />}
                <rect x={s.sx - 5} y={s.sy - 5} width={10} height={10} fill={color} rx={1.5} />
                <text x={s.sx} y={s.sy + 3} textAnchor="middle" fill="#0B0B0A" fontSize={7} fontWeight="bold">
                  {m.role.charAt(0).toUpperCase()}
                </text>
                <text x={s.sx} y={s.sy - 8} textAnchor="middle" fill={color} fontSize={7.5} fontFamily="monospace">
                  {fmtCoord(m.position, coordinateSystem.unit)}
                </text>
              </g>
            );
          })}

          {/* Audio */}
          {setup.audioMarks.map((m) => {
            if (!m.position) return null;
            const s = project(m.position);
            const isActive = activeAudio.has(m.id);
            return (
              <g key={m.id} opacity={dim(isActive)}>
                <path d={`M${s.sx} ${s.sy - 5} L${s.sx + 5} ${s.sy} L${s.sx} ${s.sy + 5} L${s.sx - 5} ${s.sy} Z`}
                  fill="#5CB8CC" opacity={0.85} />
                <text x={s.sx} y={s.sy + 15} textAnchor="middle" fill="#5CB8CC" fontSize={7.5} fontFamily="monospace">mic</text>
              </g>
            );
          })}

          {/* Performers */}
          {setup.performerMarks.map((m) => {
            const s = project(m.position);
            const isActive = activePerformer.has(m.id);
            // bodyAngleDeg is measured in the plan; draw a facing tick, do not derive geometry.
            const rad = (m.bodyAngleDeg * Math.PI) / 180;
            const fx = s.sx + Math.sin(rad) * 12;
            const fy = s.sy - Math.cos(rad) * 12;
            return (
              <g key={m.id} opacity={dim(isActive)}>
                <line x1={s.sx} y1={s.sy} x2={fx} y2={fy} stroke="#ECE9E1" strokeWidth={1.5} />
                <circle cx={s.sx} cy={s.sy} r={6.5} fill="#ECE9E1" />
                <title>{`${m.characterId} — ${m.stance}, body ${m.bodyAngleDeg}°`}</title>
                <text x={s.sx} y={s.sy + 3} textAnchor="middle" fill="#0B0B0A" fontSize={7} fontWeight="bold">P</text>
                <text x={s.sx} y={s.sy + 17} textAnchor="middle" fill="#B5B2A8" fontSize={7.5} fontFamily="monospace">
                  {m.characterId}
                </text>
              </g>
            );
          })}

          {/* Cameras (drawn last, on top) */}
          {setup.cameraMarks.map((m) => {
            const s = project(m.position);
            const t = project(m.target);
            const isActive = !hasScene || m.id === activeCameraMarkId;
            return (
              <g key={m.id} opacity={dim(isActive)}>
                <line x1={s.sx} y1={s.sy} x2={t.sx} y2={t.sy} stroke="#B5B2A8" strokeWidth={1.25} markerEnd="url(#sk-arrow)" />
                <rect x={s.sx - 7} y={s.sy - 6} width={14} height={12} fill="#D4A652" rx={2} />
                <title>{`Camera ${m.id} — ${m.orientation}${m.heightM ? `, ${m.heightM}m high` : ""}`}</title>
                <text x={s.sx} y={s.sy + 3.5} textAnchor="middle" fill="#0B0B0A" fontSize={8} fontWeight="bold">C</text>
                <text x={s.sx} y={s.sy - 9} textAnchor="middle" fill="#D4A652" fontSize={7.5} fontFamily="monospace">
                  {fmtCoord(m.position, coordinateSystem.unit)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend + the scene's framing/angle/movement (from the plan, not recomputed) */}
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#8B887F]">
        <LegendSwatch color="#D4A652" label="Camera" />
        <LegendSwatch color="#E3B341" label="Key" square />
        <LegendSwatch color="#5CB8CC" label="Fill / Audio" square />
        <LegendSwatch color="#B98CE0" label="Rim" square />
        <LegendSwatch color="#ECE9E1" label="Performer" round />
        <span className="ml-auto font-mono text-[#6B6860]">
          {coordinateSystem.origin} · {unitLabel}
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

function LegendSwatch({ color, label, square, round }: { color: string; label: string; square?: boolean; round?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5"
        style={{ background: color, borderRadius: round ? "50%" : square ? 2 : 3 }}
      />
      {label}
    </span>
  );
}
