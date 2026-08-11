# Editron post-production knowledge source and rights ledger v1

Status: **frozen for K/OE-0 Phase A**
Version: `knowledge-source-ledger-v1`
Frozen: `2026-08-12`
Authority: research evidence only; never executable capability or project truth

## Purpose

This ledger is the source-control layer for the post-production knowledge that
may be supplied to the open-ended planner experiment. It does not teach a
model by copying application manuals. It identifies authoritative sources,
records what may be synthesised from them, and separates general editorial
principles from software-specific button paths.

No entry in this ledger can:

- make an unsupported Editron operation available;
- override an `OperatorSpec`, `PlannerEnvelope`, rights decision or project
  revision;
- install code, shaders, templates, fonts, effects or dependencies;
- be treated as evidence that a customer edit rendered correctly; or
- authorize egress of customer media.

## Closest available curriculum

There is no single authoritative course that covers editorial judgment,
Premiere/Resolve/FCP/Avid operation, compositing, colour, sound, interchange,
delivery and AI orchestration together. The closest broad curriculum spine is
Blackmagic Design's official DaVinci Resolve training because it spans edit,
multicam, colour, Fairlight audio, Fusion/VFX and delivery with downloadable
practice projects. It must be cross-checked with application and standards
sources below rather than treated as a universal vocabulary.

If gaps remain after the coverage map, internally commissioned training videos
may be created. Those recordings must use owned or explicitly licensed media,
fonts and music, and must carry consent, licence, transcript and version data.
Random creator videos and paid courses may not be scraped or republished.

## Rights dispositions

| Disposition | Meaning |
| --- | --- |
| `LINK_AND_SYNTHESIZE_ONLY` | Link and write an original, short, attributed synthesis. Do not copy substantial prose, figures, exercises or project files. |
| `OPEN_STANDARD_SUMMARY` | Summarise the published standard and retain its version. Redistribution of the standards text is not implied. |
| `IMPLEMENTATION_REFERENCE_ONLY` | Study behaviour and interfaces; do not import code/assets without a separate per-file licence review. |
| `INTERNAL_OWNED_FIXTURE` | Editron/Insturix commissions or generates the fixture and records provenance. |
| `BLOCKED_UNTIL_RIGHTS_REVIEW` | Do not retrieve into a model context or benchmark until legal/provenance review is complete. |

## Source ledger

