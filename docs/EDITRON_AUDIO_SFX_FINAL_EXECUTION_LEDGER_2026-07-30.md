# Editron Audio and SFX Final Execution Ledger

Date: 2026-07-30 (IST)

Status: ACTIVE / AUTHORITATIVE FOR REMAINING AUDIO WORK

Deadline decision: semantic SFX retrieval receives work only through 2026-07-31.
If it does not pass the gates in this document, Editron ships with the ordinary
deterministic catalog selector and semantic retrieval is disabled and deferred.

Decision recorded 2026-07-30: **semantic retrieval is disabled and deferred**.
The 49-sound reviewed catalog remains active through ordinary deterministic
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
- Approved: 24
- Rejected: 1
- Pending: 0
- Published: 24
- Approved roles:
  - tick: 16
  - ambience: 5
  - foley: 2
  - logo-sting: 1
- The merged runtime manifest contains 49 reviewed sounds.
- All 24 added object hashes and public proxy responses were verified.
- Full SFX pipeline and runtime regression sweep: 157 of 157 passed.

The formerly pending car-engine recording, source `207483`, was explicitly
approved as ambience on 2026-08-01. The alarm-clock recording, source `209536`,
remains rejected and excluded. The approval of one representative did not
approve its cluster members.

The superseding-review release was incremental and receipt-bound:

- Superseding gate receipt digest:
  `9730cbc6f734811dad54389671e58597201920376c7903c087a895675c1a2bee`
- Incremental aggregate receipt digest:
  `8f74bbc414ebc3c3f158927c4cb7fd9537ba837d475e07095c3e5d246e870b88`
- Catalog promotion receipt digest:
  `1459ab1768087d599b8a07aadb4115a94c68e85e13ab7f77bc1f4188cc12578c`
- Published asset content hash:
  `6c01cf7488c03c7a56a71af0eb375798690c55e8e8fc9e9dd2039fc6173a8ce7`

This updates the deterministic runtime catalog only. It does not rebuild or
re-enable semantic retrieval, which remains disabled under section 4.7.

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

The clean-master/reference-track path is now live-proven by the canary recorded
in section 6.1. Rich user-facing song metadata remains partial: the tested
receipt preserved BPM and reference-only usage, but it had an internal asset ID
for the title, no artists, and no resolved platform cue.

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

### 6.1 Full-scale live canary evidence

The first deployed full-scale canary is recorded against:

- Project: `proj_4N_6crLWX89A`
- Render job: `rnd_DbNZQqYrlh4A`
- Finalization state: `done` through the production R2/CDN delivery path
- Output size: 43,987,542 bytes
- Output SHA-256:
  `09FDC463D15776F616FAB8444CE6588871DA2E41147006F54E2B187DDFBDFCF1`

Independent output inspection proved:

- Container duration: exactly 38.000 seconds
- Video duration: exactly 38.000 seconds
- Audio duration: exactly 38.000 seconds
- Video: H.264, 1920x1080, 30 fps
- Audio: AAC, 48 kHz, stereo
- The failed delivery was recovered by republishing finalization only. The
  renderer was not called again and no additional render credit was consumed.

The reference-only track was absent from the clean MP4. Independent decoded-PCM
comparison against the uploaded reference produced full-length correlation
`-0.0014414`, a one-second-shift control of `-0.0020097`, median one-second-window
correlation `-0.00811`, and maximum absolute one-second-window correlation
`0.0838`. These near-zero results are evidence that the reference recording was
not embedded in the exported audio.

The delivery receipt persisted reference-only usage and BPM `193.5`. Its title
was the internal asset ID `bgm_Q-8zdOA2KMYe`, artists were empty, and the cue was
`manual-cue-required`; therefore real title, artist, and resolved platform cue
metadata are not live-proven.

After a hard editor reload, the 38-second timeline recovered, Clean mode remained
selected, and the track remained marked as a reference. No explicit render-history
surface was available to verify, so project reload is live-proven but render-history
recovery is not.

This canary did **not** prove the following agency/demo conditions:

1. Exported BGM coverage, looping, loudness, or speech ducking. The reference
   track was intentionally excluded and no exportable BGM was present.
