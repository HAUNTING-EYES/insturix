'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  Image as ImageIcon,
  Loader2,
  Mic2,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import type { AvatarProfileStatus, AvatarReferenceRole, AvatarUsagePreset, AvatarVoiceSourceType } from '@/lib/avatar/avatar-profile';
import type { AvatarProfileRecord } from '@/lib/avatar/avatar-lifecycle';
import { useAcceptedBrandVaultBrands } from '@/components/dashboard/BrandVault/useBrandVault';
import {
  DEFAULT_AVATAR_DRAFT_FORM,
  buildAvatarProfileDraftRequest,
  hasRequiredAvatarDraftFields,
  toggleUsagePreset,
  type AvatarVaultDraftFormState,
} from './avatar-vault-form';
import {
  useAvatarProfile,
  useAvatarProfiles,
  useAvatarVaultMutations,
} from './useAvatarVault';
import { AvatarVaultRenderPlanner } from './AvatarVaultRenderPlanner';

type AvatarProfileFilter = AvatarProfileStatus | 'all';

const STATUS_FILTERS: AvatarProfileFilter[] = ['all', 'draft', 'accepted', 'rejected', 'superseded'];
const USAGE_PRESET_OPTIONS: Array<{ id: AvatarUsagePreset; label: string }> = [
  { id: 'product_shoot', label: 'Product shoot' },
  { id: 'speech_delivery', label: 'Speech' },
  { id: 'explainer_host', label: 'Explainer host' },
  { id: 'ad_actor', label: 'Ad actor' },
  { id: 'social_presenter', label: 'Social host' },
];