| ID | Authority and source | Coverage extracted | Rights disposition | Retrieval rule | Verification cadence |
| --- | --- | --- | --- | --- | --- |
| `KS-001` | [Blackmagic Design - DaVinci Resolve training](https://www.blackmagicdesign.com/products/davinciresolve/training) | Editing grammar, source/record work, multicam, colour, Fairlight, Fusion and delivery curriculum map | `LINK_AND_SYNTHESIZE_ONLY` | Retrieve only original Editron summaries with source URL and checked date | Re-check each Resolve major release |
| `KS-002` | [Adobe Premiere Pro user guide](https://helpx.adobe.com/premiere-pro/user-guide.html) | Premiere terminology, trims, tracks, effects, captions, colour, audio and export crosswalk | `LINK_AND_SYNTHESIZE_ONLY` | Use for application-equivalent names, not as the neutral definition | Quarterly and on major release |
| `KS-003` | [Apple Final Cut Pro user guide](https://support.apple.com/guide/final-cut-pro/welcome/mac) | Magnetic timeline, auditions, roles, multicam, colour, audio, captions and delivery crosswalk | `LINK_AND_SYNTHESIZE_ONLY` | Use for FCP equivalents and counterexamples to track-only assumptions | On guide revision |
| `KS-004` | [Avid Media Composer learning and support](https://www.avid.com/media-composer/learning-and-support) | Source/record editing, trim modes, bins, script workflows, shared projects and turnovers | `LINK_AND_SYNTHESIZE_ONLY` | Retrieve attributed neutral summaries only | Quarterly |
| `KS-005` | [Foundry Nuke user guide](https://learn.foundry.com/nuke/content/index.html) | Node compositing, channels, mattes, tracking, keying, plates, colour and render concepts | `LINK_AND_SYNTHESIZE_ONLY` | Used only when the requested result requires compositing/VFX reasoning | On Nuke major release |
| `KS-006` | [FFmpeg documentation](https://ffmpeg.org/documentation.html) | Container/codec/filter behaviour, deterministic media probing and transform implementation reference | `IMPLEMENTATION_REFERENCE_ONLY` | No command is executable until allowlisted and fixture-tested | On pinned FFmpeg upgrade |
| `KS-007` | [OpenTimelineIO feature matrix](https://opentimelineio.readthedocs.io/en/v0.14/tutorials/feature-matrix.html) | Interchange support and known per-adapter loss | `LINK_AND_SYNTHESIZE_ONLY` | Preserve explicit loss statements; never imply universal round-trip fidelity | On pinned OTIO upgrade |
| `KS-008` | [Remotion documentation](https://www.remotion.dev/docs/) | React composition, sequencing, rendering and transition implementation reference | `IMPLEMENTATION_REFERENCE_ONLY` | Code/assets require separate licence and dependency review | On pinned Remotion upgrade |
| `KS-009` | [W3C WebVTT specification](https://www.w3.org/TR/webvtt1/) | Timed-text cues, regions, settings and interoperability | `OPEN_STANDARD_SUMMARY` | Bind every summary to the cited spec version | On recommendation revision |
| `KS-010` | [EBU R 128 loudness recommendation](https://tech.ebu.ch/publications/r128) | Programme loudness, true peak and loudness range concepts | `OPEN_STANDARD_SUMMARY` | Use numeric rules only with exact version and delivery context | Annual |
| `KS-011` | [ITU-R BS.1770](https://www.itu.int/rec/R-REC-BS.1770) | Loudness and true-peak measurement algorithm authority | `OPEN_STANDARD_SUMMARY` | Validator implementation must cite the pinned revision | On revision |
| `KS-012` | [SMPTE IMF overview](https://www.smpte.org/standards/st2067) | Interoperable mastering, compositions, versions and delivery packages | `OPEN_STANDARD_SUMMARY` | No claim of compliance without licensed standard access and conformance tests | On standard revision |
| `KS-013` | [Frame.io comments overview](https://help.frame.io/en/articles/9105278-comments-panel-overview) | Timecoded review, annotations, replies and resolution workflow reference | `LINK_AND_SYNTHESIZE_ONLY` | Product-behaviour comparison only | Quarterly |
| `KS-014` | [Frame.io comparison viewer](https://help.frame.io/en/articles/9952618-comparison-viewer) | Version comparison and review interaction reference | `LINK_AND_SYNTHESIZE_ONLY` | Product-behaviour comparison only | Quarterly |
| `KS-015` | [Adobe - when to use Team Projects or Productions](https://helpx.adobe.com/premiere/desktop/collaborate-with-others/collaborate-using-team-projects/when-to-use-team-projects-and-when-to-use-productions.html) | Long-form subdivision and collaboration workflow evidence | `LINK_AND_SYNTHESIZE_ONLY` | Use for scale/workflow requirements, not an Editron architecture mandate | Quarterly |
| `KS-016` | [Adobe Productions shared-storage practices](https://helpx.adobe.com/premiere/desktop/collaborate-with-others/collaborate-using-productions/general-best-practices-for-using-productions-on-shared-storage.html) | Shared master media, storage and collaboration constraints | `LINK_AND_SYNTHESIZE_ONLY` | Preserve platform-specific qualification | Quarterly |
| `KS-017` | [ACES documentation](https://docs.acescentral.com/) | Scene/display transforms, colour pipelines and interchange vocabulary | `OPEN_STANDARD_SUMMARY` | Bind guidance to the exact ACES version and delivery context | On ACES revision |
| `KS-018` | Editron-owned synthetic K/OE media recipes in the frozen task fixtures | Geometry, motion, speech, music, repetition and failure-case evidence used by the benchmark | `INTERNAL_OWNED_FIXTURE` | May be rendered only by the isolated benchmark executor | Per fixture version |
| `KS-019` | Existing `lib/editron/data/creative-knowledge-graph.json` | Current Editron mappings, techniques and constraints | `INTERNAL_OWNED_FIXTURE` | Optional memory condition only; never owner, validator or gold truth | Every graph commit |
| `KS-020` | Existing `docs/agents/reference/general/content_editing_knowledge.md` and `creative_production_knowledge.md` | Historical internal editing notes | `BLOCKED_UNTIL_RIGHTS_REVIEW` | Excluded from K/OE-0 retrieval until every claim receives provenance | One-time provenance audit |

## Coverage map

`COVERED` means an authoritative source is identified. It does not mean Editron
implements the capability.

| Knowledge domain | Primary sources | Source coverage | Editron implementation truth for K/OE-0 |
| --- | --- | --- | --- |
| Editorial grammar and trims | `KS-001`, `KS-002`, `KS-003`, `KS-004` | `COVERED` | Narrow split/trim/cut tools exist; professional NLE semantics are not certified |
| Reference decomposition and montage | `KS-001`, `KS-002`, `KS-003`, `KS-019` | `PARTIAL` | Research behaviour only; no production reference authority |
| Captions and timed text | `KS-002`, `KS-003`, `KS-009` | `COVERED` | Canonical-caption work exists; taste and cross-path convergence are not certified |
| Transitions | `KS-001`, `KS-002`, `KS-003`, `KS-008` | `COVERED` | Existing paths are fragmented and only a bounded subset may enter research |
| Motion graphics/generated composition | `KS-005`, `KS-008`, `KS-019` | `PARTIAL` | Existing HTML/MG paths are not a certified generated-composition sandbox |
| Audio editing and mixing | `KS-001`, `KS-002`, `KS-003`, `KS-004`, `KS-010`, `KS-011` | `COVERED` | Ducking/SFX/music pieces exist; professional mix hierarchy is not certified |
| Colour management and grading | `KS-001`, `KS-002`, `KS-005`, `KS-017` | `COVERED` | Overlay CSS filters are not a professional colour pipeline |
| Compositing, masks, mattes and tracking | `KS-005`, `KS-008` | `COVERED` | Broad production capability is missing |
| Review and approval | `KS-013`, `KS-014` | `COVERED` | Full client review/version workflow is missing |
| Interchange, conform and mastering | `KS-007`, `KS-012`, `KS-017` | `COVERED` | Professional round trips and mastering are missing |
| Long-form collaboration and storage | `KS-004`, `KS-015`, `KS-016` | `COVERED` | Target architecture exists; measured production implementation is incomplete |

## Knowledge-entry extraction contract

Every later `KnowledgeEntryV1` must include:

- stable entry ID and semantic version;
- observable user/result goal, not merely a technique name;
- required and forbidden evidence;
- neutral explanation of the mechanism;
- application-specific vocabulary crosswalk kept outside the neutral rule;
- examples and counterexamples created from owned synthetic fixtures;
- known failure modes and preservation risks;
- source IDs, source URLs, checked dates and rights dispositions;
- applicable operator IDs and explicit non-authority statement;
- reviewer and promotion status.

An entry is rejected if it contains unattributed copied prose, executable web
content, an unsupported Editron operation, a claim without a source, or a
creative decision disguised as a deterministic rule.

## Phase-A exit

This ledger is ready for the frozen planner experiment when all task fixtures
reference only `INTERNAL_OWNED_FIXTURE` media recipes, every retrieved
knowledge entry cites allowed source IDs, and blocked historical notes are
absent from model context.
