# Editron Audio and SFX Final Execution Ledger

Date: 2026-07-30 (IST)

Status: ACTIVE / AUTHORITATIVE FOR REMAINING AUDIO WORK

Deadline decision: semantic SFX retrieval receives work only through 2026-07-31.
If it does not pass the gates in this document, Editron ships with the ordinary
deterministic catalog selector and semantic retrieval is disabled and deferred.

Decision recorded 2026-07-30: **semantic retrieval is disabled and deferred**.
The 48-sound reviewed catalog remains active through ordinary deterministic
selection.

Observed branch: `infrastructure-improvs-+Editron`

Observed HEAD during this audit: `0b240fe3`

## 1. Scope and source priority

This ledger covers only:

- Background music and uploaded music
- Reference-only chart music and clean-master delivery
- Music discovery and cleared music providers
- Transition, motion-graphic, manual, and generated SFX
- The reviewed SFX catalog and FSD50K candidate corpus
- Semantic SFX retrieval
- The audio portion of the deferred reference-video/trend plan

It does not reopen Grok, HappyHorse, Brand Vault, general ThinkForge, captions,
motion-graphics design, or the wider Editron execution plan.

When sources disagree, use this order:

1. Current production control flow and focused tests
2. Current receipts, manifests, deployed canaries, and commit history
3. This ledger
4. `AUDIO_REFERENCE_BUILD_PLAN_2026-07-24.md`
5. `AUDIO_SFX_PRODUCTION_AUDIT_2026-07-28.md`
6. Historical chat claims and older audits

The architecture decisions in the older documents remain valid. Their old
"remaining work" counts are superseded where later code or receipts prove
completion.

## 2. Verifiable audit record

This ledger was reconciled against:

- Codex task:
  `019f0ef1-782e-74c2-8735-b26b5239cdfd`
- Task JSONL:
  `C:\Users\admin\.codex\sessions\2026\06\28\rollout-2026-06-28T21-25-33-019f0ef1-782e-74c2-8735-b26b5239cdfd.jsonl`
- JSONL size at audit: 233,623,382 bytes
- JSONL records at audit: 62,112
- Human prompts retained after excluding injected instructions and subagent
  notifications: 257
- Claude SFX architecture review:
  `C:\Users\admin\.codex\attachments\29a99e77-de2f-4b49-9446-442a696509b7\pasted-text.txt`
- Claude review SHA-256:
  `7ce1a27cefed231db9d840dd0111764138b9c968f10a94dfb157d8ece2e728df`
- Earlier audio audit attachment:
  `C:\Users\admin\.codex\attachments\08c409ac-2409-4e62-99b4-6c303082f761\pasted-text.txt`
- Earlier audit SHA-256:
  `1ee57a8334356be72cf571609053c4bd83fce89ec63516b5696b652920fa98fa`
- `docs/AUDIO_REFERENCE_BUILD_PLAN_2026-07-24.md`
- `docs/AUDIO_SFX_PRODUCTION_AUDIT_2026-07-28.md`
- `docs/SFX_SEMANTIC_SERVICE_CANARY_2026-07-29.md`
- `docs/REFERENCE_VIDEO_ADAPTIVE_TEMPLATE_PLAN_2026-07-27.md`
- Current `public/sfx/manifest.json`
- Current semantic client, catalog selector, library service, Modal worker, music
  assignment, delivery, renderer, and focused tests
- Relevant branch commits from 2026-07-23 through 2026-07-30

## 3. Product decision

Semantic SFX retrieval is optional intelligence, not a launch dependency.

The agency-ready product must still:

- Add appropriate BGM
- Accept uploaded BGM and SFX
- Support reference-only chart music
- Export a clean master
- Add restrained transition and MG SFX
- Deliberately choose silence
- Block unlicensed render audio
- Render successfully when the semantic service is absent

Semantic retrieval may improve which reviewed catalog asset is selected. It may
not own timing, mix, rights, or the decision to add sound.

`sfx-form.ts` remains the sole owner of:

- Placement versus silence
- Anchor and timing
- Duration budget
- Volume
- Fades
- Speech ducking
- Atomic candidate compatibility

## 4. July 31 semantic go/no-go

### 4.1 Ordinary fallback mode

The ordinary mode is not a degraded or broken mode. It is:

