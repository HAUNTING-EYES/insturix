# Final Vibe Content OS Migration Plan (Codex) — GOVERNING DOC (VERBATIM)

> Founder-pasted verbatim 2026-09-03. This document SUPERSEDES the 2026-09-01
> reconstruction and is binding for all studio work. Read BEFORE any work;
> audit trail and per-slice status live in `docs/VIBE_OS_WORK_LOG.md`.
> Deferred, not to be exposed or routed to: **Editron, Musitron, Avatar Vault**.

---

# Final Vibe Content OS Migration Plan

## 1. Locked scope

### Included

- Vibe Project and conversation system
- Home
- Calendar
- Library
- Brands
- Account, organization, billing and connections
- Brand Vault
- ThinkForge backend with a new Vibe-native writing UI
- Clickatron
- CalOS
- UploaderX evolving into Distribution
- Alyzitron
- Socialize with a brand-scoped schema
- Storyboard and preproduction artifacts
- Shared jobs, approvals, receipts and Project status

### Deferred

- Editron
- Musitron
- Avatar Vault

The new architecture may reserve generic video, audio and avatar artifact types, but it will not expose or route to those three systems.

## 2. Canonical hierarchy

```text
Organization
  → Brands
    → Projects
      → Primary Project conversation
      → Content items
        → Artifacts
        → Calendar occurrences
        → Delivery receipts
```

### Organization

Owns:

- Team members
- Roles and permissions
- Billing account
- Storage allowance
- Connected services
- Organization-wide policy

### Brand

Owns:

- Accepted Brand Vault profile
- Brand voice and visual rules
- Evidence and scan history
- Socialize public profile
- Brand-specific connected accounts and assignments

### Project

A Project is the complete goal the user is working toward.

Examples:

- Nike Summer Launch
- September Instagram Plan
- Competitor Campaign Teardown
- Black Friday Carousel Series

A Project can contain one content item or many.

### Content item

A content item is something intended for a channel or publishing occurrence.

Examples:

- One Instagram carousel
- One LinkedIn post
- One YouTube upload
- One campaign email

### Artifact

An artifact is something created or used while completing the Project:

- Brief
- Plan
- Script
- Caption
- Image
- Carousel slides
- Uploaded video
- Storyboard
- Analysis report
- Thumbnail
- Publish package
- Delivery receipt

## 3. One continuous Project conversation

There will not be one planning chat and a separate execution chat.

A new request creates one Project and one primary conversation. That same conversation continues through every phase:

```text
User: Plan a four-post product launch.
Status: Planning

User: Draft the first carousel.
Status: Creating

User: Make visuals for it.
Status: Creating

User: Analyze whether it fits our brand.
Status: Reviewing

User: Put it on Friday.
Status: Needs approval

User: Ship it.
Status: Publishing

Instagram returns a post URL.
Status: Published
```

The conversation stores more than messages. It stores user-visible events such as:

- User request
- Assistant response
- Proposed plan
- Started operation
- Operation progress
- Artifact created
- Artifact selected
- Clarification requested
- Cost approval requested
- Editorial approval requested
- Calendar occurrence created
- Delivery attempted
- Delivery receipt
- Failure or refund
- Project status changed

These records are saved chronologically. Reloading the Project reconstructs the same conversation exactly.

### Conversation persistence rule

The server saves the event before, or at the same time as, it streams the event to the browser.

The browser never becomes the only owner.

If the connection drops:

- The backend operation can continue.
- The user reloads the Project.
- The client requests events after its last saved cursor.
- Missing events reappear.
- The same job is not started twice.

Retries use the same operation ID. This is idempotency: repeating the same request cannot charge twice or publish twice.

## 4. What the Project agent can access

On every turn, the Project agent loads the Project’s authorized context:

- Organization and role
- Brand and accepted Brand Vault revision
- Project goal
- Conversation history
- Current content items
- Current plan
- Focused artifact
- All Project artifacts and versions
- Open jobs
- Open decisions
- Alyzitron reports
- CalOS cards and occurrences
- Delivery status and receipts
- Connected-account health, but never secret tokens
- Library search when explicitly requested