export function AvatarVaultReview() {
  const [form, setForm] = useState<AvatarVaultDraftFormState>(DEFAULT_AVATAR_DRAFT_FORM);
  const [statusFilter, setStatusFilter] = useState<AvatarProfileFilter>('all');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [notice, setNotice] = useState<{ tone: 'good' | 'warn' | 'risk'; message: string } | null>(null);

  const listQuery = useAvatarProfiles(statusFilter === 'all' ? {} : { status: statusFilter });
  const profileQuery = useAvatarProfile(selectedRecordId);
  const acceptedBrands = useAcceptedBrandVaultBrands();
  const { createDraft, reviewDraft, uploadReference } = useAvatarVaultMutations();

  const brandOptions = useMemo(
    () =>
      (acceptedBrands.data ?? [])
        .filter((brand) => brand.brandId.trim())
        .map((brand) => ({ brandId: brand.brandId, name: brand.name || brand.brandId })),
    [acceptedBrands.data],
  );
  const records = listQuery.data ?? [];
  const selectedRecord = profileQuery.data ?? records.find((record) => record.id === selectedRecordId) ?? records[0] ?? null;
  const canCreateDraft = hasRequiredAvatarDraftFields(form);
  const busy = createDraft.isPending || reviewDraft.isPending || uploadReference.isPending || listQuery.isFetching || profileQuery.isFetching;
  const error =
    notice?.tone === 'risk'
      ? notice.message
      : errorMessage(createDraft.error) ??
        errorMessage(reviewDraft.error) ??
        errorMessage(uploadReference.error) ??
        errorMessage(listQuery.error) ??
        errorMessage(profileQuery.error) ??
        (form.bindBrand ? errorMessage(acceptedBrands.error) : null);

  useEffect(() => {
    if (!selectedRecordId && records[0]) setSelectedRecordId(records[0].id);
  }, [records, selectedRecordId]);

  useEffect(() => {
    if (!form.bindBrand || form.brandId || brandOptions.length === 0) return;
    setForm((current) => ({ ...current, brandId: brandOptions[0].brandId }));
  }, [brandOptions, form.bindBrand, form.brandId]);

  async function handleCreateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateDraft) {
      setNotice({ tone: 'risk', message: 'Add a name plus face and full-body references. Brand is required only when binding is enabled.' });
      return;
    }

    const result = await createDraft.mutateAsync(buildAvatarProfileDraftRequest(form));
    setSelectedRecordId(result.record.id);
    setNotice({ tone: 'good', message: 'Avatar draft created.' });
  }

  async function reviewSelected(action: 'accept' | 'reject') {
    if (!selectedRecord) return;
    if (action === 'reject' && !rejectReason.trim()) {
      setNotice({ tone: 'risk', message: 'Add a reject reason before rejecting.' });
      return;
    }

    const result = await reviewDraft.mutateAsync({
      recordId: selectedRecord.id,
      action,
      reason: rejectReason.trim() || undefined,
    });
    setSelectedRecordId(result.record.id);
    setNotice({
      tone: action === 'accept' ? 'good' : 'warn',
      message: action === 'accept' ? 'Avatar profile accepted.' : 'Avatar draft rejected.',
    });
  }

  async function handleReferenceUpload(target: 'portrait' | 'fullBody', file: File | null) {
    if (!file) return;
    const role: AvatarReferenceRole = target === 'portrait' ? 'face_front' : 'full_body_front';

    try {
      const result = await uploadReference.mutateAsync({ file, role });
      setForm((current) => ({
        ...current,
        ...(target === 'portrait'
          ? { portraitAssetId: result.asset.assetId, portraitImageUrl: result.asset.imageUrl }
          : { fullBodyAssetId: result.asset.assetId, fullBodyImageUrl: result.asset.imageUrl }),
      }));
      setNotice({ tone: 'good', message: target === 'portrait' ? 'Face reference uploaded.' : 'Full-body reference uploaded.' });
    } catch (error) {
      setNotice({ tone: 'risk', message: errorMessage(error) ?? 'Avatar reference upload failed.' });
    }
  }

  function updateForm<K extends keyof AvatarVaultDraftFormState>(key: K, value: AvatarVaultDraftFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  return (
    <div className="min-h-screen bg-[#101112] text-[#F4F1E8]">
      <header className="border-b border-[#2A2E31] bg-[#131516] px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#3A4244] bg-[#1A1D1E] text-[#74D6C6]">
              <UserRound size={21} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#74D6C6]">Mode C</p>
              <h1 className="text-2xl font-semibold tracking-normal text-[#F7F1E3]">Avatar Vault</h1>
            </div>
          </div>
          <span className="flex-1" />
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#384043] px-3 text-sm text-[#D7D2C4] hover:bg-[#1D2224] disabled:opacity-60"
            onClick={() => listQuery.refetch()}
            disabled={busy}
          >
            {listQuery.isFetching ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1280px] gap-5 px-5 py-5 xl:grid-cols-[440px_minmax(0,1fr)]">
        <section className="rounded-lg border border-[#2A2E31] bg-[#151819] p-5">
          <div className="mb-5 flex items-center gap-2">
            <ImageIcon size={18} className="text-[#D4A652]" />
            <h2 className="text-lg font-semibold tracking-normal text-[#F7F1E3]">Create Virtual Person</h2>
          </div>

          <form className="space-y-4" onSubmit={handleCreateDraft}>
            <div className="space-y-3 border-t border-[#293034] pt-4">
              <div className="text-sm font-semibold text-[#E8E0CF]">Required draft</div>
              <TextField label="Avatar name" value={form.displayName} onChange={(value) => updateForm('displayName', value)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <AvatarReferenceUpload
                  label="Face reference"
                  role="face_front"
                  assetId={form.portraitAssetId}
                  imageUrl={form.portraitImageUrl}
                  busy={uploadReference.isPending}
                  onFileChange={(file) => void handleReferenceUpload('portrait', file)}
                />
                <AvatarReferenceUpload
                  label="Full body reference"
                  role="full_body_front"
                  assetId={form.fullBodyAssetId}
                  imageUrl={form.fullBodyImageUrl}
                  busy={uploadReference.isPending}
                  onFileChange={(file) => void handleReferenceUpload('fullBody', file)}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {USAGE_PRESET_OPTIONS.map((option) => (
                  <label key={option.id} className="flex items-center gap-2 rounded-lg border border-[#293034] bg-[#0F1213] px-3 py-2 text-sm text-[#D7D2C4]">
                    <input
                      type="checkbox"
                      checked={form.usagePresets.includes(option.id)}
                      onChange={(event) => updateForm('usagePresets', toggleUsagePreset(form.usagePresets, option.id, event.target.checked))}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <details className="border-t border-[#293034] pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-[#E8E0CF]">Identity details</summary>
              <div className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Face asset ID" value={form.portraitAssetId} onChange={(value) => updateForm('portraitAssetId', value)} />
                  <TextField label="Full body asset ID" value={form.fullBodyAssetId} onChange={(value) => updateForm('fullBodyAssetId', value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Face image URL" value={form.portraitImageUrl} onChange={(value) => updateForm('portraitImageUrl', value)} />
                  <TextField label="Full body image URL" value={form.fullBodyImageUrl} onChange={(value) => updateForm('fullBodyImageUrl', value)} />
                </div>
                <TextField label="Side profile URL" value={form.sideProfileImageUrl} onChange={(value) => updateForm('sideProfileImageUrl', value)} />
                <TextArea label="Expression reference URLs" value={form.expressionReferenceUrls} onChange={(value) => updateForm('expressionReferenceUrls', value)} />
                <TextArea label="Identity note" value={form.portraitDescription} onChange={(value) => updateForm('portraitDescription', value)} />
                <TextArea label="Body description" value={form.bodyDescription} onChange={(value) => updateForm('bodyDescription', value)} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Hair" value={form.hair} onChange={(value) => updateForm('hair', value)} />
                  <TextArea label="Notable traits" value={form.notableTraits} onChange={(value) => updateForm('notableTraits', value)} />
                </div>
              </div>
            </details>

            <details className="border-t border-[#293034] pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-[#E8E0CF]">Performance and voice</summary>
              <div className="mt-3 space-y-3">
                <TextArea label="Wardrobe preset" value={form.wardrobePreset} onChange={(value) => updateForm('wardrobePreset', value)} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Default look" value={form.defaultLook} onChange={(value) => updateForm('defaultLook', value)} />
                  <TextField label="Product shoot look" value={form.productShootLook} onChange={(value) => updateForm('productShootLook', value)} />
                </div>
                <TextField label="Speech look" value={form.speechLook} onChange={(value) => updateForm('speechLook', value)} />
                <TextField label="Gesture style" value={form.gestureStyle} onChange={(value) => updateForm('gestureStyle', value)} />
                <TextArea label="Pose library" value={form.poseLibrary} onChange={(value) => updateForm('poseLibrary', value)} />
                <TextArea label="Product interaction" value={form.productInteraction} onChange={(value) => updateForm('productInteraction', value)} />
                <TextArea label="Camera presence" value={form.cameraPresence} onChange={(value) => updateForm('cameraPresence', value)} />
                <TextArea label="Movement constraints" value={form.movementConstraints} onChange={(value) => updateForm('movementConstraints', value)} />

                <div className="border-t border-[#293034] pt-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#E8E0CF]">
                    <Mic2 size={16} className="text-[#D088B4]" />
                    Voice
                  </div>
                  <select
                    className="avatar-vault-input mb-3"
                    value={form.voiceMode}
                    onChange={(event) => updateForm('voiceMode', event.target.value as AvatarVoiceSourceType)}
                  >
                    <option value="uploaded_voice_sample">Uploaded sample</option>
                    <option value="selected_tts_voice">Selected TTS voice</option>
                    <option value="imported_voice_profile">Imported voice profile</option>
                  </select>
                  {form.voiceMode === 'uploaded_voice_sample' && (
                    <TextField label="Voice sample asset ID" value={form.voiceSampleAssetId} onChange={(value) => updateForm('voiceSampleAssetId', value)} />
                  )}
                  {form.voiceMode === 'selected_tts_voice' && (
                    <TextField label="TTS voice ID" value={form.ttsVoiceId} onChange={(value) => updateForm('ttsVoiceId', value)} />
                  )}
                  {form.voiceMode === 'imported_voice_profile' && (
                    <TextField label="Voice profile ID" value={form.voiceProfileId} onChange={(value) => updateForm('voiceProfileId', value)} />
                  )}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <TextField label="Language" value={form.language} onChange={(value) => updateForm('language', value)} />
                    <TextField label="Speaking style" value={form.speakingStyle} onChange={(value) => updateForm('speakingStyle', value)} />
                  </div>
                </div>
              </div>
            </details>

            <details className="border-t border-[#293034] pt-4">
              <summary className="cursor-pointer text-sm font-semibold text-[#E8E0CF]">Rights and brand</summary>
              <div className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Default role" value={form.defaultRole} onChange={(value) => updateForm('defaultRole', value)} />
                  <TextField label="Default tone" value={form.defaultTone} onChange={(value) => updateForm('defaultTone', value)} />
                </div>
                <div className="border-t border-[#293034] pt-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#E8E0CF]">
                    <ShieldCheck size={16} className="text-[#74D6C6]" />
                    Rights
                  </div>
                  <select
                    className="avatar-vault-input mb-3"
                    value={form.likenessOwner}
                    onChange={(event) => updateForm('likenessOwner', event.target.value as AvatarVaultDraftFormState['likenessOwner'])}
                  >
                    <option value="self">Self</option>
                    <option value="client">Client</option>
                    <option value="licensed">Licensed</option>
                    <option value="unknown">Unknown</option>
                  </select>
                  <label className="mb-3 flex items-center gap-2 text-sm text-[#D7D2C4]">
                    <input
                      type="checkbox"
                      checked={form.consentConfirmed}
                      onChange={(event) => updateForm('consentConfirmed', event.target.checked)}
                    />
                    Consent confirmed
                  </label>
                  <label className="mb-3 flex items-center gap-2 text-sm text-[#D7D2C4]">
                    <input
                      type="checkbox"
                      checked={form.commercialUseAllowed}
                      onChange={(event) => updateForm('commercialUseAllowed', event.target.checked)}
                    />
                    Commercial use allowed
                  </label>
                  <TextArea label="Rights notes" value={form.rightsNotes} onChange={(value) => updateForm('rightsNotes', value)} />
                </div>

                <div className="border-t border-[#293034] pt-4">
                  <label className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#E8E0CF]">
                    <input
                      type="checkbox"
                      checked={form.bindBrand}
                      onChange={(event) => updateForm('bindBrand', event.target.checked)}
                    />
                    Bind to Brand Vault
                  </label>
                  {form.bindBrand ? (
                    <select
                      className="avatar-vault-input"
                      value={form.brandId}
                      onChange={(event) => updateForm('brandId', event.target.value)}
                      disabled={brandOptions.length === 0}
                    >
                      {brandOptions.length === 0 ? (
                        <option value="">No accepted brands</option>
                      ) : (
                        brandOptions.map((brand) => (
                          <option key={brand.brandId} value={brand.brandId}>
                            {brand.name}
                          </option>
                        ))
                      )}
                    </select>
                  ) : (
                    <div className="rounded-lg border border-[#334044] bg-[#0F1213] px-3 py-2 text-sm text-[#AEB6B3]">
                      Personal / no brand
                    </div>
                  )}
                </div>
              </div>
            </details>

            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#D4A652] px-4 text-sm font-semibold text-[#11100D] hover:bg-[#E0B86A] disabled:cursor-not-allowed disabled:opacity-55"
              disabled={busy || !canCreateDraft}
            >
              {createDraft.isPending ? <Loader2 size={17} className="animate-spin" /> : <UserRound size={17} />}
              Save draft
            </button>
          </form>
        </section>

        <section className="space-y-5">
          <div className="rounded-lg border border-[#2A2E31] bg-[#151819] p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`h-9 rounded-lg border px-3 text-sm ${
                    statusFilter === status
                      ? 'border-[#74D6C6] bg-[#18302F] text-[#D8FFF8]'
                      : 'border-[#30383B] text-[#C9C2B5] hover:bg-[#1D2224]'
                  }`}
                  onClick={() => setStatusFilter(status)}
                >
                  {statusLabel(status)}
                </button>
              ))}
            </div>
            {notice && notice.tone !== 'risk' && (
              <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${notice.tone === 'good' ? 'border-[#4D7D62] bg-[#112019] text-[#BFE7CB]' : 'border-[#7C6735] bg-[#211B0F] text-[#EDD494]'}`}>
                {notice.message}
              </div>
            )}
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#73453F] bg-[#211312] px-3 py-2 text-sm text-[#F0B3AC]">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <ProfileList
                records={records}
                selectedRecordId={selectedRecord?.id ?? null}
                loading={listQuery.isLoading}
                onSelect={setSelectedRecordId}
              />
              <ProfileDetail
                record={selectedRecord}
                rejectReason={rejectReason}
                busy={busy}
                onRejectReasonChange={setRejectReason}
                onAccept={() => void reviewSelected('accept')}
                onReject={() => void reviewSelected('reject')}
              />
            </div>
          </div>
        </section>
      </main>
      <style jsx global>{`
        .avatar-vault-input {
          height: 2.5rem;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #354044;
          background: #0f1213;
          padding: 0 0.75rem;
          color: #f4f1e8;
          outline: none;
        }
        textarea.avatar-vault-input {
          min-height: 4.75rem;
          padding-top: 0.6rem;
          resize: vertical;
        }
        .avatar-vault-input:focus {
          border-color: #74d6c6;
          box-shadow: 0 0 0 2px rgba(116, 214, 198, 0.12);
        }
      `}</style>
    </div>
  );
}

function AvatarReferenceUpload({
  label,
  role,
  assetId,
  imageUrl,
  busy,
  onFileChange,
}: {
  label: string;
  role: Extract<AvatarReferenceRole, 'face_front' | 'full_body_front'>;
  assetId: string;
  imageUrl: string;
  busy: boolean;
  onFileChange: (file: File | null) => void;
}) {
  const inputId = `avatar-${role}-upload`;
  const hasReference = Boolean(assetId.trim() || imageUrl.trim());

  return (
    <div className="rounded-lg border border-[#293034] bg-[#0F1213] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#E8E0CF]">{label}</div>
          <div className={hasReference ? 'text-xs text-[#9BD6B5]' : 'text-xs text-[#D9A5A0]'}>
            {hasReference ? 'Ready' : 'Missing'}
          </div>
        </div>
        <label
          htmlFor={inputId}
          className={`inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-[#384043] px-3 text-xs font-semibold text-[#D7D2C4] ${
            busy ? 'pointer-events-none opacity-60' : 'hover:bg-[#1D2224]'
          }`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
          Choose
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            event.currentTarget.value = '';
            onFileChange(file);
          }}
        />
      </div>
      <div
        className="mt-3 flex h-36 items-center justify-center rounded-md border border-[#273033] bg-[#0A0D0E] bg-cover bg-center text-[#59625F]"
        style={{ backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined }}
        aria-label={`${label} preview`}
      >
        {!imageUrl && <ImageIcon size={24} />}
      </div>
      <div className="mt-2 min-w-0 text-xs text-[#7F8986]">
        <div className="truncate">{assetId || 'No asset saved'}</div>
        {imageUrl && <div className="truncate">{imageUrl}</div>}
      </div>
    </div>
  );
}
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">{label}</span>
      <input className="avatar-vault-input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9EA7A4]">{label}</span>
      <textarea className="avatar-vault-input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ProfileList({
  records,
  selectedRecordId,
  loading,
  onSelect,
}: {
  records: AvatarProfileRecord[];
  selectedRecordId: string | null;
  loading: boolean;
  onSelect: (recordId: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-[#293034] bg-[#111415]">
        <Loader2 size={24} className="animate-spin text-[#74D6C6]" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-lg border border-[#293034] bg-[#111415] text-center text-sm text-[#AEB6B3]">
        <Archive size={24} />
        No avatar profiles yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {records.map((record) => (
        <button
          key={record.id}
          type="button"
          className={`w-full rounded-lg border p-3 text-left transition ${
            selectedRecordId === record.id
              ? 'border-[#74D6C6] bg-[#18302F]'
              : 'border-[#293034] bg-[#111415] hover:border-[#3E4A4E]'
          }`}
          onClick={() => onSelect(record.id)}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-[#F4F1E8]">{record.profile.displayName}</span>
            <StatusBadge status={record.status} />
          </div>
          <div className="text-xs text-[#AEB6B3]">{scopeLabel(record)} / {referenceCount(record)} refs</div>
          <div className="mt-2 text-xs text-[#7F8986]">{formatDate(record.updatedAt)}</div>
        </button>
      ))}
    </div>
  );
}

function ProfileDetail({
  record,
  rejectReason,
  busy,
  onRejectReasonChange,
  onAccept,
  onReject,
}: {
  record: AvatarProfileRecord | null;
  rejectReason: string;
  busy: boolean;
  onRejectReasonChange: (value: string) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  if (!record) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-[#293034] bg-[#111415] text-sm text-[#AEB6B3]">
        Select a profile.
      </div>
    );
  }

  const canReview = record.status === 'draft';

  return (
    <div className="rounded-lg border border-[#293034] bg-[#111415] p-4">
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <div
          className="aspect-[4/3] rounded-lg border border-[#30383B] bg-[#0B0D0E] bg-cover bg-center"
          style={{ backgroundImage: profilePreviewUrl(record) ? `url("${profilePreviewUrl(record)}")` : undefined }}
          aria-label={`${record.profile.displayName} virtual person reference`}
        />
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="truncate text-xl font-semibold tracking-normal text-[#F7F1E3]">{record.profile.displayName}</h3>
            <StatusBadge status={record.status} />
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Avatar ID" value={record.profile.avatarId} />
            <Info label="Scope" value={scopeLabel(record)} />
            <Info label="References" value={`${referenceCount(record)} saved`} />
            <Info label="Use cases" value={usageLabel(record)} />
            <Info label="Wardrobe" value={wardrobeLabel(record)} />
            <Info label="Voice" value={voiceLabel(record)} />
            <Info label="Likeness" value={record.profile.rights.likenessOwner} />
            <Info label="Consent" value={record.profile.rights.consentConfirmed ? 'Confirmed' : 'Missing'} />
            <Info label="Updated" value={formatDate(record.updatedAt)} />
          </dl>
          {record.review.reasons.length > 0 && (
            <div className="mt-4 rounded-lg border border-[#3B3A2F] bg-[#17160F] px-3 py-2 text-sm text-[#D9C99A]">
              {record.review.reasons.join(' ')}
            </div>
          )}
        </div>
      </div>

      {canReview && (
        <div className="mt-5 border-t border-[#293034] pt-4">
          <textarea
            className="avatar-vault-input mb-3"
            value={rejectReason}
            onChange={(event) => onRejectReasonChange(event.target.value)}
            placeholder="Reject reason"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#74D6C6] px-4 text-sm font-semibold text-[#081211] hover:bg-[#8BE0D3] disabled:opacity-60"
              disabled={busy}
              onClick={onAccept}
            >
              <Check size={16} />
              Accept
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#73453F] px-4 text-sm font-semibold text-[#F0B3AC] hover:bg-[#211312] disabled:opacity-60"
              disabled={busy}
              onClick={onReject}
            >
              <X size={16} />
              Reject
            </button>
          </div>
        </div>
      )}
      {record.status === 'accepted' && <AvatarVaultRenderPlanner key={record.id} record={record} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7F8986]">{label}</dt>
      <dd className="truncate text-[#E8E0CF]">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: AvatarProfileStatus }) {
  const tone = status === 'accepted' ? 'good' : status === 'draft' ? 'warn' : status === 'rejected' ? 'risk' : 'neutral';
  const classes = {
    good: 'border-[#4D7D62] bg-[#112019] text-[#BFE7CB]',
    warn: 'border-[#7C6735] bg-[#211B0F] text-[#EDD494]',
    risk: 'border-[#73453F] bg-[#211312] text-[#F0B3AC]',
    neutral: 'border-[#384043] bg-[#171B1D] text-[#C9C2B5]',
  }[tone];
  return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${classes}`}>{statusLabel(status)}</span>;
}

function statusLabel(status: AvatarProfileFilter): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function profilePreviewUrl(record: AvatarProfileRecord): string | undefined {
  const fullBody = record.profile.identityPack?.referenceAssets.find(
    (asset) => asset.role === 'full_body_front' || asset.role === 'full_body_side',
  );
  return fullBody?.imageUrl ?? record.profile.portrait.imageUrl;
}

function scopeLabel(record: AvatarProfileRecord): string {
  return record.profile.brandId ? 'Brand bound' : 'Personal / no brand';
}

function referenceCount(record: AvatarProfileRecord): number {
  return record.profile.identityPack?.referenceAssets.length ?? 1;
}

function usageLabel(record: AvatarProfileRecord): string {
  const presets = record.profile.performancePack?.usagePresets ?? [];
  if (presets.length === 0) return 'Not set';
  return presets.map((preset) => USAGE_PRESET_OPTIONS.find((option) => option.id === preset)?.label ?? preset).join(', ');
}

function wardrobeLabel(record: AvatarProfileRecord): string {
  return record.profile.stylePack?.wardrobePresets[0]?.description ?? 'Not set';
}

function voiceLabel(record: AvatarProfileRecord): string {
  const voice = record.profile.voice;
  if (voice.sourceType === 'selected_tts_voice') return voice.ttsVoiceId ?? 'Selected TTS voice';
  if (voice.sourceType === 'imported_voice_profile') return voice.voiceProfileId ?? 'Imported voice profile';
  return voice.sampleAssetId ?? voice.voiceProfileId ?? 'Uploaded sample';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}