```text
timeline event
  -> deterministic kinetic cue
  -> role, surface, duration, tags, acoustic, and quality gates
  -> reviewed local catalog
  -> Freesound CC0 fallback when allowed
  -> atomic timing and mix
  -> rights-bearing overlay or deliberate silence
```

To activate ordinary mode:

- Remove all semantic retrieval environment values together:
  - `SFX_SEMANTIC_RETRIEVAL_URL`
  - `SFX_SEMANTIC_RETRIEVAL_TOKEN`
  - `SFX_SEMANTIC_MODAL_PROXY_TOKEN_ID`
  - `SFX_SEMANTIC_MODAL_PROXY_TOKEN_SECRET`
- Keep semantic evidence in the manifest. It is harmless when no semantic
  client is configured.
- Keep the Modal implementation and release artifacts for later work.
- Do not delete the reviewed catalog or corpus index.

The current client returns `undefined` when no semantic values are configured,
and the library continues through deterministic catalog selection.

### 4.2 Semantic mode as it exists today

Current verified inventory:

- Published reviewed catalog: 25 assets
- Entries carrying semantic evidence: 25
- Multi-role entries: 0
- Directional entries: 0
- Neutral-direction entries: 25
- Roles:
  - whoosh: 5
  - impact: 3
  - foley: 6
  - tick: 1
  - pop: 4
  - ambience: 2
  - logo-sting: 2
  - shimmer: 2

Current semantic control flow:

```text
hardcoded cue string
  -> signed Modal text embedding query
  -> cosine scores for the 25 approved assets
  -> existing catalog selector
  -> exact-one-role hard gate
  -> atomic quality gate
  -> asset or silence
```

This means semantic retrieval is operational but not yet the open-ended system
in the product vision. CLAP reranks candidates inside the existing hard role
gate. It does not yet receive full animation phase, direction, material, or
motion evidence.

Current deployment evidence:

- Reviewed 25-asset semantic release was committed and deployed.
- Modal deployment `v3` passed authenticated health and signed query checks.
- Response HMAC, release digest, manifest digest, indexed asset count, rejected
  asset absence, and whoosh ranking were verified.
- The Modal worker currently uses `min_containers=0`.
- Earlier live tests showed cold-start calls can exceed the client timeout.
- A standalone signed query does not prove the real Editron placement path uses
  the service during a render.

### 4.3 Work allowed before the deadline

Only these semantic tasks are allowed before the July 31 decision:

1. Publish the already-reviewed batch 115 delta.
2. Build the immutable semantic release for the promoted manifest.
3. Deploy that exact release to the existing Modal worker.
4. Run one real Editron transition/MG selector canary through the configured
   Vercel Preview path.
5. Run a small zero-credit A/B retrieval review against deterministic selection.
6. Decide keep-enabled versus disable-and-defer.

Do not begin the `SfxOpportunity` refactor, role-gate redesign, large evaluation
corpus, trend extraction, or another provider integration before this decision.

### 4.4 Batch 115 state

Review batch:
`fsd50k_review_batch_cee9914e151ace1c320894e7`

Gate state:

- Candidates: 25
- Approved: 23
- Rejected: 1
- Pending: 1
- Published: 23
- Approved roles:
  - tick: 16
  - ambience: 4
  - foley: 2
  - logo-sting: 1
- The merged runtime manifest contains 48 reviewed sounds.
- All 23 added object hashes and public proxy responses were verified.
- Publication gate tests: 25 of 25 passed.

The pending and rejected candidates remain excluded. The approval of one
representative did not approve its cluster members.

### 4.5 Semantic pass gates

Semantic mode remains enabled after July 31 only if all of these pass:

1. **Manifest integrity**
   - Published object hashes match the upload plan.
   - Promotion receipt binds the exact merged manifest.
   - Semantic release binds the exact promoted manifest and 512-dimensional
     vector rows.
2. **Real-path consumption**
   - A production-shaped Editron transition or MG placement calls the live
     semantic client.
   - Its search receipt includes a valid semantic retrieval report.
   - The selected asset reaches an overlay with rights and atomic receipts.
3. **Quality**
   - Human review finds no absurd selection in the deadline A/B set.
   - Semantic ranking is meaningfully better than, or at minimum equal to, the
     deterministic selector on ambiguous queries.
   - Low-energy and speech-heavy moments still choose silence when required.
