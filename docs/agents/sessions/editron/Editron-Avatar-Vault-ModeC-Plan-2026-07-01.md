# Editron Avatar Vault Mode C Plan

Date: 2026-07-01
Status: PHASE 0 SPEC
Scope: Build a first-party Avatar Vault and exact lip-sync avatar generation path for ThinkForge -> Editron and direct Editron avatar videos.

## Executive Decision

Mode C is primary:

```
avatar identity + avatar image + voice sample or selected voice + script
  -> voice/audio authority
  -> portrait/audio lip-sync provider
  -> generated avatar video asset
  -> Editron timeline/composition/render
```

HappyHorse is deferred. It remains useful later for prompt-native avatar-looking video, but it is not the primary path because the current local HappyHorse adapter is image/text-to-video oriented and does not expose an audio-url-driven lip-sync contract.

Avatar Vault must be built like Brand Vault: evidence-backed profiles, review/accept lifecycle, explicit scope, audit trail, and downstream generation that refuses ambiguous identity or brand binding.

## Verified Current State

| Area | Current state | Evidence |
| --- | --- | --- |
| Existing AI avatar strategy | Existing docs already identify portrait + audio -> lip-sync video as the right avatar architecture. | `docs/agents/reference/general/reference_external_tech.md:73-105` |
| Reference/generative strategy | "Someone saying X" should be generated as avatar video, not sourced from copyrighted clips. | `docs/agents/sessions/editron/Editron-Reference-Driven-Generative-Strategy-2026-06-24.md:103` |
| Brand Vault pattern | Brand Vault has typed profiles, evidence, draft/accept/reject/supersede lifecycle, and accepted brand list hooks. | `lib/shared/brand-signal-profile.ts:67`, `lib/shared/brand-signal-lifecycle.ts:10`, `lib/shared/brand-signal-profile-repository.ts:85`, `components/dashboard/BrandVault/useBrandVault.ts:186` |
| Optional brand scope | Brand profiles already allow optional `brandId`; access rules are default-open until restricted. | `lib/shared/brand-signal-profile.ts:69`, `lib/shared/brand-access.ts:44` |
| ThinkForge export | Export currently derives `sourceBrandId` silently from `projectMeta.brandId` and passes it into parse/finalize/import. | `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts:238`, `:633`, `:1096`, `:1124` |
| Existing scene contract | `sceneType: "talking-head"` already exists, but no avatar-specific contract exists yet. | `lib/pipeline/schemas/storyboard.ts:139`, `lib/pipeline/llm-scene-parser.ts:84` |
| Editron timeline shape | Generated media lands on video row; voiceover lands on voiceover row; captions and MG stay separate. | `lib/pipeline/scene-to-editron.ts:1-17`, `:390` |
| Existing TTS | Kokoro via fal.ai is primary; Deepgram is fallback; this creates audio assets, not lip-sync video. | `lib/pipeline/tts-service.ts:103`, `:164` |
| Existing HappyHorse adapter | HappyHorse exists in the video registry and tests, but current `generateVideoClip` can fall back to Kling on endpoint rejection. | `lib/pipeline/adapters/video-model-configs.ts:250`, `lib/pipeline/video-generation-service.ts:617`, `tests/pipeline/video-generation-fallback.test.ts:79` |

## Non-Negotiables

1. Avatar Vault is the source of truth for reusable avatar identity.
2. `brandId` is optional and controlled by an explicit UI toggle, not silent project metadata.
3. Avatar identity, voice consent, and likeness rights must be accepted before generation.
4. ThinkForge may request avatar usage, but it must not own avatar media generation.
5. Editron consumes generated avatar video as a normal media asset and owns timeline composition.
6. Motion Graphics planners must not become avatar render-form owners.
7. No claim of "unified avatar pipeline" unless producer, source of truth, decision owner, and final consumer are verified in code.
8. HappyHorse is out of scope for Mode C v1 except as a later experimental adapter.

## Product Surface

### Avatar Vault

The user can create an avatar from:

- uploaded portrait or source photo
- generated portrait image
- uploaded voice sample
- selected TTS voice
- persona/default speaking style
- consent and rights confirmation
- optional brand binding

The Avatar Vault UI needs a required brand toggle:

```
[ ] Bind this avatar to a brand
```

If off:

```ts
brandId: null
```

If on:

```ts
brandId: "brand_..."
```

The selector must list only accepted, accessible Brand Vault brands. A missing accepted brand must not block personal/no-brand avatars.

### ThinkForge Export

