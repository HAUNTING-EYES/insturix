# Editron UI/chat parity matrix v1

This matrix is the human comparison view of the CAP-0 packet. `Yes` under both
UI and chat means only that both surfaces expose the concept. It does **not**
mean they share a command or produce equivalent state.

| Capability family | Manual UI | Chat/Director | Same canonical command? | Current parity | Main discrepancy |
|---|---:|---:|---:|---|---|
| Project load | Yes | Yes | Mostly | `SHARED_CANONICAL` | Both can read ProjectService state, but their projections differ. |
| Manual save/autosave | Yes | No | No | `UI_ONLY` | Whole-state save is not an editorial operation for a planner. |
| Add/update/delete overlay | Yes | Yes | No | `SEMANTICALLY_DIVERGENT` | Browser-local array + later save versus direct ProjectService/family writes. |
| Batch overlay changes | Partial | Yes | No | `SEMANTICALLY_DIVERGENT` | Caption batch, generic batch and whole-array replacement overlap. |
| Duplicate/copy/paste | Yes | No | No | `UI_ONLY` | Browser-local id allocation and clipboard only. |
| Split | Yes | Yes | No | `SEMANTICALLY_DIVERGENT` | Separate source-offset and persistence semantics. |
| Trim | Yes | Yes | No | `SEMANTICALLY_DIVERGENT` | Timeline drag, shorthand and chat do not update identical source fields. |
| Move/retime | Yes | Yes | No | `SEMANTICALLY_DIVERGENT` | V1/V2 drag, shorthand and chat have different collision/range contracts. |
| Layer/row order | Yes | Yes/partial | No | `SEMANTICALLY_DIVERGENT` | Row, z-index and chat layer concepts are not one operation. |
| Close gaps | Yes | Yes | No | `SEMANTICALLY_DIVERGENT` | UI, close_gaps and cut_section have separate ownership. |
| Timeline rows | Yes | No | No | `UI_ONLY` | Browser-only project structure. |
| Undo/redo | Yes | Restore-only | No | `SEMANTICALLY_DIVERGENT` | Browser snapshots versus AI checkpoint CAS; no receipt replay/redo. |
| Playback/seek/zoom | Yes | No | No | `UI_ONLY` | Correctly an interactive, non-project capability. |
| Aspect ratio/reframe | Yes | Descriptor only | No | `SEMANTICALLY_DIVERGENT` | Aspect selector is not a subject-aware reframe workflow. |
| Upload media | Yes | No direct upload | No | `UI_ONLY` | Chat can inspect existing user assets, not upload from the user's device. |
| Search/inspect user assets | Yes | Yes | No | `SEMANTICALLY_DIVERGENT` | Separate browser and resolver evidence paths. |
| Search/place stock video | Yes | Yes | No | `SEMANTICALLY_DIVERGENT` | Pexels UI and chat stock provider paths differ in rights and placement. |
| Search/place stock image | Yes | Partial | No | `SEMANTICALLY_DIVERGENT` | Generic chat stock path is not the same as Pexels image placement. |
| Extract asset segment | Placeholder | No | No | `MISSING` | UI tab has no effect. |
| Lottie/GIF graphic | Yes | No | No | `UI_ONLY` | Persists GIF as `IMAGE`; `LOTTIE` is a panel type, not renderer case. |
| Apply whole edit template | Yes | No | No | `UI_ONLY` | Replaces the full local overlay array and aspect ratio. |
| Sticker | Yes | Generated sticker | No | `SEMANTICALLY_DIVERGENT` | Static `STICKER` and generated `HTML_STICKER` are different forms. |
| HTML scene | Edit UI | Generate/edit | No | `SEMANTICALLY_DIVERGENT` | Panel direct route and chat generation tools have separate owners. |
| Generated scene | No direct form UI | Worker/chat | No | `CHAT_ONLY` | Real renderer exists; authoring and proof are not a manual parity path. |
| Motion graphic/MG sequence | No canonical manual owner | Shadow/Director/workers | No | `SHADOW_LEGACY` | Multiple producers and unmigrated MG child/delivery paths. |
| Transform/opacity/rotation | Yes | Generic update | No | `SEMANTICALLY_DIVERGENT` | Different schemas, collision rules, proof and undo. |
| Keyframes | Yes | Yes + EDL | No | `SEMANTICALLY_DIVERGENT` | Manual, set_keyframes and family resolvers write overlapping tracks. |
| Text content | Yes | Generic add/update | No | `SEMANTICALLY_DIVERGENT` | No shared text capability contract or legibility proof. |
| Text typography/colour/animation | Yes | Generic/sync style | No | `SEMANTICALLY_DIVERGENT` | Manual fields are broader and renderer-specific. |
| Video/image fit/filter/padding | Yes | Filter/generic descriptor | No | `SEMANTICALLY_DIVERGENT` | `apply_filter` is registered but not returned by compatibility `createTools`. |
| Constant speed/speed ramp | Yes | Yes + EDL | No | `SEMANTICALLY_DIVERGENT` | Root `speed`, `styles.playbackRate`, `speedCurve` and speed keyframes conflict. |
| Volume/mute | Yes | Generic/audio workflows | No | `SEMANTICALLY_DIVERGENT` | No shared loudness/audibility proof. |
| Uploaded audio role/rights | Yes | Not equivalent | No | `UI_ONLY` | Manual placement requires role and rights attestation. |
| Music discovery/assignment | Yes | Regenerate BGM | No | `SEMANTICALLY_DIVERGENT` | V2 browser is preview-only; assignment, reference and regeneration differ. |
| SFX search/add/replace | Yes | Yes + EDL | No | `SEMANTICALLY_DIVERGENT` | V1, V2, chat and EDL have separate selection/mix/proof paths. |
| Caption create/import/transcribe | Yes | Yes | No | `SEMANTICALLY_DIVERGENT` | Several producers and timing/style authorities. |
| Caption style | Yes | Batch/fancy tools | No | `SEMANTICALLY_DIVERGENT` | Manual style surface is much broader; no single resolver/proof. |
| Transition placement | Yes | Shadow + EDL | No | `SEMANTICALLY_DIVERGENT` | UI uses direct bridge; live chat filters compatibility authority; EDL resolves form. |
| Beat-sync cuts | No direct control found | Yes | Partial | `CHAT_ONLY` | Real chat path exists; evidence owner is not yet unified with five-track analysis. |
| Transcript/visual/audio analysis | Limited UI consumers | Yes | No | `CHAT_ONLY` | Evidence workflows are chat/worker oriented. |
| Dubbing | Audio placement role only | Yes | No | `CHAT_ONLY` | Translation/job workflow is not equivalent to labeling uploaded audio “dubbing.” |
| Editorial intent | Suggestion/chat UI | Yes | No | `CHAT_ONLY` | Semantic planner owns multi-family workflow; UI suggestions delegate to chat. |
| Reference-driven edit | Reference input UI | Yes | No | `CHAT_ONLY` | Durable queued state is not final reference-match proof. |
| Legacy auto-edit/style transfer | No equivalent | Shadow filtered | No | `SHADOW_LEGACY` | Replaced in live exposure by semantic editorial/reference owners. |
| EDL transition/zoom/fade/etc. | No single UI operation | Yes | No | `CHAT_ONLY` | Family resolvers mutate an in-memory overlay set under an outer workflow. |
| EDL cut/pacing/pan | Manual analogues exist | Declared only | No | `MISSING` | Cut is informational, pacing is no-op, pan has no applying case. |
| AI suggestions | Yes | Delegates to chat | No | `UI_ONLY` | Panel does not own the accepted edit. |
| Quality review | Yes | No | No | `UI_ONLY` | Advisory warnings; not a delivery gate. |
| Scan report | Yes | No | No | `UI_ONLY` | Read-only findings and frame navigation. |
| Start render | Yes | No canonical planner operation | No | `UI_ONLY` | Multiple backends; render completion is not semantic proof. |
| Cancel render | Local UI flag | No | No | `UI_ONLY` | Stops polling; server-side cancellation was not established. |
| Download/analyze/retry output | Yes | No | No | `UI_ONLY` | Delivery/operator operations, not atomic timeline edits. |
| Checkpoint restore | No equivalent canonical UI | Yes | No | `CHAT_ONLY` | CAS restore is real; redo/replay is intentionally unavailable. |
| Shorthand unknown-command fallback | Opens chat | Chat exists | No | `SEMANTICALLY_DIVERGENT` | Constructed `aiPrompt` is discarded instead of handed to chat. |

## Parity conclusion

The code does not support the statement “everything available manually is
already available in chat.” It supports a narrower statement:

> Manual UI, chat and Director cover many of the same editing concepts, and
> several eventually use ProjectService or the same renderer, but most do not
> yet issue the same canonical command or share state, proof and undo semantics.

The next production parity slice must therefore migrate a representative row,
not add a second command registry. CAP-1 is documentation/research only and may
proceed from this matrix without repairing runtime behaviour.