4. **Reliability**
   - Three consecutive production-client calls complete within the configured
     timeout without manual intervention.
   - Idle/cold behavior is measured, not assumed.
   - A remote failure cannot leave the editor in a repeatedly failing state.
5. **Cost decision**
   - Any proposal to set `min_containers=1` must include an explicit ongoing
     cost decision. It is not silently enabled to make the canary pass.

The exact CLAP similarity threshold, role penalty, and cache tolerance are not
locked. Claude's suggested constants are research hypotheses, not production
configuration.

### 4.6 Semantic fail decision

Any one of these is enough to disable semantic mode:

- The real Editron path does not call it.
- Cold or warm calls repeatedly exceed the client timeout.
- Semantic ranking does not improve useful selection.
- It produces an absurd match.
- The exact release/manifest binding cannot be proven.
- Keeping it responsive requires unapproved ongoing spend.
- A remote outage makes ordinary auto-edit fail.

Failure action:

1. Remove the complete semantic environment set from Vercel Preview and
   Production.
2. Keep Modal at zero minimum containers or stop the deployment.
3. Confirm deterministic catalog selection and Freesound fallback still pass.
4. Mark phases S1-S5 below as deferred.
5. Continue the full-scale video canary using ordinary mode.

No emergency rewrite is permitted on July 31.

### 4.7 Decision outcome recorded 2026-07-30

The exact 48-entry semantic release passed its integrity and real-path gates:

- Release receipt digest:
  `882140458b24b5a4dfc8d5fa929136e826499204cf6a339c832997e7ed198b68`
- Promoted manifest digest:
  `c9ed837ebc249cbc77d07a17b0b9dfaf5bf37d67a8b4cd2fd5258f4698693baa`
- The production-shaped render canary selected one transition SFX and one
  motion-graphic SFX, carried rights and semantic receipts into the overlays,
  rendered both audible, retained deliberate silence, and made zero provider or
  paid-generation calls.
- Render receipt:
  `.calibration-temp/sfx-render-canary/2026-07-30T05-01-37-401Z/receipt.json`

The release failed the quality and outage gates:

- Idle/cold signed query: 7,115.8 ms.
- Five following warm queries: 335.9-818.3 ms.
- All six calls stayed within the configured 10,000 ms timeout.
- `soft keyboard typing foley` selected a three-knock recording.
- `paper rustle handling foley` selected a car-door recording with negative
  query similarity.
- A forced semantic outage rejected `searchAndDownloadSFX` before deterministic
  catalog selection, so ordinary editing did not survive the remote failure.
- Rollout audit receipt:
  `.calibration-temp/sfx-semantic-rollout/2026-07-30T05-09-31-583Z/receipt.json`

The fail action is complete:

- The complete semantic environment set is absent from the approved Vercel
  Preview branch and Production.
- Modal remains scale-to-zero; the deployment and immutable artifacts are
  retained for deferred research.
- Semantic evidence remains in the manifest.
- Deterministic catalog selection, deliberate silence, and Freesound fallback
  regression coverage passed: 34 of 34 focused tests.

Do not re-enable semantic retrieval until the deferred design addresses both
quality calibration and outage isolation, then reruns every gate in section
4.5.

## 5. What is complete

### 5.1 Music and BGM

Substantially wired and covered:

- Generated BGM
- Uploaded BGM
- Exact-duration trim/loop
- Equal-power loop crossfade
- Pre-render LUFS normalization
- Silence and clipping guards
- Music coverage planning: none, sections, full
- Runtime coverage application
- `musicPreference === 'none'`
- Editorial music-off suppression
- Beat/BPM analysis
- Beat-aware cut realignment
- BGM ducking configuration and rendered envelope support
- Uploaded-audio rights and attestation
- Fail-closed render rights gate
- Render consumption of rights-bearing music

### 5.2 Reference-only music

Implemented in code and focused tests:

- Assignment mode `reference-only`
- Add-time choice between embedded and reference-only usage
- Timeline/reference state
- Clean-master delivery contract
- Pre-render exclusion planning
- Platform-native music handoff receipt
- Delivery metadata tests
- Clean-master UI controls and history/progress parsing

What remains is a real live editor-to-render battle test, not another data-model
rewrite.

### 5.3 SFX

Substantially wired:

- Transition kinetic hints
- Motion-graphic kinetic events
- Real MG choreography landing anchors
- Speech-energy abstention
- Energy floors
- Editorial density gap
- Atomic form-resolved silence
- Catalog quality and acoustic gating
- Rights-bearing SFX overlays
- Rendered SFX mix and ducking consumption
- Freesound CC0 provider fallback
- Dedicated CassetteAI/FAL SFX fallback in code
- Human listening approval gates
- Content-addressed publication
- Full FSD50K source acquisition and controlled extraction
- Checkpointed acoustic inspection
- Full-corpus pinned CLAP embeddings
- Full-corpus candidate index for discovery/review only
- Reviewed semantic release and authenticated Modal worker

The full-corpus index is not a production catalog. Only individually reviewed,
published assets may be selected.

## 6. What remains after the semantic decision

### 6.1 Required for agency/demo confidence

These remain required even if semantic mode is disabled:

1. Run one full-scale video through the real editor and renderer.
2. Verify music coverage, loudness, looping, and ducking in the rendered MP4.
3. Verify `music:off` produces zero music.
4. Verify a transition-heavy section receives restrained SFX.
5. Verify an MG-heavy section receives restrained SFX.
6. Verify speech-heavy moments and ordinary cuts can remain silent.
7. Verify every audible overlay has a rights receipt.
8. Verify a reference-only chart song plays in preview but is absent from the
   clean master.
9. Verify the delivery receipt preserves title, artist, cue window, timeline
   offset, BPM, and beat-entry information.
10. Verify the output is usable after reload and in render history.

### 6.2 Audio items to fix or prove later

- Live proof of dynamic speech-gap ducking across a real long-form render
- Live proof of the clean-master/reference-track workflow
- Cleared replacement selection for the `swap` export option
- Paid canary for CassetteAI SFX only when explicitly approved
- Uploaded manual SFX provenance and assignment battle test
- Provider outage and timeout behavior in a full edit
- Long-form memory/performance proof for videos around five minutes

## 7. Deferred semantic architecture and pinned catalog coverage

S1-S5 are deferred because the semantic go/no-go failed. They may resume only
as a separately approved effort after the agency canary. S6 remains pinned
because deterministic catalog coverage still benefits ordinary mode.

### S1. Fill the existing retrieval contract [DEFERRED]

Pass existing evidence into catalog retrieval:

- surface
- direction
- motion speed
- material

Do not change role behavior in this phase.

Exit:

- Reports prove the fields are populated.
- Current neutral catalog selection does not regress.
- Focused tests cover transition and MG callers.

### S2. Build the evaluation harness [DEFERRED]

Build before changing role eligibility:

- Every transition family and direction
- Existing MG families
- Open cues outside the five current MG kinds
- Speech-heavy cases
- Low-energy intentional-silence cases
- Human-labelled acceptable and absurd sets

Metrics:

- recall at 1
- recall at 5
- absurd selection rate
- silence retention
- cross-role selection log
- cache hit rate
- latency and request count

One high-severity absurd selection blocks the role-gate change.

### S3. Add the central `SfxOpportunity` adapter [DEFERRED]

Use the low-change architecture:

```text
existing final overlay receipt and choreography
  -> deriveSfxOpportunity()
  -> existing retrieval request
  -> existing sfx-form
  -> asset or silence
```

The adapter reads existing evidence. It does not mutate every producer and does
not extend the atomic overlay receipt contract.

Evidence may include:

- surface
- animation phase
- anchor frame
- motion vector and speed
- material hint
- prominence
- speech pressure
- local audio density
- negative terms
- confidence
- human-readable cue

Use a quantized opportunity cache key so richer queries do not create unlimited
semantic or provider requests.

### S4. Reform the role gate [DEFERRED]

Only after S2 and S3 pass:

- Infer multiple plausible roles.
- Allow assets to carry multiple roles.
- Treat role agreement as ranking evidence rather than a universal veto.
- Keep hard rejection for incompatible surface, duration, blocked tags,
  atomic incompatibility, quality, and rights.
- Require higher semantic confidence for a cross-role selection.
- Preserve silence when evidence is weak.

No numeric penalty or threshold is accepted without evaluation.

### S5. Catalog enrichment and rendered canaries [DEFERRED]

