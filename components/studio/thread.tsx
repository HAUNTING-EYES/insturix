"use client";

/**
 * Thread item renderers — presentational only. Every state the interaction
 * model defines renders here: user turns, plan cards with live steps,
 * artifacts born inline, literal receipts, quick replies, and the four
 * honesty moments (clarify / capability gap / confirm-spend / confirm-publish).
 */

import type { StudioThreadItem } from "@/lib/studio/contracts/objects";
import type { StudioTurnCostQuote } from "@/lib/studio/contracts/credits";
import { CAPABILITY_COLOR } from "@/lib/studio/mock/data";

export function Spark({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="var(--gold)" aria-hidden>
      <path d="M6 0 7.4 4.6 12 6 7.4 7.4 6 12 4.6 7.4 0 6 4.6 4.6Z" />
    </svg>
  );
}

function AgentName({ title }: { title: string }) {
  return (
    <div className="stu-aname">
      <Spark />
      <span className="t">{title}</span>
    </div>
  );
}

export function ArtifactMini({
  artifactId,
  kind,
  title,
  status,
  onShow,
}: {
  artifactId: string;
  kind: string;
  title: string;
  status: string;
  onShow?: (artifactId: string) => void;
}) {
  const dotClass = status === "done" ? "stu-ms-done" : status === "running" ? "stu-ms-run" : "stu-ms-queue";
  return (
    <button className="stu-amini" onClick={() => onShow?.(artifactId)} aria-label={`Show ${title}`}>
      <div className="pv">
        {kind === "script" && (
          <div className="lines">
            <span className="h" style={{ width: "88%" }} />
            <span style={{ width: "68%" }} />
            <span style={{ width: "78%" }} />
          </div>
        )}
        {(kind === "reel" || kind === "avatar_video") && (
          <div className="film">
            <i />
            <i className="b" />
            <i />
            <i />
          </div>
        )}
        {(kind === "thumbnail" || kind === "image_canvas" || kind === "carousel") && (
          <div className="varz">
            <i className="b" />
            <i />
            <i />
            <i className="b" />
          </div>
        )}
        {kind === "schedule" && (
          <div className="cal">
            <b />
            <b className="f" />
            <b className="f" />
            <b className="f" />
          </div>
        )}
        {(kind === "analysis" || kind === "music" || kind === "audio" || kind === "storyboard" || kind === "post") && (
          <div className="lines">
            <span className="h" style={{ width: "60%" }} />
            <span style={{ width: "80%" }} />
          </div>
        )}
      </div>
      <div className="mt">
        <span className="mn">{title}</span>
        <span className={`ms ${dotClass}`} />
      </div>
    </button>
  );
}

/* ── confirm cards (honesty moments rendered inline) ── */

export function ConfirmSpendCard({
  quote,
  walletMain,
  walletMedia,
  answered,
  onAnswer,
}: {
  quote: StudioTurnCostQuote;
  walletMain: number;
  walletMedia: number;
  answered: boolean;
  onAnswer: (accepted: boolean) => void;
}) {
  const relevant = quote.totalByPool.media > 0 ? quote.totalByPool.media : quote.totalByPool.main;
  const wallet = quote.totalByPool.media > 0 ? walletMedia : walletMain;
  return (
    <div className="stu-hcard">
      <span className="stu-htag"><i style={{ background: "var(--gold)" }} />confirm before spend</span>
      <div className="stu-hq">
        Generating <b>{quote.lines[0].display}</b>. This one costs credits:
      </div>
      <div className="stu-costrow">
        <div className="stu-cost"><span className="ck">variations</span><span className="cv">{quote.lines[0].quantity}</span></div>
        <div className="stu-cost"><span className="ck">pool</span><span className="cv">{quote.totalByPool.media > 0 ? "media" : "main"}</span></div>
        <div className="stu-cost"><span className="ck">cost</span><span className="cv">{relevant} cr</span></div>
        <div className="stu-cost"><span className="ck">wallet</span><span className="cv">{wallet} cr</span></div>
      </div>
      <div className="stu-btnrow">
        <button className="stu-btn stu-btn-primary" disabled={answered} onClick={() => onAnswer(true)}>
          Confirm {relevant} credits
        </button>
        <button className="stu-btn stu-btn-ghost" disabled={answered} onClick={() => onAnswer(false)}>
          Skip it
        </button>
      </div>
    </div>
  );
}