ThinkForge should expose avatar intent in export config only after Avatar Vault has accepted profiles:

```ts
{
  useAvatar: true,
  avatarId: "avatar_...",
  avatarMode: "custom_lipsync",
  bindBrand: false,
  brandId: null
}
```

ThinkForge writes intent. It does not generate, validate, or store avatar truth.

### Editron

Editron receives generated avatar video assets and composes them with:

- captions
- BGM
- SFX
- transitions
- brand graphics
- motion graphics
- render/export

If the avatar video already contains final speech, Editron should treat that audio as the speech authority for that clip. If the lip-sync provider returns video-only plus audio separately, Editron should place the returned audio on `ROW.VOICEOVER` and preserve exact sync metadata.

## Data Model

### AvatarProfile

```ts
export type AvatarProfileStatus = "draft" | "accepted" | "rejected" | "disabled" | "superseded";

export type AvatarSourceType =
  | "uploaded_portrait"
  | "generated_portrait"
  | "stock_avatar"
  | "imported_avatar";

export type AvatarVoiceSourceType =
  | "uploaded_voice_sample"
  | "selected_tts_voice"
  | "imported_voice_profile";

export interface AvatarEvidence {
  id: string;
  signalPath: string;
  sourceType:
    | "manual_user_entry"
    | "uploaded_portrait"
    | "uploaded_voice_sample"
    | "generated_asset"
    | "provider_receipt"
    | "fallback_default";
  sourceAssetId?: string;
  sourceUrl?: string;
  excerpt?: string;
  confidence: number;
  observedAt: string;
  extractor: string;
  consentRequired: boolean;
}

export interface AvatarProfile {
  version: 1;
  avatarId: string;
  userId: string;
  orgId?: string | null;
  brandId?: string | null;
  displayName: string;
  status: AvatarProfileStatus;
  sourceType: AvatarSourceType;
  portrait: {
    assetId: string;
    imageUrl: string;
    thumbnailUrl?: string;
    gcsPath?: string;
    r2Key?: string;
    faceDetected?: boolean;
    identityDescription?: string;
  };
  voice: {
    sourceType: AvatarVoiceSourceType;
    voiceProfileId?: string;
    sampleAssetId?: string;
    ttsVoiceId?: string;
    language?: string;
    speakingStyle?: string;
  };
  persona: {
    defaultRole?: string;
    defaultTone?: string;
    speakingConstraints?: string[];
    killList?: string[];
  };
  rights: {
    consentConfirmed: boolean;
    likenessOwner: "self" | "client" | "licensed" | "unknown";
    commercialUseAllowed: boolean;
    consentArtifactAssetId?: string;
    notes?: string;
  };
  evidence: AvatarEvidence[];
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
}
```

### AvatarGenerationJob

```ts
export type AvatarGenerationJobStatus =
  | "queued"
  | "processing_audio"
  | "processing_lipsync"
  | "persisting"
  | "completed"
  | "failed"
  | "cancelled";

export interface AvatarGenerationJob {
  jobId: string;
  userId: string;
  orgId?: string | null;
  avatarId: string;
  brandId?: string | null;
  source: "thinkforge_export" | "editron_direct" | "avatar_vault_preview";
  script: {
    text: string;
    language?: string;
    sceneIndex?: number;
    segmentIndex?: number;
    durationTargetMs?: number;
  };
  audio: {
    mode: "clone_or_profile" | "tts_selected" | "uploaded_audio";
    inputAudioAssetId?: string;
    generatedAudioAssetId?: string;
    audioUrl?: string;
    words?: Array<{ word: string; startMs: number; endMs: number }>;
  };
  provider: {
    kind: "musetalk" | "wav2lip" | "skyreels" | "duix" | "external_api" | "stub";
    endpointId: string;
    modelVersion?: string;
  };
  output?: {
    videoAssetId: string;
    videoUrl: string;
    gcsPath?: string;
    r2Key?: string;
    durationMs: number;
    hasEmbeddedSpeech: boolean;
    lipSyncScore?: number;
  };
  status: AvatarGenerationJobStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
```

### SceneDescriptor Extension

Do not overload existing `visualDescription` or final render fields. Add avatar intent as input evidence:

```ts
export interface SceneAvatarIntent {
  avatarId: string;
  mode: "custom_lipsync";
  spokenScript: string;
  placementHint?: "full-frame" | "picture-in-picture" | "lower-third-presenter";
  brandId?: string | null;
}

export interface SceneDescriptor {
  sceneType?: "continuous" | "montage" | "logo-reveal" | "text-card" | "talking-head";
  avatarIntent?: SceneAvatarIntent;
}
```

