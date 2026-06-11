"use client";

import { useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Archive,
  Check,
  FileText,
  FolderOpen,
  GitBranch,
  Globe2,
  Network,
  RefreshCw,
  Search,
  Share2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  extractBrandVaultUploadEvidence,
  type BrandVaultUploadSourceEvidence,
} from "@/lib/frontend/services/brand-vault-upload-extraction";

type JobStatus = "queued" | "running" | "needs_review" | "accepted" | "rejected" | "failed";
type ReviewStatus = "idle" | "creating" | "reloading" | "reviewing";
type SignalGroup = "identity" | "palette" | "typography" | "visual" | "motion" | "voice" | "warnings";
type KbMode = "graph" | "docs";
type BrandVaultSourceKind = "uploaded_guideline" | "uploaded_asset" | "crawl_seed";

interface BrandVaultSourceInput {
  kind: BrandVaultSourceKind;
  url?: string;
  name?: string;
  note?: string;
  platform?: "website";
  mimeType?: string;
  sizeBytes?: number;
  text?: string;
  dominantColors?: string[];
  assetRole?: BrandVaultUploadSourceEvidence["assetRole"];
}

interface BrandRefineryJob {
  id: string;
  status: JobStatus;
  inputs: {
    websiteUrl?: string;
    companyName?: string;
    socialLinks: string[];
    sourceEvidence?: BrandVaultSourceInput[];
  };
  warnings: string[];
  createdAt: string;
  updatedAt: string;
}

interface BrandSignalEvidence {
  id: string;
  signalPath: string;
  sourceType: string;
  sourceField?: string;
  excerpt?: string;
  confidence: number;
  trustLevel: string;
  authorityClass: string;
  observedAt: string;
  fallbackReason?: string;
}

interface BrandSignalProfileRecord {
  id: string;
  status: "draft" | "accepted" | "rejected" | "superseded";
  profile: Record<string, unknown> & {
    evidence?: BrandSignalEvidence[];
    generatedAt?: string;
    brandId?: string;
  };
  createdAt: string;
  updatedAt: string;
  review: {
    required: boolean;
    reasons: string[];
    acceptedAt?: string;
    rejectedAt?: string;
    rejectionReason?: string;
  };
}

interface BrandEvidenceCandidate {
  id: string;
  sourceType: string;
  sourceUrl?: string;
  sourceField: string;
  signalPath: string;
  rawValue: unknown;
  normalizedValue: unknown;
  excerpt?: string;
  confidence: number;
  authorityClass: string;
  observedAt: string;
}

interface ReviewPayload {
  jobId: string;
  recordId: string;
  status: JobStatus;
  normalizedUrl: string;
  candidateCount: number;
  evidenceCount: number;
  warnings: string[];
  reviewRequired: boolean;
  reviewReasons: string[];
  generatedAt: string;
  coverage: Record<string, { signalCount: number; actionableSignalCount: number; evidenceCount: number }>;
}

interface ApiSuccess {
  ok: true;
  job?: BrandRefineryJob | null;
  record?: BrandSignalProfileRecord | null;
  reviewPayload?: ReviewPayload | null;
  candidates?: BrandEvidenceCandidate[];
  superseded?: BrandSignalProfileRecord[];
}

interface ApiFailure {
  ok: false;
  error?: {
    code?: string;
    message?: string;
  };
}

interface SignalRow {
  path: string;
  group: SignalGroup;
  label: string;
  value: unknown;
  confidence: number;
  trustLevel: string;
  authorityClass: string;
  evidenceIds: string[];
  fallbackReason?: string;
}

interface SourceCard {
  id: string;
  label: string;
  detail: string;
  status: "pending" | "processing" | "processed" | "partial" | "failed" | "rejected";
  countLabel: string;
  progress: number;
  tone: "good" | "warn" | "risk" | "neutral";
  Icon: LucideIcon;
}

const C = {
  bg: "#0B0B0A",
  raised: "#0F0F0E",
  deeper: "#131312",
  well: "#1B1A18",
  border: "#1C1B19",
  borderL: "#282724",
  text: "#ECE9E1",
  soft: "#B5B2A8",
  muted: "#7A776E",
  dim: "#5F5E5A",
  faint: "#454340",
  gold: "#D4A652",
  green: "#5EC97E",
  red: "#D46A5C",
  purple: "#9088D4",
  pink: "#D088B4",
  cyan: "#5CB8CC",
} as const;

const GROUPS: Array<{ id: SignalGroup; label: string; color: string }> = [
  { id: "identity", label: "Identity", color: C.gold },
  { id: "palette", label: "Palette", color: C.red },
  { id: "typography", label: "Typography", color: C.cyan },
  { id: "visual", label: "Visual", color: C.purple },
  { id: "motion", label: "Motion", color: C.pink },
  { id: "voice", label: "Voice", color: C.green },
  { id: "warnings", label: "Warnings", color: C.gold },
];

