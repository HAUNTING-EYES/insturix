import React from "react";
import { Easing, Img, interpolate, useCurrentFrame } from "remotion";
import type { GeneratedSceneAsset, GeneratedSceneElement, GeneratedSceneFamilyPlan, GeneratedSceneOverlay } from "../../types";

type GeneratedSceneLike = GeneratedSceneOverlay & {
  sceneModel?: GeneratedSceneOverlay["sceneModel"] & Record<string, unknown>;
};

const DEFAULT_ITEMS = ["Plan", "Generate", "Review", "Publish"];
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const EASE_BALANCED = Easing.bezier(0.45, 0, 0.55, 1);
type DirectorChoreography = {
  gridTemplateColumns: string;
  gap: string;
  shellMinHeight: number;
  shellRadius: number;
  gridOpacity: number;
  cameraScale: [number, number];
  cameraX: [number, number];
  cameraY: [number, number];
  shellShadow: string;
};
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
  const sceneAssets = normalizeSceneAssets(model?.assets);
  const familyPlan = normalizeFamilyPlan(model?.familyPlan);
  const caption = model?.captionTracks?.[0]?.text;
  const choreography = resolveDirectorChoreography(familyPlan);
  const headlineText = safeViewerText(headline?.text || model?.title || overlay.content, 92) ?? familyHeadline(familyPlan);
  const panelText = safeViewerText(panel?.text, 150) ?? familyDisplayLine(familyPlan);
  const ctaText = safeViewerText(cta?.text, 76) ?? familyCtaText(familyPlan);
  const logoAsset = sceneAssets.logos[0];
  const productImage = familyPlan.productAssetUse?.productImage !== false ? sceneAssets.productImages[0] : undefined;
  const accent = safeColor(brand.accentColor, "#D4A652");
  const background = safeColor(brand.backgroundColor, "#0B0B0A");
  const surface = safeColor(brand.surfaceColor, "#171A1F");
  const text = safeColor(brand.textColor, "#F7F4EA");
  const muted = safeColor(brand.mutedTextColor, "#B9B2A3");
  const fontFamily = brand.fontFamily || "Plus Jakarta Sans, Inter, sans-serif";
  const items = normalizeItems(shell?.items);
  const activeStep = activeIndex(localFrame, duration, items.length);
  const activeItem = items[activeStep] ?? items[0] ?? DEFAULT_ITEMS[0];
  const sceneProgress = progress(localFrame, 0, duration, EASE_BALANCED);
  const enter = progress(localFrame, 0, Math.min(34, duration * 0.18), EASE_OUT);
  const headlineIn = progress(localFrame, 6, Math.min(42, duration * 0.2), EASE_OUT);
  const shellIn = progress(localFrame, 14, Math.min(54, duration * 0.26), EASE_OUT);
  const proofIn = progress(localFrame, duration * 0.16, duration * 0.34, EASE_OUT);
  const ctaIn = progress(localFrame, duration * 0.62, duration * 0.78, EASE_OUT);
  const exit = progress(localFrame, Math.max(0, duration - 18), duration, Easing.in(Easing.cubic));
  const cameraScale = interpolate(sceneProgress, [0, 1], choreography.cameraScale);
  const cameraX = interpolate(sceneProgress, [0, 1], choreography.cameraX);
  const cameraY = interpolate(sceneProgress, [0, 1], choreography.cameraY);
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
          opacity: choreography.gridOpacity,
          transform: `translate3d(${gridDrift}px, ${gridDrift * 0.36}px, 0) scale(${1 + sceneProgress * 0.018})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: "7% 8%",
          display: "grid",
          gridTemplateColumns: choreography.gridTemplateColumns,
          gap: choreography.gap,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 22}px)`,
        }}
      >
        <section style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: headlineIn }}>
            <BrandMark asset={logoAsset} accent={accent} sceneProgress={sceneProgress} headlineIn={headlineIn} />
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
            {headlineText}
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
            {panelText}
          </p>
        </section>

        <section
          style={{
            alignSelf: "center",
            minHeight: choreography.shellMinHeight,
            borderRadius: choreography.shellRadius,
            background: surface,
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: choreography.shellShadow,
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
            <span
              style={{
                marginLeft: "auto",
                color: text,
                fontSize: 16,
                fontWeight: 800,
                padding: "8px 12px",
                borderRadius: 999,
                background: `${accent}${Math.round(24 + activeStepProgress(localFrame, duration, activeStep, items.length) * 18).toString(16)}`,
                border: `1px solid ${accent}55`,
              }}
            >
              {activeItem}
            </span>
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
            <main style={{ padding: 30, display: "grid", gridTemplateRows: "108px 74px minmax(0, 1fr) 106px", gap: 16, position: "relative" }}>
              <MetricCards metricLabel={metric?.label} metricValue={metric?.value} familyPlan={familyPlan} activeStep={activeStep} accent={accent} text={text} muted={muted} localFrame={localFrame} />
              <WorkflowStageRail items={items} activeStep={activeStep} accent={accent} text={text} muted={muted} localFrame={localFrame} duration={duration} />
              <ProductProofPanel accent={accent} text={text} muted={muted} activeStep={activeStep} localFrame={localFrame} duration={duration} familyPlan={familyPlan} items={items} panelCopy={panelText} productImage={productImage} logoAsset={logoAsset} />
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
                {ctaText}
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

function BrandMark(props: { asset?: GeneratedSceneAsset; accent: string; sceneProgress: number; headlineIn: number }) {
  const size = 42;
  if (props.asset) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          background: "rgba(255,255,255,0.92)",
          boxShadow: `0 0 ${24 + props.sceneProgress * 20}px ${props.accent}44`,
          transform: `scale(${interpolate(props.headlineIn, [0, 1], [0.72, 1])})`,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          padding: 6,
        }}
      >
        <Img src={props.asset.url} alt={props.asset.label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: props.accent,
        boxShadow: `0 0 ${24 + props.sceneProgress * 20}px ${props.accent}55`,
        transform: `scale(${interpolate(props.headlineIn, [0, 1], [0.72, 1])})`,
      }}
    />
  );
}

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
    { label: "Evidence", value: evidenceLabel(props.familyPlan) },
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