This lets the user ask:

- “What did we decide for the second post?”
- “Use the logo from our Brand Vault.”
- “Find the testimonial video I uploaded last month.”
- “Analyze this version.”
- “Why did Instagram fail?”
- “Move the carousel to Friday.”
- “Ship it.”

### Resolving “it”

The agent resolves vague references in this order:

1. Explicitly mentioned artifact or content item
2. What is currently open in the stage
3. The last selected artifact
4. The last created publishable content item
5. Ask one clarification if multiple candidates remain

For a high-risk action like publishing, it never guesses between multiple items.

## 5. Library is not an upload checkpoint

You are correct: users should not have to leave the Project chat and manually upload their own generated content through Library.

Library is an index and browser for assets. It is not a mandatory transfer step.

### Project-created content

When ThinkForge or Clickatron creates something:

- It receives a stable artifact ID.
- Its storage location is recorded.
- It appears in the Project.
- It automatically becomes discoverable in Library.

### User-uploaded content

A user can upload:

- Directly inside the Project chat
- From the Project stage
- From Library

All three paths create the same kind of asset reference.

### “Ship it” from Project chat

```text
User: Ship this carousel to Instagram.

Project agent:
1. Resolves the focused carousel
2. Loads the selected slide versions and caption
3. Checks the brand’s Instagram connection
4. Checks CalOS approval
5. Shows approval if one is missing
6. Passes the same artifact IDs to Distribution
7. Distribution uploads the media to Instagram internally
8. Stores the Instagram ID and public URL
9. Adds the receipt to the same conversation
10. Advances the Project status
```

No manual Library upload is involved.

For a video, the same applies to an existing uploaded video artifact. This migration can distribute that video even though Editron creation and editing are deferred.

## 6. Project status model

The current shared status system is Editron-shaped, with stages such as editing and rendering, and is stored through the Editron database in [`project-status.ts`](<D:/google downloads/Front-End-main/vibe-os-worktree/lib/shared/project-status.ts:1>). It cannot own the new Content OS lifecycle.

The new Project status is calculated from real Project facts.

### Main phase

```text
Planning
Creating
Reviewing
Scheduled
Publishing
Complete
```

### Attention state

```text
Normal
Needs you
Blocked
Failed
```

### Activity state

```text
Idle
Working
```

These combine into useful dashboard labels:

- Planning
- Creating · writing script
- Creating · generating visuals
- Needs you · select an image
- Needs you · approve 3 posts
- Scheduled · next Friday at 10:00
- Publishing · Instagram
- Partially published · 2 of 4
- Published · 4 of 4
- Blocked · reconnect Instagram
- Failed · analysis refund pending

### Status priority

The dashboard calculates the label in this order:

1. Open user decision: `Needs you`
2. Failed or blocked operation: `Blocked` or `Failed`
3. Active publish job: `Publishing`
4. Active generation or analysis: `Creating` or `Working`
5. Content awaiting approval: `Reviewing`
6. Approved future occurrences: `Scheduled`
7. Some delivery receipts: `Partially published`
8. All expected deliveries completed: `Published`
9. Plan exists but no production started: `Planning`

The chat does not manually declare a Project complete. Real artifact, approval, occurrence and delivery records determine it.

## 7. Four-place interface

### Home

Home is mission control:

- Main composer
- Create a Project
- Resume a Project
- Needs-you queue
- Active work
- Recently updated Projects
- Project status
- Brand filter
- Next scheduled publishing
- Recent delivery results

Submitting the Home composer creates the Project and conversation before work begins. It must not open a mock Project.

### Project page

The Project page is where the continuous conversation lives.

```text
Project header:
Brand · Project name · status · cost · participants

Left:
Persistent conversation

Right:
Contextual stage
```

The stage follows the conversation:

- Plan document
- Script editor
- Clickatron Canvas
- Carousel candidate view
- Storyboard
- Alyzitron report
- Calendar preview
- Approval details
- Delivery receipt