export function ConfirmPublishCard({
  targets,
  answered,
  onAnswer,
}: {
  targets: { platform: string; scheduledAt: string }[];
  answered: boolean;
  onAnswer: (accepted: boolean) => void;
}) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="stu-hcard">
      <span className="stu-htag"><i style={{ background: "var(--c-distribute)" }} />confirm before publish · hard gate</span>
      <div className="stu-hq">
        Schedule locked. Confirm and these <b>{targets.length} posts go out</b>:
      </div>
      <div className="stu-sched">
        {targets.map((t, i) => (
          <div className="stu-srow" key={i}>
            <span className="st">{fmt(t.scheduledAt)}</span>
            <span>Summer drop — launch</span>
            <span className="sc">{t.platform}</span>
          </div>
        ))}
      </div>
      <div className="stu-btnrow">
        <button className="stu-btn stu-btn-primary" disabled={answered} onClick={() => onAnswer(true)}>
          Queue {targets.length} posts
        </button>
        <button className="stu-btn stu-btn-ghost" disabled={answered} onClick={() => onAnswer(false)}>
          Hold
        </button>
      </div>
    </div>
  );
}

export function ClarifyCard({
  question,
  options,
  onPick,
}: {
  question: string;
  options: { id: string; label: string; detail?: string }[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="stu-hcard">
      <span className="stu-htag"><i style={{ background: "var(--c-analyze)" }} />needs clarification</span>
      <div className="stu-hq">{question}</div>
      <div className="stu-opts">
        {options.map((o) => (
          <button className="stu-opt" key={o.id} onClick={() => onPick(o.id)}>
            <span className="rd" />
            <div>
              <div className="ot">{o.label}</div>
              {o.detail && <div className="od">{o.detail}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function CapabilityGapCard({ reason, alternative }: { reason: string; alternative?: { description: string } | null }) {
  return (
    <div className="stu-hcard">
      <span className="stu-htag"><i style={{ background: "var(--red)" }} />capability gap · honest decline</span>
      <div className="stu-hq"><b>{reason}</b></div>
      {alternative && <div className="stu-hq" style={{ marginBottom: 0 }}>{alternative.description}</div>}
    </div>
  );
}

/* ── plan card ── */

export function PlanCard({
  item,
}: {
  item: Extract<StudioThreadItem, { kind: "plan" }>;
}) {
  return (
    <div className="stu-plan">
      <div className="pt">{item.summary}</div>
      <div className="stu-steps">
        {item.steps.map((s) => (
          <div key={s.id} className={`stu-step ${s.state === "done" ? "done" : s.state === "pending" ? "pending" : ""}`}>
            <span
              className={`sdot ${s.state === "running" ? "run" : ""}`}
              style={{ background: CAPABILITY_COLOR[s.capability] ?? "var(--muted)" }}
            />
            <span className="lab">
              <b>{s.label}</b>{" "}
              {s.state !== "pending" && s.riskLevel !== "read" && <span className="meta">· {s.riskLevel} risk</span>}
            </span>
            <span className="tool">{s.toolName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ThreadItems({
  items,
  artifacts,
  onQuickReply,
  onShowArtifact,
  clarifyCard,
  gapCard,
  spendCard,
  publishCard,
}: {
  items: StudioThreadItem[];
  artifacts: { id: string; kind: string; title: string; status: string }[];
  onQuickReply: (text: string) => void;
  onShowArtifact: (artifactId: string) => void;
  clarifyCard: React.ReactNode;
  gapCard: React.ReactNode;
  spendCard: React.ReactNode;
  publishCard: React.ReactNode;
}) {
  const artifactById = new Map(artifacts.map((a) => [a.id, a]));
  return (
    <>
      {items.map((item) => {
        switch (item.kind) {
          case "user":
            return <div className="stu-u" key={item.id}>{item.text}</div>;
          case "prose":
            return (
              <div className="stu-aturn" key={item.id}>
                <AgentName title="Insturix" />
                <div className="stu-arcpt" style={{ marginTop: 0 }}>{item.text}</div>
              </div>
            );
          case "plan":
            return (
              <div className="stu-aturn" key={item.id}>
                <AgentName title="Producing" />
                <PlanCard item={item} />
              </div>
            );
          case "artifact_born":
            return (
              <div className="stu-arts" key={item.id}>
                {item.artifactIds
                  .map((id) => artifactById.get(id))
                  .filter((a): a is NonNullable<typeof a> => Boolean(a))
                  .map((a) => (
                    <ArtifactMini key={a.id} artifactId={a.id} kind={a.kind} title={a.title} status={a.status} onShow={onShowArtifact} />
                  ))}
              </div>
            );
          case "receipt":
            return (
              <div className="stu-receipt" key={item.id}>
                <span className="tick">✓</span>
                <span>
                  receipt · {item.label}
                  {item.detail ? ` · ${item.detail}` : ""}
                  {item.creditsConsumed ? ` · ${item.creditsConsumed} cr` : ""}
                </span>
              </div>
            );
          case "quick_replies":
            return (
              <div className="stu-qr" key={item.id}>
                {item.options.map((o) => (
                  <button key={o} onClick={() => onQuickReply(o)}>{o}</button>
                ))}
              </div>
            );
          default:
            return null;
        }
      })}
      {gapCard}
      {clarifyCard}
      {spendCard}
      {publishCard}
    </>
  );
}