function WorkflowStageRail(props: {
  items: string[];
  activeStep: number;
  accent: string;
  text: string;
  muted: string;
  localFrame: number;
  duration: number;
}) {
  const stepPulse = activeStepProgress(props.localFrame, props.duration, props.activeStep, props.items.length);
  const railFill = progress(props.localFrame, props.duration * 0.08, props.duration * 0.92, EASE_BALANCED);

  return (
    <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${props.items.length}, 1fr)`, gap: 12, alignItems: "stretch" }}>
      <div style={{ position: "absolute", left: 16, right: 16, top: 17, height: 3, borderRadius: 999, background: "rgba(255,255,255,0.1)" }} />
      <div style={{ position: "absolute", left: 16, top: 17, width: `calc((100% - 32px) * ${railFill})`, height: 3, borderRadius: 999, background: props.accent, boxShadow: `0 0 18px ${props.accent}66` }} />
      {props.items.map((item, index) => {
        const isActive = index === props.activeStep;
        const isDone = index < props.activeStep;
        const itemIn = progress(props.localFrame, 22 + index * 8, 48 + index * 8, EASE_OUT);
        return (
          <div
            key={`${item}_${index}`}
            style={{
              position: "relative",
              minWidth: 0,
              opacity: itemIn,
              transform: `translateY(${(1 - itemIn) * 8}px) scale(${isActive ? 1 + stepPulse * 0.025 : 1})`,
            }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 12, background: isActive || isDone ? props.accent : "rgba(255,255,255,0.12)", color: isActive || isDone ? "#0B0B0A" : props.muted, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 900, marginBottom: 8, boxShadow: isActive ? `0 0 ${18 + stepPulse * 14}px ${props.accent}88` : "none" }}>
              {index + 1}
            </div>
            <div style={{ color: isActive ? props.text : props.muted, fontSize: 14, fontWeight: isActive ? 850 : 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {item}
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
  items: string[];
  panelCopy: string;
  productImage?: GeneratedSceneAsset;
  logoAsset?: GeneratedSceneAsset;
}) {
  const panelPulse = progress(props.localFrame, props.duration * 0.34, props.duration * 0.48, EASE_BALANCED);
  const family = props.familyPlan.family;
  const displayLine = familyDisplayLine(props.familyPlan);

  if (family === "section_header") {
    const headerIn = progress(props.localFrame, props.duration * 0.18, props.duration * 0.38, EASE_OUT);
    return (
      <div style={{ ...panelBaseStyle(props.accent), display: "grid", gridTemplateColumns: "1fr 120px", gap: 28, alignItems: "center" }}>
        <div>
          <div style={{ color: props.accent, fontSize: 16, fontWeight: 900, letterSpacing: 0 }}>NEXT PROOF</div>
          <div style={{ marginTop: 18, color: props.text, fontSize: 38, lineHeight: 1.02, fontWeight: 950, transform: `translateY(${(1 - headerIn) * 16}px)`, opacity: headerIn }}>
            {props.familyPlan.productUiState}
          </div>
          <div style={{ marginTop: 18, color: props.muted, fontSize: 20, lineHeight: 1.28 }}>{displayLine}</div>
        </div>
        <div style={{ width: 108, height: 108, borderRadius: 28, background: `${props.accent}18`, border: `1px solid ${props.accent}55`, display: "grid", placeItems: "center", color: props.accent, fontSize: 34, fontWeight: 950, boxShadow: `0 0 ${28 + panelPulse * 20}px ${props.accent}44` }}>
          {props.activeStep + 1}
        </div>
      </div>
    );
  }

  if (family === "promise") {
    return (
      <div style={{ ...panelBaseStyle(props.accent), display: "grid", gridTemplateRows: "auto 1fr", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div style={{ color: props.accent, fontSize: 16, fontWeight: 900 }}>PRODUCT PROMISE</div>
          <div style={{ color: props.muted, fontSize: 15, fontWeight: 800 }}>{evidenceLabel(props.familyPlan)}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "stretch" }}>
          {["Current state", "Product promise"].map((label, index) => {
            const cardIn = progress(props.localFrame, 36 + index * 12, 78 + index * 12, EASE_OUT);
            return (
              <div key={label} style={{ borderRadius: 18, background: index === 1 ? `${props.accent}18` : "rgba(255,255,255,0.055)", border: `1px solid ${index === 1 ? `${props.accent}55` : "rgba(255,255,255,0.1)"}`, padding: 22, opacity: cardIn, transform: `translateY(${(1 - cardIn) * 18}px)` }}>
                <div style={{ color: index === 1 ? props.accent : props.muted, fontSize: 18, fontWeight: 850 }}>{label}</div>
                <div style={{ marginTop: 24, color: index === 1 ? props.text : props.muted, fontSize: index === 1 ? 27 : 21, lineHeight: 1.12, fontWeight: 900 }}>{index === 1 ? displayLine : props.familyPlan.productUiState}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (family === "ui_proof") {
    const proofLabels = props.familyPlan.productAssetUse?.productImage
      ? ["Verified screen", "Readable state", "Action path"]
      : ["Product state", "UI flow", "Action path"];
    return (
      <div style={{ ...panelBaseStyle(props.accent), display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 22 }}>
        <div style={{ borderRadius: 18, background: "rgba(255,255,255,0.06)", border: `1px solid ${props.accent}4d`, padding: 22, position: "relative", overflow: "hidden" }}>
          <div style={{ color: props.accent, fontSize: 15, fontWeight: 900 }}>VERIFIED UI EVIDENCE</div>
          {props.productImage ? (
            <div style={{ marginTop: 18, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(0,0,0,0.24)", height: 178 }}>
              <Img src={props.productImage.url} alt={props.productImage.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ) : null}
          <div style={{ marginTop: 18, color: props.text, fontSize: 25, lineHeight: 1.12, fontWeight: 900 }}>{props.panelCopy || displayLine}</div>
          {props.productImage ? (
            <div style={{ marginTop: 12, color: props.muted, fontSize: 14, fontWeight: 750 }}>{props.productImage.label}</div>
          ) : [0, 1, 2, 3].map((bar) => {
            const barIn = progress(props.localFrame, 34 + bar * 8, 72 + bar * 8, EASE_OUT);
            return <div key={bar} style={{ marginTop: 20, width: `${82 - bar * 10 + panelPulse * 8}%`, height: bar === props.activeStep % 4 ? 18 : 13, borderRadius: 999, background: bar === props.activeStep % 4 ? props.accent : "rgba(255,255,255,0.15)", opacity: barIn }} />;
          })}
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {proofLabels.map((label, index) => {
            const cardIn = progress(props.localFrame, 42 + index * 10, 78 + index * 10, EASE_OUT);
            const active = index === Math.min(2, props.activeStep);
            return (
              <div key={label} style={{ borderRadius: 16, padding: 18, background: active ? `${props.accent}1f` : "rgba(255,255,255,0.055)", border: `1px solid ${active ? `${props.accent}66` : "rgba(255,255,255,0.1)"}`, color: active ? props.text : props.muted, fontSize: 18, fontWeight: 850, opacity: cardIn, transform: `translateX(${(1 - cardIn) * 18}px)` }}>
                {label}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (family === "objection_handling") {
    const rows = ["Concern", "Evidence", "Answer"];
    return (
      <div style={{ ...panelBaseStyle(props.accent), padding: 28 }}>
        {rows.map((label, index) => {
          const rowIn = progress(props.localFrame, 32 + index * 12, 68 + index * 12, EASE_OUT);
          const active = index === Math.min(2, props.activeStep);
          return (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 20, alignItems: "center", minHeight: 82, marginBottom: 14, padding: "16px 18px", borderRadius: 18, background: active ? `${props.accent}18` : "rgba(255,255,255,0.05)", border: `1px solid ${active ? `${props.accent}55` : "rgba(255,255,255,0.1)"}`, opacity: rowIn, transform: `translateY(${(1 - rowIn) * 16}px)` }}>
              <div style={{ color: active ? props.accent : props.muted, fontSize: 17, fontWeight: 900 }}>{label}</div>
              <div style={{ color: active ? props.text : props.muted, fontSize: active ? 24 : 19, fontWeight: active ? 900 : 750, lineHeight: 1.16 }}>{index === 2 ? displayLine : props.familyPlan.productUiState}</div>
            </div>
          );
        })}
      </div>
    );
  }

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
          <div style={{ color: props.text, fontSize: 26, fontWeight: 850 }}>{displayLine}</div>
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
        {props.logoAsset ? (
          <div style={{ width: 112, height: 112, borderRadius: 26, background: "rgba(255,255,255,0.94)", boxShadow: `0 0 ${34 + panelPulse * 26}px ${props.accent}55`, transform: `scale(${0.84 + cardIn * 0.16})`, padding: 18, display: "grid", placeItems: "center", overflow: "hidden" }}>
            <Img src={props.logoAsset.url} alt={props.logoAsset.label} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{ width: 112, height: 112, borderRadius: 26, background: props.accent, boxShadow: `0 0 ${34 + panelPulse * 26}px ${props.accent}77`, transform: `scale(${0.84 + cardIn * 0.16})` }} />
        )}
        <div style={{ marginTop: 26, color: props.text, fontSize: 30, fontWeight: 900 }}>{props.familyPlan.productUiState}</div>
        <div style={{ marginTop: 16, color: props.muted, fontSize: 20, maxWidth: 520 }}>{displayLine}</div>
      </div>
    );
  }

  const stageItems = props.items.length > 0 ? props.items : DEFAULT_ITEMS;
  const stepPulse = activeStepProgress(props.localFrame, props.duration, props.activeStep, stageItems.length);
  const connector = progress(props.localFrame, props.duration * 0.12, props.duration * 0.86, EASE_BALANCED);

  return (
    <div style={{ ...panelBaseStyle(props.accent), padding: 26 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
        <div>
          <div style={{ color: props.muted, fontSize: 15, fontWeight: 750 }}>Live product flow</div>
          <div style={{ marginTop: 8, color: props.text, fontSize: 24, fontWeight: 900, lineHeight: 1.05 }}>{props.familyPlan.productUiState}</div>
        </div>
        <div style={{ color: props.accent, fontSize: 18, fontWeight: 900 }}>{props.activeStep + 1}/{stageItems.length}</div>
      </div>
      <div style={{ position: "relative", height: 34, marginTop: 24 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 16, height: 4, borderRadius: 999, background: "rgba(255,255,255,0.1)" }} />
        <div style={{ position: "absolute", left: 0, top: 16, width: `${connector * 100}%`, height: 4, borderRadius: 999, background: props.accent, boxShadow: `0 0 18px ${props.accent}88` }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {stageItems.map((item, index) => {
          const isActive = index === props.activeStep;
          const isDone = index < props.activeStep;
          const cardIn = progress(props.localFrame, 38 + index * 10, 72 + index * 10, EASE_OUT);
          const barFill = isDone ? 1 : isActive ? stepPulse : 0.16;
          return (
            <div
              key={`${item}_${index}`}
              style={{
                minHeight: 130,
                borderRadius: 18,
                background: isActive ? `${props.accent}1f` : isDone ? `${props.accent}12` : "rgba(255,255,255,0.055)",
                border: `1px solid ${isActive ? `${props.accent}66` : isDone ? `${props.accent}33` : "rgba(255,255,255,0.1)"}`,
                padding: 18,
                opacity: cardIn,
                transform: `translateY(${(1 - cardIn) * 18}px) scale(${isActive ? 1 + stepPulse * 0.025 : 1})`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 11, background: isActive || isDone ? props.accent : "rgba(255,255,255,0.12)", color: isActive || isDone ? "#0B0B0A" : props.muted, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 900 }}>{index + 1}</div>
                <div style={{ color: isActive ? props.accent : props.muted, fontSize: 13, fontWeight: 850 }}>{isDone ? "Done" : isActive ? "Active" : "Queued"}</div>
              </div>
              <div style={{ marginTop: 18, color: isActive ? props.text : props.muted, fontSize: 20, fontWeight: 850, lineHeight: 1.1, minHeight: 44, overflow: "hidden" }}>{item}</div>
              <div style={{ marginTop: 16, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.11)", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(0.16, barFill) * 100}%`, height: "100%", borderRadius: 999, background: isActive || isDone ? props.accent : "rgba(255,255,255,0.2)" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function normalizeSceneAssets(assets: GeneratedSceneOverlay["sceneModel"]["assets"] | undefined): {
  logos: GeneratedSceneAsset[];
  productImages: GeneratedSceneAsset[];
} {
  return {
    logos: normalizeAssetList(assets?.logos),
    productImages: normalizeAssetList(assets?.productImages),
  };
}

function normalizeAssetList(value: unknown): GeneratedSceneAsset[] {
  if (!Array.isArray(value)) return [];
  return value.filter((asset): asset is GeneratedSceneAsset => {
    if (!asset || typeof asset !== "object") return false;
    const candidate = asset as Partial<GeneratedSceneAsset>;
    return typeof candidate.url === "string" && candidate.url.length > 0 && typeof candidate.label === "string";
  });
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
  return ["hook", "problem", "promise", "workflow_demo", "feature_demo", "ui_proof", "proof_metric", "comparison", "social_proof", "objection_handling", "cta", "logo_outro", "section_header"].includes(String(value));
}

function familyLabel(family: GeneratedSceneFamilyPlan["family"]): string {
  const labels: Record<GeneratedSceneFamilyPlan["family"], string> = {
    hook: "Hook",
    problem: "Problem",
    promise: "Promise",
    workflow_demo: "Workflow",
    feature_demo: "Feature",
    ui_proof: "UI proof",
    proof_metric: "Proof",
    comparison: "Compare",
    social_proof: "Trust",
    objection_handling: "Objection",
    cta: "CTA",
    logo_outro: "Outro",
    section_header: "Section",
  };
  return labels[family];
}

function familyFocusValue(plan: GeneratedSceneFamilyPlan): string {
  if (plan.family === "problem") return "Friction";
  if (plan.family === "promise") return "Promise";
  if (plan.family === "feature_demo") return "Focus";
  if (plan.family === "ui_proof") return "Verified";
  if (plan.family === "proof_metric") return "Proof";
  if (plan.family === "comparison") return "Shift";
  if (plan.family === "objection_handling") return "Answer";
  if (plan.family === "section_header") return "Next";
  if (plan.family === "cta") return "Next";
  if (plan.family === "logo_outro") return "Recall";
  return "Flow";
}

function resolveDirectorChoreography(plan: GeneratedSceneFamilyPlan): DirectorChoreography {
  const base: DirectorChoreography = {
    gridTemplateColumns: "0.84fr 1.42fr",
    gap: "5%",
    shellMinHeight: 620,
    shellRadius: 28,
    gridOpacity: 0.24,
    cameraScale: [1.01, 1.075],
    cameraX: [26, -34],
    cameraY: [8, -12],
    shellShadow: "0 28px 80px rgba(0,0,0,0.38)",
  };

  if (plan.visualArchetype === "UI_FULL_BLEED" || plan.visualArchetype === "UI_CROP_ZOOM" || plan.family === "ui_proof") {
    return {
      ...base,
      gridTemplateColumns: "0.56fr 1.62fr",
      gap: "4%",
      shellMinHeight: 650,
      shellRadius: plan.visualArchetype === "UI_CROP_ZOOM" ? 20 : 24,
      gridOpacity: 0.18,
      cameraScale: plan.visualArchetype === "UI_CROP_ZOOM" ? [1.08, 1.16] : [1.035, 1.105],
      cameraX: [8, -42],
      cameraY: [0, -10],
      shellShadow: "0 34px 96px rgba(0,0,0,0.44)",
    };
  }

  if (plan.visualArchetype === "SPLIT_COMPARE" || plan.family === "comparison") {
    return {
      ...base,
      cameraScale: [1, 1.045],
      cameraX: [18, -18],
      cameraY: [4, -4],
      gridOpacity: 0.2,
    };
  }

  if (plan.visualArchetype === "TYPE_ONLY" || plan.family === "section_header" || plan.family === "promise") {
    return {
      ...base,
      gridTemplateColumns: "1fr 1.04fr",
      gap: "4.5%",
      shellMinHeight: 560,
      shellRadius: 26,
      gridOpacity: 0.3,
      cameraScale: [1, 1.035],
      cameraX: [12, -12],
      cameraY: [0, -6],
    };
  }

  if (plan.visualArchetype === "DIAGRAM_SCHEMATIC" || plan.family === "objection_handling") {
    return {
      ...base,
      cameraScale: [1, 1.05],
      cameraX: [18, -22],
      cameraY: [4, -6],
      gridOpacity: 0.28,
    };
  }

  return base;
}

function safeViewerText(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 2) return undefined;
  if (isPromptLikeViewerText(clean)) return undefined;
  return clean.length > maxLength ? `${clean.slice(0, Math.max(0, maxLength - 3)).trim()}...` : clean;
}

