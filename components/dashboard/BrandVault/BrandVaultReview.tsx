'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { AlertTriangle, Check, FileText, Loader2, RefreshCw, Search, Upload, X } from 'lucide-react';
import {
  extractBrandVaultUploadEvidence,
  type BrandVaultUploadSourceEvidence,
} from '@/lib/frontend/services/brand-vault-upload-extraction';
import { BrandConstellation } from './BrandConstellation';
import type { BrandConstellationFacet } from './BrandConstellation';
import { SourceStrip } from './SourceStrip';
import { BrandVaultStats } from './BrandVaultStats';
import { ConflictCard } from './ConflictCard';
import { SignalTable } from './SignalTable';
import {
  buildSourceLanes,
  collectSignals,
  coveragePercent,
  EMPTY_SNAPSHOT,
  formatValue,
  groupConflicts,
  groupMeta,
  GROUPS,
  mergeSnapshot,
  parseSocialLinks,
  profileBrandName,
  summarize,
} from './brand-vault-data';
import type {
  BrandVaultSignalGroup,
  BrandVaultSnapshot,
  BrandVaultSourceInput,
  SignalConflict,
  SourceLane,
} from './brand-vault-types';
import { useBrandVaultJob, useBrandVaultMutations, useBrandVaultProfile } from './useBrandVault';

type ToastTone = 'good' | 'warn' | 'risk';
type UploadStatus = 'idle' | 'extracting';

const BRAND_GROUPS: BrandVaultSignalGroup[] = [
  'identity',
  'palette',
  'typography',
  'visual',
  'motion',
  'voice',
];

