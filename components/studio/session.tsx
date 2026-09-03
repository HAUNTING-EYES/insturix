"use client";

/**
 * The vibe session — conversation left (the only thing the user touches),
 * auto-following stage right. Consumes the turn protocol from the mock
 * orchestrator (Phase 2 swaps in the SSE endpoint; this component keeps the
 * same event loop). All honesty moments render inline; confirm gates pause
 * the turn until answered, exactly as the contract specifies.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioArtifact, StudioDeliverable, StudioStageFocus, StudioThreadItem } from "@/lib/studio/contracts/objects";
import type { StudioTurnEvent } from "@/lib/studio/contracts/turn";
import type { StudioTurnCostQuote } from "@/lib/studio/contracts/credits";
import { MOCK_DELIVERABLE, MOCK_THREAD, MOCK_WALLET } from "@/lib/studio/mock/data";
import { runMockTurn, type MockTurnHandle } from "@/lib/studio/mock/orchestrator";
import { runRealTurn, studioRealTurnsEnabled } from "@/lib/studio/client/turnClient";
import { replayEventsToItems, replayOpenConfirm, type PersistedSpineEvent } from "@/lib/studio/persist/replay";
import { useArtifactPolling } from "./use-artifact-polling";
import { ComposerMedia, type ComposerAttachment } from "./composer-media";
import { ThreadItems, ClarifyCard, CapabilityGapCard, ConfirmSpendCard, ConfirmPublishCard } from "./thread";
import { StageHost } from "./stage";

const REAL = studioRealTurnsEnabled;

/* spine identity: a real project id (TF session_, Editron, proj_*) or null
 * while the first turn is still on the "live"/"del_live" placeholder */
const spineId = (id: string | null | undefined) => (!id || id === "live" || id === "del_live" ? null : id);

interface PendingConfirm {
  kind: "spend" | "publish" | "destructive";
  quote: StudioTurnCostQuote | null;
  publishTargets: { platform: string; scheduledAt: string }[];
  answered: boolean;
  originalText: string;
  operationId: string | null; // the answer RESUMES this claim — never a new job
}