`placementHint` is only an input hint. Editron timeline/composition remains the form owner.

## Control Flow

### Direct Avatar Video

```
Avatar Vault accepted profile
  -> user enters script
  -> create AvatarGenerationJob
  -> resolve portrait asset + voice profile
  -> create/reuse exact audio asset
  -> lip-sync provider returns avatar video
  -> persist video through Editron upload/storage service
  -> create Editron project or add timeline overlay
```

### ThinkForge -> Editron Avatar Scene

```
ThinkForge script blocks
  -> parse SceneDescriptor[]
  -> sceneType "talking-head" + avatarIntent
  -> storyboard/project shell
  -> avatar generation jobs for avatar scenes
  -> completed avatar videos registered as media assets
  -> finalize places avatar videos on ROW.VIDEO
  -> captions/BGM/SFX/MG/director continue as existing Editron work
```

### Provider Boundary

The provider adapter should be replaceable:

```ts
export interface AvatarLipSyncProvider {
  readonly kind: AvatarGenerationJob["provider"]["kind"];
  createVideo(input: {
    avatarImageUrl: string;
    audioUrl: string;
    scriptText: string;
    durationTargetMs?: number;
    userId: string;
    jobId: string;
  }): Promise<{
    remoteVideoUrl: string;
    durationMs: number;
    lipSyncScore?: number;
    providerReceipt?: unknown;
  }>;
}
```

The MIT `PunithVT/ai-avatar-system` repo can be copied/adapted under MIT terms for service ideas and implementation pieces, with license notices preserved. Do not transplant its whole frontend/backend shape into this repo. Adapt the useful boundaries: avatar upload, voice profile, lip-sync worker, progress status, and static fallback.

## Phase Plan

Each phase must touch no more than 5 files and stop for approval.

### Phase 0 - Spec

Files:

- `docs/agents/sessions/editron/Editron-Avatar-Vault-ModeC-Plan-2026-07-01.md`

Done when this spec is committed or explicitly accepted as the implementation contract.

### Phase 1 - Core Types And Lifecycle

Suggested files:

- `lib/avatar/avatar-profile.ts`
- `lib/avatar/avatar-lifecycle.ts`
- `lib/avatar/avatar-repository.ts`
- `tests/avatar/avatar-lifecycle.test.ts`

Acceptance:

1. Draft avatar profile requires review before acceptance.
2. Accepted profile requires consent, portrait asset, and voice source.
3. `brandId` accepts string or null.
4. Accepting a newer profile supersedes prior accepted profile with same `{ userId, orgId, avatarId }`.
5. Tests prove rejection, supersede, missing consent, and optional brand behavior.

### Phase 2 - Avatar Vault Intake UI And API

Suggested split into two subphases if it exceeds 5 files.

Core API files:

- `app/api/avatar-vault/profiles/route.ts`
- `app/api/avatar-vault/profiles/[id]/route.ts`
- `app/api/avatar-vault/uploads/route.ts`

UI files:

- `components/dashboard/AvatarVault/AvatarVaultReview.tsx`
- `components/dashboard/AvatarVault/useAvatarVault.ts`

Acceptance:

1. User can upload portrait and voice sample.
2. User must confirm likeness/voice consent before accepting.
3. Brand toggle defaults off and stores `brandId: null`.
4. Brand selector is shown only when toggle is on.
5. Brand selector reads accepted accessible Brand Vault brands.

### Phase 3 - Generation Job Contract And Stub Provider

Suggested files:

- `lib/avatar/avatar-generation-job.ts`
- `lib/avatar/avatar-generation-service.ts`
- `lib/avatar/providers/stub-lipsync-provider.ts`
- `tests/avatar/avatar-generation-service.test.ts`

Acceptance:

1. Job creation validates accepted avatar profile.
2. Job refuses missing consent or wrong owner.
3. Stub provider returns deterministic fake video metadata.
4. Result is persisted as an Editron-compatible video asset reference.
5. No HappyHorse or generic video fallback is used.

### Phase 4 - Real Lip-Sync Provider

Suggested files depend on deployment choice:

- `lib/avatar/providers/musetalk-provider.ts`
- or `lib/avatar/providers/duix-provider.ts`
- or `lib/avatar/providers/skyreels-provider.ts`
- route/worker wrapper
- provider tests

Acceptance:

1. Provider takes `avatarImageUrl + audioUrl`.
2. Provider returns a video with speech aligned to the supplied audio.
3. Provider errors are recorded on the job without corrupting profile state.
4. Uploaded/generated assets are stored through existing Editron storage.
5. License notice is preserved for copied MIT code.