The stage can change without changing the conversation.

### Calendar

Calendar is the real CalOS surface:

- Campaigns
- Content cards
- Review state
- Dates
- Occurrences
- Approval
- Scheduling
- Delivery state

Selecting a calendar item opens its owning Project and the same conversation.

A user can continue talking from there:

> Move this to Friday and change the hook to mention the sale.

That turn can call both ThinkForge and CalOS while remaining in the Project conversation.

### Library

Library contains:

- All Project artifacts
- Uploaded assets
- Scripts
- Images
- Carousels
- Videos
- Reports
- Storyboards
- Published results

Opening an artifact opens its owning Project when one exists.

Library can also attach an existing artifact to the current Project by reference. It does not copy or re-upload it.

### Brands

Brands contains:

- Accepted Brand Vault profile
- Website and evidence sources
- Scan status and history
- Review queue
- Voice suggestions from ThinkForge
- Socialize public profile
- Brand account assignments
- Brand health

### Account

Account remains outside production navigation:

- Organization and members
- Billing and credits
- Platform connections
- Security
- Spend policy
- Autonomy policy
- Storage
- Notification settings

## 8. Ownership map

| Concern | Final owner |
|---|---|
| Project identity and lifecycle | Vibe Content OS |
| Primary conversation and visible event history | Vibe Content OS |
| Cross-service operations and receipts | Vibe Content OS |
| Approved brand truth | Brand Vault |
| Writing and script mutation | ThinkForge backend |
| Visual generation and Canvas edits | Clickatron |
| Campaigns, calendar and editorial approval | CalOS |
| Provider connection and delivery execution | Distribution |
| Analysis result and transcript | Alyzitron |
| Public brand profile | Socialize |
| Storyboard generation | Storyboard/Pipeline |
| Editing and timeline | Deferred Editron |
| Music | Deferred Musitron |
| Avatar profiles and rendering | Deferred Avatar Vault |

The Project chat is the common interface, but it does not replace each service’s specialist logic.

## 9. Core records to add

These are conceptual contracts for the migration, not code being written now.

### Project

Stores:

- `projectId`
- `organizationId`
- `brandId`
- Title and goal
- Primary conversation ID
- Current phase
- Attention/activity state
- Project profile
- Created/updated timestamps

### Conversation event

Stores:

- Event ID
- Project/conversation ID
- Event type
- User or system actor
- Text or card payload
- Artifact, operation or decision reference
- Sequence number
- Timestamp

### Content item

Stores:

- Project and brand
- Platform and format
- Current editorial state
- Selected text/artifact versions
- CalOS reference
- Planned occurrences
- Delivery state

### Artifact link

Stores metadata, not a duplicate of service data:

- Artifact ID and kind
- Owning Project
- Producing service
- Exact service record ID
- Exact version
- Storage asset ID if applicable
- Parent artifacts
- Selected/current status
- Rights
- Created/updated timestamps

### Media asset reference

Stores:

- Stable asset ID
- Owner organization
- Brand and Project
- Storage provider and object key
- MIME type
- Size and duration
- Checksum
- Rights and source
- Derivative relationships
- Access policy

Signed URLs are temporary views, not permanent identity.

### Operation

Stores:

- Operation ID
- Project and conversation
- Requested command
- Current state
- Steps and service job references
- Cost reservation
- Retry state
- Result artifact IDs
- Error/refund information

### Decision request

Supports:

- Clarification
- Select candidate
- Confirm spend
- Approve content
- Confirm publish
- Destructive action
- Reconnect account
- Resolve a failed delivery

### Receipt

Supports:

- Generation
- Billing
- Refund
- Approval
- Scheduling
- Provider delivery
- Final public URL
- Failure/retry

## 10. ThinkForge migration

Keep:

- Writers and agents
- Document-family resolution
- Brand context
- Script persistence
- Billing and refunds
- Selection-edit backend
- Research and source support
- Production-plan generation where independent of Editron

Replace the entire current visible ThinkForge shell with a Vibe-native Write stage.

