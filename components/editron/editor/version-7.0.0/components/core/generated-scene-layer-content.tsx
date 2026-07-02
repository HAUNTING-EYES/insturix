import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { GeneratedSceneElement, GeneratedSceneFamilyPlan, GeneratedSceneOverlay } from "../../types";

type GeneratedSceneLike = GeneratedSceneOverlay & {
  sceneModel?: GeneratedSceneOverlay["sceneModel"] & Record<string, unknown>;
};

const DEFAULT_ITEMS = ["Plan", "Generate", "Review", "Publish"];
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_BALANCED = Easing.bezier(0.45, 0, 0.55, 1);

const FALLBACK_FAMILY_PLAN: GeneratedSceneFamilyPlan = {
  family: "workflow_demo",
  evidenceSource: "scene_descriptor",
  sourcePaths: ["SceneDescriptor"],
  visualGoal: "Show a readable product workflow state.",
  productUiState: "product workflow",
  motionIntent: "balanced stepwise UI state change",
  copyRole: "explain the workflow step",
  claimMode: "synthetic_demo_only",
};

export const GeneratedSceneLayerContent: React.FC<{ overlay: GeneratedSceneLike }> = ({ overlay }) => {
  const frame = useCurrentFrame();
  const localFrame = Math.max(0, frame);
  const duration = Math.max(1, overlay.durationInFrames || 1);
  const model = overlay.sceneModel;
  const brand = model?.brand ?? {};
  const elements = Array.isArray(model?.elements) ? model.elements : [];
  const headline = findElement(elements, "headline");
  const shell = findElement(elements, "app-shell");
  const panel = findElement(elements, "panel");
  const metric = findElement(elements, "metric");
  const cta = findElement(elements, "cta");
  const familyPlan = normalizeFamilyPlan(model?.familyPlan);
  const caption = model?.captionTracks?.[0]?.text;

  const accent = safeColor(brand.accentColor, "#D4A652");
  const background = safeColor(brand.backgroundColor, "#0B0B0A");
  const surface = safeColor(brand.surfaceColor, "#171A1F");
  const text = safeColor(brand.textColor, "#F7F4EA");
  const muted = safeColor(brand.mutedTextColor, "#B9B2A3");
  const fontFamily = brand.fontFamily || "Plus Jakarta Sans, Inter, sans-serif";
  const items = normalizeItems(shell?.items);
  const activeStep = activeIndex(localFrame, duration, items.length);
  const sceneProgress = progress(localFrame, 0, duration, EASE_BALANCED);
  const enter = progress(localFrame, 0, Math.min(34, duration * 0.18), EASE_OUT);
  const headlineIn = progress(localFrame, 6, Math.min(42, duration * 0.2), EASE_OUT);
  const shellIn = progress(localFrame, 14, Math.min(54, duration * 0.26), EASE_OUT);
  const proofIn = progress(localFrame, duration * 0.16, duration * 0.34, EASE_OUT);
  const ctaIn = progress(localFrame, duration * 0.62, duration * 0.78, EASE_OUT);
  const exit = progress(localFrame, Math.max(0, duration - 18), duration, Easing.in(Easing.cubic));
  const cameraScale = interpolate(sceneProgress, [0, 1], [1.01, 1.075]);
  const cameraX = interpolate(sceneProgress, [0, 1], [26, -34]);
  const cameraY = interpolate(sceneProgress, [0, 1], [8, -12]);
  const gridDrift = interpolate(sceneProgress, [0, 1], [18, -18]);
  const cursor = cursorPosition(sceneProgress);
  const visibleCaption = caption ? revealCaption(caption, localFrame, duration) : "";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        background,
        color: text,
        fontFamily,
        opacity: 1 - exit * 0.18,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          opacity: 0.24,
          transform: `translate3d(${gridDrift}px, ${gridDrift * 0.36}px, 0) scale(${1 + sceneProgress * 0.018})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "7% 8%",
          display: "grid",
          gridTemplateColumns: "0.84fr 1.42fr",
          gap: "5%",
          opacity: enter,
          transform: `translateY(${(1 - enter) * 22}px)`,
        }}
      >
        <section style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: headlineIn }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: accent,
                boxShadow: `0 0 ${24 + sceneProgress * 20}px ${accent}55`,
                transform: `scale(${interpolate(headlineIn, [0, 1], [0.72, 1])})`,
              }}
            />
            <div style={{ fontSize: 24, color: muted }}>{brand.name || model?.productName || "SaaS product"}</div>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 72,
              lineHeight: 0.96,
              fontWeight: 800,
              letterSpacing: 0,
              maxWidth: 720,
              opacity: headlineIn,
              transform: `translateY(${(1 - headlineIn) * 18}px)`,
            }}
          >
            {headline?.text || model?.title || overlay.content}
          </h1>
          <div
            style={{
              width: 150 + sceneProgress * 72,
              height: 4,
              borderRadius: 999,
              background: accent,
              opacity: headlineIn,
            }}
          />
          <p
            style={{
              margin: 0,
              color: muted,
              fontSize: 28,
              lineHeight: 1.32,
              maxWidth: 640,
              opacity: proofIn,
              transform: `translateY(${(1 - proofIn) * 14}px)`,
            }}
          >
            {panel?.text || familyPlan.visualGoal || model?.style?.uiTreatment || "Readable product proof with motion-led UI moments."}
          </p>
        </section>

        <section
          style={{
            alignSelf: "center",
            minHeight: 620,
            borderRadius: 28,
            background: surface,
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 28px 80px rgba(0,0,0,0.38)",
            overflow: "hidden",
            opacity: shellIn,
            transform: `translate3d(${(1 - shellIn) * 46 + cameraX}px, ${cameraY}px, 0) scale(${cameraScale})`,
          }}
        >
          <div style={{ height: 58, display: "flex", alignItems: "center", gap: 10, padding: "0 22px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            {[0, 1, 2].map((dot) => (
              <span key={dot} style={{ width: 12, height: 12, borderRadius: 999, background: dot === 0 ? accent : "rgba(255,255,255,0.22)" }} />
            ))}
            <span style={{ marginLeft: 18, color: muted, fontSize: 18 }}>{shell?.label || familyPlan.productUiState || "Product workspace"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", minHeight: 562 }}>
            <aside style={{ padding: 24, borderRight: "1px solid rgba(255,255,255,0.1)", position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 16,
                  width: 4,
                  height: 32,
                  borderRadius: 999,
                  background: accent,
                  top: 29 + activeStep * 44,
                  boxShadow: `0 0 24px ${accent}66`,
                }}
              />
              {items.map((item, index) => {
                const itemIn = progress(localFrame, 18 + index * 7, 42 + index * 7, EASE_OUT);
                const isActive = index === activeStep;
                return (
                  <div
                    key={`${item}_${index}`}
                    style={{
                      height: 44,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      color: isActive ? text : muted,
                      fontSize: 17,
                      fontWeight: isActive ? 800 : 500,
                      opacity: itemIn,
                      transform: `translateX(${(1 - itemIn) * -12}px)`,
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: isActive ? accent : "rgba(255,255,255,0.22)" }} />
                    {item}
                  </div>
                );
              })}
            </aside>
            <main style={{ padding: 30, display: "grid", gridTemplateRows: "120px 1fr 118px", gap: 22, position: "relative" }}>
              <MetricCards metricLabel={metric?.label} metricValue={metric?.value} familyPlan={familyPlan} activeStep={activeStep} accent={accent} text={text} muted={muted} localFrame={localFrame} />
              <ProductProofPanel accent={accent} text={text} muted={muted} activeStep={activeStep} localFrame={localFrame} duration={duration} familyPlan={familyPlan} />
              <div
                style={{
                  borderRadius: 18,
                  background: `${accent}12`,
                  border: `1px solid ${accent}38`,
                  padding: 20,
                  color: text,
                  fontSize: 24,
                  fontWeight: 700,
                  opacity: ctaIn,
                  transform: `translateY(${(1 - ctaIn) * 18}px)`,
                }}
              >
                {cta?.text || "Turn brand context into a finished launch asset"}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: `${cursor.x}%`,
                  top: `${cursor.y}%`,
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  border: `3px solid ${accent}`,
                  background: `${accent}22`,
                  boxShadow: `0 0 26px ${accent}99`,
                  opacity: progress(localFrame, duration * 0.2, duration * 0.3, EASE_OUT),
                  transform: "translate(-50%, -50%)",
                }}
              />
            </main>
          </div>
        </section>
      </div>
      {visibleCaption ? (
        <div
          style={{
            position: "absolute",
            left: "14%",
            right: "14%",
            bottom: "5%",
            padding: "16px 24px",
            borderRadius: 18,
            background: "rgba(0,0,0,0.58)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: text,
            fontSize: 28,
            textAlign: "center",
            lineHeight: 1.25,
            opacity: progress(localFrame, 8, 24, EASE_OUT),
          }}
        >
          {visibleCaption}
        </div>
      ) : null}
    </div>
  );
};

function MetricCards(props: {
  metricLabel?: string;
  metricValue?: string;
  familyPlan: GeneratedSceneFamilyPlan;
  activeStep: number;
  accent: string;
  text: string;
  muted: string;
  localFrame: number;
}) {
  const values = [
    { label: "Family", value: familyLabel(props.familyPlan.family) },
    { label: props.metricLabel || "Focus", value: props.metricValue || familyFocusValue(props.familyPlan) },
    { label: "Evidence", value: props.familyPlan.claimMode === "evidence_backed" ? "Sourced" : "Demo" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
      {values.map((card, index) => {
        const cardIn = progress(props.localFrame, 26 + index * 8, 54 + index * 8, EASE_OUT);
        const isActive = index === Math.min(2, props.activeStep);
        return (
          <div
            key={card.label}
            style={{
              borderRadius: 18,
              background: isActive ? `${props.accent}14` : "rgba(255,255,255,0.055)",
              border: `1px solid ${isActive ? `${props.accent}55` : "rgba(255,255,255,0.1)"}`,
              padding: 18,
              opacity: cardIn,
              transform: `translateY(${(1 - cardIn) * 16}px) scale(${0.96 + cardIn * 0.04})`,
            }}
          >
            <div style={{ color: props.muted, fontSize: 15 }}>{card.label}</div>
            <div style={{ marginTop: 12, color: index === 1 ? props.accent : props.text, fontSize: 28, fontWeight: 800 }}>
              {card.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductProofPanel(props: {
  accent: string;
  text: string;
  muted: string;
  activeStep: number;
  localFrame: number;
  duration: number;
  familyPlan: GeneratedSceneFamilyPlan;
}) {
  const panelPulse = progress(props.localFrame, props.duration * 0.34, props.duration * 0.48, EASE_BALANCED);
  const family = props.familyPlan.family;

  if (family === "problem") {
    return (
      <div style={panelBaseStyle(props.accent)}>
        {["Scattered inputs", "Slow review", "Launch drag"].map((label, index) => {
          const rowIn = progress(props.localFrame, 34 + index * 10, 68 + index * 10, EASE_OUT);
          return (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "42px 1fr 84px", alignItems: "center", gap: 18, marginBottom: 24, opacity: rowIn, transform: `translateX(${(1 - rowIn) * -24}px)` }}>
              <span style={{ width: 28, height: 28, borderRadius: 999, border: `2px solid ${props.accent}`, background: `${props.accent}18` }} />
              <div style={{ height: 24, borderRadius: 999, background: "rgba(255,255,255,0.12)" }} />
              <div style={{ color: props.muted, fontSize: 16 }}>{label}</div>
            </div>
          );
        })}
        <div style={{ marginTop: 22, padding: 18, borderRadius: 16, background: `${props.accent}12`, color: props.text, fontSize: 22, fontWeight: 800 }}>
          {props.familyPlan.productUiState}
        </div>
      </div>
    );
  }

  if (family === "comparison") {
    return (
      <div style={{ ...panelBaseStyle(props.accent), display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {["Before", "After"].map((label, index) => {
          const sideIn = progress(props.localFrame, 36 + index * 14, 78 + index * 14, EASE_OUT);
          return (
            <div key={label} style={{ borderRadius: 18, background: index === 1 ? `${props.accent}18` : "rgba(255,255,255,0.055)", border: `1px solid ${index === 1 ? `${props.accent}44` : "rgba(255,255,255,0.11)"}`, padding: 22, opacity: sideIn, transform: `translateY(${(1 - sideIn) * 22}px)` }}>
              <div style={{ color: index === 1 ? props.accent : props.muted, fontSize: 20, fontWeight: 800 }}>{label}</div>
              {[0, 1, 2].map((bar) => <div key={bar} style={{ marginTop: 26, height: 22, borderRadius: 999, background: index === 1 && bar === props.activeStep % 3 ? `${props.accent}88` : "rgba(255,255,255,0.13)", width: `${82 - bar * 14}%` }} />)}
            </div>
          );
        })}
      </div>
    );
  }

  if (family === "proof_metric" || family === "social_proof") {
    const ring = interpolate(panelPulse, [0, 1], [42, 78]);
    return (
      <div style={{ ...panelBaseStyle(props.accent), display: "grid", gridTemplateColumns: "190px 1fr", gap: 28, alignItems: "center" }}>
        <div style={{ width: 168, height: 168, borderRadius: 999, border: `14px solid ${props.accent}44`, boxShadow: `inset 0 0 0 ${ring}px ${props.accent}16`, display: "grid", placeItems: "center", color: props.accent, fontSize: 24, fontWeight: 900 }}>
          {props.familyPlan.claimMode === "evidence_backed" ? "Proof" : "Demo"}
        </div>
        <div>
          <div style={{ color: props.text, fontSize: 26, fontWeight: 850 }}>{props.familyPlan.visualGoal}</div>
          <div style={{ marginTop: 24, height: 22, width: `${48 + panelPulse * 38}%`, borderRadius: 999, background: `${props.accent}88` }} />
          <div style={{ marginTop: 18, height: 18, width: "62%", borderRadius: 999, background: "rgba(255,255,255,0.13)" }} />
        </div>
      </div>
    );
  }

  if (family === "cta" || family === "logo_outro") {
    const cardIn = progress(props.localFrame, props.duration * 0.28, props.duration * 0.48, EASE_OUT);
    return (
      <div style={{ ...panelBaseStyle(props.accent), display: "grid", placeItems: "center", textAlign: "center" }}>
        <div style={{ width: 112, height: 112, borderRadius: 26, background: props.accent, boxShadow: `0 0 ${34 + panelPulse * 26}px ${props.accent}77`, transform: `scale(${0.84 + cardIn * 0.16})` }} />
        <div style={{ marginTop: 26, color: props.text, fontSize: 30, fontWeight: 900 }}>{props.familyPlan.productUiState}</div>
        <div style={{ marginTop: 16, color: props.muted, fontSize: 20, maxWidth: 520 }}>{props.familyPlan.visualGoal}</div>
      </div>
    );
  }

  const focusX = [8, 54, 8, 54][props.activeStep] ?? 8;
  const focusY = [62, 62, 18, 18][props.activeStep] ?? 62;

  return (
    <div style={panelBaseStyle(props.accent)}>
      <div
        style={{
          position: "absolute",
          left: `${focusX}%`,
          top: `${focusY}%`,
          width: "34%",
          height: "27%",
          borderRadius: 18,
          border: `2px solid ${props.accent}`,
          background: `${props.accent}10`,
          opacity: 0.42 + panelPulse * 0.34,
          transform: "translate(-8%, -12%)",
        }}
      />
      <div style={{ height: 18, width: `${52 + progress(props.localFrame, 42, 82, EASE_OUT) * 34}%`, background: `${props.accent}88`, borderRadius: 999 }} />
      {[0, 1, 2, 3].map((bar) => {
        const fill = progress(props.localFrame, 56 + bar * 10, 102 + bar * 10, EASE_OUT);
        return <div key={bar} style={{ marginTop: 28, height: 24, width: `${30 + fill * (58 - bar * 8)}%`, background: "rgba(255,255,255,0.12)", borderRadius: 999 }} />;
      })}
      <div style={{ marginTop: 34, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {[0, 1].map((card) => {
          const cardIn = progress(props.localFrame, props.duration * (card === 0 ? 0.32 : 0.48), props.duration * (card === 0 ? 0.46 : 0.62), EASE_OUT);
          return <div key={card} style={{ height: 120, borderRadius: 18, background: card === props.activeStep % 2 ? `${props.accent}18` : "rgba(255,255,255,0.055)", border: `1px solid ${card === props.activeStep % 2 ? `${props.accent}33` : "rgba(255,255,255,0.1)"}`, opacity: cardIn, transform: `translateY(${(1 - cardIn) * 18}px)` }} />;
        })}
      </div>
    </div>
  );
}

function normalizeFamilyPlan(plan: GeneratedSceneFamilyPlan | undefined): GeneratedSceneFamilyPlan {
  if (!plan || !isSceneFamily(plan.family)) return FALLBACK_FAMILY_PLAN;
  return {
    ...FALLBACK_FAMILY_PLAN,
    ...plan,
    sourcePaths: Array.isArray(plan.sourcePaths) ? plan.sourcePaths : FALLBACK_FAMILY_PLAN.sourcePaths,
  };
}

function isSceneFamily(value: unknown): value is GeneratedSceneFamilyPlan["family"] {
  return ["hook", "problem", "workflow_demo", "feature_demo", "proof_metric", "comparison", "social_proof", "cta", "logo_outro"].includes(String(value));
}

function familyLabel(family: GeneratedSceneFamilyPlan["family"]): string {
  const labels: Record<GeneratedSceneFamilyPlan["family"], string> = {
    hook: "Hook",
    problem: "Problem",
    workflow_demo: "Workflow",
    feature_demo: "Feature",
    proof_metric: "Proof",
    comparison: "Compare",
    social_proof: "Trust",
    cta: "CTA",
    logo_outro: "Outro",
  };
  return labels[family];
}

function familyFocusValue(plan: GeneratedSceneFamilyPlan): string {
  if (plan.family === "problem") return "Friction";
  if (plan.family === "feature_demo") return "Focus";
  if (plan.family === "proof_metric") return "Proof";
  if (plan.family === "comparison") return "Shift";
  if (plan.family === "cta") return "Next";
  if (plan.family === "logo_outro") return "Recall";
  return "Flow";
}

function panelBaseStyle(accent: string): React.CSSProperties {
  return {
    borderRadius: 22,
    background: "rgba(255,255,255,0.045)",
    border: `1px solid ${accent}44`,
    padding: 24,
    position: "relative",
    overflow: "hidden",
    minHeight: 0,
  };
}
function findElement(elements: GeneratedSceneElement[], role: GeneratedSceneElement["role"]): GeneratedSceneElement | undefined {
  return elements.find((element) => element.role === role);
}

function normalizeItems(items: unknown): string[] {
  const values = Array.isArray(items) ? items : [];
  const clean = values
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 4);
  return clean.length > 0 ? clean.concat(DEFAULT_ITEMS).slice(0, 4) : DEFAULT_ITEMS;
}

function progress(frame: number, start: number, end: number, easing: (value: number) => number): number {
  const safeEnd = Math.max(start + 1, end);
  return interpolate(frame, [start, safeEnd], [0, 1], {
    easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function activeIndex(frame: number, duration: number, itemCount: number): number {
  const index = Math.floor(interpolate(frame, [0, duration], [0, itemCount], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
  return Math.min(Math.max(0, index), Math.max(0, itemCount - 1));
}

function cursorPosition(sceneProgress: number): { x: number; y: number } {
  return {
    x: interpolate(sceneProgress, [0, 0.28, 0.55, 0.78, 1], [76, 42, 72, 48, 84]),
    y: interpolate(sceneProgress, [0, 0.28, 0.55, 0.78, 1], [27, 53, 51, 73, 77]),
  };
}

function revealCaption(text: string, frame: number, duration: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const visible = Math.max(3, Math.ceil(interpolate(frame, [duration * 0.12, duration * 0.88], [3, words.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })));
  return words.slice(0, visible).join(" ");
}

function safeColor(value: string | undefined, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value : fallback;
}