2. `music:off` producing zero music across every production path.
3. Restrained transition SFX. This project contained no transition SFX overlay.
4. Restrained motion-graphic SFX. This project contained no MG SFX overlay.
5. Intentional silence behavior. Continuous voiceover was present and no
   silence of at least 300 ms below -50 dB was detected.
6. Explicit render-history recovery.

The overall audio initiative therefore remains active. This canary live-proves
durable exact-duration finalization and reference-only clean export; it does not
close the remaining BGM, music-off, SFX, silence, or history gates.

### 6.2 Zero-credit rendered audio evidence added 2026-08-03

Three local production-shaped Remotion canaries now exercise the production
conditioner, assignment owners, rights gates, render assembler, and final sound
layer without provider, generation, cloud-render, or Editron render-credit calls.

- Exportable BGM receipt:
  `.calibration-temp/bgm-render-canary/2026-08-03T06-19-34-794Z/receipt.json`
  - Conditioned duration: exactly 12,000 ms.
  - Rendered PCM: exactly 576,000 sample frames at 48 kHz stereo.
  - Output loudness: -13.9 LUFS; true peak: -7.6 dBTP.
  - Six loops used a 250 ms equal-power crossfade.
  - Rendered speech ducking measured 11.54 dB and the final 500 ms remained audible.
- Transition/MG SFX receipt:
  `.calibration-temp/sfx-render-canary/2026-08-03T06-16-39-681Z/receipt.json`
  - A licensed catalog whoosh rendered on the whip-pan.
  - A licensed catalog snap rendered on the motion graphic.
  - The dip-to-black window remained exactly silent.
  - Provider API calls: zero.
- Uploaded manual SFX receipt:
  `.calibration-temp/uploaded-sfx-render-canary/2026-08-03T06-28-50-781Z/receipt.json`
  - The server created one owner-attested SFX derivative and one canonical row-0
    timeline overlay, then replayed the same request without a second append.
  - Stored source and derivative evidence passed the render rights authority.
  - Rendered PCM was exactly 144,000 sample frames at 48 kHz stereo.
  - The assigned frame 30-60 window was audible; PCM before and after was exactly
    silent; provider and cloud-render calls were zero.

The BGM and SFX receipts are repeatable local renderer evidence, not deployed-MP4
evidence. `music:off` is covered by the shared policy plus focused tests across
Director, storyboard finalize, and the audio worker; a paid deployed canary is not
needed before the five-minute combined soak.

### 6.3 Audio items to fix or prove later

- Live proof of dynamic speech-gap ducking across a real long-form render
- Rich-title, artist, and resolved-cue proof for the reference-track workflow
- Cleared replacement selection for the `swap` export option
- Paid canary for CassetteAI SFX only when explicitly approved
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

Do not call the overall audio initiative complete until every remaining live
render gate in section 6 passes. The first canary proved only the subset recorded
in section 6.1.

## 12. Immediate order

1. **Complete:** productized finalization-only retry republishes verified renderer
   output without database surgery or another renderer charge.
2. **Production-shaped proof complete:** exportable BGM exact looping, loudness,
   speech ducking, and audible-tail behavior pass the zero-credit renderer canary.
3. **Code/test proof complete:** `music:off` uses one policy across Director,
   storyboard finalize, and the audio worker and produces no music work.
4. **Production-shaped proof complete:** transition, MG, and intentional-silence
   SFX behavior passes the zero-credit renderer canary.
5. **Production-shaped proof complete:** uploaded manual SFX assignment,
   provenance, idempotency, render authority, and rendered timing pass.
6. Repeat reference-only delivery with real title, artist, and cue metadata, and
   verify an explicit render-history surface when one exists.
7. Run the approximately five-minute memory and performance canary.
8. Resume the pinned S6 catalog coverage loop using only observed runtime misses
   and known coverage gaps.
9. Verify provider timeout/outage behavior and run a CassetteAI SFX canary only
   with explicit paid approval.
10. Resume S1-S5 only through a separately approved semantic retrieval effort.

This order is the single active audio plan. Older phase labels remain historical
evidence, not competing execution queues.
