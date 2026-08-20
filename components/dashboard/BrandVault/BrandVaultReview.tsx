'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  extractBrandVaultUploadEvidence,
  type BrandVaultUploadSourceEvidence,
} from '@/lib/frontend/services/brand-vault-upload-extraction';
import { useActiveBrand } from '@/components/dashboard/ActiveBrand/ActiveBrandProvider';
import { BrandHero } from './BrandHero';
import { SourceStrip } from './SourceStrip';
import { BrandVaultStats } from './BrandVaultStats';
import { ConflictCard } from './ConflictCard';
import { SignalTable } from './SignalTable';
import { BrandVisualBoard } from './BrandVisualBoard';
import { ProductUiPanel } from './ProductUiPanel';
import { BrandScanReveal } from './BrandScanReveal';
import { BrandManagerPanel } from './BrandManagerPanel';
import {
  buildIntakeGuidance,
  buildSourceLanes,
  collectSignals,
  coveragePercent,
  EMPTY_SNAPSHOT,
  formatValue,
  groupConflicts,
  groupMeta,
  isBrandVaultScanActive,
  mergeSnapshot,
  parseSocialLinks,
  profileBrandName,
  summarize,
} from './brand-vault-data';
import type { BrandVaultIntakeGuidance } from './brand-vault-data';
import type {
  BrandConstellationFacet,
  BrandVaultSignalGroup,
  BrandVaultSnapshot,
  BrandVaultSourceInput,
  CreateBrandVaultDraftInput,
  SignalRow,
  SourceLane,
} from './brand-vault-types';
import {
  useAcceptedBrandVaultBrands,
  useBrandVaultJob,
  useBrandVaultMutations,
  useBrandVaultProfile,
  useBrandVaultScans,
  useDeleteBrandVaultScan,
  useLatestAcceptedBrandVaultRecordId,
} from './useBrandVault';

type ToastTone = 'good' | 'warn' | 'risk';
type UploadStatus = 'idle' | 'extracting';
type DomainVerificationRequestStatus = 'idle' | 'loading' | 'checking';

interface DomainVerificationState {
  host: string;
  recordName: string;
  recordType: 'TXT';
  recordValue: string;
  token: string;
  status?: 'pending' | 'verified' | 'error';
  verified?: boolean;
  checkedAt?: string;
  observedRecordValues?: string[];
  error?: string;
}

const BRAND_GROUPS: BrandVaultSignalGroup[] = [
  'identity',
  'palette',
  'typography',
  'visual',
  'motion',
  'voice',
];

const SOCIAL_PLATFORM_META = [
  { id: 'youtube', label: 'YouTube', color: '#FF4D4D', pattern: /(?:youtube\.com|youtu\.be)/i },
  { id: 'instagram', label: 'Instagram', color: '#D088B4', pattern: /instagram\.com/i },
  { id: 'tiktok', label: 'TikTok', color: '#5CB8CC', pattern: /tiktok\.com/i },
  { id: 'x', label: 'X', color: '#8FB7FF', pattern: /(?:twitter\.com|x\.com)/i },
  { id: 'linkedin', label: 'LinkedIn', color: '#5EA8D4', pattern: /linkedin\.com/i },
  { id: 'facebook', label: 'Facebook', color: '#6F8FFF', pattern: /(?:facebook\.com|fb\.com)/i },
  { id: 'github', label: 'GitHub', color: '#E6EDF3', pattern: /github\.com/i },
  { id: 'reddit', label: 'Reddit', color: '#D46A5C', pattern: /reddit\.com/i },
  { id: 'discord', label: 'Discord', color: '#9088D4', pattern: /discord\.(?:com|gg)/i },
] as const;