### New Write stage

- Clean document editor
- Output format and platform shown simply
- Inline script/post editing
- Select text and ask for changes
- Version history
- Brand-context drawer
- Sources/evidence drawer
- Word count and content metadata
- Conflict/reload handling
- “Design this”
- “Analyze this”
- “Add to Calendar”

Remove from the user flow:

- Three-column control room
- Separate Projects
- Whiteboard stub
- Separate Planning mode
- Separate ThinkForge Library
- Clickatron handoff modal
- Editron handoff
- Unwired sidecar actions

### Conversation migration

For old ThinkForge sessions:

- Create or match a Vibe Project.
- Import ThinkForge user/assistant messages with their original IDs and timestamps.
- Link scripts as artifacts.
- Mark imported events as coming from ThinkForge.
- Do not duplicate script contents inside conversation messages.

New Projects write the visible conversation to Vibe from the beginning.

## 11. Clickatron migration

### Normal flow

Inside the same Project conversation:

> Make an Instagram visual for this post.

Vibe shows:

- Spend quote if required
- Real generation status
- Candidate gallery
- Explicit selected candidate
- Refine
- Regenerate
- Use this
- Open Canvas

### Canvas

The existing Canvas becomes the advanced Vibe stage workbench.

No forced navigation to Clickatron Lab.

The visual model must support:

- Candidate group
- Selected candidate
- Immutable previous candidates
- Derivative versions
- Source script/content item
- Brand revision
- Model/provider/cost receipt
- Ordered carousel slides
- Multiple candidates per slide

Hide unfinished Compare, chat, grading and duplicate controls.

## 12. CalOS migration

### Project planning

A Project conversation can begin with:

> Plan four launch posts for next week.

The system:

1. Creates a Plan artifact.
2. Asks CalOS for valid cadence slots.
3. Generates proposals against those slots.
4. Shows the proposal and expected changes.
5. Lets the user accept, edit or remove entries.
6. Writes only accepted entries into CalOS.

No Studio-owned Tuesday/Thursday guesses.

### Calendar rules

- CalOS owns dates and cadence.
- A proposed item is not yet a CalOS card.
- An accepted proposal becomes a CalOS content item.
- Moving and editing are reversible.
- Every planned date becomes one occurrence.
- Each occurrence has its own approval and delivery receipt.
- Editing approved content invalidates that occurrence’s approval.

### Publishing gate

CalOS editorial approval is the only publish authorization.

Vibe presents that approval inside the Project conversation, but acceptance updates the CalOS decision record.

Distribution cannot publish without it.

## 13. Distribution and UploaderX migration

UploaderX becomes the implementation base for parts of Distribution, not a separate tool door.

### Distribution owns

- Connected-account credential access
- Destination capability checks
- Immediate publishing
- Scheduled execution
- Provider retries
- Delivery receipts
- Public provider IDs and URLs
- Reconnect and account-health state

### CalOS owns

- Content item
- Intended platform
- Intended date
- Editorial approval
- Occurrence identity

### Project chat owns the user flow

The user can say:

- “Ship this now.”
- “Post the approved carousel Friday.”
- “Send this video to YouTube as unlisted.”
- “Why did LinkedIn fail?”
- “Retry Instagram.”

Distribution receives the selected Project artifact directly.

### UploaderX UI decomposition

- Upload becomes part of Project and Library.
- Connections move to Account.
- Scheduled work appears in Calendar.
- Delivery state appears in Project, Home and Delivery Monitor.
- Analytics stays hidden until backed by real provider data.
- The standalone Floor retires after parity.

## 14. Alyzitron migration

The same Project conversation can say:

- “Analyze this video.”
- “Compare these two versions.”
- “Does this match our brand?”
- “What are the three biggest weaknesses?”
- “Apply the useful feedback to the script.”

The backend creates a durable analysis job.

The result becomes an Analysis Report artifact shown in the stage.

When the user asks about it, the Project agent loads:

- The authoritative saved report
- Transcript
- Content intent
- Brand-fit result
- Applicable takeaways