### Phase 5 - Editron Timeline Integration

Suggested files:

- `lib/pipeline/schemas/storyboard.ts`
- `app/api/services/pipeline/storyboard/[id]/finalize/route.ts`
- `lib/pipeline/scene-to-editron.ts`
- `tests/pipeline/avatar-scene-finalize.test.ts`

Acceptance:

1. Avatar scene output appears on `ROW.VIDEO`.
2. Separate returned audio, if present, appears on `ROW.VOICEOVER`.
3. Captions use returned word timings when available.
4. Non-avatar scenes keep current behavior.
5. Timeline metadata records `avatarId`, job id, source scene, and provider receipt id.

### Phase 6 - ThinkForge Export Integration

Suggested files:

- `components/dashboard/ThinkForge/export/ExportConfigPanel.tsx`
- `components/dashboard/ThinkForge/export/hooks/useExportPipeline.ts`
- `app/api/services/thinkforge/script/export-for-editron/route.ts`
- `tests/pipeline/thinkforge-avatar-export.test.ts`

Acceptance:

1. Export config can select an accepted avatar profile.
2. Export carries `avatarIntent` only when user explicitly chooses avatar.
3. `brandId` is optional and controlled by the brand toggle.
4. `talking-head` scenes do not silently become generic AI video scenes.
5. Existing non-avatar ThinkForge exports remain unchanged.

### Phase 7 - Quality, Safety, And Credits

Likely files:

- `lib/config/creditCosts.ts`
- `lib/avatar/avatar-safety.ts`
- `tests/avatar/avatar-safety.test.ts`
- provider-specific quality test

Acceptance:

1. Avatar generation is metered before provider calls.
2. Long scripts are chunked into bounded jobs.
3. Provider output is speech/transcript checked when feasible.
4. Failed jobs are retryable without duplicating profile acceptance.
5. UI exposes provider failure and consent failure distinctly.

## Explicitly Out Of Scope For Mode C v1

- HappyHorse avatar generation.
- Generic `generateVideoClip` model selection.
- Free-form avatar motion graphics composer.
- Browser-only 3D real-time avatar preview.
- Marketplace/public avatar library.
- Automatic use of project `brandId` without user toggle.
- Claiming Brand Vault, Avatar Vault, ThinkForge, and Editron are unified before code proves the full control flow.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Lip-sync backend is GPU-heavy or slow | Isolate it behind provider adapter and async jobs. Do not run it inside normal Next request budget. |
| Voice cloning creates legal/consent risk | Require accepted profile consent and store consent evidence before generation. |
| Brand binding becomes invisible | Use explicit toggle and selector. Off means `brandId: null`. |
| Avatar scenes accidentally use generic video generation | Keep AvatarGenerationJob separate from `generateVideoClip`; tests assert no HappyHorse/Kling fallback. |
| MG planners try to own avatar placement/form | Keep avatarIntent as evidence only; timeline/finalize owns media placement. |
| Copied MIT implementation drifts from repo patterns | Copy only service/provider pieces and preserve notices; wrap them in local interfaces, auth, credits, storage, and tests. |

## Testing Pyramid

| Layer | What | Minimum tests |
| --- | --- | --- |
| Unit | avatar profile lifecycle, consent validation, optional brand behavior | 6 |
| Unit | generation job validation and provider adapter contract | 5 |
| Integration | avatar job -> video asset registration | 2 |
| Integration | storyboard finalize places avatar video/audio correctly | 2 |
| Integration | ThinkForge export carries avatarIntent only when selected | 2 |
| UI/component | brand toggle stores null/off and selected brand/on | 2 |

## Rollback Plan

Phase 1 and Phase 2 can be disabled by hiding Avatar Vault routes/UI. Profile data is additive and stored in new collections. Phase 3+ generation jobs must be idempotent and cancelable. Editron integration should be additive: if `avatarIntent` or completed avatar job is absent, existing storyboard/finalize paths continue unchanged.

## Definition Of Done

1. A user can create and accept an avatar profile with portrait, voice, and consent.
2. A user can choose whether that avatar is personal/no-brand or bound to an accepted brand.
3. A script can generate a lip-synced avatar video from the accepted avatar.
4. The generated avatar video lands in Editron as a normal media asset and timeline overlay.
5. ThinkForge can request avatar scenes without owning avatar truth or final render form.
6. Tests prove owner scope, consent, optional brand binding, provider failure, and non-avatar regression safety.