export function BrandVaultReview() {
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [socialLinksText, setSocialLinksText] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadedSources, setUploadedSources] = useState<BrandVaultUploadSourceEvidence[]>([]);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "extracting">("idle");
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [lookupId, setLookupId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [job, setJob] = useState<BrandRefineryJob | null>(null);
  const [record, setRecord] = useState<BrandSignalProfileRecord | null>(null);
  const [reviewPayload, setReviewPayload] = useState<ReviewPayload | null>(null);
  const [candidates, setCandidates] = useState<BrandEvidenceCandidate[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<SignalGroup>("identity");
  const [kbMode, setKbMode] = useState<KbMode>("graph");
  const [status, setStatus] = useState<ReviewStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signals = useMemo(() => collectSignals(record?.profile), [record]);
  const selectedSignal = signals.find((signal) => signal.path === selectedPath) ?? signals[0] ?? null;
  const evidence = useMemo(
    () => selectEvidence(record, candidates, selectedSignal),
    [record, candidates, selectedSignal],
  );
  const sources = useMemo(
    () => createSources(job, candidates, reviewPayload, socialLinksText, uploadNotes, uploadedSources),
    [job, candidates, reviewPayload, socialLinksText, uploadNotes, uploadedSources],
  );
  const visibleSignals = useMemo(() => {
    if (activeGroup === "warnings") return signals.filter((signal) => signal.fallbackReason || signal.confidence < 0.55);
    return signals.filter((signal) => signal.group === activeGroup);
  }, [activeGroup, signals]);
  const sourceWarnings = [...uploadWarnings, ...(job?.warnings ?? []), ...(reviewPayload?.warnings ?? [])].filter(Boolean);

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const cleanUrl = websiteUrl.trim();
    if (!cleanUrl) {
      setError("Enter a client website before scanning.");
      return;
    }

    await runApi("creating", async () => {
      const socialLinks = parseSocialLinks(socialLinksText);
      const body = {
        websiteUrl: cleanUrl,
        companyName: companyName.trim() || undefined,
        socialLinks,
        sourceEvidence: createSourceEvidence(uploadNotes, cleanUrl, uploadedSources),
      };
      const result = await postJson<ApiSuccess | ApiFailure>("/api/brand-vault/refinery/jobs", body);
      if (!result.ok) throw new Error(result.error?.message ?? "Could not create a draft.");
      applyApiResult(result);
      setLookupId(result.job?.id ?? result.reviewPayload?.jobId ?? "");
      setMessage("Draft ready for review.");
    });
  }

  async function handleUploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) return;

    setUploadStatus("extracting");
    setError(null);
    setMessage(null);
    try {
      const results = await Promise.all(files.slice(0, 24).map((file) => extractBrandVaultUploadEvidence(file)));
      const nextSources = results.map((result) => result.source);
      const warnings = results.flatMap((result) => result.warnings);
      setUploadedSources((current) => mergeUploadedSources(current, nextSources));
      setUploadWarnings((current) => uniqueStrings([...current, ...warnings]).slice(-8));
      setMessage(`${nextSources.length} brand file${nextSources.length === 1 ? "" : "s"} staged.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not read selected brand files.");
    } finally {
      setUploadStatus("idle");
    }
  }

  function removeUploadedSource(name: string) {
    setUploadedSources((current) => current.filter((source) => source.name !== name));
    setUploadWarnings((current) => current.filter((warning) => !warning.startsWith(name)));
  }

  async function reloadJob() {
    const id = (lookupId || job?.id || "").trim();
    if (!id) {
      setError("Enter or create a job id before reloading.");
      return;
    }

    await runApi("reloading", async () => {
      const result = await getJson<ApiSuccess | ApiFailure>(`/api/brand-vault/refinery/jobs?jobId=${encodeURIComponent(id)}`);
      if (!result.ok) throw new Error(result.error?.message ?? "Could not reload the draft.");
      applyApiResult(result);
      setMessage("Draft reloaded.");
    });
  }

  async function loadProfile() {
    const id = lookupId.trim();
    if (!id) {
      setError("Enter a profile id first.");
      return;
    }

    await runApi("reloading", async () => {
      const result = await getJson<ApiSuccess | ApiFailure>(`/api/brand-vault/signal-profiles/${encodeURIComponent(id)}`);
      if (!result.ok) throw new Error(result.error?.message ?? "Could not open the profile.");
      applyApiResult(result);
      setMessage("Profile opened.");
    });
  }

  async function reviewDraft(action: "accept" | "reject") {
    if (!record?.id) {
      setError("Create or open a draft before reviewing it.");
      return;
    }
    if (action === "reject" && !rejectReason.trim()) {
      setError("Add a reject reason before rejecting the draft.");
      return;
    }

    await runApi("reviewing", async () => {
      const result = await postJson<ApiSuccess | ApiFailure>(
        `/api/brand-vault/signal-profiles/${encodeURIComponent(record.id)}`,
        action === "accept" ? { action } : { action, reason: rejectReason.trim() },
        "PATCH",
      );
      if (!result.ok) throw new Error(result.error?.message ?? "Could not update draft status.");
      applyApiResult({ ...result, candidates });
      setMessage(action === "accept" ? "Draft accepted." : "Draft rejected.");
    });
  }

  async function runApi(nextStatus: ReviewStatus, fn: () => Promise<void>) {
    setStatus(nextStatus);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : "Something went wrong.");
    } finally {
      setStatus("idle");
    }
  }

  function applyApiResult(result: ApiSuccess) {
    const nextRecord = result.record === undefined ? record : result.record;
    setJob(result.job === undefined ? job : result.job ?? null);
    setRecord(nextRecord ?? null);
    setReviewPayload(result.reviewPayload === undefined ? reviewPayload : result.reviewPayload ?? null);
    if (Array.isArray(result.candidates)) setCandidates(result.candidates);

    const nextSignals = collectSignals(nextRecord?.profile);
    if (nextSignals.length > 0 && (!selectedPath || !nextSignals.some((signal) => signal.path === selectedPath))) {
      setSelectedPath(nextSignals[0].path);
      setActiveGroup(nextSignals[0].group);
    }
  }

  const canReview = Boolean(record?.id && record.status === "draft");

  return (
    <>
      <style>{styles}</style>
      <div className="bv-app">
        <header className="bv-topbar">
          <div className="bv-top-left">
            <div className="bv-traffic" aria-hidden="true"><span /><span /><span /></div>
            <div>
              <h1>Brand Vault</h1>
              <p>Evidence-backed brand setup</p>
            </div>
          </div>
          <div className="bv-summary-row">
            <StatusBadge status={record?.status ?? job?.status ?? "queued"} />
            <span className="bv-mono">{reviewPayload?.evidenceCount ?? candidates.length} evidence</span>
            <span className="bv-mono">{signals.length} signals</span>
          </div>
          <div className="bv-actions">
            <button type="button" onClick={reloadJob} disabled={status !== "idle"}>
              <RefreshCw size={14} /> Reload
            </button>
            <button type="button" className="bv-primary" onClick={() => reviewDraft("accept")} disabled={!canReview || status !== "idle"}>
              <Check size={14} /> Accept
            </button>
          </div>
        </header>

        <main className="bv-shell">
          <aside className="bv-left">
            <form className="bv-panel" onSubmit={createDraft}>
              <PanelHead title="Fast setup" meta={status === "creating" ? "scanning" : "ready"} />
              <div className="bv-stack">
                <label>
                  <span className="bv-mono">Client website</span>
                  <input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://client.example" />
                </label>
                <label>
                  <span className="bv-mono">Company name</span>
                  <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Optional" />
                </label>
                <label>
                  <span className="bv-mono">Social links</span>
                  <textarea value={socialLinksText} onChange={(event) => setSocialLinksText(event.target.value)} placeholder="One link per line" />
                </label>
                <label>
                  <span className="bv-mono">Manual source names</span>
                  <textarea value={uploadNotes} onChange={(event) => setUploadNotes(event.target.value)} />
                </label>
                <label>
                  <span className="bv-mono">Brand files</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.markdown,.csv,.json,.html,.htm,.css,.svg,image/*"
                    onChange={handleUploadFiles}
                    disabled={status !== "idle" || uploadStatus === "extracting"}
                  />
                </label>
                {uploadedSources.length > 0 && (
                  <div className="bv-upload-list">
                    {uploadedSources.map((source) => (
                      <div className="bv-upload-item" key={`${source.name}_${source.sizeBytes ?? 0}`}>
                        <FileText size={14} />
                        <span>
                          <strong>{source.name}</strong>
                          <em>
                            {source.assetRole ?? "other"} / {source.text ? "text" : "metadata"} / {source.dominantColors?.length ?? 0} colors
                          </em>
                        </span>
                        <button type="button" onClick={() => removeUploadedSource(source.name)} aria-label={`Remove ${source.name}`}>
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {uploadWarnings.length > 0 && (
                  <div className="bv-upload-warnings">
                    {uploadWarnings.map((warning) => <span key={warning}>{warning}</span>)}
                  </div>
                )}
                <button className="bv-primary" type="submit" disabled={status !== "idle"}>
                  <Search size={14} /> Start scan
                </button>
              </div>
            </form>

            <section className="bv-panel">
              <PanelHead title="Open draft" meta="existing" />
              <div className="bv-stack">
                <label>
                  <span className="bv-mono">Job or profile id</span>
                  <input value={lookupId} onChange={(event) => setLookupId(event.target.value)} placeholder="Paste id" />
                </label>
                <div className="bv-two-actions">
                  <button type="button" onClick={reloadJob} disabled={status !== "idle"}>Reload job</button>
                  <button type="button" onClick={loadProfile} disabled={status !== "idle"}>Open profile</button>
                </div>
              </div>
            </section>

            <section className="bv-panel">
              <PanelHead title="Source lanes" meta="mixed" />
              <div className="bv-source-list">
                {sources.map((source) => (
                  <SourceRow key={source.id} source={source} />
                ))}
              </div>
            </section>
          </aside>

          <section className="bv-center">
            <section className="bv-source-strip" aria-label="Evidence source lanes">
              {sources.map((source) => (
                <SourceCardView key={source.id} source={source} />
              ))}
            </section>

            <section className="bv-summary">
              <div>
                <span className="bv-mono">Draft profile</span>
                <h2>{record ? profileTitle(record) : "Create a website-derived draft"}</h2>
                <p>
                  {record
                    ? "Signals stay evidence-backed until accepted. Additional sources remain staged for enrichment."
                    : "Paste a client website, add social and source material, then review the generated draft before it affects output."}
                </p>
              </div>
              <div className="bv-metrics">
                <Metric label="draft signals" value={signals.length} />
                <Metric label="review reasons" value={record?.review.reasons.length ?? 0} />
                <Metric label="warnings" value={sourceWarnings.length} />
              </div>
            </section>

            <nav className="bv-tabs" aria-label="Signal groups">
              {GROUPS.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={activeGroup === group.id ? "active" : ""}
                  onClick={() => setActiveGroup(group.id)}
                  style={{ borderLeftColor: activeGroup === group.id ? group.color : C.border }}
                >
                  {group.label}
                </button>
              ))}
            </nav>

            <section className="bv-signals" aria-label="Draft signal review">
              {visibleSignals.length === 0 ? (
                <EmptySignals activeGroup={activeGroup} hasRecord={Boolean(record)} />
              ) : (
                visibleSignals.map((signal) => (
                  <button
                    key={signal.path}
                    type="button"
                    className={`bv-signal ${selectedSignal?.path === signal.path ? "active" : ""}`}
                    onClick={() => setSelectedPath(signal.path)}
                  >
                    <span>
                      <strong>{signal.label}</strong>
                      <em>{signal.path}</em>
                    </span>
                    <span className="bv-value">{formatValue(signal.value)}</span>
                    <span className="bv-confidence">
                      <span className="bv-mono">{Math.round(signal.confidence * 100)}%</span>
                      <i><b style={{ width: `${Math.round(signal.confidence * 100)}%` }} /></i>
                    </span>
                    <span className={`bv-badge ${signalTone(signal)}`}>{signal.trustLevel.replaceAll("_", " ")}</span>
                  </button>
                ))
              )}
            </section>

            <footer className="bv-decision">
              <div>
                <p>{decisionCopy(record, job)}</p>
                {message && <span className="bv-good-text">{message}</span>}
                {error && <span className="bv-risk-text">{error}</span>}
              </div>
              <div className="bv-actions">
                <input
                  className="bv-reject"
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Reject reason"
                  disabled={!canReview}
                />
                <button type="button" onClick={() => reviewDraft("reject")} disabled={!canReview || status !== "idle"}>
                  <X size={14} /> Reject
                </button>
                <button type="button" className="bv-primary" onClick={() => reviewDraft("accept")} disabled={!canReview || status !== "idle"}>
                  <Check size={14} /> Accept draft
                </button>
              </div>
            </footer>
          </section>

          <aside className="bv-right">
            <section className="bv-detail">
              <span className="bv-mono">Selected signal</span>
              <h2>{selectedSignal ? selectedSignal.label : "No signal selected"}</h2>
              <p>{selectedSignal ? formatValue(selectedSignal.value) : "Create or open a draft to inspect evidence."}</p>
            </section>

            <section className="bv-panel bv-panel-inset">
              <PanelHead title="Evidence" meta={`${evidence.length}`} />
              <div className="bv-evidence-list">
                {evidence.length === 0 ? (
                  <div className="bv-evidence"><strong>No evidence selected</strong><p>Signal evidence appears here after a draft is created.</p></div>
                ) : (
                  evidence.map((item) => (
                    <div key={item.id} className="bv-evidence">
                      <strong>{item.sourceField || item.sourceType}</strong>
                      <p>{evidenceBody(item)}</p>
                      <span className="bv-mono">{Math.round((item.confidence ?? 0) * 100)}% / {item.sourceType}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="bv-panel bv-panel-inset">
              <PanelHead title="User KB" meta={kbMode} />
              <div className="bv-kb-tabs">
                <button type="button" className={kbMode === "graph" ? "active" : ""} onClick={() => setKbMode("graph")}>
                  <GitBranch size={14} /> Graph
                </button>
                <button type="button" className={kbMode === "docs" ? "active" : ""} onClick={() => setKbMode("docs")}>
                  <FolderOpen size={14} /> Docs
                </button>
              </div>
              {kbMode === "graph" ? <KbGraph selectedSignal={selectedSignal} /> : <KbDocs uploadNotes={uploadNotes} uploadedSources={uploadedSources} record={record} />}
            </section>

            <section className="bv-panel bv-panel-inset">
              <PanelHead title="Review notes" meta={record?.status ?? "idle"} />
              <div className="bv-evidence-list">
                {(record?.review.reasons ?? ["Drafts must be accepted before they become brand truth."]).map((reason) => (
                  <div className="bv-evidence" key={reason}><strong>Review reason</strong><p>{reason}</p></div>
                ))}
                {sourceWarnings.map((warning) => (
                  <div className="bv-evidence" key={warning}><strong>Warning</strong><p>{warning}</p></div>
                ))}
              </div>
            </section>
          </aside>
        </main>
      </div>
    </>
  );
}

function PanelHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="bv-panel-head">
      <h2>{title}</h2>
      <span className="bv-mono">{meta}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bv-metric">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "accepted" || status === "processed" ? "good" : status === "rejected" || status === "failed" ? "risk" : "warn";
  return <span className={`bv-badge ${cls}`}>{status.replaceAll("_", " ")}</span>;
}

function SourceRow({ source }: { source: SourceCard }) {
  const Icon = source.Icon;
  return (
    <article className="bv-source-row">
      <Icon size={14} />
      <div>
        <strong>{source.label}</strong>
        <p>{source.detail}</p>
      </div>
      <span className={`bv-badge ${source.tone}`}>{source.status}</span>
    </article>
  );
}

function SourceCardView({ source }: { source: SourceCard }) {
  const Icon = source.Icon;
  return (
    <article className="bv-source-card">
      <div className="bv-card-head">
        <Icon size={14} />
        <h2>{source.label}</h2>
        <span className={`bv-badge ${source.tone}`}>{source.status}</span>
      </div>
      <p>{source.detail}</p>
      <div className="bv-meter">
        <span className="bv-mono">{source.countLabel}</span>
        <i><b style={{ width: `${source.progress}%`, background: toneColor(source.tone) }} /></i>
      </div>
    </article>
  );
}

function EmptySignals({ activeGroup, hasRecord }: { activeGroup: SignalGroup; hasRecord: boolean }) {
  return (
    <div className="bv-empty">
      <Archive size={18} />
      <strong>{hasRecord ? "No signals in this group" : "No draft yet"}</strong>
      <p>{hasRecord ? `${activeGroup} has no evidence-backed signal rows in this draft.` : "Start a scan or open an existing draft to review signals."}</p>
    </div>
  );
}

function KbGraph({ selectedSignal }: { selectedSignal: SignalRow | null }) {
  return (
    <div className="bv-graph" aria-label="Brand knowledge graph">
      <span className="bv-node brand">Brand</span>
      <span className="bv-node palette">Palette</span>
      <span className="bv-node voice">Voice</span>
      <span className="bv-node docs">Docs</span>
      <span className="bv-node social">Posts</span>
      <span className="bv-node selected">{selectedSignal?.label ?? "Signal"}</span>
    </div>
  );
}

function KbDocs({
  uploadNotes,
  uploadedSources,
  record,
}: {
  uploadNotes: string;
  uploadedSources: BrandVaultUploadSourceEvidence[];
  record: BrandSignalProfileRecord | null;
}) {
  const docs = [
    ...uploadedSources.map((source) => ({
      name: source.name,
      status: source.text || source.dominantColors?.length ? "extracted" : "staged",
    })),
    ...parseUploadNotes(uploadNotes).map((name) => ({ name, status: "staged" })),
  ].slice(0, 4);
  return (
    <div className="bv-docs">
      {(docs.length ? docs : [{ name: "Brand book.pdf", status: "staged" }, { name: "Approved phrases.doc", status: "staged" }, { name: "Logo placement.png", status: "staged" }]).map((doc) => (
        <div className="bv-doc" key={`${doc.name}_${doc.status}`}><FileText size={14} /><span>{doc.name}</span><span className="bv-mono">{doc.status}</span></div>
      ))}
      {record && <div className="bv-doc"><FileText size={14} /><span>Profile snapshot</span><span className="bv-mono">{record.status}</span></div>}
    </div>
  );
}

async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && payload?.ok !== false) throw new Error(`Request failed with status ${response.status}.`);
  return payload as T;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const payload = await response.json().catch(() => null);
  if (!response.ok && payload?.ok !== false) throw new Error(`Request failed with status ${response.status}.`);
  return payload as T;
}

function parseSocialLinks(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function createSourceEvidence(
  uploadNotes: string,
  websiteUrl: string,
  uploadedSources: BrandVaultUploadSourceEvidence[],
): BrandVaultSourceInput[] {
  const uploadedNames = new Set(uploadedSources.map((source) => source.name.toLowerCase()));
  const uploadSources: BrandVaultSourceInput[] = parseUploadNotes(uploadNotes).filter((name) => !uploadedNames.has(name.toLowerCase())).map((name) => ({
    kind: inferUploadKind(name),
    name,
    note: "User-supplied brand source for review.",
  }));
  const crawlSeed: BrandVaultSourceInput = {
    kind: "crawl_seed",
    url: websiteUrl,
    platform: "website",
    note: "Root domain for deeper brand evidence crawl.",
  };
  return [
    crawlSeed,
    ...uploadedSources,
    ...uploadSources,
  ].slice(0, 30);
}

function parseUploadNotes(value: string): string[] {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function inferUploadKind(name: string): BrandVaultSourceKind {
  return /\.(pdf|docx?|pptx?|txt|md)$/i.test(name) ? "uploaded_guideline" : "uploaded_asset";
}

function mergeUploadedSources(
  current: BrandVaultUploadSourceEvidence[],
  incoming: BrandVaultUploadSourceEvidence[],
): BrandVaultUploadSourceEvidence[] {
  const byKey = new Map<string, BrandVaultUploadSourceEvidence>();
  for (const source of [...current, ...incoming]) {
    byKey.set(`${source.name.toLowerCase()}_${source.sizeBytes ?? 0}`, source);
  }
  return [...byKey.values()].slice(0, 24);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function collectSignals(profile: unknown): SignalRow[] {
  const rows: SignalRow[] = [];
  visitSignals(profile, "", rows);
  return rows.sort((a, b) => groupIndex(a.group) - groupIndex(b.group) || a.path.localeCompare(b.path));
}

function visitSignals(value: unknown, path: string, rows: SignalRow[]) {
  if (isSignal(value)) {
    rows.push({
      path,
      group: groupFromPath(path),
      label: labelFromPath(path),
      value: value.value,
      confidence: typeof value.confidence === "number" ? value.confidence : 0,
      trustLevel: typeof value.trustLevel === "string" ? value.trustLevel : "unknown",
      authorityClass: typeof value.authorityClass === "string" ? value.authorityClass : "unknown",
      evidenceIds: Array.isArray(value.evidenceIds) ? value.evidenceIds.filter((id): id is string => typeof id === "string") : [],
      fallbackReason: typeof value.fallbackReason === "string" ? value.fallbackReason : undefined,
    });
    return;
  }
  if (!isRecord(value) || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "evidence") continue;
    visitSignals(child, path ? `${path}.${key}` : key, rows);
  }
}

function isSignal(value: unknown): value is Record<string, unknown> & { value: unknown; confidence: number; evidenceIds: unknown[] } {
  return isRecord(value) && "value" in value && typeof value.confidence === "number" && Array.isArray(value.evidenceIds);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function groupFromPath(path: string): SignalGroup {
  const first = path.split(".")[0] as SignalGroup;
  return GROUPS.some((group) => group.id === first) ? first : "warnings";
}

function groupIndex(group: SignalGroup): number {
  return GROUPS.findIndex((item) => item.id === group);
}

function labelFromPath(path: string): string {
  const raw = path.split(".").at(-1) ?? path;
  return raw.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

function selectEvidence(
  record: BrandSignalProfileRecord | null,
  candidates: BrandEvidenceCandidate[],
  signal: SignalRow | null,
): Array<BrandSignalEvidence | BrandEvidenceCandidate> {
  if (!signal) return [];
  const profileEvidence = (record?.profile.evidence ?? []).filter((item) => signal.evidenceIds.includes(item.id) || item.signalPath === signal.path);
  const candidateEvidence = candidates.filter((item) => item.signalPath === signal.path);
  return [...profileEvidence, ...candidateEvidence].slice(0, 8);
}

function evidenceBody(item: BrandSignalEvidence | BrandEvidenceCandidate): string {
  if (item.excerpt) return item.excerpt;
  if ("normalizedValue" in item) return formatValue(item.normalizedValue ?? item.rawValue);
  if (item.fallbackReason) return item.fallbackReason;
  return item.signalPath;
}

function createSources(
  job: BrandRefineryJob | null,
  candidates: BrandEvidenceCandidate[],
  reviewPayload: ReviewPayload | null,
  socialLinksText: string,
  uploadNotes: string,
  uploadedSources: BrandVaultUploadSourceEvidence[],
): SourceCard[] {
  const socialCount = job?.inputs.socialLinks.length ?? parseSocialLinks(socialLinksText).length;
  const uploadCount =
    job?.inputs.sourceEvidence?.filter((source) => source.kind === "uploaded_guideline" || source.kind === "uploaded_asset").length ??
    uniqueStrings([...uploadedSources.map((source) => source.name), ...parseUploadNotes(uploadNotes)]).length;
  const uploadCandidateCount = candidates.filter((item) => item.sourceType === "uploaded_guideline" || item.sourceType === "uploaded_asset").length;
  const websiteCount = candidates.filter((item) => item.sourceType.startsWith("website") || item.sourceType === "css" || item.sourceType === "json_ld" || item.sourceType === "logo_asset").length;
  const warningCount = (job?.warnings.length ?? 0) + (reviewPayload?.warnings.length ?? 0);

  return [
    {
      id: "website",
      label: "Website",
      detail: "Homepage, metadata, JSON-LD, CSS, colors, fonts, logo candidates.",
      status: websiteCount > 0 ? "processed" : job?.status === "failed" ? "failed" : "pending",
      countLabel: `${websiteCount || reviewPayload?.candidateCount || 0} candidates`,
      progress: websiteCount > 0 ? 92 : 16,
      tone: websiteCount > 0 ? "good" : job?.status === "failed" ? "risk" : "neutral",
      Icon: Globe2,
    },
    {
      id: "socials",
      label: "Pinned posts",
      detail: "Social links are recorded for voice, proof patterns, and creator language review.",
      status: socialCount > 0 ? "partial" : "pending",
      countLabel: `${socialCount} links`,
      progress: socialCount > 0 ? 44 : 12,
      tone: socialCount > 0 ? "warn" : "neutral",
      Icon: Share2,
    },
    {
      id: "uploads",
      label: "Uploads",
      detail: "PDFs, docs, slides, screenshots, logos, and brand guideline files.",
      status: uploadCandidateCount > 0 ? "processed" : uploadCount > 0 ? "partial" : "pending",
      countLabel: uploadCandidateCount > 0 ? `${uploadCandidateCount} candidates` : `${uploadCount} files staged`,
      progress: uploadCandidateCount > 0 ? 72 : uploadCount > 0 ? 42 : 12,
      tone: uploadCandidateCount > 0 ? "good" : "warn",
      Icon: Upload,
    },
    {
      id: "crawler",
      label: "Full crawler",
      detail: "Sitemap, case studies, media kit, assets, resources, and deeper pages.",
      status: "pending",
      countLabel: "awaiting crawl",
      progress: 12,
      tone: "neutral",
      Icon: Network,
    },
    {
      id: "legacy",
      label: "Old intelligence",
      detail: "Existing brand facts stay separate until they can be attached to source evidence.",
      status: warningCount > 0 ? "partial" : "pending",
      countLabel: `${warningCount} warnings`,
      progress: warningCount > 0 ? 28 : 12,
      tone: warningCount > 0 ? "risk" : "neutral",
      Icon: Archive,
    },
  ];
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(", ") : "None observed";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value || "None observed";
  if (value && typeof value === "object") return JSON.stringify(value);
  return "None observed";
}

function profileTitle(record: BrandSignalProfileRecord): string {
  const brandName = getPath(record.profile, ["identity", "brandName", "value"]);
  return typeof brandName === "string" && brandName ? brandName : "Draft brand profile";
}

function getPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value);
}

function signalTone(signal: SignalRow): "good" | "warn" | "risk" | "neutral" {
  if (signal.fallbackReason || signal.confidence < 0.55) return "risk";
  if (signal.confidence < 0.75) return "warn";
  return "good";
}

function toneColor(tone: SourceCard["tone"]): string {
  if (tone === "good") return C.green;
  if (tone === "risk") return C.red;
  if (tone === "warn") return C.gold;
  return C.borderL;
}

function decisionCopy(record: BrandSignalProfileRecord | null, job: BrandRefineryJob | null): string {
  if (record?.status === "accepted") return "This profile is accepted and can be consumed by service-specific adapters.";
  if (record?.status === "rejected") return "This draft was rejected. Create a new scan or open another draft.";
  if (record?.status === "draft") return "Accepting publishes the draft as canonical brand truth. Rejecting keeps it out of outputs.";
  if (job?.status === "failed") return "The scan failed. Check the website URL and try again.";
  return "Create or open a draft to review Brand Vault evidence.";
}

const styles = `
  .bv-app {
    min-height: 100vh;
    display: grid;
    grid-template-rows: 48px 1fr;
    background: ${C.bg};
    color: ${C.text};
    font-family: 'Plus Jakarta Sans', -apple-system, system-ui, sans-serif;
  }
  .bv-app * { box-sizing: border-box; }
  .bv-app button,
  .bv-app input,
  .bv-app textarea { font: inherit; }
  .bv-app button {
    min-height: 32px;
    border: 1px solid ${C.border};
    border-radius: 7px;
    background: ${C.deeper};
    color: ${C.soft};
    padding: 0 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .bv-app button:disabled,
  .bv-app input:disabled {
    cursor: not-allowed;
    color: ${C.faint};
  }
  .bv-app button:focus-visible,
  .bv-app input:focus-visible,
  .bv-app textarea:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px #D4A65240;
  }
  .bv-primary {
    border-color: ${C.gold} !important;
    background: ${C.gold} !important;
    color: ${C.bg} !important;
    font-weight: 800 !important;
  }
  .bv-topbar {
    border-bottom: 1px solid ${C.border};
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 32px;
    background: ${C.bg};
  }
  .bv-top-left,
  .bv-summary-row,
  .bv-actions,
  .bv-traffic,
  .bv-card-head,
  .bv-two-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .bv-traffic span {
    width: 8px;
    height: 8px;
    border-radius: 4px;
    border: 1px solid ${C.borderL};
    background: ${C.raised};
  }
  .bv-topbar h1,
  .bv-summary h2,
  .bv-detail h2,
  .bv-panel-head h2,
  .bv-source-card h2,
  .bv-empty strong {
    margin: 0;
  }
  .bv-topbar h1 {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0;
  }
  .bv-topbar p,
  .bv-summary p,
  .bv-detail p,
  .bv-decision p {
    margin: 0;
    color: ${C.muted};
  }
  .bv-topbar p {
    margin-top: 4px;
    font-size: 11px;
  }
  .bv-mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${C.dim};
  }
  .bv-shell {
    min-height: 0;
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr) 368px;
  }
  .bv-left,
  .bv-right {
    min-height: 0;
    overflow: auto;
    background: ${C.raised};
    padding: 16px;
  }
  .bv-left { border-right: 1px solid ${C.border}; }
  .bv-right { border-left: 1px solid ${C.border}; }
  .bv-center {
    min-height: 0;
    overflow: auto;
    display: grid;
    grid-template-rows: auto auto auto 1fr auto;
    background: ${C.bg};
  }
  .bv-panel {
    border: 1px solid ${C.border};
    border-radius: 12px;
    background: ${C.raised};
    overflow: hidden;
  }
  .bv-panel + .bv-panel { margin-top: 16px; }
  .bv-panel-inset { margin-bottom: 16px; }
  .bv-panel-head {
    min-height: 48px;
    border-bottom: 1px solid ${C.border};
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 16px;
  }
  .bv-panel-head h2 {
    font-size: 13px;
    font-weight: 500;
    color: ${C.soft};
  }
  .bv-stack,
  .bv-source-list,
  .bv-evidence-list,
  .bv-docs {
    display: grid;
    gap: 12px;
    padding: 12px;
  }
  .bv-stack label {
    display: grid;
    gap: 8px;
  }
  .bv-upload-list,
  .bv-upload-warnings {
    display: grid;
    gap: 8px;
  }
  .bv-app input,
  .bv-app textarea {
    width: 100%;
    border: 1px solid ${C.border};
    border-radius: 7px;
    background: ${C.deeper};
    color: ${C.text};
    padding: 12px;
  }
  .bv-app textarea {
    min-height: 96px;
    resize: vertical;
  }
  .bv-app input[type="file"] {
    min-height: 40px;
    color: ${C.muted};
  }
  .bv-source-row,
  .bv-source-card,
  .bv-evidence,
  .bv-metric,
  .bv-doc,
  .bv-upload-item,
  .bv-empty {
    border: 1px solid ${C.border};
    border-radius: 7px;
    background: ${C.deeper};
    padding: 12px;
  }
  .bv-upload-item {
    min-height: 48px;
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) 32px;
    align-items: center;
    gap: 10px;
  }
  .bv-upload-item strong,
  .bv-upload-item em {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bv-upload-item strong {
    font-size: 12px;
    font-weight: 500;
    color: ${C.soft};
  }
  .bv-upload-item em {
    margin-top: 3px;
    font-style: normal;
    font-size: 10px;
    color: ${C.dim};
  }
  .bv-upload-item button {
    width: 32px;
    min-height: 32px;
    padding: 0;
  }
  .bv-upload-warnings span {
    border: 1px solid #D4A65230;
    border-radius: 7px;
    padding: 8px 10px;
    color: ${C.gold};
    background: #D4A65210;
    font-size: 11px;
    line-height: 1.35;
  }
  .bv-source-row {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
  }
  .bv-source-row strong,
  .bv-evidence strong {
    display: block;
    margin-bottom: 4px;
    font-size: 13px;
    font-weight: 500;
    color: ${C.soft};
  }
  .bv-source-row p,
  .bv-source-card p,
  .bv-evidence p,
  .bv-empty p {
    margin: 0;
    color: ${C.muted};
    font-size: 11px;
    line-height: 1.45;
  }
  .bv-source-strip {
    display: grid;
    grid-template-columns: repeat(5, minmax(144px, 1fr));
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid ${C.border};
  }
  .bv-source-card {
    min-height: 144px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bv-card-head {
    justify-content: space-between;
  }
  .bv-card-head h2 {
    flex: 1;
    font-size: 13px;
    font-weight: 800;
  }
  .bv-meter {
    display: grid;
    gap: 8px;
    margin-top: auto;
  }
  .bv-meter i,
  .bv-confidence i {
    display: block;
    height: 8px;
    border-radius: 4px;
    background: ${C.borderL};
    overflow: hidden;
  }
  .bv-meter b,
  .bv-confidence b {
    display: block;
    height: 100%;
    background: ${C.green};
  }
  .bv-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 16px;
    padding: 16px;
    border-bottom: 1px solid ${C.border};
  }
  .bv-summary h2 {
    margin-top: 8px;
    font-size: 24px;
    font-weight: 800;
  }
  .bv-summary p {
    margin-top: 8px;
    line-height: 1.5;
  }
  .bv-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .bv-metric b {
    display: block;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 24px;
    font-weight: 500;
  }
  .bv-metric span {
    color: ${C.dim};
    font-size: 11px;
  }
  .bv-tabs {
    min-height: 48px;
    border-bottom: 1px solid ${C.border};
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    overflow: auto;
  }
  .bv-tabs button {
    border-left-width: 4px;
  }
  .bv-tabs button.active,
  .bv-kb-tabs button.active {
    color: ${C.gold};
    background: ${C.well};
    border-color: ${C.gold};
  }
  .bv-signals {
    display: grid;
    gap: 8px;
    align-content: start;
    padding: 12px 16px 16px;
  }
  .bv-signal {
    width: 100%;
    min-height: 72px !important;
    display: grid !important;
    grid-template-columns: minmax(144px, 0.8fr) minmax(220px, 1.3fr) 112px 148px;
    align-items: center !important;
    text-align: left;
    gap: 12px !important;
    border-radius: 7px !important;
    background: ${C.deeper} !important;
    padding: 12px !important;
  }
  .bv-signal.active {
    border-left: 4px solid ${C.gold};
    background: ${C.well} !important;
  }
  .bv-signal strong {
    display: block;
    font-weight: 500;
    color: ${C.soft};
  }
  .bv-signal em {
    display: block;
    margin-top: 4px;
    color: ${C.dim};
    font-style: normal;
    font-size: 11px;
  }
  .bv-value {
    color: ${C.soft};
    line-height: 1.45;
  }
  .bv-confidence {
    display: grid;
    gap: 8px;
  }
  .bv-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    border: 1px solid ${C.border};
    border-radius: 4px;
    padding: 0 8px;
    color: ${C.muted};
    font-size: 11px;
    white-space: nowrap;
  }
  .bv-badge.good {
    border-color: #5EC97E40;
    background: #5EC97E14;
    color: ${C.green};
  }
  .bv-badge.warn {
    border-color: #D4A65240;
    background: #D4A65214;
    color: ${C.gold};
  }
  .bv-badge.risk {
    border-color: #D46A5C40;
    background: #D46A5C14;
    color: ${C.red};
  }
  .bv-detail {
    padding: 16px;
    border: 1px solid ${C.border};
    border-radius: 12px;
    background: ${C.raised};
    margin-bottom: 16px;
  }
  .bv-detail h2 {
    margin-top: 8px;
    font-size: 18px;
    font-weight: 800;
  }
  .bv-detail p {
    margin-top: 8px;
    line-height: 1.5;
  }
  .bv-kb-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 12px;
  }
  .bv-graph {
    position: relative;
    height: 224px;
    margin: 0 12px 12px;
    border: 1px solid ${C.border};
    border-radius: 7px;
    background: ${C.deeper};
  }
  .bv-node {
    position: absolute;
    min-width: 76px;
    min-height: 32px;
    border: 1px solid ${C.borderL};
    border-radius: 7px;
    background: ${C.raised};
    display: grid;
    place-items: center;
    color: ${C.soft};
    font-size: 11px;
  }
  .bv-node.brand {
    left: 50%;
    top: 44%;
    transform: translate(-50%, -50%);
    border-color: ${C.gold};
    color: ${C.gold};
  }
  .bv-node.palette { left: 24px; top: 32px; border-color: ${C.red}; }
  .bv-node.voice { right: 24px; top: 32px; border-color: ${C.purple}; }
  .bv-node.docs { left: 32px; bottom: 32px; border-color: ${C.cyan}; }
  .bv-node.social { right: 32px; bottom: 32px; border-color: ${C.pink}; }
  .bv-node.selected {
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    border-color: ${C.green};
  }
  .bv-doc {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }
  .bv-empty {
    min-height: 180px;
    display: grid;
    place-items: center;
    text-align: center;
    align-content: center;
    gap: 8px;
    color: ${C.dim};
  }
  .bv-decision {
    position: sticky;
    bottom: 0;
    border-top: 1px solid ${C.border};
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    background: ${C.bg};
  }
  .bv-decision > div:first-child {
    display: grid;
    gap: 4px;
  }
  .bv-good-text {
    color: ${C.green};
    font-size: 11px;
  }
  .bv-risk-text {
    color: ${C.red};
    font-size: 11px;
  }
  .bv-reject {
    width: 220px !important;
    min-height: 32px;
    padding: 0 12px !important;
  }
  @media (max-width: 1280px) {
    .bv-shell {
      grid-template-columns: 280px minmax(0, 1fr);
    }
    .bv-right {
      grid-column: 1 / -1;
      border-left: 0;
      border-top: 1px solid ${C.border};
    }
    .bv-source-strip {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 860px) {
    .bv-topbar,
    .bv-decision {
      height: auto;
      align-items: stretch;
      flex-direction: column;
      padding: 12px 16px;
    }
    .bv-shell,
    .bv-source-strip,
    .bv-summary,
    .bv-metrics,
    .bv-signal {
      grid-template-columns: 1fr;
    }
    .bv-left {
      border-right: 0;
      border-bottom: 1px solid ${C.border};
    }
    .bv-reject {
      width: 100% !important;
    }
  }
`;