It never trusts a report body supplied by the browser.

Before exposure:

- Fix direct-image ingest.
- Fix refund ordering.
- Align organization permissions.
- Route transcription through one billing owner.
- Fix report-chat authority.
- Include lens fields in export.

## 15. Socialize brand migration

Socialize becomes one public profile per brand.

```text
Organization
  → Brand
    → Socialize profile
```

It stores:

- Public slug
- Bio
- Status
- Links and ordering
- Announcements
- Banner and profile image
- Accent/theme
- Revision
- Updated timestamp

### Existing profile migration

- One accessible brand: migrate with an audit record.
- Multiple brands: create a Needs-you task asking which brand owns the profile.
- No brand: retain it as an unassigned legacy profile until a brand is selected.
- Preserve or redirect the existing public URL.
- Do not silently copy one profile to every brand.

Socialize remains in Brands. It is not part of CalOS publishing.

## 16. Storyboard migration

Storyboard remains an artifact within the same Project.

The user can say:

> Turn this script into a storyboard.

The system creates:

- Storyboard job
- Scene cards
- Shot descriptions
- Visual references
- Status and receipt

The stage renders the existing Storyboard workbench where useful.

No Editron handoff is added during this program.

## 17. Migration phases

Each implementation slice must touch no more than five files, pass verification, and stop for approval.

Files over 300 lines require a separate dead-code cleanup commit before structural work. This applies immediately to the current Studio session/thread components and the very large Clickatron Canvas.

### Phase 0: Baseline and authority freeze

- Choose the source commit for every service subsystem.
- Reconcile Vibe, main and newer service branches.
- Do not merge whole historical branches blindly.
- Produce the final capability ledger.
- Mark every capability available, partial, deferred, internal or retired.
- Lock owner, record and consumer for every handoff.

Exit: no unresolved authority or branch-source claim.

### Phase 1: Project and conversation spine

- Add Project persistence.
- Add primary Project conversation.
- Add saved conversation events.
- Create Project before the first agent turn.
- Replace hardcoded deliverable/thread IDs.
- Add reload and reconnect.
- Import existing ThinkForge history.

Exit: planning, plans, receipts and artifacts survive reload and another device.

### Phase 2: Operations, context and status

- Add operation, decision and receipt records.
- Add Project context loader.
- Add artifact/content-item registry.
- Add reliable event streaming and resume.
- Add dashboard status calculation.
- Add job tray and Needs-you index.

Exit: a Project advances from Planning to Published using only real records.

### Phase 3: Four-place shell

- Real Home
- Project conversation/stage
- Calendar place
- Library place
- Brands place
- Account shell
- Brand and Project navigation

Exit: no mock records, synthetic “live” state or legacy new-tab requirement in migrated surfaces.

### Phase 4: Brand Vault and Vibe Write

- Stamp exact accepted Brand revision.
- Add Vibe-native editor.
- Connect ThinkForge backend.
- Preserve full idea and authoring contracts.
- Add versions, selection edits, sources and reload recovery.
- Remove the current ThinkForge UI from the normal path.

Exit: user plans and writes in the same persistent Project conversation.

### Phase 5: Clickatron and Storyboard

- Typed Design command
- Candidate groups and selection
- Carousel slide model
- Canvas in the stage
- Storyboard command and stage
- One billing/job path

Exit: script to selected visuals/storyboard without leaving the Project.

### Phase 6: CalOS and Calendar

- Repair the adapter.
- Add Plan artifact and proposal review.
- Compile accepted proposals.
- Use real CalOS calendar projection.
- Add occurrence identity.
- Add approval invalidation when content changes.

Exit: planning in chat produces truthful Calendar state.

### Phase 7: Distribution

- Add stable media asset references.
- Make upload finalization transactional.
- Consolidate connected accounts.
- Add immediate and scheduled publish jobs.
- Add provider receipts and retry handling.
- Enable “ship it” using the current Project media.

Exit: one Project artifact publishes once with one receipt and no Library detour.