function isPromptLikeViewerText(text: string): boolean {
  return /\b(prompt|scene|shot|overlay|render|animation|camera|visual description|reference video|voiceover|script|caption|concept|director|evidence duty)\b/i.test(text)
    || /^(create|generate|write|design|show|use|ensure|include|make)\b/i.test(text);
}

function familyHeadline(plan: GeneratedSceneFamilyPlan): string {
  const headlines: Record<GeneratedSceneFamilyPlan["family"], string> = {
    hook: "Product momentum, visible fast",
    problem: "The old workflow breaks here",
    promise: "One clear product promise",
    workflow_demo: "Watch the workflow move",
    feature_demo: "One capability in focus",
    ui_proof: "The product proof is on screen",
    proof_metric: "Proof, held long enough to read",
    comparison: "Before and after, side by side",
    social_proof: "Trust signals, made readable",
    objection_handling: "The concern gets answered",
    cta: "Ready for the next move",
    logo_outro: "Brand recall, clean close",
    section_header: "Next capability",
  };
  return headlines[plan.family];
}

function familyDisplayLine(plan: GeneratedSceneFamilyPlan): string {
  const lines: Record<GeneratedSceneFamilyPlan["family"], string> = {
    hook: "A branded product moment opens the story without hiding the interface.",
    problem: "Scattered work turns into one visible before-state.",
    promise: "The promise stays simple, sourced, and easy to remember.",
    workflow_demo: "The viewer can follow the product state from step to step.",
    feature_demo: "One capability gets the full attention of the frame.",
    ui_proof: "Verified UI evidence stays large enough to inspect.",
    proof_metric: "The result is framed as proof, not decoration.",
    comparison: "The contrast is readable before the scene moves on.",
    social_proof: "Trust evidence is treated as product context, not filler.",
    objection_handling: "A real concern is answered with a grounded product state.",
    cta: "The action resolves into a clear product next step.",
    logo_outro: "The close lands on brand memory without extra noise.",
    section_header: "The next beat has to prove the header immediately.",
  };
  return lines[plan.family];
}

function familyCtaText(plan: GeneratedSceneFamilyPlan): string {
  if (plan.family === "cta" || plan.family === "logo_outro") return "Move from proof to next step";
  if (plan.family === "ui_proof") return "Keep the product proof visible";
  if (plan.family === "objection_handling") return "Resolve the concern in-product";
  return "Turn the workflow into a launch-ready story";
}

function evidenceLabel(plan: GeneratedSceneFamilyPlan): string {
  if (plan.evidenceStatus === "disabled") return "Disabled";
  if (plan.evidenceStatus === "degraded") return "Degraded";
  if (plan.evidenceStatus === "substituted") return "Substituted";
  if (plan.claimMode === "claim_locked") return "Locked";
  if (plan.claimMode === "evidence_backed") return "Sourced";
  return "Demo";
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

function activeStepProgress(frame: number, duration: number, activeStep: number, itemCount: number): number {
  const count = Math.max(1, itemCount);
  const stepDuration = duration / count;
  const start = activeStep * stepDuration;
  return progress(frame, start, start + stepDuration * 0.68, EASE_OUT);
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
