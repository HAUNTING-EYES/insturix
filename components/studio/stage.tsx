"use client";

/**
 * Stage views — Phase 1 static embeds (high-fidelity stand-ins; real engine
 * embeds land Phase 3+). The stage is AGENT-DRIVEN: the host renders whatever
 * artifact is focused. No tabs, no user navigation — talking moves it.
 */

import type { StudioArtifact, StudioStageFocus } from "@/lib/studio/contracts/objects";

const CAP_COLOR: Record<string, string> = {
  script: "var(--c-write)",
  reel: "var(--c-edit)",
  thumbnail: "var(--c-design)",
  image_canvas: "var(--c-design)",
  schedule: "var(--c-distribute)",
  analysis: "var(--c-analyze)",
};

function ReelView({ artifact }: { artifact: StudioArtifact }) {
  return (
    <>
      <div className="stu-chips">
        <span className="stu-chip">0:30 · 9:16</span>
        <span className="stu-chip">on @brand voice</span>
        {artifact.sourceRef.manualHref && (
          <a className="stu-chip" href={artifact.sourceRef.manualHref} style={{ textDecoration: "none" }}>
            open full editor ↗
          </a>
        )}
      </div>
      <div className="stu-mon">
        <div className="stu-frame">
          <span className="ftag">summer drop · 01 hook</span>
          <span className="disc" />
          <span className="band" />
          <span className="shoe"><i /><i /></span>
          <div className="cap">THE SUMMER<br />DROP. <span className="g">GO.</span></div>
        </div>
        <span className="stu-ovl eye">◉ preview</span>
        <span className="stu-ovl tc">f-0006 · 00:02</span>
        <div className="stu-vstack">
          <span className="new"><b>01</b>hook · new</span>
          <span><b>02</b>caption-grp</span>
        </div>
      </div>
      <div className="stu-transport">
        <span className="stu-chip" style={{ padding: "6px 12px" }}>▶</span>
        <span className="stu-tcode">00:02 / 00:30</span>
      </div>
      <div className="stu-tl">
        <div className="stu-ruler"><span>00:00</span><span>00:10</span><span>00:20</span><span>00:30</span></div>
        <div className="stu-tracks">
          <span className="stu-phline" />
          <div className="stu-track">
            <span className="tn">V1</span>
            <div className="stu-lane">
              <span className="stu-clip fl" style={{ left: "1%", width: "15%" }} />
              <span className="stu-clip" style={{ left: "17.5%", width: "15%" }} />
              <span className="stu-clip" style={{ left: "33.5%", width: "15%" }} />
              <span className="stu-clip" style={{ left: "49.5%", width: "14%" }} />
              <span className="stu-island" style={{ left: "64.5%", width: "21%" }}>scene</span>
              <span className="stu-clip" style={{ left: "86.5%", width: "12.5%" }} />
            </div>
          </div>
          <div className="stu-track">
            <span className="tn">CC</span>
            <div className="stu-lane">
              <span className="stu-grp" style={{ left: "17.5%", right: "35%" }}>
                <i style={{ width: 9 }} /><i style={{ width: 7 }} /><i style={{ width: 11 }} /><i style={{ width: 8 }} />
                <i style={{ width: 10 }} /><i style={{ width: 9 }} /><i style={{ width: 8 }} />
                <span className="gl">· 18</span>
              </span>
            </div>
          </div>
          <div className="stu-track">
            <span className="tn">AUD</span>
            <div className="stu-lane">
              <span className="stu-grp" style={{ inset: "3px 4px", gap: 2 }}>
                {[22, 38, 55, 34, 70, 46, 88, 58, 40, 64, 30, 52, 78, 60, 44, 66, 36, 50, 24, 42, 58, 34, 48, 28].map((h, i) => (
                  <i key={i} style={{ height: `${h}%`, flex: 1, background: "#2a2620", borderRadius: 1, minWidth: 1 }} />
                ))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ScriptView({ artifact }: { artifact: StudioArtifact }) {
  /* real path: contentMarkdown from the engine; fallback to the fixture email */
  if (artifact.contentMarkdown) {
    const paragraphs = artifact.contentMarkdown.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    const words = artifact.contentMarkdown.trim().split(/\s+/).length;
    return (
      <>
        <div className="stu-chips">
          <span className="stu-chip">{words} words</span>
          <span className="stu-chip">on brand</span>
        </div>
        <div className="stu-doc">
          <div className="subj">{artifact.title}</div>
          <div className="body">
            {paragraphs.slice(0, 24).map((p, i) => (
              <p key={i}>{p.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "")}</p>
            ))}
          </div>
          <div className="cite">
            <span className="tick">✓</span>
            <span>thinkforge · {artifact.sourceRef.externalId.split(":")[1]}</span>
          </div>
        </div>
        <div className="stu-chint" style={{ marginTop: 14 }}>
          keep talking to reshape it — the draft follows the conversation
        </div>
      </>
    );
  }
  return (
    <>
      <div className="stu-chips">
        <span className="stu-chip">email · 124 words</span>
        <span className="stu-chip">on @brand voice</span>
      </div>
      <div className="stu-doc">
        <div className="dmeta">
          <span>to <b style={{ color: "var(--muted)", fontWeight: 500 }}>waitlist · 12,480</b></span>
          <span>from <b style={{ color: "var(--muted)", fontWeight: 500 }}>drops@</b></span>
        </div>
        <div className="subj">Summer drop. You&apos;re first.</div>
        <div className="body">
          <p>You waited. We counted every day. <b>Friday 09:00, the summer drop goes live</b> — and for the first hour, it&apos;s yours before anyone else.</p>
          <p>Two colorways. Limited run. No restock.</p>
        </div>
        <div className="cta"><span>Shop the drop</span></div>
        <div className="cite"><span className="tick">✓</span><span>¹ drop date 09-04 · internal calendar · verified</span></div>
      </div>
      <div className="stu-tl" style={{ marginTop: 16 }}>
        <div className="stu-mlabel" style={{ marginBottom: 12 }}>Subject lines · A/B/C</div>
        <div className="stu-opts">
          {["Summer drop. You're first.", "48 hours early. That's the whole email.", "The wait ends Friday."].map((s, i) => (
            <div className="stu-opt" key={s} style={{ cursor: "default" }}>
              <span className="rd" style={i === 0 ? { borderColor: "var(--gold)" } : undefined} />
              <div className="ot">{s}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function CanvasView({ artifact }: { artifact: StudioArtifact }) {
  const done = artifact.status === "done" ? 6 : 3;
  return (
    <>
      <div className="stu-chips">
        <span className="stu-chip">6 variations · 9:16</span>
        <span className="stu-chip">{artifact.status === "done" ? "complete" : `generating · ${done}/6`}</span>
        {artifact.sourceRef.manualHref && (
          <a className="stu-chip" href={artifact.sourceRef.manualHref} style={{ textDecoration: "none" }}>open canvas ↗</a>
        )}
      </div>
      <div className="stu-vargrid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`stu-var ${i === 0 ? "sel" : ""}`} style={i >= done ? { opacity: 0.35 } : undefined}>
            <div className="vh">
              <span className="disc" style={{ position: "absolute", right: "14%", top: "16%", width: "26%", aspectRatio: "1", borderRadius: 99, background: "#2a241a", display: "block" }} />
              <i style={{ left: "12%", bottom: "22%", width: "64%", height: "18%" }} />
            </div>
            <span className="vn">{i === 0 ? "selected" : `v${i + 1}`}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ScheduleView() {
  const days = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"];
  const posts: Record<string, { label: string; ig?: boolean }[]> = {
    Tue: [{ label: "ig 09:00 reel", ig: true }, { label: "yt 12:00 reel" }],
    Thu: [{ label: "ig 17:00 teaser", ig: true }],
    Fri: [{ label: "x 11:00 last call" }],
  };
  return (
    <>
      <div className="stu-chips">
        <span className="stu-chip">week of sep 1 · 4 posts</span>
        <span className="stu-chip">confirm before publish</span>
      </div>
      <div className="stu-calgrid">
        {days.map((d) => (
          <div className="stu-calday" key={d}>
            <div className="d">{d}</div>
            {(posts[d] ?? []).map((p) => (
              <div key={p.label} className={`stu-calpost ${p.ig ? "ig" : ""}`}>{p.label}</div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function AnalyzeView() {
  return (
    <>
      <div className="stu-chips">
        <span className="stu-chip">competitor reel · url ingest</span>
        <span className="stu-chip">intent: reference</span>
      </div>
      <div className="stu-doc" style={{ maxWidth: 680 }}>
        <div className="stu-score">
          <span className="n" style={{ color: "var(--green)" }}>87</span>
          <span className="stu-mlabel">overall · intent-aware</span>
        </div>
        {[
          ["hook", "Cold open on the product — 0.8s to first frame. Steal this."],
          ["pacing", "Cuts land on beat from 00:04. Slightly long mid-section."],
          ["cta", "Implicit only. A spoken CTA in the last 3s would convert."],
        ].map(([k, v]) => (
          <div className="stu-srow2" key={k}>
            <span className="sk">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function FallbackView({ artifact }: { artifact: StudioArtifact }) {
  return (
    <div className="stu-doc" style={{ textAlign: "center" }}>
      <div className="stu-mlabel" style={{ marginBottom: 8 }}>{artifact.kind}</div>
      <div className="stu-hq" style={{ marginBottom: 0 }}>
        <b>{artifact.title}</b> — {artifact.status}
        {artifact.progress ? ` · ${artifact.progress.stage}` : ""}
      </div>
      <div className="stu-hint" style={{ marginTop: 10 }}>
        this stage view lands in its build phase
      </div>
    </div>
  );
}

export function StageHost({
  focus,
  artifacts,
}: {
  focus: StudioStageFocus | null;
  artifacts: StudioArtifact[];
}) {
  const focused = focus ? artifacts.find((a) => a.id === focus.artifactId) : undefined;

  return (
    <div className="stu-stage-wrap">
      <div className="stu-shead">
        <div>
          <div className="stu-mlabel" style={{ marginBottom: 6 }}>Now showing</div>
          <div className="cur">
            <span className="cdot" style={{ background: CAP_COLOR[focused?.kind ?? ""] ?? "var(--muted)" }} />
            {focused?.title ?? "—"}
          </div>
          <div className="why">{focus?.why ?? "waiting for the agent"}</div>
        </div>
        <div className="stu-follow">follows your conversation</div>
      </div>
      <div className="stu-pips">
        <span className="lbl">This deliverable</span>
        {artifacts.map((a) => (
          <span key={a.id} className={`stu-pip ${focused?.id === a.id ? "active" : ""}`}>
            <span className={`pd ${a.status === "running" ? "run" : ""}`} style={{ background: statusDot(a.status) }} />
            <span className="pn">{a.title}{focused?.id === a.id ? " · live" : statusSuffix(a.status)}</span>
          </span>
        ))}
      </div>
      <div className="stu-stage">
        <div className="stu-stageinner">
          {!focused && <div className="stu-hint">the agent will bring work here</div>}
          {focused?.kind === "reel" && <ReelView artifact={focused} />}
          {focused?.kind === "script" && <ScriptView artifact={focused} />}
          {(focused?.kind === "thumbnail" || focused?.kind === "image_canvas" || focused?.kind === "carousel") && <CanvasView artifact={focused} />}
          {focused?.kind === "schedule" && <ScheduleView />}
          {focused?.kind === "analysis" && <AnalyzeView />}
          {focused && !["reel", "script", "thumbnail", "image_canvas", "carousel", "schedule", "analysis"].includes(focused.kind) && (
            <FallbackView artifact={focused} />
          )}
        </div>
      </div>
    </div>
  );
}

function statusDot(status: string) {
  switch (status) {
    case "done": return "var(--green)";
    case "running": return "var(--gold)";
    case "queued": return "var(--faint)";
    case "error": return "var(--red)";
    case "stale": return "var(--muted)";
    default: return "var(--soft)";
  }
}
function statusSuffix(status: string) {
  switch (status) {
    case "running": return " · generating";
    case "queued": return " · queued";
    case "error": return " · error";
    case "stale": return " · stale";
    default: return "";
  }
}