export function BrandVaultReview() {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [socialLinksText, setSocialLinksText] = useState('');
  const [sourceNotes, setSourceNotes] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [snapshot, setSnapshot] = useState<BrandVaultSnapshot>(EMPTY_SNAPSHOT);
  const [uploadedSources, setUploadedSources] = useState<BrandVaultUploadSourceEvidence[]>([]);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [resolvedConflicts, setResolvedConflicts] = useState<Set<string>>(() => new Set());
  const [resolvingConflictPath, setResolvingConflictPath] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const jobQuery = useBrandVaultJob(jobId);
  const profileQuery = useBrandVaultProfile(profileId);
  const { createDraft, acceptDraft, rejectDraft } = useBrandVaultMutations();

  useEffect(() => {
    if (!jobQuery.data) return;
    setSnapshot((current) => mergeSnapshot(current, jobQuery.data));
  }, [jobQuery.data]);

  useEffect(() => {
    if (!profileQuery.data) return;
    setSnapshot((current) => mergeSnapshot(current, profileQuery.data));
  }, [profileQuery.data]);

  const signals = useMemo(() => collectSignals(snapshot.record?.profile), [snapshot.record]);
  const allConflicts = useMemo(() => groupConflicts(snapshot.candidates), [snapshot.candidates]);
  const activeConflicts = useMemo(
    () =>
      allConflicts.filter(
        (conflict) => !resolvedConflicts.has(conflict.path) && conflict.path !== resolvingConflictPath,
      ),
    [allConflicts, resolvedConflicts, resolvingConflictPath],
  );
  const displayedConflict = useMemo(
    () =>
      resolvingConflictPath
        ? allConflicts.find((conflict) => conflict.path === resolvingConflictPath) ?? null
        : activeConflicts[0] ?? null,
    [activeConflicts, allConflicts, resolvingConflictPath],
  );
  const summary = useMemo(() => summarize(signals, activeConflicts, snapshot), [activeConflicts, signals, snapshot]);
  const sourceLanes = useMemo(
    () => augmentSourceLanes(buildSourceLanes(snapshot), socialLinksText, uploadedSources, snapshot),
    [snapshot, socialLinksText, uploadedSources],
  );
  const brandName = profileBrandName(snapshot);
  const facets = useMemo(() => buildFacets(snapshot, signals), [signals, snapshot]);
  const canReview = Boolean(snapshot.record?.id && snapshot.record.status === 'draft');
  const busy =
    createDraft.isPending ||
    acceptDraft.isPending ||
    rejectDraft.isPending ||
    jobQuery.isFetching ||
    profileQuery.isFetching ||
    uploadStatus === 'extracting';
  const currentError =
    localError ??
    errorMessage(createDraft.error) ??
    errorMessage(acceptDraft.error) ??
    errorMessage(rejectDraft.error) ??
    errorMessage(jobQuery.error) ??
    errorMessage(profileQuery.error);
  const statusLabel = snapshot.record?.status ?? snapshot.job?.status ?? 'draft';
  const needsCount = activeConflicts.length;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleCreateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUrl = websiteUrl.trim();
    if (!cleanUrl) {
      setLocalError('Enter a client website before scanning.');
      return;
    }

    setLocalError(null);
    const input = {
      websiteUrl: cleanUrl,
      companyName: companyName.trim() || undefined,
      socialLinks: parseSocialLinks(socialLinksText),
      sourceEvidence: createSourceEvidence(cleanUrl, sourceNotes, uploadedSources),
    };
    const result = await createDraft.mutateAsync(input);
    setSnapshot((current) => mergeSnapshot(current, result));
    const nextJobId = result.job?.id ?? result.reviewPayload?.jobId ?? null;
    const nextProfileId = result.record?.id ?? result.reviewPayload?.recordId ?? null;
    setJobId(nextJobId);
    setProfileId(nextProfileId);
    setLookupId(nextJobId ?? nextProfileId ?? '');
    setResolvedConflicts(new Set());
    setResolvingConflictPath(null);
    showToast('Draft ready for review.', 'good');
  }

  async function handleUploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) return;

    setUploadStatus('extracting');
    setLocalError(null);
    try {
      const results = await Promise.all(files.slice(0, 24).map((file) => extractBrandVaultUploadEvidence(file)));
      const nextSources = results.map((result) => result.source);
      const warnings = results.flatMap((result) => result.warnings);
      setUploadedSources((current) => mergeUploadedSources(current, nextSources));
      setUploadWarnings((current) => uniqueStrings([...current, ...warnings]).slice(-8));
      showToast(`${nextSources.length} brand file${nextSources.length === 1 ? '' : 's'} staged.`, 'good');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Could not read selected brand files.');
    } finally {
      setUploadStatus('idle');
    }
  }

  function removeUploadedSource(name: string) {
    setUploadedSources((current) => current.filter((source) => source.name !== name));
    setUploadWarnings((current) => current.filter((warning) => !warning.startsWith(name)));
  }

  async function reloadJob() {
    const id = (lookupId || snapshot.job?.id || '').trim();
    if (!id) {
      setLocalError('Enter or create a job id before reloading.');
      return;
    }
    setLocalError(null);
    setLookupId(id);
    if (id === jobId) {
      await jobQuery.refetch();
      showToast('Draft reloaded.', 'good');
      return;
    }
    setJobId(id);
    showToast('Reloading draft.', 'warn');
  }

  async function openProfile() {
    const id = lookupId.trim();
    if (!id) {
      setLocalError('Enter a profile id first.');
      return;
    }
    setLocalError(null);
    if (id === profileId) {
      await profileQuery.refetch();
      showToast('Profile opened.', 'good');
      return;
    }
    setProfileId(id);
    showToast('Opening profile.', 'warn');
  }

  async function acceptProfile() {
    if (!snapshot.record?.id) {
      setLocalError('Create or open a draft before accepting it.');
      return;
    }
    const result = await acceptDraft.mutateAsync(snapshot.record.id);
    setSnapshot((current) => mergeSnapshot(current, result));
    showToast('Profile accepted as brand truth.', 'good');
  }

  async function rejectProfile() {
    if (!snapshot.record?.id) {
      setLocalError('Create or open a draft before rejecting it.');
      return;
    }
    if (!rejectReason.trim()) {
      setLocalError('Add a reject reason before rejecting the draft.');
      return;
    }
    const result = await rejectDraft.mutateAsync({ recordId: snapshot.record.id, reason: rejectReason.trim() });
    setSnapshot((current) => mergeSnapshot(current, result));
    showToast('Draft rejected.', 'risk');
  }

  function resolveConflict(path: string, value: unknown) {
    setResolvingConflictPath(path);
    showToast(`Conflict resolved / ${formatValue(value)}`, 'good');
    window.setTimeout(() => {
      setResolvedConflicts((current) => new Set(current).add(path));
      setResolvingConflictPath(null);
    }, 650);
  }

  function showToast(message: string, tone: ToastTone) {
    setToast({ message, tone });
  }

  return (
    <>
      <style>{baseStyles}</style>
      <div style={{ minHeight: '100vh', background: '#0B0B0A', color: '#ECE9E1' }}>
        <header className="bv-c1-topbar">
          <span className="bv-c1-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="bv-c1-wordmark">Brand Vault</span>
          <span className="bv-c1-context">
            {brandName} / {statusLabel}
          </span>
          <span className="flex-1" />
          <span className={`bv-c1-pill ${needsCount === 0 ? 'clear' : ''}`}>
            {needsCount === 0 ? <Check size={13} /> : <AlertTriangle size={13} />}
            {needsCount === 0 ? 'all clear' : `${needsCount} needs you`}
          </span>
          <button type="button" className="bv-c1-primary" disabled={!canReview || busy} onClick={acceptProfile}>
            {acceptDraft.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Accept profile
          </button>
        </header>

        <BrandConstellation
          brandName={brandName}
          facets={facets}
          conflict={displayedConflict ? conflictToConstellation(displayedConflict) : null}
          resolved={Boolean(resolvingConflictPath)}
        />

        <main className="mx-auto max-w-[1180px] px-10">
          <SourceStrip lanes={sourceLanes} />
          <BrandVaultStats summary={summary} />

          {!snapshot.record && (
            <FastSetupPanel
              websiteUrl={websiteUrl}
              companyName={companyName}
              socialLinksText={socialLinksText}
              sourceNotes={sourceNotes}
              lookupId={lookupId}
              uploadedSources={uploadedSources}
              uploadWarnings={uploadWarnings}
              busy={busy}
              uploadStatus={uploadStatus}
              onWebsiteUrlChange={setWebsiteUrl}
              onCompanyNameChange={setCompanyName}
              onSocialLinksTextChange={setSocialLinksText}
              onSourceNotesChange={setSourceNotes}
              onLookupIdChange={setLookupId}
              onCreateDraft={handleCreateDraft}
              onUploadFiles={handleUploadFiles}
              onRemoveUpload={removeUploadedSource}
              onReloadJob={reloadJob}
              onOpenProfile={openProfile}
            />
          )}

          {currentError && (
            <div className="mb-6 rounded-[10px] border border-[rgba(212,106,92,0.3)] bg-[rgba(212,106,92,0.06)] px-4 py-3 text-[13px] text-[#D46A5C]">
              {currentError}
            </div>
          )}

          <ConflictCard
            conflict={displayedConflict}
            resolved={Boolean(resolvingConflictPath)}
            onAccept={resolveConflict}
            onEdit={(path) => showToast(`Edit queued for ${path}. Per-signal patch API is pending.`, 'warn')}
            onReject={(path) => resolveConflict(path, 'rejected')}
          />

          <SignalTable signals={signals} onAccept={(path) => showToast(`Signal accepted / ${path}`, 'good')} />

          <footer className="py-10 pb-[72px] text-center">
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#5F5E5A',
              }}
            >
              {summary.reviewOnly} review-only signals / evidence-backed until accepted
            </span>
            {snapshot.record && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                <input
                  value={lookupId}
                  onChange={(event) => setLookupId(event.target.value)}
                  placeholder="Job or profile id"
                  className="bv-c1-input w-[260px]"
                />
                <button type="button" className="bv-c1-button" disabled={busy} onClick={reloadJob}>
                  <RefreshCw size={14} /> Reload
                </button>
                <button type="button" className="bv-c1-button" disabled={busy} onClick={openProfile}>
                  Open profile
                </button>
                <input
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Reject reason"
                  className="bv-c1-input w-[220px]"
                  disabled={!canReview}
                />
                <button type="button" className="bv-c1-button danger" disabled={!canReview || busy} onClick={rejectProfile}>
                  <X size={14} /> Reject
                </button>
              </div>
            )}
          </footer>
        </main>

        <div className={`bv-c1-toast ${toast ? 'show' : ''} ${toast?.tone ?? 'good'}`}>
          <Check size={15} />
          <span>{toast?.message ?? 'Resolved'}</span>
        </div>
      </div>
    </>
  );
}