### Phase 8: Alyzitron

- Project analysis command
- Durable task state
- Report artifact
- Same-conversation report questions
- Access and billing fixes
- Export parity

Exit: analysis and follow-up survive reload and remain bound to authoritative results.

### Phase 9: Socialize

- Introduce brand-scoped profile
- Migrate existing profiles
- Build Brands-stage editor
- Add low-risk Project-chat commands
- Implement real QR/download/update state

Exit: each brand has an owned public profile and working public page.

### Phase 10: Backfill, hardening and retirement

- Backfill old service records into Projects and Library.
- Measure read parity.
- Run authorization and retry tests.
- Enable capabilities behind switches that can disable them without redeploying.
- Pilot with selected organizations.
- Redirect old tool routes only after parity.
- Remove mock, dead and duplicate UI after usage evidence.
- Keep Editron, Musitron and Avatar disabled.

## 18. Existing data migration

No destructive database merge.

### ThinkForge

- Session becomes or attaches to a Project.
- Chat messages import into the Project conversation.
- Scripts become artifacts.

### Clickatron

- Tasks with Project/session provenance attach to the Project.
- Unlinked images enter Library as unassigned work.
- User can attach them later.

### CalOS

- Campaigns map to Projects where possible.
- Deliverables become content items.
- Scheduled-publish rows become occurrences and receipts.

### UploaderX

- Owned videos become Library assets.
- Existing project links attach them to Projects.
- Provider metadata becomes delivery history only when a real receipt exists.

### Alyzitron

- Analysis becomes a Report artifact.
- Project-linked analysis attaches automatically.
- Unlinked reports remain searchable in Library.

### Socialize

- Profiles follow the brand-assignment migration above.

Every imported relationship records its origin and migration version.

## 19. Safety rules

- Ask mode is read-only.
- Direct mode may perform low-risk reversible actions.
- Neither mode bypasses spend, editorial approval or destructive-action gates.
- The user approves exact content versions.
- Provider tokens never enter conversation context.
- Missing worker signatures are rejected.
- Every route checks organization, brand and Project access.
- Retryable work carries one operation ID.
- No synthetic progress percentages.
- No “shipped” state without a provider receipt.
- No “published” Project unless expected occurrences have receipts.
- No cross-brand context fallback.

## 20. Verification and launch gates

### Persistence

- Reload after every conversation event.
- Continue on another device.
- Disconnect mid-stream and resume.
- Confirm no duplicated message, job or charge.

### Authorization

- Cross-user denial
- Cross-organization denial
- Removed-member denial
- Brand-access denial
- Connected-account assignment checks

### End-to-end flows

1. Plan → write → design → Calendar → approve → publish
2. Upload video in Project chat → analyze → publish
3. Multi-slide carousel → select per-slide candidates → publish
4. Modify approved content → approval becomes stale
5. Provider timeout → safe retry/reconciliation
6. Multiple possible “ship it” targets → clarification
7. Existing ThinkForge session → imported conversation → continue in Vibe

### Engineering checks

For every implementation slice:

- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --incremental false`
- `node --max-old-space-size=8192 node_modules/eslint/bin/eslint.js . --quiet`
- Relevant unit and contract tests
- Browser E2E
- Visual and accessibility check
- Clean git status

Provider canaries require explicit authorization because they may spend credits or publish externally.

## Investigation report

- Symptom: uncertainty over whether Vibe chats persist.
- Root cause: split persistence. ThinkForge stores its own chat, while Vibe stores cross-service conversation items only in browser state.
- Fix: none, as requested. Planning only.
- Evidence: Studio state/reload path, ignored hardcoded thread ID, ThinkForge ChatModel writes, and absence of a Studio thread API.
- Current branch: `vibe-content-os` at `fee8294a9`, clean.
- Status: `DONE_WITH_CONCERNS`.

Concern: the intended conversation spine is not currently implemented, so it must precede further service UI integration. The investigation skill’s learning logger could not write because Bun is missing; its telemetry completed, and the failed skill upgrade was restored without touching the product repository.