- Add reviewed multi-role metadata.
- Add direction and material evidence where genuinely supported.
- Do not fabricate left/right labels for neutral audio.
- Run transition-heavy, MG-heavy, and speech-heavy rendered canaries.
- Confirm rights receipts, semantic reports, and silence behavior.

### S6. Active coverage loop [PINNED]

Do not manually review all 536 generated review batches.

Use:

```text
runtime miss or known coverage gap
  -> retrieve representative corpus clusters
  -> human listening batch
  -> explicit per-asset approval
  -> publish
  -> rendered canary
```

The corpus is a candidate pool. It is not a product library until each selected
asset clears review and publication.

## 8. Music provider and discovery ledger

### Continue

- YouTube for broad discovery and preview/link handoff
- MusicBrainz for canonical recording identity and aliases
- User uploads for owned or reference-only music
- Generated music for export-safe originals
- Existing rights-aware discovery contract

MusicBrainz identifies recordings; it does not provide playable song audio.

### Operationally gated

Epidemic Sound:

- Search adapter and ingest foundations exist.
- A live branch-scoped search was previously proven.
- Production download/ingest remains gated by the actual partner agreement and
  Editron's operator-supplied contract reference.
- An API key alone does not prove sublicensing or client-export rights.

### Deferred

- Soundstripe adapter
- Apple Music token/provider activation
- Broader platform-native publishing integrations
- Automatic cleared-track replacement when no populated cleared catalog exists

### Explicitly rejected

- `yt-dlp` or equivalent downloading of unauthorized YouTube/YouTube Music
  audio for rendering
- Baking Spotify, YouTube, Instagram, or TikTok catalog audio into an export
  without the required rights

Spotify and broad music search are discovery/reference signals. They are not
render-audio suppliers.

## 9. Deferred trend/reference-video plan

`REFERENCE_VIDEO_ADAPTIVE_TEMPLATE_PLAN_2026-07-27.md` remains pinned and
deferred. Do not begin it before:

- BGM battle canary passes
- SFX go/no-go is closed
- Reference-only preview and clean export are battle-tested
- Render-boundary rights behavior is proven

The existing R0-R6 order remains:

- R0: evaluation corpus
- R1: canonical private asset and demux
- R2: measured cuts, beats, sections, onsets, energy, and silence
- R3: soundtrack identity
- R4: canonical `EditFingerprint`
- R5: adaptive planning
- R6: rendered similarity verification

Required SFX clarifications:

- R0 annotations include timecoded reference SFX events.
- R2 emits a timecoded SFX event map with confidence and algorithm version.
- R4 adds `sfxEvents` to `EditFingerprint`.
- Separation-derived audio is analysis-only and never a render input.
- R5 adapts structural SFX placement using approved Editron assets.

The trend system will not:

- Clone every source timestamp
- Treat Gemini-authored beats as measured evidence
- Copy isolated reference SFX into the target render
- Download an unauthorized soundtrack
- Force SFX into charged silence

## 10. Deferred music-first work

True music-first composition remains a later architecture phase:

- Composer chooses candidate shot lengths from measured beat/section evidence.
- Speech and action continuity retain authority.
- The existing realignment pass remains the fallback.
- The system avoids metronomic edits and beat-locking every cut.

This is not required for the July 31 semantic decision.

## 11. Status vocabulary

Use these terms consistently:

- **Complete:** control flow and final consumer are proven in code and tests.
- **Live-proven:** a deployed production-shaped canary passed.
- **Partial:** shared plumbing exists but one or more real paths remain unproven.
- **Pinned:** accepted work with an explicit future order.
- **Deferred:** intentionally not being built in the current deadline.
- **Operationally gated:** code exists but credentials, contract, cost, or a live
  provider decision blocks activation.
- **Rejected:** not part of the product direction.

Do not call the overall audio initiative complete until the full-scale rendered
canary in section 6 passes.

## 12. Immediate order

1. Run the full-scale video canary in ordinary deterministic mode.
2. Verify every agency/demo condition in section 6.1 against the rendered
   output, editor state, and delivery receipt.
3. Record canary findings and exact evidence paths in this ledger.
4. Fix only blockers exposed by the full-scale canary, with focused regression
   coverage.
5. Resume the pinned S6 catalog coverage loop after the canary findings are
   recorded.
6. Resume S1-S5 only through a separately approved semantic retrieval effort.

This order is the single active audio plan. Older phase labels remain historical
evidence, not competing execution queues.