interface FastSetupPanelProps {
  websiteUrl: string;
  companyName: string;
  socialLinksText: string;
  sourceNotes: string;
  lookupId: string;
  uploadedSources: BrandVaultUploadSourceEvidence[];
  uploadWarnings: string[];
  busy: boolean;
  uploadStatus: UploadStatus;
  onWebsiteUrlChange: (value: string) => void;
  onCompanyNameChange: (value: string) => void;
  onSocialLinksTextChange: (value: string) => void;
  onSourceNotesChange: (value: string) => void;
  onLookupIdChange: (value: string) => void;
  onCreateDraft: (event: FormEvent<HTMLFormElement>) => void;
  onUploadFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveUpload: (name: string) => void;
  onReloadJob: () => void;
  onOpenProfile: () => void;
}

function FastSetupPanel({
  websiteUrl,
  companyName,
  socialLinksText,
  sourceNotes,
  lookupId,
  uploadedSources,
  uploadWarnings,
  busy,
  uploadStatus,
  onWebsiteUrlChange,
  onCompanyNameChange,
  onSocialLinksTextChange,
  onSourceNotesChange,
  onLookupIdChange,
  onCreateDraft,
  onUploadFiles,
  onRemoveUpload,
  onReloadJob,
  onOpenProfile,
}: FastSetupPanelProps) {
  return (
    <section className="mb-10 rounded-[14px] border border-[#1C1B19] bg-[#0F0F0E] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="bv-c1-mono">Fast setup</span>
          <h2 className="mt-2 text-[24px] font-extrabold leading-tight tracking-[-0.02em]">
            Create a website-derived draft
          </h2>
          <p className="mt-2 max-w-[620px] text-[13px] leading-6 text-[#7A776E]">
            Paste the client site, add social links, and stage brand files. Website evidence is live; social and uploads stay visibly staged until the backend attaches source evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={lookupId}
            onChange={(event) => onLookupIdChange(event.target.value)}
            placeholder="Job or profile id"
            className="bv-c1-input w-[220px]"
          />
          <button type="button" className="bv-c1-button" disabled={busy} onClick={onReloadJob}>
            Reload job
          </button>
          <button type="button" className="bv-c1-button" disabled={busy} onClick={onOpenProfile}>
            Open profile
          </button>
        </div>
      </div>

      <form onSubmit={onCreateDraft} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className="grid gap-3">
          <label className="grid gap-2">
            <span className="bv-c1-mono">Client website</span>
            <input
              value={websiteUrl}
              onChange={(event) => onWebsiteUrlChange(event.target.value)}
              placeholder="https://client.example"
              className="bv-c1-input"
            />
          </label>
          <label className="grid gap-2">
            <span className="bv-c1-mono">Company name</span>
            <input
              value={companyName}
              onChange={(event) => onCompanyNameChange(event.target.value)}
              placeholder="Optional"
              className="bv-c1-input"
            />
          </label>
          <label className="grid gap-2">
            <span className="bv-c1-mono">Social links</span>
            <textarea
              value={socialLinksText}
              onChange={(event) => onSocialLinksTextChange(event.target.value)}
              placeholder="One link per line"
              className="bv-c1-input min-h-[92px] resize-y"
            />
          </label>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-2">
            <span className="bv-c1-mono">Brand files</span>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.markdown,.csv,.json,.html,.htm,.css,.svg,image/*"
              onChange={onUploadFiles}
              disabled={busy}
              className="bv-c1-input"
            />
          </label>
          <label className="grid gap-2">
            <span className="bv-c1-mono">Source notes</span>
            <textarea
              value={sourceNotes}
              onChange={(event) => onSourceNotesChange(event.target.value)}
              placeholder="Brand book.pdf&#10;Approved phrases.docx"
              className="bv-c1-input min-h-[92px] resize-y"
            />
          </label>
          <button type="submit" className="bv-c1-primary min-h-10" disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {uploadStatus === 'extracting' ? 'Reading files' : 'Start scan'}
          </button>
        </div>
      </form>

      {(uploadedSources.length > 0 || uploadWarnings.length > 0) && (
        <div className="mt-5 grid gap-2">
          {uploadedSources.map((source) => (
            <div
              key={`${source.name}_${source.sizeBytes ?? 0}`}
              className="grid min-h-12 grid-cols-[16px_minmax(0,1fr)_32px] items-center gap-3 rounded-[8px] border border-[#1C1B19] bg-[#131312] px-3 py-2"
            >
              <FileText size={14} color="#7A776E" />
              <span className="min-w-0">
                <strong className="block truncate text-[12px] font-medium text-[#B5B2A8]">{source.name}</strong>
                <em className="mt-0.5 block truncate text-[10px] not-italic text-[#5F5E5A]">
                  {source.assetRole ?? 'other'} / {source.text ? 'text' : 'metadata'} / {source.dominantColors?.length ?? 0} colors
                </em>
              </span>
              <button
                type="button"
                onClick={() => onRemoveUpload(source.name)}
                aria-label={`Remove ${source.name}`}
                className="bv-c1-icon-button"
              >
                <X size={13} />
              </button>
            </div>
          ))}
          {uploadWarnings.map((warning) => (
            <span
              key={warning}
              className="rounded-[8px] border border-[rgba(212,166,82,0.3)] bg-[rgba(212,166,82,0.06)] px-3 py-2 text-[11px] leading-5 text-[#D4A652]"
            >
              {warning}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function buildFacets(snapshot: BrandVaultSnapshot, signals: ReturnType<typeof collectSignals>): BrandConstellationFacet[] {
  return BRAND_GROUPS.map((group) => {
    const meta = groupMeta(group);
    const coverage = coveragePercent(snapshot.reviewPayload?.coverage, group);
    const groupSignals = signals.filter((signal) => signal.group === group);
    const fallbackCoverage = groupSignals.length
      ? Math.round((groupSignals.reduce((sum, signal) => sum + signal.confidence, 0) / groupSignals.length) * 100)
      : 0;
    return {
      id: group,
      label: meta.label,
      color: meta.color,
      coverage: (coverage || fallbackCoverage) / 100,
    };
  });
}

function augmentSourceLanes(
  lanes: SourceLane[],
  socialLinksText: string,
  uploadedSources: BrandVaultUploadSourceEvidence[],
  snapshot: BrandVaultSnapshot,
): SourceLane[] {
  if (snapshot.job) return lanes;
  const socialCount = parseSocialLinks(socialLinksText).length;
  return lanes.map((lane) => {
    if (lane.id === 'socials') return { ...lane, count: socialCount, status: 'pending' };
    if (lane.id === 'uploads') return { ...lane, count: uploadedSources.length, status: 'mocked' };
    return lane;
  });
}

function conflictToConstellation(conflict: SignalConflict) {
  const source = conflict.candidates[0]?.sourceType.replace(/_/g, ' ') ?? 'source';
  return {
    facetId: conflict.group,
    label: source,
    sourceLabel: `${conflict.candidates[0]?.authorityClass ?? 'untrusted'} / review`,
    detail: 'conflicts',
  };
}

function createSourceEvidence(
  websiteUrl: string,
  sourceNotes: string,
  uploadedSources: BrandVaultUploadSourceEvidence[],
): BrandVaultSourceInput[] {
  const uploadedNames = new Set(uploadedSources.map((source) => source.name.toLowerCase()));
  const websiteSeed: BrandVaultSourceInput = {
    kind: 'crawl_seed',
    url: websiteUrl,
    platform: 'website',
    note: 'Root domain for deeper brand evidence crawl.',
    evidenceOrigin: 'user_supplied',
  };
  const uploadedEvidence: BrandVaultSourceInput[] = uploadedSources.map((source) => ({
    ...source,
    evidenceOrigin: 'user_supplied',
  }));
  const manualSources: BrandVaultSourceInput[] = parseSourceNotes(sourceNotes)
    .filter((name) => !uploadedNames.has(name.toLowerCase()))
    .map((name) => ({
      kind: inferSourceKind(name),
      name,
      note: 'User-supplied brand source staged for evidence review.',
      evidenceOrigin: 'user_supplied',
    }));
  return [websiteSeed, ...uploadedEvidence, ...manualSources].slice(0, 30);
}

function parseSourceNotes(value: string): string[] {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function inferSourceKind(name: string): BrandVaultSourceInput['kind'] {
  return /\.(pdf|docx?|pptx?|txt|md|markdown|csv|json)$/i.test(name) ? 'uploaded_guideline' : 'uploaded_asset';
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

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

const baseStyles = `
.bv-c1-topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 14px;
  height: 56px;
  padding: 0 24px;
  border-bottom: 1px solid #1C1B19;
  background: rgba(11, 11, 10, 0.82);
  backdrop-filter: blur(10px);
}
.bv-c1-dots {
  display: flex;
  gap: 6px;
}
.bv-c1-dots i {
  width: 8px;
  height: 8px;
  border-radius: 4px;
  border: 1px solid #282724;
}
.bv-c1-wordmark {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.bv-c1-context {
  color: #7A776E;
  font-size: 13px;
}
.bv-c1-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 6px 11px;
  border-radius: 5px;
  border: 1px solid rgba(212, 166, 82, 0.25);
  background: rgba(212, 166, 82, 0.08);
  color: #D4A652;
  transition: all 0.4s cubic-bezier(.16,1,.3,1);
}
.bv-c1-pill.clear {
  border-color: rgba(94, 201, 126, 0.3);
  background: rgba(94, 201, 126, 0.08);
  color: #5EC97E;
}
.bv-c1-primary,
.bv-c1-button,
.bv-c1-icon-button {
  font-family: inherit;
  border-radius: 7px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  transition: all 0.2s cubic-bezier(.16,1,.3,1);
}
.bv-c1-primary {
  min-height: 34px;
  padding: 8px 13px;
  border: 1px solid #D4A652;
  background: #D4A652;
  color: #0B0B0A;
  font-size: 12px;
  font-weight: 800;
}
.bv-c1-button {
  min-height: 32px;
  padding: 7px 12px;
  border: 1px solid #1C1B19;
  background: #1B1A18;
  color: #ECE9E1;
  font-size: 12px;
  font-weight: 500;
}
.bv-c1-button.danger {
  color: #D46A5C;
  border-color: rgba(212, 106, 92, 0.3);
  background: transparent;
}
.bv-c1-icon-button {
  width: 32px;
  min-height: 32px;
  border: 1px solid #1C1B19;
  background: #1B1A18;
  color: #7A776E;
}
.bv-c1-primary:hover,
.bv-c1-button:hover,
.bv-c1-icon-button:hover {
  border-color: #282724;
  transform: translateY(-1px);
}
.bv-c1-primary:disabled,
.bv-c1-button:disabled,
.bv-c1-icon-button:disabled,
.bv-c1-input:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}
.bv-c1-input {
  border: 1px solid #1C1B19;
  border-radius: 8px;
  background: #131312;
  color: #ECE9E1;
  padding: 10px 12px;
  font: inherit;
  font-size: 13px;
  outline: none;
}
.bv-c1-input:focus-visible,
.bv-c1-button:focus-visible,
.bv-c1-primary:focus-visible,
.bv-c1-icon-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(212, 166, 82, 0.25);
}
.bv-c1-mono {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #5F5E5A;
}
.bv-c1-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-radius: 10px;
  border: 1px solid #282724;
  background: #131312;
  color: #ECE9E1;
  font-size: 13px;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 40px);
  transition: opacity 0.35s cubic-bezier(.16,1,.3,1), transform 0.35s cubic-bezier(.16,1,.3,1);
}
.bv-c1-toast.show {
  opacity: 1;
  transform: translate(-50%, 0);
}
.bv-c1-toast.good svg {
  color: #5EC97E;
}
.bv-c1-toast.warn svg {
  color: #D4A652;
}
.bv-c1-toast.risk svg {
  color: #D46A5C;
}
@media (max-width: 860px) {
  .bv-c1-topbar {
    height: auto;
    align-items: flex-start;
    flex-wrap: wrap;
    padding: 12px 16px;
  }
  .bv-c1-topbar .flex-1 {
    display: none;
  }
  main {
    padding-left: 16px !important;
    padding-right: 16px !important;
  }
}
`;