export function StudioSession({ deliverableId }: { deliverableId?: string }) {
  const [deliverable, setDeliverable] = useState<StudioDeliverable>(MOCK_DELIVERABLE);
  const [items, setItems] = useState<StudioThreadItem[]>(REAL ? [] : MOCK_THREAD);
  const [artifacts, setArtifacts] = useState<StudioArtifact[]>(REAL ? [] : MOCK_DELIVERABLE.artifacts);
  const [focus, setFocus] = useState<StudioStageFocus | null>(REAL ? null : MOCK_DELIVERABLE.stageFocus ?? null);
  const [mode, setMode] = useState<"ask" | "direct">("direct");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [realWallet, setRealWallet] = useState<{ main: number; media: number }>({ main: MOCK_WALLET.main, media: MOCK_WALLET.media });
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [clarifyEv, setClarifyEv] = useState<Extract<StudioTurnEvent, { type: "turn.needs_clarification" }> | null>(null);
  const [gapEv, setGapEv] = useState<Extract<StudioTurnEvent, { type: "turn.capability_gap" }> | null>(null);
  const [wsBrand, setWsBrand] = useState<{ id: string; name: string } | null>(null);
  const brandsMapRef = useRef<Record<string, string> | null>(null);
  const handleRef = useRef<MockTurnHandle | null>(null);
  const lastTextRef = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const projectIdRef = useRef<string | null>(spineId(deliverableId));
  const opIdRef = useRef<string | null>(null); // current logical turn's operation id
  const runTurnRef = useRef<(text: string, confirmQuoteId?: string, confirmAccepted?: boolean) => void>(() => undefined);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [items, pendingConfirm, busy]);

  /* real mode: hydrate an existing deliverable (Home row → its artifacts) */
  useEffect(() => {
    if (!REAL || !deliverableId) return;
    let cancelled = false;
    fetch(`/api/studio/deliverables/${deliverableId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { deliverable: StudioDeliverable }) => {
        if (cancelled || !d.deliverable) return;
        setDeliverable(d.deliverable);
        setArtifacts(d.deliverable.artifacts);
        setFocus(d.deliverable.stageFocus ?? null);
      })
      .catch(() => {
        /* new deliverable — empty session is the honest state */
      });
    return () => {
      cancelled = true;
    };
  }, [REAL, deliverableId]);

  /* workspace banner: the events payload carries the project's brandId; the
   * display name comes from the overview brands map, fetched once and cached */
  const resolveWsBrand = useCallback((brandId: string | null | undefined) => {
    if (!brandId) return;
    const apply = (map: Record<string, string>) => setWsBrand({ id: brandId, name: map[brandId] ?? brandId });
    if (brandsMapRef.current) {
      apply(brandsMapRef.current);
      return;
    }
    fetch("/api/studio/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { brands?: Record<string, string> }) => {
        brandsMapRef.current = d.brands ?? {};
        apply(brandsMapRef.current);
      })
      .catch(() => setWsBrand({ id: brandId, name: brandId }));
  }, []);

  /* spine: reload reconstructs the conversation from the persisted event log
   * (plan §3) — the same items the live reducer produced, replayed in order.
   * Boot order matters: hydrate the log FIRST, then send the ?q= prompt from
   * the Home composer as the first turn (Slice 2b), so replay never clobbers
   * a live message. Mount-once. */
  useEffect(() => {
    if (!REAL) return;
    let cancelled = false;
    const boot = async () => {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) window.history.replaceState(null, "", window.location.pathname);
      const pid = projectIdRef.current;
      if (pid) {
        try {
          const r = await fetch(`/api/studio/threads/${pid}/events`);
          if (r.ok) {
            const d = (await r.json()) as { events?: PersistedSpineEvent[]; brandId?: string | null };
            if (!cancelled && d.events?.length) setItems(replayEventsToItems(d.events));
            /* §3: reload reconstructs the conversation EXACTLY — an unanswered
             * approval gate re-arms its card, and the answer resumes the same
             * operation claim via PendingConfirm.operationId */
            const openConfirm = d.events ? replayOpenConfirm(d.events) : null;
            if (!cancelled && openConfirm && !q) {
              setPendingConfirm({
                kind: openConfirm.kind,
                quote: (openConfirm.quote as PendingConfirm["quote"]) ?? null,
                publishTargets: openConfirm.publishTargets,
                answered: false,
                originalText: openConfirm.originalText,
                operationId: openConfirm.operationId,
              });
            }
            if (!cancelled) resolveWsBrand(d.brandId);
          }
        } catch {
          /* no history yet — the empty thread is the honest state */
        }
      }
      if (!cancelled && q) void runTurnRef.current(q);
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [resolveWsBrand]);

  const refetchThread = useCallback(() => {
    const pid = projectIdRef.current;
    if (!pid) return;
    fetch(`/api/studio/threads/${pid}/events`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { events?: PersistedSpineEvent[]; brandId?: string | null }) => {
        if (d.events?.length) setItems(replayEventsToItems(d.events)); /* full replace — replay is canonical, so a dropped stream can't duplicate items */
        resolveWsBrand(d.brandId);
      })
      .catch(() => {
        /* offline — the next reload retries */
      });
  }, [resolveWsBrand]);

  useArtifactPolling(artifacts, setArtifacts, REAL);

  const showArtifact = useCallback((artifactId: string) => {
    setFocus((f) => (f ? { ...f, artifactId, reason: "user_asked", why: "you asked for it", since: new Date().toISOString() } : f));
  }, []);

  const applyEvent = useCallback((ev: StudioTurnEvent) => {
    switch (ev.type) {
      case "turn.received":
        /* first turn on the placeholder: adopt the minted spine project id and
         * pin the URL so a reload lands on the same persisted project */
        if (ev.deliverableId && ev.deliverableId !== projectIdRef.current) {
          projectIdRef.current = ev.deliverableId;
          window.history.replaceState(null, "", `/studio/d/${ev.deliverableId}`);
        }
        break;
      case "turn.plan":
        setItems((prev) => [
          ...prev,
          {
            kind: "plan",
            id: ev.planId,
            turnId: ev.turnId,
            summary: ev.summary,
            steps: ev.steps.map((s) => ({
              id: s.stepId,
              capability: s.capability,
              toolName: s.toolName,
              label: s.label,
              riskLevel: s.riskLevel,
              state: "pending",
            })),
            createdAt: new Date().toISOString(),
          },
        ]);
        break;
      case "step.start":
      case "step.progress":
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "plan" && it.turnId === ev.turnId
              ? { ...it, steps: it.steps.map((s) => (s.id === ev.stepId ? { ...s, state: "running" } : s)) }
              : it,
          ),
        );
        break;
      case "step.done":
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "plan" && it.turnId === ev.turnId
              ? { ...it, steps: it.steps.map((s) => (s.id === ev.stepId ? { ...s, state: "done" } : s)) }
              : it,
          ),
        );
        setItems((prev) => [
          ...prev,
          {
            kind: "receipt",
            id: `${ev.turnId}_${ev.stepId}_rc`,
            label: ev.receipt.label,
            riskLevel: ev.receipt.riskLevel,
            detail: ev.receipt.detail,
            creditsConsumed: ev.receipt.creditsConsumed,
            createdAt: new Date().toISOString(),
          },
        ]);
        break;
      case "step.error":
        setItems((prev) =>
          prev.map((it) =>
            it.kind === "plan" && it.turnId === ev.turnId
              ? { ...it, steps: it.steps.map((s) => (s.id === ev.stepId ? { ...s, state: "error" } : s)) }
              : it,
          ),
        );
        break;
      case "turn.error":
        setItems((prev) => [
          ...prev,
          { kind: "prose", id: `err_${ev.turnId}_${Date.now()}`, text: `${ev.message}${ev.refundIssued ? " · credits refunded" : ""}${ev.retryable ? " — try again" : ""}`, createdAt: new Date().toISOString() },
        ]);
        break;
      case "turn.confirm_required":
        setPendingConfirm({
          kind: ev.kind,
          quote: ev.quote ? (JSON.parse(ev.quote) as StudioTurnCostQuote) : null,
          publishTargets: ev.publishTargets,
          answered: false,
          originalText: lastTextRef.current ?? "",
          operationId: opIdRef.current,
        });
        break;
      case "turn.ideas":
        setItems((prev) => [
          ...prev,
          {
            kind: "ideas",
            id: `ideas_${ev.turnId}`,
            turnId: ev.turnId,
            ideas: ev.ideas,
            createdAt: new Date().toISOString(),
          },
        ]);
        break;
      case "turn.capability_gap":
        /* the decline is the turn's answer — it stays in the thread, not just
         * the transient card, so a reload keeps the honest record */
        setItems((prev) => [
          ...prev,
          {
            kind: "prose",
            id: `${ev.turnId}_gap`,
            text: `${ev.reason}${ev.alternative ? ` ${ev.alternative.description}` : ""}`,
            createdAt: new Date().toISOString(),
          },
        ]);
        break;
      case "turn.done":
        setItems((prev) => [
          ...prev,
          { kind: "prose", id: `${ev.turnId}_done`, text: ev.summary, createdAt: new Date().toISOString() },
          {
            kind: "quick_replies",
            id: `${ev.turnId}_qr`,
            options: REAL
              ? ["shorten it", "punch up the hook", "make it a carousel"]
              : ["show me the thumbnail", "schedule it", "what should we fix?"],
            createdAt: new Date().toISOString(),
          },
        ]);
        if (ev.artifactPayload) {
          const payload = ev.artifactPayload;
          setArtifacts((prev) => (prev.some((a) => a.id === payload.id) ? prev.map((a) => (a.id === payload.id ? payload : a)) : [...prev, payload]));
        }
        if (ev.stageFocus) {
          setFocus({ artifactId: ev.stageFocus.artifactId, reason: "agent_working", why: ev.stageFocus.why, since: new Date().toISOString() });
        }
        break;
      default:
        break;
    }
  }, []);

  const runTurn = useCallback(
    async (text: string, confirmQuoteId?: string, confirmAccepted?: boolean, operationId?: string) => {
      if (busy || !text.trim()) return;
      setBusy(true);
      setInput("");
      lastTextRef.current = text.trim();
      /* one operationId per logical turn — retries and confirm answers reuse
       * it, so the server's claim (409 on in-flight/done) makes double charges
       * and double publishes impossible. Plain UUID: the contract requires it */
      const opId = operationId ?? crypto.randomUUID();
      opIdRef.current = opId;
      setClarifyEv(null);
      setGapEv(null);
      setPendingConfirm(null);
      setItems((prev) => [
        ...prev,
        { kind: "user", id: `u${Date.now()}`, text: text.trim(), attachments: [], mentions: [], createdAt: new Date().toISOString() },
      ]);
      let gap: Extract<StudioTurnEvent, { type: "turn.capability_gap" }> | null = null;
      if (REAL) {
        /* real path: /api/studio/turns over SSE; artifact sourceRefs
         * round-trip engine ids for follow-ups (script → write, reel → edit) */
        const scriptArtifact = artifacts.find((a) => a.kind === "script");
        const reelArtifact = artifacts.find((a) => a.kind === "reel");
        const attachment = reelArtifact?.sourceRef.engine === "editron"
          ? [{ ref: reelArtifact.sourceRef.externalId, role: "reel" }]
          : scriptArtifact?.sourceRef.engine === "thinkforge"
            ? [{ ref: scriptArtifact.sourceRef.externalId, role: "script" }]
            : [];
        const abort = new AbortController();
        /* real confirms resolve by re-posting the turn with the accepted quote
         * (answerConfirm) — the old /confirm endpoint left with the confirm
         * registry, so the real path carries no handle */
        try {
          for await (const ev of runRealTurn(
            {
              deliverableId: projectIdRef.current ?? "del_live",
              threadId: projectIdRef.current ? `th_${projectIdRef.current}` : "th_live",
              text: text.trim(),
              mode,
              attachments: [...attachment, ...composerAttachments.map((a) => ({ ref: a.ref, role: a.role }))],
              mentions: [],
              clientContext: { focusedArtifactId: focus?.artifactId ?? null },
              operationId: opId,
              confirmAcceptedQuoteId: confirmQuoteId ?? null,
              confirmAccepted: confirmAccepted ?? undefined,
            },
            abort.signal,
          )) {
            applyEvent(ev);
            if (ev.type === "turn.confirm_required") {
              /* serverless: the paused stream may not resume on another
               * instance — close it; the card's answer re-posts the original
               * ask with the accepted quote and the turn continues there. */
              if (ev.quote) {
                try {
                  const cr = await fetch("/api/user/credits?wallet=auto");
                  if (cr.ok) {
                    const w = (await cr.json()) as { balance?: { totalCredits?: number; totalMediaCredits?: number }; totalCredits?: number; totalMediaCredits?: number };
                    setRealWallet({ main: w.balance?.totalCredits ?? w.totalCredits ?? 0, media: w.balance?.totalMediaCredits ?? w.totalMediaCredits ?? 0 });
                  }
                } catch {
                  /* card falls back to the last known wallet */
                }
              }
              abort.abort();
              break;
            }
            if (ev.type === "turn.capability_gap") gap = ev;
          }
        } catch (error) {
          /* stream dropped (network), not one of our own aborts: pull the
           * persisted log so everything saved before the drop reappears —
           * the spine resume path (plan §3) */
          if ((error as Error)?.name !== "AbortError") refetchThread();
        } finally {
          setBusy(false);
          handleRef.current = null;
        }
        if (gap) setGapEv(gap);
        return;
      }
      const { events, handle } = runMockTurn(text);
      handleRef.current = handle;
      let clarify: Extract<StudioTurnEvent, { type: "turn.needs_clarification" }> | null = null;
      for await (const ev of events) {
        applyEvent(ev);
        if (ev.type === "turn.needs_clarification") clarify = ev;
        if (ev.type === "turn.capability_gap") gap = ev;
      }
      if (clarify) setClarifyEv(clarify);
      if (gap) setGapEv(gap);
      setBusy(false);
      handleRef.current = null;
    },
    [busy, applyEvent, artifacts, mode, focus, composerAttachments, refetchThread],
  );

  runTurnRef.current = runTurn;

  const answerConfirm = useCallback(
    (accepted: boolean) => {
      setPendingConfirm((pc) => {
        if (pc && REAL && accepted && (pc.quote || pc.kind === "publish")) {
          /* serverless continuation: re-post the original ask with the yes —
           * same operationId, so the server resumes the awaiting claim */
          void runTurn(pc.originalText, pc.quote?.quoteId, pc.kind === "publish" ? true : undefined, pc.operationId ?? undefined);
        } else if (pc && REAL && !accepted) {
          setItems((prev) => [
            ...prev,
            { kind: "prose", id: `decline_${pc.quote?.quoteId ?? Date.now()}`, text: "Left it — nothing generated, nothing charged.", createdAt: new Date().toISOString() },
          ]);
        }
        return pc ? { ...pc, answered: true } : pc;
      });
      handleRef.current?.answer({ accepted });
    },
    [runTurn],
  );

  return (
    <div className="stu">
      <header className="stu-top">
        <div className="stu-brand">
          <span className="stu-mark" />
          <span className="stu-word">Instu<b>rix</b></span>
        </div>
        <nav className="stu-crumb" aria-label="Breadcrumb">
          <a href="/studio">Home</a>
          <span>·</span>
          <span className="dn">{deliverable.title}</span>
        </nav>
        <div className="stu-topright">
          <span className="stu-credits">{realWallet.main} cr</span>
          <div className="stu-seg" role="group" aria-label="Mode">
            <button className={mode === "ask" ? "on" : ""} onClick={() => setMode("ask")}>Ask</button>
            <button className={mode === "direct" ? "on" : ""} onClick={() => setMode("direct")}>Direct</button>
          </div>
          <div className="stu-credits" style={{ borderRadius: 99, width: 32, height: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>NJ</div>
        </div>
      </header>
      {wsBrand && (
        <div className="stu-wsbanner" role="note">
          You&apos;re in <b>{wsBrand.name}&apos;s</b> workspace — its voice, settings and credits apply to everything made here
        </div>
      )}
      <div className="stu-main">
        <div className="stu-convo">
          <div className="stu-chead">
            <div className="t">Direction</div>
            <div className="sub">just talk · the agent does the rest</div>
          </div>
          <div className="stu-thread" ref={threadRef}>
            <ThreadItems
              items={items}
              artifacts={artifacts}
              onQuickReply={runTurn}
              onShowArtifact={showArtifact}
              clarifyCard={
                clarifyEv ? (
                  <ClarifyCard
                    question={clarifyEv.question}
                    options={clarifyEv.options}
                    onPick={() => {
                      setClarifyEv(null);
                      runTurn("a launch reel, 30 seconds, go");
                    }}
                  />
                ) : null
              }
              gapCard={gapEv ? <CapabilityGapCard reason={gapEv.reason} alternative={gapEv.alternative ?? null} /> : null}
              spendCard={
                pendingConfirm?.kind === "spend" && pendingConfirm.quote ? (
                  <ConfirmSpendCard
                    quote={pendingConfirm.quote}
                    walletMain={realWallet.main}
                    walletMedia={realWallet.media}
                    answered={pendingConfirm.answered}
                    onAnswer={answerConfirm}
                  />
                ) : null
              }
              onUndo={() => runTurn("undo the last change — restore the checkpoint")}
            publishCard={
                pendingConfirm?.kind === "publish" ? (
                  <ConfirmPublishCard targets={pendingConfirm.publishTargets} answered={pendingConfirm.answered} onAnswer={answerConfirm} />
                ) : null
              }
            />
            {busy && !pendingConfirm && (
              <div className="stu-aname" aria-live="polite">
                <span className="stu-pm">
                  <i className="stu-ms-run" style={{ background: "var(--muted)" }} /> working…
                </span>
              </div>
            )}
          </div>
          <div className="stu-composer">
            <form
              className="stu-cbox"
              onSubmit={(e) => {
                e.preventDefault();
                runTurn(input);
                setComposerAttachments([]);
              }}
              style={REAL ? { flexDirection: "column", alignItems: "stretch", gap: 8 } : undefined}
            >
              {REAL && <ComposerMedia attachments={composerAttachments} setAttachments={setComposerAttachments} />}
              <div style={REAL ? { display: "flex", alignItems: "center", gap: 12 } : undefined}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={busy ? "agent is working…" : "Direct anything — write, cut, design, schedule…"}
                aria-label="Direct the agent"
              />
              <span className="k">⌘K</span>
              </div>
            </form>
            <div className="stu-chint">you never pick a tool · the agent shows you what it&apos;s on</div>
          </div>
        </div>
        <StageHost
          focus={focus}
          artifacts={artifacts}
          brandName={wsBrand?.name ?? null}
          onAskAbout={(text) => {
            /* §10 Write stage: selection-to-ask + hand-offs land in the composer */
            setInput(text);
            document.querySelector<HTMLInputElement>(".stu-composer input, textarea")?.focus();
          }}
        />
      </div>
    </div>
  );
}
