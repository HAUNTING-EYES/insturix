"use client";

/**
 * Stage views — Phase 1 static embeds (high-fidelity stand-ins; real engine
 * embeds land Phase 3+). The stage is AGENT-DRIVEN: the host renders whatever
 * artifact is focused. No tabs, no user navigation — talking moves it.
 */

import type { StudioArtifact, StudioStageFocus } from "@/lib/studio/contracts/objects";
import { studioRealTurnsEnabled } from "@/lib/studio/client/turnClient";
import { weekGrid } from "@/lib/studio/client/place-helpers";
import { useEffect, useRef, useState } from "react";
import { ReelEmbed } from "./reel-embed";
import { AUTO_EDIT_STAGES } from "@/components/editron/project/auto-edit/auto-edit-stages";
import { StageIframe } from "./stage-iframe";

const CAP_COLOR: Record<string, string> = {
  script: "var(--c-write)",
  reel: "var(--c-edit)",
  thumbnail: "var(--c-design)",
  image_canvas: "var(--c-design)",
  schedule: "var(--c-distribute)",
  analysis: "var(--c-analyze)",
};

/* A3: the 8-stage pipeline rail for a running auto-edit (canonical stages
 * from the engine's own auto-edit-stages.ts — current lit by telemetry text) */
function AutoEditProgressView({ artifact }: { artifact: StudioArtifact }) {
  const text = (artifact.progress?.stage ?? "").toLowerCase();
  let current = 0;
  if (/analyz/.test(text)) current = 0;
  else if (/cut/.test(text)) current = 1;
  else if (/punch|beat/.test(text)) current = 2;
  else if (/caption/.test(text)) current = 3;
  else if (/music|scor/.test(text)) current = 4;
  else if (/transition|dissolv/.test(text)) current = 5;
  else if (/graphic/.test(text)) current = 6;
  else if (/finish|render/.test(text)) current = 7;
  const needsInput = /needs more footage|needs_input/.test(text);
  return (
    <>
      <div className="stu-chips">
        <span className="stu-chip">auto-edit · live</span>
        {artifact.sourceRef.manualHref && (
          <a className="stu-chip" href={artifact.sourceRef.manualHref} style={{ textDecoration: "none" }}>open pipeline ↗</a>
        )}
      </div>
      <div className="stu-doc" style={{ textAlign: "left" }}>
        <div className="stu-mlabel" style={{ marginBottom: 16 }}>the cut is being made</div>
        <div className="stu-steps">
          {AUTO_EDIT_STAGES.map((st, i) => (
            <div key={st.id} className={`stu-step ${i < current ? "done" : i === current ? "" : "pending"}`}>
              <span className={`sdot ${i === current ? "run" : ""}`} style={{ background: "var(--c-edit)" }} />
              <span className="lab">{st.verb}</span>
              {i === current && <span className="tool">now</span>}
            </div>
          ))}
        </div>
        {needsInput && (
          <div className="stu-hcard" style={{ marginTop: 16, marginBottom: 0 }}>
            <span className="stu-htag"><i style={{ background: "var(--gold)" }} />needs input</span>
            <div className="stu-hq" style={{ marginBottom: 10 }}>
              The script has beats this footage doesn&apos;t cover. Feed it more clips — or loosen the script — and the cut continues.
            </div>
            <div className="stu-btnrow" style={{ marginTop: 0 }}>
              <a className="stu-btn stu-btn-primary" href={artifact.sourceRef.manualHref ?? "/studio"} style={{ textDecoration: "none" }}>Feed it footage</a>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ReelView({ artifact }: { artifact: StudioArtifact }) {
  /* running auto-edit → the pipeline rail; done → the editor */
  if (studioRealTurnsEnabled && artifact.sourceRef.engine === "editron" && artifact.status === "running") {
    return <AutoEditProgressView artifact={artifact} />;
  }
  /* real mode + real editron artifact → the actual editor, embedded */
  if (studioRealTurnsEnabled && artifact.sourceRef.engine === "editron") {
    return (
      <>
        <div className="stu-chips">
          <span className="stu-chip">live editor</span>
          {artifact.sourceRef.manualHref && (
            <a className="stu-chip" href={artifact.sourceRef.manualHref} style={{ textDecoration: "none" }}>
              open full editor ↗
            </a>
          )}
        </div>
        <ReelEmbed projectId={artifact.sourceRef.externalId} />
      </>
    );
  }
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

function ScriptView({ artifact, onAskAbout, brandName }: { artifact: StudioArtifact; onAskAbout?: (text: string) => void; brandName?: string | null }) {
  /* §10 Write stage: the document is editable inline; selected text becomes
   * an ask; versions + brand context + sources are visible; hand-off actions
   * prefill the composer. The draft still follows the conversation. */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"brand" | "sources" | null>(null);

  const onMouseUp = () => {
    const text = window.getSelection()?.toString().trim() ?? "";
    setSel(text.length >= 3 ? text.slice(0, 140) : null);
  };
  const ask = (prefix: string) => {
    if (onAskAbout) onAskAbout(prefix);
    setSel(null);
  };

  const versions = artifact.revisions.length > 0
    ? artifact.revisions.map((r, i) => ({ label: `v${i + 1}`, at: r.createdAt, note: r.summary ?? null }))
    : [{ label: "v1", at: artifact.updatedAt, note: null }, { label: "v2 · current", at: artifact.updatedAt, note: "latest" }];

  const handoffs = [
    { label: "Design this", prompt: `design visuals for "${artifact.title}"` },
    { label: "Analyze this", prompt: `analyze "${artifact.title}" against our brand` },
    { label: "Add to Calendar", prompt: `schedule "${artifact.title}" — propose slots first` },
  ];

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
          {/* §10 inline editing: local draft state — chat confirmations version it */}
          <div
            className="body"
            contentEditable
            suppressContentEditableWarning
            onMouseUp={onMouseUp}
            aria-label="Draft body — editable; select text to ask about it"
          >
            {paragraphs.slice(0, 24).map((p, i) => (
              <p key={i}>{p.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "")}</p>
            ))}
          </div>
          <div className="cite">
            <span className="tick">✓</span>
            <span>thinkforge · {artifact.sourceRef.externalId.split(":")[1]}</span>
          </div>
        </div>
        <WriteStageChrome
          sel={sel}
          onMouseUp={onMouseUp}
          ask={ask}
          versions={versions}
          drawer={drawer}
          setDrawer={setDrawer}
          brandName={brandName}
          handoffs={handoffs}
          artifact={artifact}
        />
        <div className="stu-chint" style={{ marginTop: 14 }}>
          editable here or in chat — the draft follows the conversation
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
      <WriteStageChrome
        sel={sel}
        onMouseUp={onMouseUp}
        ask={ask}
        versions={versions}
        drawer={drawer}
        setDrawer={setDrawer}
        brandName={brandName}
        handoffs={handoffs}
        artifact={artifact}
      />
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

/* §11 candidate flow: REAL variations from the engine session, a PERSISTED
 * selection ("use this" → spine event, survives reload), regenerate via the
 * composer, and the lab iframe as the advanced workbench — an explicit
 * choice, never the default surface. */
function CandidateGallery({ artifact, projectId, onAskAbout }: { artifact: StudioArtifact; projectId?: string | null; onAskAbout?: (text: string) => void }) {
  const sessionId = artifact.sourceRef.externalId;
  type Var = { id: string; status?: string; imageRef?: string; thumbnailRef?: string };
  const [variations, setVariations] = useState<Var[]>([]);
  const [selected, setSelected] = useState<string | null>(artifact.selectedCandidateId ?? null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/services/clickatron/session/${sessionId}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { session?: { details?: { canvas?: { variations?: Var[] } } }; details?: { canvas?: { variations?: Var[] } } };
        const s = data.session ?? data;
        if (!cancelled) setVariations(s.details?.canvas?.variations ?? []);
      } catch {
        /* keep the last known candidates */
      }
    };
    void load();
    if (artifact.status !== "running") return () => { cancelled = true; };
    const timer = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [sessionId, artifact.status]);

  const useThis = async (candidateId: string) => {
    if (!projectId || busyId) return;
    setBusyId(candidateId);
    setError(null);
    try {
      const res = await fetch(`/api/studio/artifacts/${artifact.id}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, candidateId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? `select failed (${res.status})`);
        return;
      }
      setSelected(candidateId);
    } finally {
      setBusyId(null);
    }
  };

  if (canvasOpen) return <StageIframe href={`/dashboard/clickatron/lab/${sessionId}`} label="canvas lab" />;

  return (
    <>
      <div className="stu-chips">
        <span className="stu-chip">{variations.length} candidate{variations.length === 1 ? "" : "s"}{selected ? " · one selected" : ""}</span>
        {onAskAbout && (
          <button className="stu-chip" style={{ cursor: "pointer" }} onClick={() => onAskAbout("regenerate the visual — same brief, fresh takes")}>regenerate</button>
        )}
        <button className="stu-chip" style={{ cursor: "pointer" }} onClick={() => setCanvasOpen(true)}>open canvas</button>
      </div>
      {variations.length === 0 && (
        <div className="stu-hint">{artifact.status === "running" ? "generating — candidates land here" : "no candidates yet — ask for a visual"}</div>
      )}
      <div className="stu-vargrid">
        {variations.map((v) => {
          const src = v.thumbnailRef || v.imageRef;
          const isSel = selected === v.id;
          return (
            <div key={v.id} className={`stu-var ${isSel ? "sel" : ""}`} style={v.status === "generating" ? { opacity: 0.4 } : undefined}>
              <div className="vh">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- engine-signed R2 URL, not a bundled asset
                  <img src={src} alt={`candidate ${v.id}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span className="disc" style={{ position: "absolute", right: "14%", top: "16%", width: "26%", aspectRatio: "1", borderRadius: 99, background: "#2a241a", display: "block" }} />
                )}
              </div>
              <span className="vn">{isSel ? "selected" : v.status === "generating" ? "generating" : v.status === "failed" ? "failed" : "candidate"}</span>
              {v.status === "completed" && (
                <button className="stu-btn" style={{ marginTop: 6 }} disabled={!projectId || busyId === v.id} onClick={() => void useThis(v.id)}>
                  {isSel ? "selected ✓" : busyId === v.id ? "…" : "use this"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <div className="stu-hint" style={{ color: "var(--red)" }}>{error}</div>}
    </>
  );
}

/* §12 proposal review: every entry is a PROPOSAL until accepted — accept
 * writes exactly that entry to CalOS (idea stage), remove drops it. Only
 * accepted entries become cards; publishing still needs CalOS approval. */
function PlanView({ artifact, projectId }: { artifact: StudioArtifact; projectId?: string | null }) {
  const [local, setLocal] = useState<Record<string, "accept" | "remove" | "busy">>({});
  const [error, setError] = useState<string | null>(null);

  const stateOf = (entry: { id: string; accepted?: boolean; removed?: boolean }) =>
    local[entry.id] ?? (entry.removed ? "remove" : entry.accepted ? "accept" : undefined);

  const act = async (entryId: string, action: "accept" | "remove") => {
    if (!projectId || local[entryId]) return;
    setLocal((prev) => ({ ...prev, [entryId]: "busy" }));
    setError(null);
    try {
      const res = await fetch(`/api/studio/artifacts/${artifact.id}/plan-entry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, entryId, action }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? `plan entry failed (${res.status})`);
        setLocal((prev) => {
          const next = { ...prev };
          delete next[entryId];
          return next;
        });
        return;
      }
      setLocal((prev) => ({ ...prev, [entryId]: action }));
    } catch {
      setError("network — try again");
      setLocal((prev) => {
        const next = { ...prev };
        delete next[entryId];
        return next;
      });
    }
  };

  const entries = artifact.planEntries ?? [];
  const accepted = entries.filter((e) => stateOf(e) === "accept").length;

  return (
    <>
      <div className="stu-chips">
        <span className="stu-chip">{entries.length} proposed · {accepted} accepted</span>
        <span className="stu-chip">accepted entries become idea-stage CalOS cards</span>
      </div>
      <div className="stu-doc" style={{ textAlign: "left" }}>
        {entries.length === 0 && <div className="stu-hint">no entries on this plan</div>}
        {entries.map((e) => {
          const state = stateOf(e);
          return (
            <div className="stu-drow" key={e.id} style={{ opacity: state === "remove" ? 0.45 : 1 }}>
              <div>
                <div className="nm">{e.title}</div>
                <div className="sub">
                  {e.platform} · {new Date(e.scheduledAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {state === "accept" ? (
                  <span className="stu-chip">accepted ✓</span>
                ) : state === "remove" ? (
                  <span className="stu-chip">removed</span>
                ) : (
                  <>
                    <button className="stu-btn" disabled={!projectId || state === "busy"} onClick={() => void act(e.id, "accept")}>
                      {state === "busy" ? "…" : "accept"}
                    </button>
                    <button className="stu-btn" disabled={!projectId || state === "busy"} onClick={() => void act(e.id, "remove")}>
                      remove
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {error && <div className="stu-hint" style={{ color: "var(--red)" }}>{error}</div>}
      </div>
    </>
  );
}

/* §17 Phase 5 storyboard stage: scene cards straight off the pipeline's
 * real record — image when it exists, honest generating state when it
 * doesn't. Approve/regenerate actions stay in the storyboard workspace
 * (the manualHref chip); this is the in-conversation board. */
function StoryboardView({ artifact }: { artifact: StudioArtifact }) {
  interface Scene {
    sceneIndex?: number;
    status?: string;
    imageUrl?: string;
    descriptor?: { narration?: string; durationSeconds?: number };
  }
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/services/pipeline/storyboard/${artifact.sourceRef.externalId}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { storyboard?: { scenes?: Scene[]; title?: string } & Scene[]; scenes?: Scene[]; title?: string };
        const sb = data.storyboard ?? data;
        if (!cancelled) {
          setScenes(sb.scenes ?? []);
          setTitle(sb.title ?? null);
        }
      } catch {
        /* keep the last known board */
      }
    };
    void load();
    if (artifact.status !== "running") return () => { cancelled = true; };
    const timer = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [artifact.sourceRef.externalId, artifact.status]);

  return (
    <>
      <div className="stu-chips">
        <span className="stu-chip">{scenes ? `${scenes.length} scenes` : "loading board"}</span>
        {title && <span className="stu-chip">{title}</span>}
        <a className="stu-chip" href={artifact.sourceRef.manualHref ?? `/dashboard/storyboard/${artifact.sourceRef.externalId}`} style={{ textDecoration: "none" }}>
          open workspace ↗
        </a>
      </div>
      {scenes && scenes.length === 0 && <div className="stu-hint">no scenes on this board yet</div>}
      <div className="stu-vargrid">
        {(scenes ?? []).map((s, i) => {
          const ready = s.status === "generated" || s.status === "approved";
          return (
            <div key={s.sceneIndex ?? i} className={`stu-var ${ready ? "" : ""}`} style={ready ? undefined : { opacity: 0.45 }}>
              <div className="vh">
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- pipeline R2 CDN URL, not a bundled asset
                  <img src={s.imageUrl} alt={`scene ${(s.sceneIndex ?? i) + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span className="disc" style={{ position: "absolute", right: "14%", top: "16%", width: "26%", aspectRatio: "1", borderRadius: 99, background: "#2a241a", display: "block" }} />
                )}
              </div>
              <span className="vn">
                scene {(s.sceneIndex ?? i) + 1}
                {s.descriptor?.durationSeconds ? ` · ${s.descriptor.durationSeconds}s` : ""}
                {ready ? "" : s.status === "rejected" ? " · rejected" : " · generating"}
              </span>
              {s.descriptor?.narration && (
                <div className="sub" style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, lineHeight: 1.4 }}>{s.descriptor.narration.slice(0, 120)}</div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function CanvasView({ artifact, projectId, onAskAbout }: { artifact: StudioArtifact; projectId?: string | null; onAskAbout?: (text: string) => void }) {
  if (studioRealTurnsEnabled && artifact.sourceRef.engine === "clickatron") {
    return <CandidateGallery artifact={artifact} projectId={projectId} onAskAbout={onAskAbout} />;
  }
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


/* §10 Write-stage affordances: selection-to-ask, versions, brand + sources
 * drawers, and hand-off actions. All pure UI — prompts go to the composer. */
function WriteStageChrome({
  sel,
  onMouseUp,
  ask,
  versions,
  drawer,
  setDrawer,
  brandName,
  handoffs,
  artifact,
}: {
  sel: string | null;
  onMouseUp: () => void;
  ask: (prompt: string) => void;
  versions: Array<{ label: string; at: string; note: string | null }>;
  drawer: "brand" | "sources" | null;
  setDrawer: (d: "brand" | "sources" | null) => void;
  brandName?: string | null;
  handoffs: Array<{ label: string; prompt: string }>;
  artifact: StudioArtifact;
}) {
  return (
    <>
      {sel && (
        <div className="stu-selask" role="toolbar" aria-label="Ask about selected text">
          <span className="stu-seltext">&ldquo;{sel}{sel.length >= 140 ? "…" : ""}&rdquo;</span>
          <button className="act sm primary" onClick={() => ask(`about this part: "${sel}" — `)}>Ask about this</button>
          <button className="act sm" onClick={() => ask(`rewrite this part: "${sel}" — `)}>Rewrite it</button>
        </div>
      )}
      <div className="stu-chips" style={{ marginTop: 12 }}>
        {versions.map((v) => (
          <span key={v.label} className="stu-chip">{v.label}{v.note ? ` · ${v.note}` : ""}</span>
        ))}
        <button className="stu-chip" onClick={() => setDrawer(drawer === "brand" ? null : "brand")} style={{ cursor: "pointer" }}>
          brand context {drawer === "brand" ? "▲" : "▼"}
        </button>
        <button className="stu-chip" onClick={() => setDrawer(drawer === "sources" ? null : "sources")} style={{ cursor: "pointer" }}>
          sources {drawer === "sources" ? "▲" : "▼"}
        </button>
      </div>
      {drawer === "brand" && (
        <div className="stu-drawer">
          <div className="stu-mlabel" style={{ marginBottom: 6 }}>brand context</div>
          {brandName ? (
            <div className="stu-drow">writing against <b>{brandName}</b> — voice, kill-list and palette come from its accepted Brand Vault profile</div>
          ) : (
            <div className="stu-drow">no brand bound — writing neutral; bind a brand to apply its vault profile</div>
          )}
        </div>
      )}
      {drawer === "sources" && (
        <div className="stu-drawer">
          <div className="stu-mlabel" style={{ marginBottom: 6 }}>sources · evidence</div>
          <div className="stu-drow">produced by thinkforge · script {artifact.sourceRef.externalId}</div>
          <div className="stu-drow">citations ride the receipt — every claim in the draft lists its source there</div>
        </div>
      )}
      <div className="stu-chips" style={{ marginTop: 12 }}>
        {handoffs.map((h) => (
          <button key={h.label} className="stu-chip" style={{ cursor: "pointer" }} onClick={() => ask(h.prompt)}>{h.label} →</button>
        ))}
      </div>
    </>
  );
}

function ScheduleView() {
  /* real mode: the week ahead from the delivery queue itself — never invented
   * dates next to real work. Mock mode keeps the scripted demo grid. */
  const [rows, setRows] = useState<Array<{ id: string; platform: string; status: string; publishAt: string }> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!studioRealTurnsEnabled) return;
    fetch("/api/studio/calendar")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { scheduled?: Array<{ id: string; platform: string; status: string; publishAt: string }> }) => setRows(d.scheduled ?? []))
      .catch(() => setFailed(true));
  }, []);

  if (studioRealTurnsEnabled) {
    if (failed) {
      return (
        <div className="stu-chips">
          <span className="stu-chip">couldn&apos;t load the schedule — nothing is faked here, retry by refocusing</span>
        </div>
      );
    }
    if (!rows) {
      return (
        <div className="stu-chips">
          <span className="stu-chip">loading the week…</span>
        </div>
      );
    }
    const grid = weekGrid(rows);
    const total = grid.reduce((n, g) => n + g.posts.length, 0);
    return (
      <>
        <div className="stu-chips">
          <span className="stu-chip">next 7 days · {total} scheduled</span>
          <span className="stu-chip">confirm before publish · nothing posts itself</span>
        </div>
        <div className="stu-calgrid">
          {grid.map((g) => (
            <div className="stu-calday" key={g.key}>
              <div className="d">
                {g.dayLabel} <span style={{ color: "var(--dim)" }}>{g.dateLabel}</span>
              </div>
              {g.posts.map(({ row, time }) => (
                <div key={row.id} className={`stu-calpost ${row.platform === "instagram" ? "ig" : ""}`}>
                  {row.platform} {time}
                </div>
              ))}
            </div>
          ))}
        </div>
        {total === 0 && (
          <div className="stu-chips">
            <span className="stu-chip">nothing scheduled this week — approved work lands here</span>
          </div>
        )}
      </>
    );
  }

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

function AnalyzeView({ artifact }: { artifact: StudioArtifact }) {
  if (studioRealTurnsEnabled && artifact.sourceRef.engine === "alyzitron" && artifact.sourceRef.externalId) {
    const taskId = artifact.sourceRef.externalId.includes(",") ? artifact.sourceRef.externalId.split(",")[0] : artifact.sourceRef.externalId;
    /* the report page only serves completed/failed tasks — while the task
     * runs, an iframe would 404. Honest state instead: what stage it's in. */
    if (artifact.status === "running" || artifact.status === "queued") {
      return (
        <>
          <div className="stu-chips">
            <span className="stu-chip">analyzing</span>
            {artifact.progress?.stage && <span className="stu-chip">{artifact.progress.stage}</span>}
          </div>
          <div className="stu-doc" style={{ textAlign: "left", maxWidth: 680 }}>
            <div className="stu-mlabel" style={{ marginBottom: 14 }}>the report unlocks here the moment scoring finishes</div>
            <div className="stu-hint">{artifact.progress?.stage ?? "queued"} — transcribing, then scoring against your brand. No progress is invented; this updates from the real task.</div>
          </div>
        </>
      );
    }
    return <StageIframe href={`/dashboard/alyzitron/report/${taskId}`} label="analysis report" />;
  }
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
  onAskAbout,
  brandName,
  projectId,
}: {
  focus: StudioStageFocus | null;
  artifacts: StudioArtifact[];
  /** Write stage (§10): select-to-ask + hand-off actions prefill the composer */
  onAskAbout?: (text: string) => void;
  brandName?: string | null;
  /** spine project id — §11 "use this" persists the candidate selection to this project's log */
  projectId?: string | null;
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
          {focused?.kind === "script" && <ScriptView artifact={focused} onAskAbout={onAskAbout} brandName={brandName} />}
          {(focused?.kind === "thumbnail" || focused?.kind === "image_canvas" || focused?.kind === "carousel") && (
            <CanvasView artifact={focused} projectId={projectId} onAskAbout={onAskAbout} />
          )}
          {focused?.kind === "schedule" && <ScheduleView />}
          {focused?.kind === "plan" && <PlanView artifact={focused} projectId={projectId} />}
          {focused?.kind === "storyboard" && <StoryboardView artifact={focused} />}
          {focused?.kind === "analysis" && <AnalyzeView artifact={focused} />}
          {focused && !["reel", "script", "thumbnail", "image_canvas", "carousel", "schedule", "plan", "storyboard", "analysis"].includes(focused.kind) && (
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