const GENERIC_SOCIAL_META = { id: 'website', label: 'Website', color: '#D4A652' } as const;
const NEW_CLIENT_TARGET_VALUE = '__brand_vault_new_client__';
const BRAND_VAULT_UPLOAD_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.markdown,.csv,.json,.html,.htm,.css,.svg,image/*';

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
  const [activeGuidanceWorkflow, setActiveGuidanceWorkflow] = useState<string | null>(null);
  const [domainVerification, setDomainVerification] = useState<DomainVerificationState | null>(null);
  const [domainVerificationStatus, setDomainVerificationStatus] = useState<DomainVerificationRequestStatus>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [confirmedSignalPaths, setConfirmedSignalPaths] = useState<Set<string>>(() => new Set());
  const [deferredConflictPaths, setDeferredConflictPaths] = useState<Set<string>>(() => new Set());
  const [resolvingConflictPath, setResolvingConflictPath] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [newClientMode, setNewClientMode] = useState(false);
  const [newClientBrandId, setNewClientBrandId] = useState<string | null>(null);
  const [pendingBrandActivationId, setPendingBrandActivationId] = useState<string | null>(null);
  const [showSignals, setShowSignals] = useState(false);
  const [signalEdits, setSignalEdits] = useState<Record<string, unknown>>({});

  const { brands: brandOptions, activeBrandId, activeBrand, setActiveBrandId, isLoading: activeBrandLoading } = useActiveBrand();
  const workspaceBrandId = newClientMode ? null : activeBrandId;
  const previousWorkspaceBrandIdRef = useRef<string | null | undefined>(undefined);

  const jobQuery = useBrandVaultJob(jobId);
  const profileQuery = useBrandVaultProfile(profileId);
  const { createDraft, acceptDraft, rejectDraft, saveDraftReview } = useBrandVaultMutations();
  const latestAccepted = useLatestAcceptedBrandVaultRecordId(workspaceBrandId);
  const acceptedBrands = useAcceptedBrandVaultBrands();
  const brandScans = useBrandVaultScans(workspaceBrandId);
  const deleteScan = useDeleteBrandVaultScan();
  const guidanceUploadInputRef = useRef<HTMLInputElement | null>(null);
  const signalTableRef = useRef<HTMLDivElement | null>(null);
  const decisionControlsRef = useRef<HTMLDivElement | null>(null);
  const conflictRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // A first-time account has no existing client to accidentally overwrite. Treat that as an explicit
    // new-client workspace, rather than inventing a selected brand from the first list item.
    if (!activeBrandLoading && brandOptions.length === 0 && !activeBrandId) {
      setNewClientMode(true);
    }
  }, [activeBrandId, activeBrandLoading, brandOptions.length]);

  useEffect(() => {
    if (!pendingBrandActivationId || !brandOptions.some((brand) => brand.brandId === pendingBrandActivationId)) return;
    // The provider validates selections against its loaded list. Wait until acceptance has refreshed that
    // list, then activate the new client without ever writing an unverified brand id to global storage.
    previousWorkspaceBrandIdRef.current = pendingBrandActivationId;
    setActiveBrandId(pendingBrandActivationId);
    setNewClientMode(false);
    setNewClientBrandId(null);
    setPendingBrandActivationId(null);
  }, [brandOptions, pendingBrandActivationId, setActiveBrandId]);

  useEffect(() => {
    const previousBrandId = previousWorkspaceBrandIdRef.current;
    if (previousBrandId === undefined) {
      previousWorkspaceBrandIdRef.current = workspaceBrandId;
      return;
    }
    if (newClientMode || previousBrandId === workspaceBrandId) return;

    // A selection made through the shared dashboard switcher must clear this page's old job/profile
    // state before the scoped accepted-profile query resolves for the newly selected client.
    previousWorkspaceBrandIdRef.current = workspaceBrandId;
    setSnapshot(EMPTY_SNAPSHOT);
    setWebsiteUrl('');
    setCompanyName('');
    setSocialLinksText('');
    setSourceNotes('');
    setLookupId('');
    setRejectReason('');
    setUploadedSources([]);
    setUploadWarnings([]);
    setDomainVerification(null);
    setJobId(null);
    setProfileId(null);
    setConfirmedSignalPaths(new Set());
    setDeferredConflictPaths(new Set());
    setResolvingConflictPath(null);
    setActiveGuidanceWorkflow(null);
    setSignalEdits({});
    setShowSignals(false);
    setLocalError(null);
  }, [newClientMode, workspaceBrandId]);

  useEffect(() => {
    if (!jobQuery.data) return;
    setSnapshot((current) => mergeSnapshot(current, jobQuery.data));
  }, [jobQuery.data]);

  useEffect(() => {
    if (!profileQuery.data) return;
    setSnapshot((current) => mergeSnapshot(current, profileQuery.data));
  }, [profileQuery.data]);

  useEffect(() => {
    const decisions = snapshot.record?.status === 'draft' ? snapshot.record.review.decisions : undefined;
    setSignalEdits(Object.fromEntries((decisions?.signalEdits ?? []).map((edit) => [edit.path, edit.value])));
    setConfirmedSignalPaths(new Set(decisions?.confirmedSignalPaths ?? []));
    setDeferredConflictPaths(new Set(decisions?.deferredConflictPaths ?? []));
  }, [snapshot.record?.id, snapshot.record?.updatedAt]);

  // Fresh visit (no in-session scan/draft): load the user's saved accepted vault so the tab shows
  // it instead of the build screen. Reuses the by-id load path via setProfileId.
  useEffect(() => {
    const recordId = latestAccepted.data;
    if (workspaceBrandId && recordId && !jobId && !profileId) setProfileId(recordId);
  }, [jobId, latestAccepted.data, profileId, workspaceBrandId]);

  // After switching brands the website field is empty, so "Rescan" has nothing to scan. Seed it from the
  // brand's most recent scan so rescan works without retyping. Only fills an empty field — never clobbers
  // what the user typed (guard on websiteUrl), and the guard also stops any set/re-run loop.
  useEffect(() => {
    if (websiteUrl.trim()) return;
    const latestScanUrl = brandScans.data?.find((scan) => scan.websiteUrl)?.websiteUrl;
    if (latestScanUrl) setWebsiteUrl(latestScanUrl);
  }, [brandScans.data, websiteUrl]);

  // Same for social links. On brand switch the socials field is blank, and a rescan with empty socials
  // DROPS the brand's social evidence entirely (the scan gates connected-account evidence on a non-empty
  // socialLinks list). Seed it from the most recent scan that actually HAD socials — skipping an empty
  // website-only rescan — so Rescan re-pulls them. Only fills an empty field (guard also stops re-run loops).
  useEffect(() => {
    if (socialLinksText.trim()) return;
    const priorSocials = brandScans.data?.find((scan) => scan.socialLinks.length > 0)?.socialLinks;
    if (priorSocials?.length) setSocialLinksText(priorSocials.join('\n'));
  }, [brandScans.data, socialLinksText]);

  const signals = useMemo(() => collectSignals(snapshot.record?.profile), [snapshot.record]);
  const editedSignals = useMemo(() => applySignalEditsToRows(signals, signalEdits), [signalEdits, signals]);
  const editedSignalCount = Object.keys(signalEdits).length;
  const allConflicts = useMemo(() => groupConflicts(snapshot.candidates), [snapshot.candidates]);
  const resolvedConflictPaths = useMemo(
    () => new Set([...Object.keys(signalEdits), ...confirmedSignalPaths, ...deferredConflictPaths]),
    [confirmedSignalPaths, deferredConflictPaths, signalEdits],
  );
  const activeConflicts = useMemo(
    () =>
      allConflicts.filter(
        (conflict) => !resolvedConflictPaths.has(conflict.path) && conflict.path !== resolvingConflictPath,
      ),
    [allConflicts, resolvedConflictPaths, resolvingConflictPath],
  );
  const displayedConflict = useMemo(
    () =>
      resolvingConflictPath
        ? allConflicts.find((conflict) => conflict.path === resolvingConflictPath) ?? null
        : activeConflicts[0] ?? null,
    [activeConflicts, allConflicts, resolvingConflictPath],
  );
  const summary = useMemo(() => summarize(editedSignals, activeConflicts, snapshot), [activeConflicts, editedSignals, snapshot]);
  const sourceLanes = useMemo(
    () => augmentSourceLanes(buildSourceLanes(snapshot), socialLinksText, uploadedSources, snapshot),
    [snapshot, socialLinksText, uploadedSources],
  );
  const intakeGuidance = useMemo(
    () => buildIntakeGuidance(snapshot, sourceLanes),
    [snapshot, sourceLanes],
  );
  const brandName = profileBrandName(snapshot);
  const facets = useMemo(() => buildFacets(snapshot, editedSignals), [editedSignals, snapshot]);
  const canReview = Boolean(snapshot.record?.id && snapshot.record.status === 'draft');
  const scanBusy = isBrandVaultScanActive(snapshot.job, createDraft.isPending);
  const isScanning = scanBusy;
  const busy =
    scanBusy ||
    acceptDraft.isPending ||
    rejectDraft.isPending ||
    saveDraftReview.isPending ||
    profileQuery.isFetching ||
    uploadStatus === 'extracting';
  const currentError =
    localError ??
    errorMessage(createDraft.error) ??
    errorMessage(acceptDraft.error) ??
    errorMessage(rejectDraft.error) ??
    errorMessage(saveDraftReview.error) ??
    errorMessage(jobQuery.error) ??
    errorMessage(profileQuery.error) ??
    errorMessage(latestAccepted.error) ??
    errorMessage(acceptedBrands.error) ??
    errorMessage(deleteScan.error);
  const statusLabel = snapshot.record?.status ?? snapshot.job?.status ?? 'draft';
  const needsCount = activeConflicts.length;
  const scanWebsiteUrl = websiteUrl.trim() || snapshot.job?.inputs.websiteUrl?.trim() || snapshot.reviewPayload?.normalizedUrl?.trim() || '';
  const activeBrandName = newClientMode ? 'New client' : activeBrand?.name ?? 'Choose a client';
  const canRescanWithEvidence = Boolean(scanWebsiteUrl) && !busy;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleCreateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createDraftFromCurrentInputs();
  }

  async function createDraftFromCurrentInputs() {
    const cleanUrl = scanWebsiteUrl;
    if (!cleanUrl) {
      setLocalError('Enter a client website before scanning.');
      return;
    }
    let scanBrandId = workspaceBrandId;
    if (newClientMode) {
      scanBrandId = newClientBrandId ?? `brand_${crypto.randomUUID()}`;
      if (!newClientBrandId) setNewClientBrandId(scanBrandId);
    }
    if (!scanBrandId) {
      setLocalError('Choose an existing client or start a new client before scanning.');
      return;
    }

    setLocalError(null);
    const input: CreateBrandVaultDraftInput = {
      brandId: scanBrandId,
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
    setConfirmedSignalPaths(new Set());
    setDeferredConflictPaths(new Set());
    setResolvingConflictPath(null);
    setSignalEdits({});
    const resultStillScanning = result.job?.status === 'queued' || result.job?.status === 'running';
    showToast(resultStillScanning ? 'Scan queued. Results will appear here.' : 'Draft ready for review.', 'good');
  }

  function handleGuidanceAction(actionId: string) {
    setActiveGuidanceWorkflow(actionId);

    if (actionId === 'verify_domain_access') {
      void requestDomainVerification('instructions');
      return;
    }

    if (actionId === 'add_pinned_posts') {
      showToast('Social link receiver ready.', 'warn');
      return;
    }

    if (actionId === 'add_uploads') {
      guidanceUploadInputRef.current?.click();
      showToast('Brand file picker opened.', 'warn');
      return;
    }

    if (actionId === 'connect_social') {
      if (typeof window !== 'undefined') {
        window.open('/dashboard/uploaderx', '_blank', 'noopener,noreferrer');
      }
      showToast('Opening UploaderX social connections.', 'warn');
      return;
    }

    if (actionId === 'review_candidates') {
      setShowSignals(true);
      requestAnimationFrame(() => signalTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return;
    }

    if (actionId === 'accept_or_reject') {
      decisionControlsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (actionId === 'review_crawl') {
      showToast('Crawl evidence notes are visible below.', 'warn');
    }
  }

  async function requestDomainVerification(action: 'instructions' | 'verify') {
    const cleanUrl = scanWebsiteUrl;
    if (!cleanUrl) {
      setLocalError('Enter a client website before verifying domain access.');
      return;
    }

    setLocalError(null);
    setDomainVerificationStatus(action === 'verify' ? 'checking' : 'loading');
    try {
      const response = await fetch('/api/brand-vault/domain-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ websiteUrl: cleanUrl, action }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; verification: DomainVerificationState }
        | { ok: false; error?: { message?: string } }
        | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload && 'error' in payload ? payload.error?.message ?? 'Domain verification failed.' : 'Domain verification failed.');
      }
      setDomainVerification(payload.verification);
      if (action === 'verify') {
        showToast(payload.verification.verified ? 'Domain TXT record verified.' : 'DNS record not visible yet.', payload.verification.verified ? 'good' : 'warn');
      } else {
        showToast('DNS verification record generated.', 'warn');
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Domain verification failed.');
    } finally {
      setDomainVerificationStatus('idle');
    }
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
    // NOTE: a missing brandId no longer blocks accept — the server mints one (see refinery-api), so even
    // a first-run / pre-mint draft accepts cleanly instead of dead-ending with "rescan".
    const edits = Object.entries(signalEdits).map(([path, value]) => ({ path, value }));
    const result = await acceptDraft.mutateAsync({ recordId: snapshot.record.id, signalEdits: edits });
    setSnapshot((current) => mergeSnapshot(current, result));
    // A new client becomes globally selectable only after the provider has received the refreshed,
    // server-authorized brand list. Existing-client acceptance leaves the current selection intact.
    const acceptedBrandId = result.record?.profile?.brandId;
    if (acceptedBrandId && newClientMode) {
      setPendingBrandActivationId(acceptedBrandId);
    }
    setSignalEdits({});
    setConfirmedSignalPaths(new Set());
    setDeferredConflictPaths(new Set());
    showToast(edits.length ? `Profile accepted with ${edits.length} user edit${edits.length === 1 ? '' : 's'}.` : 'Profile accepted as brand truth.', 'good');
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

  async function persistDraftReview(
    nextSignalEdits: Record<string, unknown>,
    nextConfirmedSignalPaths: Set<string>,
    nextDeferredConflictPaths: Set<string>,
  ): Promise<void> {
    const record = snapshot.record;
    if (!record?.id || record.status !== 'draft') {
      const message = 'Open a draft before saving review decisions.';
      setLocalError(message);
      throw new Error(message);
    }

    setLocalError(null);
    const result = await saveDraftReview.mutateAsync({
      recordId: record.id,
      expectedUpdatedAt: record.updatedAt,
      signalEdits: Object.entries(nextSignalEdits).map(([path, value]) => ({ path, value })),
      confirmedSignalPaths: [...nextConfirmedSignalPaths],
      deferredConflictPaths: [...nextDeferredConflictPaths],
    });
    if (!result.record) {
      const message = 'Brand Vault did not return the saved draft.';
      setLocalError(message);
      throw new Error(message);
    }

    setSnapshot((current) => mergeSnapshot(current, result));
    const decisions = result.record.review.decisions;
    setSignalEdits(Object.fromEntries((decisions?.signalEdits ?? []).map((edit) => [edit.path, edit.value])));
    setConfirmedSignalPaths(new Set(decisions?.confirmedSignalPaths ?? []));
    setDeferredConflictPaths(new Set(decisions?.deferredConflictPaths ?? []));
  }

  async function resolveConflict(path: string, value: unknown) {
    setResolvingConflictPath(path);
    try {
      await persistDraftReview(
        { ...signalEdits, [path]: value },
        confirmedSignalPaths,
        deferredConflictPaths,
      );
      showToast(`Saved ${formatValue(value)}.`, 'good');
      window.setTimeout(() => setResolvingConflictPath(null), 650);
    } catch (error) {
      setResolvingConflictPath(null);
      setLocalError(errorMessage(error) ?? 'Could not save that choice.');
    }
  }

  async function deferConflict(path: string) {
    setResolvingConflictPath(path);
    try {
      const nextDeferredConflictPaths = new Set(deferredConflictPaths);
      nextDeferredConflictPaths.add(path);
      await persistDraftReview(signalEdits, confirmedSignalPaths, nextDeferredConflictPaths);
      showToast('Marked this conflict to revisit later.', 'warn');
      window.setTimeout(() => setResolvingConflictPath(null), 650);
    } catch (error) {
      setResolvingConflictPath(null);
      setLocalError(errorMessage(error) ?? 'Could not save that review choice.');
    }
  }

  async function confirmSignal(path: string) {
    if (confirmedSignalPaths.has(path)) return;
    const nextConfirmedSignalPaths = new Set(confirmedSignalPaths);
    nextConfirmedSignalPaths.add(path);
    await persistDraftReview(signalEdits, nextConfirmedSignalPaths, deferredConflictPaths);
    showToast('Saved confirmation.', 'good');
  }

  async function editSignalValue(path: string, value: unknown) {
    await persistDraftReview(
      { ...signalEdits, [path]: value },
      confirmedSignalPaths,
      deferredConflictPaths,
    );
    showToast('Saved edit.', 'good');
  }

  function showToast(message: string, tone: ToastTone) {
    setToast({ message, tone });
  }

  // Clear the whole review workspace back to a fresh scan/create state (shared by brand switch + new client).
  function resetWorkspaceState() {
    setSnapshot(EMPTY_SNAPSHOT);
    setWebsiteUrl('');
    setCompanyName('');
    setSocialLinksText('');
    setSourceNotes('');
    setLookupId('');
    setRejectReason('');
    setUploadedSources([]);
    setUploadWarnings([]);
    setDomainVerification(null);
    setJobId(null);
    setProfileId(null);
    setConfirmedSignalPaths(new Set());
    setDeferredConflictPaths(new Set());
    setResolvingConflictPath(null);
    setActiveGuidanceWorkflow(null);
    setSignalEdits({});
    setShowSignals(false);
    setLocalError(null);
  }

  function selectActiveBrand(nextBrandId: string) {
    const cleanBrandId = nextBrandId.trim();
    if (!cleanBrandId || (!newClientMode && cleanBrandId === activeBrandId)) return;
    previousWorkspaceBrandIdRef.current = cleanBrandId;
    setNewClientMode(false);
    setNewClientBrandId(null);
    setActiveBrandId(cleanBrandId);
    resetWorkspaceState();
  }

  // New-client setup is local to Brand Vault until acceptance. It must never overwrite the globally
  // selected client or persist an unknown brand id before the backend creates accepted brand truth.
  function scanNewClient() {
    previousWorkspaceBrandIdRef.current = null;
    setNewClientMode(true);
    setNewClientBrandId(null);
    resetWorkspaceState();
    showToast('New client started. Add a website and scan.', 'good');
  }

  // Reload a scan from the brand's history by its job id (never shown to the user) into the review pane.
  function openScan(scanJobId: string) {
    const id = scanJobId.trim();
    if (!id) return;
    setLocalError(null);
    setProfileId(null);
    setConfirmedSignalPaths(new Set());
    setDeferredConflictPaths(new Set());
    setResolvingConflictPath(null);
    setSignalEdits({});
    setLookupId(id);
    if (id === jobId) {
      void jobQuery.refetch();
      showToast('Reloaded scan.', 'good');
      return;
    }
    setJobId(id);
    showToast('Opening scan.', 'warn');
  }

  // Only wait for an accepted profile after an explicit client selection. A fresh or new-client workspace
  // is intentionally blank, never populated by another client's globally latest profile.
  const bootstrappingVault =
    activeBrandLoading ||
    Boolean(workspaceBrandId && (latestAccepted.isLoading || (latestAccepted.data && !snapshot.record)));
  if (bootstrappingVault) {
    return (
      <>
        <style>{baseStyles}</style>
        <div style={{ minHeight: '100vh', background: '#0B0B0A', color: '#ECE9E1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: '#D4A652' }} />
        </div>
      </>
    );
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
          {!activeBrandLoading && (
            <select
              aria-label="Brand scan target"
              className="bv-c1-input h-9 w-[220px] py-0"
              value={newClientMode ? NEW_CLIENT_TARGET_VALUE : activeBrandId ?? ''}
              disabled={busy}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (nextValue === NEW_CLIENT_TARGET_VALUE) {
                  scanNewClient();
                  return;
                }
                if (nextValue) selectActiveBrand(nextValue);
              }}
            >
              <option value="" disabled>Choose a client</option>
              <option value={NEW_CLIENT_TARGET_VALUE}>New client</option>
              {brandOptions.map((option) => (
                <option key={option.brandId} value={option.brandId}>
                  {option.name}
                </option>
              ))}
            </select>
          )}
          <span className="bv-c1-context">
            Client: {activeBrandName} | Profile: {brandName} | Status: {statusLabel}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className={`bv-c1-pill ${needsCount === 0 ? 'clear' : ''}`}
            style={{ cursor: needsCount === 0 ? 'default' : 'pointer' }}
            title={needsCount === 0 ? 'No conflicts to resolve' : 'Jump to what needs your review'}
            aria-label={needsCount === 0 ? 'All conflicts resolved' : `${needsCount} item${needsCount === 1 ? '' : 's'} need your review, jump to them`}
            onClick={() => {
              if (needsCount === 0) return;
              conflictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          >
            {needsCount === 0 ? <Check size={13} /> : <AlertTriangle size={13} />}
            {needsCount === 0 ? 'all clear' : `${needsCount} needs you`}
          </button>
          {snapshot.record?.status === 'accepted' ? (
            <span className="bv-c1-pill clear" title="This profile is saved as your accepted brand truth">
              <Check size={13} /> Accepted
            </span>
          ) : (
            <button type="button" className="bv-c1-primary" disabled={!canReview || busy} onClick={acceptProfile}>
              {acceptDraft.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {editedSignalCount ? `Accept profile (${editedSignalCount})` : 'Accept profile'}
            </button>
          )}
        </header>

        {isScanning ? (
          <BrandScanReveal label={scanWebsiteUrl || brandName} />
        ) : (
          <>
        <BrandHero
          brandName={brandName}
          signals={editedSignals}
          visualIdentity={snapshot.reviewPayload?.visualIdentity ?? null}
          facets={facets}
          conflict={displayedConflict ? { label: displayedConflict.label } : null}
        />

        <main className="mx-auto max-w-[1180px] px-5 sm:px-10">
          <input
            ref={guidanceUploadInputRef}
            type="file"
            multiple
            accept={BRAND_VAULT_UPLOAD_ACCEPT}
            onChange={handleUploadFiles}
            disabled={busy}
            className="hidden"
          />
          {canReview && (
            <div className="mt-5 flex items-center gap-2.5 rounded-[10px] border border-[rgba(212,166,82,0.3)] bg-[rgba(212,166,82,0.08)] px-4 py-3 text-[13px] text-[#D4A652]">
              <AlertTriangle size={15} className="flex-none" />
              <span>
                You&apos;re reviewing a <strong>new scan draft</strong>. It is not your accepted brand yet. Check the details below, then hit <strong>Accept profile</strong> to make it your brand memory.
              </span>
            </div>
          )}
          {snapshot.reviewPayload && (
            <BrandVisualBoard visualIdentity={snapshot.reviewPayload.visualIdentity ?? null} />
          )}
          <ProductUiPanel model={snapshot.record?.profile?.productUiModel ?? null} />
          <SourceStrip lanes={sourceLanes} />
          <IntakeGuidancePanel
            guidance={intakeGuidance}
            activeWorkflow={activeGuidanceWorkflow}
            busy={busy}
            scanBusy={scanBusy}
            socialLinksText={socialLinksText}
            uploadStatus={uploadStatus}
            uploadedSourceCount={uploadedSources.length}
            canRescan={canRescanWithEvidence}
            domainVerification={domainVerification}
            domainVerificationStatus={domainVerificationStatus}
            onAction={handleGuidanceAction}
            onSocialLinksTextChange={setSocialLinksText}
            onUploadClick={() => guidanceUploadInputRef.current?.click()}
            onVerifyDomain={() => void requestDomainVerification('verify')}
            onRescan={() => void createDraftFromCurrentInputs()}
            onClearWorkflow={() => setActiveGuidanceWorkflow(null)}
          />
          <BrandVaultStats summary={summary} />

          <BrandManagerPanel
            brands={brandOptions}
            acceptedSummaries={acceptedBrands.data ?? []}
            activeBrandId={workspaceBrandId}
            scans={brandScans.data ?? []}
            scansLoading={brandScans.isLoading}
            scansError={errorMessage(brandScans.error)}
            busy={busy}
            canRescan={Boolean(workspaceBrandId) && canRescanWithEvidence}
            onSelectBrand={selectActiveBrand}
            onRescan={() => void createDraftFromCurrentInputs()}
            onScanNew={scanNewClient}
            onOpenScan={openScan}
            onDeleteScan={(jobId) => {
              if (workspaceBrandId) void deleteScan.mutateAsync({ brandId: workspaceBrandId, jobId }).catch(() => undefined);
            }}
            deletingJobId={deleteScan.isPending ? deleteScan.variables?.jobId ?? null : null}
          />

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
              scanBusy={scanBusy}
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

          <div ref={conflictRef}>
            <ConflictCard
              conflict={displayedConflict}
              resolved={Boolean(resolvingConflictPath)}
              disabled={busy || Boolean(resolvingConflictPath)}
              onAccept={(path, value) => void resolveConflict(path, value)}
              onEdit={(path) => {
                setShowSignals(true);
                showToast('Open this detail in the table to edit it.', 'warn');
                requestAnimationFrame(() => signalTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
              }}
              onReject={(path) => void deferConflict(path)}
            />
          </div>

          <div ref={signalTableRef} className="mt-2">
            <button
              type="button"
              onClick={() => setShowSignals((value) => !value)}
              aria-expanded={showSignals}
              className="flex w-full items-center justify-between rounded-[10px] border border-[#1C1B19] bg-[#0F0F0E] px-4 py-3 text-left transition hover:border-[#282724]"
            >
              <span>
                <span className="block font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.18em] text-[#7A776E]">
                  All your brand details
                </span>
                <span className="mt-0.5 block text-[12px] text-[#5F5E5A]">
                  {editedSignals.length} details · expand to review
                </span>
              </span>
              {showSignals ? (
                <ChevronUp size={16} className="flex-none text-[#7A776E]" />
              ) : (
                <ChevronDown size={16} className="flex-none text-[#7A776E]" />
              )}
            </button>
            {showSignals && (
              <div className="mt-4">
                <SignalTable
                  signals={editedSignals}
                  editedValues={signalEdits}
                  confirmedSignalPaths={[...confirmedSignalPaths]}
                  disabled={!canReview || busy}
                  onAccept={confirmSignal}
                  onEdit={editSignalValue}
                />
              </div>
            )}
          </div>

          <footer className="py-10 pb-[72px] text-center">
            {snapshot.record?.status === 'draft' && (
              <div ref={decisionControlsRef} className="flex flex-wrap items-center justify-center gap-2.5">
                <input
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Reason (only if you reject this)"
                  className="bv-c1-input w-[280px]"
                  disabled={!canReview}
                />
                <button type="button" className="bv-c1-button danger" disabled={!canReview || busy} onClick={rejectProfile}>
                  <X size={14} /> Reject
                </button>
              </div>
            )}
          </footer>
        </main>
          </>
        )}

        <div className={`bv-c1-toast ${toast ? 'show' : ''} ${toast?.tone ?? 'good'}`}>
          <Check size={15} />
          <span>{toast?.message ?? 'Resolved'}</span>
        </div>
      </div>
    </>
  );
}

interface IntakeGuidancePanelProps {
  guidance: BrandVaultIntakeGuidance;
  activeWorkflow: string | null;
  busy: boolean;
  scanBusy: boolean;
  socialLinksText: string;
  uploadStatus: UploadStatus;
  uploadedSourceCount: number;
  canRescan: boolean;
  domainVerification: DomainVerificationState | null;
  domainVerificationStatus: DomainVerificationRequestStatus;
  onAction: (actionId: string) => void;
  onSocialLinksTextChange: (value: string) => void;
  onUploadClick: () => void;
  onVerifyDomain: () => void;
  onRescan: () => void;
  onClearWorkflow: () => void;
}

function IntakeGuidancePanel({
  guidance,
  activeWorkflow,
  busy,
  scanBusy,
  socialLinksText,
  uploadStatus,
  uploadedSourceCount,
  canRescan,
  domainVerification,
  domainVerificationStatus,
  onAction,
  onSocialLinksTextChange,
  onUploadClick,
  onVerifyDomain,
  onRescan,
  onClearWorkflow,
}: IntakeGuidancePanelProps) {
  if (guidance.actions.length === 0 && guidance.lanes.length === 0) return null;

  const socialLinkCount = parseSocialLinks(socialLinksText).length;
  const showSocialWorkflow = activeWorkflow === 'add_pinned_posts' || activeWorkflow === 'connect_social';
  const showUploadWorkflow = activeWorkflow === 'add_uploads';
  const showDomainWorkflow = activeWorkflow === 'verify_domain_access';
  const showWorkflow = showSocialWorkflow || showUploadWorkflow || showDomainWorkflow;

  return (
    <section className="bv-c1-intake-panel" aria-label="Brand Vault intake guidance">
      <div className="bv-c1-intake-column">
        <div className="bv-c1-intake-header">
          <span className="bv-c1-mono">Next actions</span>
          <span>{guidance.actions.length} queued</span>
        </div>
        <div className="bv-c1-intake-list">
          {guidance.actions.length > 0 ? (
            guidance.actions.map((action) => (
              <div key={action.id} className={`bv-c1-intake-action ${action.priority}`}>
                <span>{action.priority}</span>
                <div>
                  <strong>{action.label}</strong>
                  <em>{action.reason}</em>
                </div>
                <button
                  type="button"
                  className="bv-c1-intake-action-button"
                  disabled={busy && isCaptureAction(action.id)}
                  aria-pressed={activeWorkflow === action.id}
                  onClick={() => onAction(action.id)}
                >
                  {guidanceActionButtonLabel(action.id)}
                </button>
              </div>
            ))
          ) : (
            <div className="bv-c1-intake-empty">No follow-up actions from Brand Vault yet.</div>
          )}
        </div>

        {showWorkflow && (
          <div className="bv-c1-intake-workflow">
            <div className="bv-c1-intake-workflow-head">
              <span>
                <strong>{workflowTitle(activeWorkflow)}</strong>
                <em>
                  {showDomainWorkflow
                    ? domainVerification?.host ?? 'DNS proof pending'
                    : showUploadWorkflow
                      ? `${uploadedSourceCount} file${uploadedSourceCount === 1 ? '' : 's'} staged`
                      : `${socialLinkCount}/10 links staged`}
                </em>
              </span>
              <button type="button" className="bv-c1-icon-button" onClick={onClearWorkflow} aria-label="Close intake workflow">
                <X size={13} />
              </button>
            </div>

            {showDomainWorkflow ? (
              <DomainVerificationWorkflow
                verification={domainVerification}
                status={domainVerificationStatus}
                disabled={busy}
                onVerify={onVerifyDomain}
              />
            ) : showUploadWorkflow ? (
              <div className="bv-c1-intake-workflow-body">
                <div className="bv-c1-intake-staged">
                  <FileText size={15} />
                  <span>{uploadStatus === 'extracting' ? 'Reading selected files' : `${uploadedSourceCount} upload sources staged`}</span>
                </div>
                <div className="bv-c1-intake-workflow-actions">
                  <button type="button" className="bv-c1-button" disabled={busy} onClick={onUploadClick}>
                    <Plus size={13} />
                    Choose files
                  </button>
                  <button type="button" className="bv-c1-primary" disabled={!canRescan} onClick={onRescan}>
                    {uploadStatus === 'extracting' || scanBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {uploadStatus === 'extracting' ? 'Reading files' : scanBusy ? 'Scanning site' : 'Refresh draft'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bv-c1-intake-workflow-body">
                <SocialLinksReceiver value={socialLinksText} disabled={busy} onChange={onSocialLinksTextChange} />
                <div className="bv-c1-intake-workflow-actions">
                  {activeWorkflow === 'connect_social' && (
                    <button type="button" className="bv-c1-button" disabled={busy} onClick={() => onAction('connect_social')}>
                      <ExternalLink size={13} />
                      Open UploaderX
                    </button>
                  )}
                  <button type="button" className="bv-c1-primary" disabled={!canRescan} onClick={onRescan}>
                    {scanBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {scanBusy ? 'Scanning site' : 'Refresh draft'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bv-c1-intake-column">
        <div className="bv-c1-intake-header">
          <span className="bv-c1-mono">Evidence notes</span>
          <span>{guidance.lanes.length} lanes</span>
        </div>
        <div className="bv-c1-intake-list">
          {guidance.lanes.map((lane) => (
            <div key={lane.id} className="bv-c1-intake-lane">
              <div>
                <strong>{lane.label}</strong>
                <span>
                  {lane.status.replace('_', ' ')} / {lane.count}
                </span>
              </div>
              {lane.notes.length > 0 && (
                <ul>
                  {lane.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
              {lane.topSignalPaths.length > 0 && (
                <div className="bv-c1-intake-paths">
                  {lane.topSignalPaths.map((path) => (
                    <span key={path}>{path}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {guidance.socialPlatforms.length > 0 && (
            <div className="bv-c1-social-health">
              <div className="bv-c1-social-health-head">
                <strong>Social platform health</strong>
                <span>{guidance.socialPlatforms.length} checked</span>
              </div>
              <div className="bv-c1-social-health-grid">
                {guidance.socialPlatforms.map((platform) => (
                  <div key={platform.platform} className={`bv-c1-social-health-card ${platform.status}`}>
                    <div>
                      <strong>{platform.label}</strong>
                      <span>{platform.rawStatus.replace('_', ' ')}</span>
                    </div>
                    <em>
                      {platform.sourceCount} sources / {platform.postSourceCount} posts / {platform.connectedAccountCount} connected / {platform.publicFallbackPostCount} public
                    </em>
                    {platform.notes.length > 0 && (
                      <ul>
                        {platform.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function guidanceActionButtonLabel(actionId: string): string {
  if (actionId === 'add_pinned_posts') return 'Add links';
  if (actionId === 'add_uploads') return 'Add files';
  if (actionId === 'connect_social') return 'Connect';
  if (actionId === 'verify_domain_access') return 'Verify';
  if (actionId === 'review_candidates') return 'Review';
  if (actionId === 'accept_or_reject') return 'Decide';
  if (actionId === 'review_crawl') return 'Inspect';
  return 'Open';
}

function workflowTitle(actionId: string | null): string {
  if (actionId === 'verify_domain_access') return 'Domain access';
  if (actionId === 'add_uploads') return 'Brand files';
  return 'Pinned posts and profiles';
}

function DomainVerificationWorkflow({
  verification,
  status,
  disabled,
  onVerify,
}: {
  verification: DomainVerificationState | null;
  status: DomainVerificationRequestStatus;
  disabled: boolean;
  onVerify: () => void;
}) {
  const busy = status === 'loading' || status === 'checking';
  return (
    <div className="bv-c1-intake-workflow-body">
      <div className="bv-c1-intake-staged">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
        <span>{verification ? `Add TXT on ${verification.host}` : 'Generating DNS TXT instructions'}</span>
      </div>
      {verification && (
        <div className="bv-c1-domain-proof-grid">
          <label>
            <span>Record name</span>
            <code>{verification.recordName}</code>
          </label>
          <label>
            <span>Type</span>
            <code>{verification.recordType}</code>
          </label>
          <label className="wide">
            <span>TXT value</span>
            <code>{verification.recordValue}</code>
          </label>
          {verification.status && (
            <label>
              <span>Status</span>
              <code>{verification.status}{verification.checkedAt ? ` / ${new Date(verification.checkedAt).toLocaleTimeString()}` : ''}</code>
            </label>
          )}
          {verification.error && (
            <label className="wide">
              <span>DNS note</span>
              <code>{verification.error}</code>
            </label>
          )}
        </div>
      )}
      <div className="bv-c1-intake-workflow-actions">
        <button type="button" className="bv-c1-primary" disabled={disabled || busy || !verification} onClick={onVerify}>
          {status === 'checking' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {status === 'checking' ? 'Checking DNS' : 'Check DNS'}
        </button>
      </div>
    </div>
  );
}

function isCaptureAction(actionId: string): boolean {
  return actionId === 'add_pinned_posts' || actionId === 'add_uploads' || actionId === 'connect_social' || actionId === 'verify_domain_access';
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
  scanBusy: boolean;
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
  uploadedSources,
  uploadWarnings,
  busy,
  scanBusy,
  uploadStatus,
  onWebsiteUrlChange,
  onCompanyNameChange,
  onSocialLinksTextChange,
  onSourceNotesChange,
  onCreateDraft,
  onUploadFiles,
  onRemoveUpload,
}: FastSetupPanelProps) {
  return (
    <section className="mb-10 rounded-[14px] border border-[#1C1B19] bg-[#0F0F0E] p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="bv-c1-mono">Get started</span>
          <h2 className="mt-2 text-[24px] font-extrabold leading-tight tracking-[-0.02em]">
            Add your brand
          </h2>
          <p className="mt-2 max-w-[620px] text-[13px] leading-6 text-[#7A776E]">
            Paste your website, add your social links, and upload any brand files. We&apos;ll build your
            brand profile from them.
          </p>
        </div>
      </div>

      <form onSubmit={onCreateDraft} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className="grid content-start gap-3">
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
          <SocialLinksReceiver
            value={socialLinksText}
            disabled={busy}
            onChange={onSocialLinksTextChange}
          />
        </div>

        <div className="grid content-start gap-3">
          <label className="grid gap-2">
            <span className="bv-c1-mono">Brand files</span>
            <span className="bv-c1-file-picker">
              <input
                type="file"
                multiple
                accept={BRAND_VAULT_UPLOAD_ACCEPT}
                onChange={onUploadFiles}
                disabled={busy}
                className="bv-c1-file-input"
              />
              <span>
                <FileText size={14} />
                Choose brand files
              </span>
              <em>PDF, docs, slides, images, CSS, SVG</em>
            </span>
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
          <button type="submit" className="bv-c1-primary min-h-10 w-full" disabled={busy}>
            {scanBusy || uploadStatus === 'extracting' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {uploadStatus === 'extracting' ? 'Reading files' : scanBusy ? 'Scanning site' : 'Start scan'}
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

function SocialLinksReceiver({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const links = useMemo(() => parseSocialLinks(value), [value]);
  const [draftUrl, setDraftUrl] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const platform = detectSocialPlatform(draftUrl);
  const isEditing = editingIndex !== null;

  function writeLinks(nextLinks: string[]) {
    onChange(uniqueStrings(nextLinks).slice(0, 10).join('\n'));
  }

  function commitDraft() {
    const rawValues = isEditing ? [draftUrl] : parseSocialLinks(draftUrl);
    if (rawValues.length === 0) {
      setError('Paste a social profile or post link first.');
      return;
    }

    const normalized = rawValues.map(normalizeSocialLink).filter((link): link is string => Boolean(link));
    if (normalized.length !== rawValues.length) {
      setError('Use a valid http or https social URL.');
      return;
    }

    if (isEditing) {
      const nextLink = normalized[0];
      if (!nextLink) return;
      const duplicateIndex = links.findIndex((link, index) => link === nextLink && index !== editingIndex);
      if (duplicateIndex !== -1) {
        setError('That link is already staged.');
        return;
      }
      const nextLinks = [...links];
      nextLinks[editingIndex] = nextLink;
      writeLinks(nextLinks);
      setEditingIndex(null);
      setDraftUrl('');
      setError(null);
      return;
    }

    const existing = new Set(links);
    const additions = normalized.filter((link) => !existing.has(link));
    if (additions.length === 0) {
      setError('Those links are already staged.');
      return;
    }
    if (links.length >= 10) {
      setError('Brand Vault can receive up to 10 social links per draft.');
      return;
    }

    const remainingSlots = Math.max(0, 10 - links.length);
    writeLinks([...links, ...additions.slice(0, remainingSlots)]);
    setDraftUrl('');
    setEditingIndex(null);
    setError(additions.length > remainingSlots ? 'Only the first 10 links were staged.' : null);
  }

  function startEdit(index: number) {
    setEditingIndex(index);
    setDraftUrl(links[index] ?? '');
    setError(null);
  }

  function removeLink(index: number) {
    writeLinks(links.filter((_, itemIndex) => itemIndex !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
      setDraftUrl('');
    }
    setError(null);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setDraftUrl('');
    setError(null);
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="bv-c1-mono">Social links</span>
        <span className="bv-c1-social-count">{links.length}/10 staged</span>
      </div>

      <div className="bv-c1-social-panel">
        <div className="bv-c1-social-entry">
          <span
            className="bv-c1-platform-chip"
            style={{
              borderColor: `${platform.color}66`,
              background: `${platform.color}14`,
              color: platform.color,
            }}
          >
            <span style={{ background: platform.color }} />
            {platform.label}
          </span>
          <input
            value={draftUrl}
            onChange={(event) => {
              setDraftUrl(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              commitDraft();
            }}
            placeholder="https://instagram.com/client or https://x.com/client/status/..."
            className="bv-c1-input"
            disabled={disabled}
          />
          <button
            type="button"
            className="bv-c1-button"
            disabled={disabled || !draftUrl.trim()}
            onClick={commitDraft}
          >
            {isEditing ? <Pencil size={13} /> : <Plus size={13} />}
            {isEditing ? 'Update' : 'Add'}
          </button>
          {isEditing && (
            <button type="button" className="bv-c1-icon-button" disabled={disabled} onClick={cancelEdit} aria-label="Cancel social link edit">
              <X size={13} />
            </button>
          )}
        </div>

        {error && <span className="bv-c1-social-error">{error}</span>}

        <div className="bv-c1-social-list">
          {links.length > 0 ? (
            links.map((link, index) => (
              <SocialLinkRow
                key={link}
                link={link}
                index={index}
                disabled={disabled}
                onEdit={startEdit}
                onRemove={removeLink}
              />
            ))
          ) : (
            <div className="bv-c1-social-empty">
              <Link2 size={16} />
              <span>Add profile links, pinned posts, or launch posts for voice and proof evidence.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SocialLinkRow({
  link,
  index,
  disabled,
  onEdit,
  onRemove,
}: {
  link: string;
  index: number;
  disabled: boolean;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const platform = detectSocialPlatform(link);
  return (
    <div className="bv-c1-social-row" style={{ borderLeftColor: platform.color }}>
      <span className="bv-c1-social-platform" style={{ color: platform.color }}>
        {platform.label}
      </span>
      <span className="min-w-0">
        <strong className="block truncate text-[12px] font-semibold text-[#B5B2A8]">{platform.label} evidence</strong>
        <em className="mt-0.5 block truncate text-[10px] not-italic text-[#5F5E5A]">{link}</em>
      </span>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="bv-c1-icon-button"
        aria-label={`Open ${platform.label} link`}
      >
        <ExternalLink size={13} />
      </a>
      <button type="button" className="bv-c1-icon-button" disabled={disabled} onClick={() => onEdit(index)} aria-label={`Edit ${platform.label} link`}>
        <Pencil size={13} />
      </button>
      <button type="button" className="bv-c1-icon-button" disabled={disabled} onClick={() => onRemove(index)} aria-label={`Remove ${platform.label} link`}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function applySignalEditsToRows(signals: SignalRow[], edits: Record<string, unknown>): SignalRow[] {
  if (Object.keys(edits).length === 0) return signals;
  return signals.map((signal) => {
    if (!Object.prototype.hasOwnProperty.call(edits, signal.path)) return signal;
    return {
      ...signal,
      value: edits[signal.path],
      confidence: Math.max(signal.confidence, 0.95),
      trustLevel: 'manual_user_entry',
      authorityClass: authorityClassForEditedSignal(signal),
      fallbackReason: undefined,
    };
  });
}

function authorityClassForEditedSignal(signal: SignalRow): string {
  if (signal.authorityClass === 'brand_fact' || signal.authorityClass === 'brand_constraint' || signal.authorityClass === 'brand_preference' || signal.authorityClass === 'voice_default') {
    return signal.authorityClass;
  }
  if (signal.path === 'voice.killList' || signal.path.startsWith('palette.unsafe')) return 'brand_constraint';
  if (signal.path.startsWith('identity.') || signal.path.startsWith('assets.')) return 'brand_fact';
  if (signal.path.startsWith('voice.')) return 'voice_default';
  return 'brand_preference';
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
    if (lane.id === 'uploads') return { ...lane, count: uploadedSources.length, status: uploadedSources.length > 0 ? 'pending' : 'not_provided' };
    return lane;
  });
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

function normalizeSocialLink(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function detectSocialPlatform(value: string): (typeof SOCIAL_PLATFORM_META)[number] | typeof GENERIC_SOCIAL_META {
  const normalized = value.trim();
  return SOCIAL_PLATFORM_META.find((platform) => platform.pattern.test(normalized)) ?? GENERIC_SOCIAL_META;
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
.bv-c1-file-picker {
  position: relative;
  min-height: 74px;
  display: grid;
  align-content: center;
  gap: 6px;
  border: 1px dashed #282724;
  border-radius: 8px;
  background: #131312;
  color: #ECE9E1;
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(.16,1,.3,1);
}
.bv-c1-file-picker:hover {
  border-color: rgba(212, 166, 82, 0.55);
  background: rgba(212, 166, 82, 0.06);
}
.bv-c1-file-picker > span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 750;
}
.bv-c1-file-picker em {
  color: #7A776E;
  font-size: 11px;
  font-style: normal;
}
.bv-c1-file-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.bv-c1-file-input:disabled,
.bv-c1-file-input:disabled + span,
.bv-c1-file-input:disabled ~ em {
  cursor: not-allowed;
  opacity: 0.55;
}
.bv-c1-social-panel {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #1C1B19;
  border-radius: 8px;
  background: #0B0B0A;
}
.bv-c1-social-entry {
  display: grid;
  grid-template-columns: minmax(92px, auto) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
}
.bv-c1-social-entry .bv-c1-input {
  min-width: 0;
}
.bv-c1-social-count {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  color: #7A776E;
}
.bv-c1-platform-chip {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 7px 10px;
  border: 1px solid;
  border-radius: 7px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
  white-space: nowrap;
}
.bv-c1-platform-chip span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
}
.bv-c1-social-error {
  border: 1px solid rgba(212, 106, 92, 0.28);
  border-radius: 8px;
  background: rgba(212, 106, 92, 0.06);
  color: #D46A5C;
  padding: 8px 10px;
  font-size: 11px;
}
.bv-c1-social-list {
  display: grid;
  gap: 8px;
}
.bv-c1-social-row {
  min-height: 50px;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) 32px 32px 32px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 12px;
  border: 1px solid #1C1B19;
  border-left: 4px solid #D4A652;
  border-radius: 8px;
  background: #131312;
}
.bv-c1-social-platform {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}
.bv-c1-social-empty {
  min-height: 54px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px dashed #282724;
  border-radius: 8px;
  color: #7A776E;
  font-size: 12px;
}
.bv-c1-manager {
  display: grid;
  gap: 10px;
  padding: 18px 0 22px;
  border-bottom: 1px solid #1C1B19;
}
.bv-c1-manager-head {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #5F5E5A;
  font-size: 11px;
}
.bv-c1-manager-count {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  color: #7A776E;
}
.bv-c1-brand-list {
  display: grid;
  gap: 8px;
}
.bv-c1-brand-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 12px;
  border: 1px solid #1C1B19;
  border-left: 4px solid #282724;
  border-radius: 8px;
  background: #131312;
}
.bv-c1-brand-row.is-active {
  border-left-color: #D4A652;
  background: rgba(212, 166, 82, 0.05);
}
.bv-c1-brand-open {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  color: inherit;
  padding: 0;
  font: inherit;
}
.bv-c1-brand-open:disabled {
  cursor: default;
  opacity: 0.75;
}
.bv-c1-brand-name {
  font-size: 13px;
  font-weight: 700;
  color: #ECE9E1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bv-c1-brand-meta {
  font-size: 11px;
  color: #7A776E;
}
.bv-c1-brand-switch {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #7A776E;
}
.bv-c1-manager-empty {
  min-height: 46px;
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border: 1px dashed #282724;
  border-radius: 8px;
  color: #7A776E;
  font-size: 12px;
}
.bv-c1-scan-list {
  display: grid;
  gap: 8px;
}
.bv-c1-scan-row {
  display: grid;
  grid-template-columns: minmax(96px, auto) minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 12px;
  border: 1px solid #1C1B19;
  border-radius: 8px;
  background: #0F0F0E;
}
.bv-c1-scan-status {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid rgba(212, 166, 82, 0.25);
  background: rgba(212, 166, 82, 0.08);
  color: #D4A652;
  white-space: nowrap;
  text-align: center;
}
.bv-c1-scan-status.good {
  border-color: rgba(94, 201, 126, 0.3);
  background: rgba(94, 201, 126, 0.08);
  color: #5EC97E;
}
.bv-c1-scan-status.muted {
  border-color: #282724;
  background: #1B1A18;
  color: #7A776E;
}
.bv-c1-scan-status.risk {
  border-color: rgba(212, 106, 92, 0.3);
  background: rgba(212, 106, 92, 0.06);
  color: #D46A5C;
}
.bv-c1-scan-site {
  font-size: 12px;
  color: #ECE9E1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bv-c1-scan-counts {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  color: #7A776E;
  white-space: nowrap;
}
.bv-c1-scan-warn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #D4A652;
}
.bv-c1-scan-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.bv-c1-scan-time {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  color: #5F5E5A;
  white-space: nowrap;
}
.bv-c1-intake-panel {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: 14px;
  padding: 18px 0 22px;
  border-bottom: 1px solid #1C1B19;
}
.bv-c1-intake-column {
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
}
.bv-c1-intake-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #5F5E5A;
  font-size: 11px;
}
.bv-c1-intake-list {
  display: grid;
  gap: 8px;
}
.bv-c1-intake-action,
.bv-c1-intake-lane,
.bv-c1-intake-empty {
  min-width: 0;
  border: 1px solid #1C1B19;
  border-radius: 8px;
  background: #0F0F0E;
  padding: 11px 12px;
}
.bv-c1-intake-action {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr) auto;
  align-items: start;
  gap: 8px 10px;
}
.bv-c1-intake-action > span {
  align-self: start;
  justify-self: start;
  padding: 4px 7px;
  border-radius: 5px;
  background: rgba(122, 119, 110, 0.12);
  color: #7A776E;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}
.bv-c1-intake-action.high > span {
  background: rgba(212, 106, 92, 0.12);
  color: #D46A5C;
}
.bv-c1-intake-action.medium > span {
  background: rgba(212, 166, 82, 0.12);
  color: #D4A652;
}
.bv-c1-intake-action > div {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.bv-c1-intake-action strong,
.bv-c1-intake-lane strong {
  min-width: 0;
  color: #ECE9E1;
  font-size: 12px;
  font-weight: 750;
}
.bv-c1-intake-action em {
  min-width: 0;
  color: #7A776E;
  font-size: 11px;
  font-style: normal;
  line-height: 1.45;
}
.bv-c1-intake-action-button {
  min-height: 30px;
  align-self: center;
  border: 1px solid #282724;
  border-radius: 7px;
  background: #1B1A18;
  color: #ECE9E1;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(.16,1,.3,1);
}
.bv-c1-intake-action-button:hover {
  border-color: #D4A652;
  transform: translateY(-1px);
}
.bv-c1-intake-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}
.bv-c1-intake-action-button[aria-pressed='true'] {
  border-color: rgba(212, 166, 82, 0.55);
  background: rgba(212, 166, 82, 0.12);
  color: #D4A652;
}
.bv-c1-intake-workflow {
  display: grid;
  gap: 12px;
  border: 1px solid #282724;
  border-radius: 8px;
  background: #0B0B0A;
  padding: 12px;
}
.bv-c1-intake-workflow-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.bv-c1-intake-workflow-head > span {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.bv-c1-intake-workflow-head strong {
  color: #ECE9E1;
  font-size: 12px;
}
.bv-c1-intake-workflow-head em {
  color: #7A776E;
  font-size: 11px;
  font-style: normal;
}
.bv-c1-intake-workflow-body {
  display: grid;
  gap: 10px;
}
.bv-c1-intake-staged {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px dashed #282724;
  border-radius: 8px;
  color: #7A776E;
  padding: 10px 12px;
  font-size: 12px;
}
.bv-c1-domain-proof-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px;
  gap: 8px;
}
.bv-c1-domain-proof-grid label {
  min-width: 0;
  display: grid;
  gap: 5px;
}
.bv-c1-domain-proof-grid label.wide {
  grid-column: 1 / -1;
}
.bv-c1-domain-proof-grid span {
  color: #7A776E;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}
.bv-c1-domain-proof-grid code {
  min-width: 0;
  overflow-wrap: anywhere;
  border: 1px solid #282724;
  border-radius: 7px;
  background: #050505;
  color: #ECE9E1;
  padding: 8px 9px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  line-height: 1.45;
}
.bv-c1-intake-workflow-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.bv-c1-intake-lane {
  display: grid;
  gap: 8px;
}
.bv-c1-intake-lane > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.bv-c1-intake-lane > div:first-child span {
  color: #7A776E;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  text-transform: uppercase;
  white-space: nowrap;
}
.bv-c1-intake-lane ul {
  margin: 0;
  padding-left: 16px;
  color: #7A776E;
  font-size: 11px;
  line-height: 1.45;
}
.bv-c1-intake-paths {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.bv-c1-intake-paths span {
  max-width: 100%;
  border: 1px solid #282724;
  border-radius: 5px;
  padding: 4px 7px;
  color: #B5B2A8;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  overflow-wrap: anywhere;
}
.bv-c1-intake-empty {
  color: #7A776E;
  font-size: 12px;
}
.bv-c1-social-health {
  display: grid;
  gap: 8px;
  border: 1px solid #1C1B19;
  border-radius: 8px;
  background: #0B0B0A;
  padding: 11px 12px;
}
.bv-c1-social-health-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.bv-c1-social-health-head strong {
  color: #ECE9E1;
  font-size: 12px;
  font-weight: 750;
}
.bv-c1-social-health-head span {
  color: #7A776E;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  text-transform: uppercase;
}
.bv-c1-social-health-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.bv-c1-social-health-card {
  min-width: 0;
  display: grid;
  gap: 6px;
  border: 1px solid #1C1B19;
  border-left: 3px solid #7A776E;
  border-radius: 8px;
  background: #131312;
  padding: 9px 10px;
}
.bv-c1-social-health-card.live {
  border-left-color: #5EC97E;
}
.bv-c1-social-health-card.pending {
  border-left-color: #D4A652;
}
.bv-c1-social-health-card.failed {
  border-left-color: #D46A5C;
}
.bv-c1-social-health-card > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.bv-c1-social-health-card strong {
  min-width: 0;
  color: #ECE9E1;
  font-size: 12px;
  font-weight: 750;
}
.bv-c1-social-health-card span,
.bv-c1-social-health-card em {
  color: #7A776E;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-style: normal;
  text-transform: uppercase;
}
.bv-c1-social-health-card em {
  overflow-wrap: anywhere;
}
.bv-c1-social-health-card ul {
  margin: 0;
  padding-left: 15px;
  color: #7A776E;
  font-size: 11px;
  line-height: 1.4;
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
  .bv-c1-social-entry,
  .bv-c1-social-row {
    grid-template-columns: 1fr;
  }
  .bv-c1-intake-panel {
    grid-template-columns: 1fr;
  }
  .bv-c1-intake-action {
    grid-template-columns: 1fr;
  }
  .bv-c1-intake-action > span,
  .bv-c1-intake-action-button,
  .bv-c1-intake-workflow-actions .bv-c1-button,
  .bv-c1-intake-workflow-actions .bv-c1-primary {
    width: 100%;
  }
  .bv-c1-social-row .bv-c1-icon-button {
    width: 100%;
  }
}
`;
