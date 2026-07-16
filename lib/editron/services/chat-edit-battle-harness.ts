import { createHash } from 'node:crypto';

import { getChatToolMetadata } from '@/lib/editron/agent/chat-tool-registry';

export const CHAT_EDIT_BATTLE_HARNESS_VERSION = 'editron-chat-battle-v1' as const;

export type ChatBattleRuntimeMode = 'deterministic-fixture' | 'live-provider';
export type ChatBattleMutationExpectation = 'required' | 'forbidden' | 'conditional';
export type ChatBattleStatus = 'pass' | 'warn' | 'fail';

export interface ChatBattleArgumentProhibition {
  tool: string;
  path: string;
  equals: unknown;
  reason: string;
}

export interface ChatBattleScenario {
  id: string;
  label: string;
  prompt: string;
  mutationExpectation: ChatBattleMutationExpectation;
  minimumSuccessfulMutations: number;
  requiredToolSequence: ReadonlyArray<string | readonly string[]>;
  forbiddenTools: readonly string[];
  forbiddenArguments: readonly ChatBattleArgumentProhibition[];
  requireEvidenceBeforeMutation: boolean;
  requireUiReload: boolean;
  requireRenderedEvidence: boolean;
}

export interface ChatBattleToolEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  output?: unknown;
}

export interface ChatBattleInvocationEvidence {
  agentRunId: string;
  mode: ChatBattleRuntimeMode;
  prompt: string;
  responseText: string;
  toolEvents: ChatBattleToolEvent[];
  refusalReason?: string;
  error?: string;
}

export interface ChatBattleOverlaySnapshot {
  id: string;
  type: string;
  from: number;
  durationInFrames: number;
  row: number;
  assetId: string | null;
  digest: string;
}

export interface ChatBattleProjectSnapshot {
  source: 'mongo-before' | 'mongo-after' | 'ui-reload';
  projectId: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  overlayCount: number;
  overlays: ChatBattleOverlaySnapshot[];
  digest: string;
  capturedAt: string;
}

export interface ChatBattleRenderEvidence {
  status: 'pass' | 'warn' | 'fail' | 'missing';
  capturedAt?: string;
  artifactRefs: string[];
  issues: Array<Record<string, unknown>>;
  reason?: string;
}

export interface ChatBattleCheck {
  id: string;
  status: ChatBattleStatus;
  blocking: boolean;
  summary: string;
  evidence: Record<string, unknown>;
}

export interface ChatBattleJourneyReport {
  version: typeof CHAT_EDIT_BATTLE_HARNESS_VERSION;
  journeyId: string;
  scenarioId: string;
  projectId: string;
  startedAt: string;
  completedAt: string;
  verdict: ChatBattleStatus;
  invocation: ChatBattleInvocationEvidence;
  mongoBefore: ChatBattleProjectSnapshot;
  mongoAfter: ChatBattleProjectSnapshot;
  uiReload: ChatBattleProjectSnapshot | null;
  renderEvidence: ChatBattleRenderEvidence;
  checks: ChatBattleCheck[];
}

export interface ChatBattleRuntime {
  loadMongoProject(projectId: string, phase: 'before' | 'after'): Promise<unknown>;
  invokeAgent(input: {
    scenario: ChatBattleScenario;
    projectId: string;
    userId?: string;
    selectedOverlayId?: string;
    clientContext?: Record<string, unknown>;
  }): Promise<ChatBattleInvocationEvidence>;
  reloadUiProject(projectId: string): Promise<unknown>;
  captureRenderEvidence(input: {
    projectId: string;
    startedAt: string;
    mongoAfter: unknown;
  }): Promise<ChatBattleRenderEvidence>;
}

export interface RunChatBattleJourneyInput {
  scenarioId: string;
  projectId: string;
  userId?: string;
  selectedOverlayId?: string;
  clientContext?: Record<string, unknown>;
  journeyId?: string;
  now?: () => Date;
}

export interface ChatBattleSuiteReport {
  version: typeof CHAT_EDIT_BATTLE_HARNESS_VERSION;
  verdict: ChatBattleStatus;
  requiredScenarioCount: number;
  executedScenarioCount: number;
  passedScenarioCount: number;
  missingScenarioIds: string[];
  failedScenarioIds: string[];
}

const READ_PROJECT = ['read_project_file', 'get_timeline_view'] as const;

function scenario(
  id: string,
  label: string,
  prompt: string,
  options: Partial<Omit<ChatBattleScenario, 'id' | 'label' | 'prompt'>> = {},
): ChatBattleScenario {
  return {
    id,
    label,
    prompt,
    mutationExpectation: options.mutationExpectation ?? 'required',
    minimumSuccessfulMutations: options.minimumSuccessfulMutations ?? 1,
    requiredToolSequence: options.requiredToolSequence ?? [],
    forbiddenTools: options.forbiddenTools ?? [],
    forbiddenArguments: options.forbiddenArguments ?? [],
    requireEvidenceBeforeMutation: options.requireEvidenceBeforeMutation ?? true,
    requireUiReload: options.requireUiReload ?? true,
    requireRenderedEvidence: options.requireRenderedEvidence ?? true,
  };
}

export const CHAT_EDIT_BATTLE_SCENARIOS: readonly ChatBattleScenario[] = [
  scenario('explicit-text', 'Explicit text at explicit time', 'Add a bold white title saying Launch day at the top for the first 3 seconds.', { requiredToolSequence: [READ_PROJECT, 'add_overlay'] }),
  scenario('explicit-asset', 'Explicit asset at explicit time', 'Add image asset a_logo123 in the bottom right from 2s to 6s.', { requiredToolSequence: [READ_PROJECT, 'add_overlay'] }),
  scenario('selected-overlay-edit', 'Edit selected overlay', 'Make the selected title larger and move it slightly upward.', { requiredToolSequence: [READ_PROJECT, 'update_overlay'] }),
  scenario('explicit-cut', 'Explicit cut range', 'Cut out 5s to 8s and close the gap.', { requiredToolSequence: [READ_PROJECT, 'cut_section'] }),
  scenario('spoken-phrase-english', 'English phrase without timestamp', 'Remove the words pricing is simple.', { requiredToolSequence: ['resolve_transcript_edit', 'cut_section'] }),
  scenario('spoken-phrase-devanagari', 'Devanagari phrase without timestamp', 'जहाँ मैं कहता हूँ कीमत आसान है वह हिस्सा हटा दो।', { requiredToolSequence: ['resolve_transcript_edit', 'cut_section'] }),
  scenario('untimed-transcript-cache', 'Untimed transcript cache', 'Remove the phrase pricing is simple without asking me for a timestamp.', { requiredToolSequence: ['resolve_transcript_edit', 'cut_section'] }),
  scenario('semantic-transcript-topic', 'Semantic transcript topic', 'Remove the part where I explain why pricing matters.', { requiredToolSequence: ['resolve_transcript_edit', 'cut_section'] }),
  scenario('roman-hinglish-phrase', 'Roman Hinglish phrase', 'Jahan main bolta hoon pricing simple hai woh part hata do.', { requiredToolSequence: ['resolve_transcript_edit', 'cut_section'] }),
  scenario('visual-object-exact', 'Exact visual object reference', 'When the logo appears, add a small highlight around it.', { requiredToolSequence: ['resolve_visual_edit', 'add_overlay'] }),
  scenario('visual-object-paraphrase', 'Visual paraphrase', 'Highlight the shot where the garment sketch is being measured.', { requiredToolSequence: ['resolve_visual_edit', 'add_overlay'] }),
  scenario('inspect-rendered-frame', 'Inspect actual rendered frame', 'Look at the frame under my playhead and tell me what blocks the subject.', { mutationExpectation: 'forbidden', minimumSuccessfulMutations: 0, requiredToolSequence: ['visual_inspect_frame'], requireEvidenceBeforeMutation: false, requireUiReload: false, requireRenderedEvidence: false }),
  scenario('multiasset-script-intake', 'Multi-asset script through intake', 'Arrange every uploaded clip to follow the supplied script.', { requiredToolSequence: [READ_PROJECT, 'auto_edit_from_script'] }),
  scenario('multiasset-script-chat', 'Multi-asset script through chat', 'Use all my uploaded footage and reorder it to match this script exactly.', { requiredToolSequence: [READ_PROJECT, 'auto_edit_from_script'] }),
  scenario('vague-enhance', 'Vague enhancement request', 'Enhance this video so it feels professionally edited.', { requiredToolSequence: [READ_PROJECT], minimumSuccessfulMutations: 1, forbiddenArguments: [{ tool: 'add_transition', path: 'applyToAll', equals: true, reason: 'A vague enhancement request cannot license transitions at every boundary.' }] }),
  scenario('vague-transitions', 'Content-owned transitions', 'Add transitions where they genuinely help the edit.', { requiredToolSequence: [READ_PROJECT, 'add_transition'], forbiddenArguments: [{ tool: 'add_transition', path: 'applyToAll', equals: true, reason: 'Transition opportunities must come from boundary evidence.' }] }),
  scenario('vague-motion-graphics', 'Signal-owned motion graphics', 'Add motion graphics only where the idea is visually explainable.', { requiredToolSequence: [READ_PROJECT], forbiddenTools: ['auto_motion_graphics', 'add_motion_graphic'] }),
  scenario('motivated-zoom', 'Motivated zoom', 'Use a subtle zoom on the strongest spoken emphasis, if the shot supports it.', { requiredToolSequence: ['resolve_keyframe_edit', 'set_keyframes'] }),
  scenario('vague-sfx-beat', 'SFX on a grounded beat', 'Add a subtle impact on the strongest visual or spoken beat.', { requiredToolSequence: ['resolve_audio_edit', 'add_sfx'] }),
  scenario('clean-captions', 'Clean readable captions', 'Add clean readable captions that fit this video.', { requiredToolSequence: [READ_PROJECT, 'add_captions'] }),
  scenario('create-html-scene', 'Create HTML scene', 'Create a full-screen process diagram for this explanation.', { requiredToolSequence: [READ_PROJECT, 'generate_html_scene'] }),
  scenario('edit-html-scene', 'Edit HTML scene in place', 'Change the existing process graphic title to How it works.', { requiredToolSequence: [READ_PROJECT, 'edit_html_scene'] }),
  scenario('bgm-explicit', 'Explicit BGM intent', 'Add restrained cinematic background music with no vocals and keep speech clear.', { requiredToolSequence: [READ_PROJECT, 'regenerate_bgm'] }),
  scenario('bgm-vague', 'Vague BGM intent', 'Add suitable background music for this edit.', { requiredToolSequence: [READ_PROJECT, 'regenerate_bgm'] }),
  scenario('bgm-provider-failure', 'Safe BGM replacement failure', 'Replace the current music with something calmer.', { mutationExpectation: 'conditional', requiredToolSequence: [READ_PROJECT, 'regenerate_bgm'] }),
  scenario('mixed-multi-step', 'Mixed multi-step edit', 'Clean the captions, add one motivated zoom, and add music without covering speech.', { requiredToolSequence: [READ_PROJECT], minimumSuccessfulMutations: 2 }),
  scenario('undo-overlay-edit', 'Undo overlay edit', 'Undo that AI edit.', { requiredToolSequence: ['restore_ai_edit_checkpoint'] }),
  scenario('undo-full-state', 'Undo timing and project state', 'Undo the last AI edit including its timing and project duration changes.', { requiredToolSequence: ['restore_ai_edit_checkpoint'] }),
  scenario('rollback-partial-failure', 'Rollback partial failure', 'Apply these three changes as one edit and leave everything unchanged if any step fails.', { mutationExpectation: 'conditional', requiredToolSequence: [READ_PROJECT], minimumSuccessfulMutations: 2 }),
  scenario('retry-idempotency', 'Interrupted request retry', 'Retry my previous edit without applying anything twice.', { mutationExpectation: 'conditional', requiredToolSequence: [READ_PROJECT] }),
  scenario('project-chat-isolation', 'Project-scoped chat isolation', 'Add a test title only to this project.', { requiredToolSequence: [READ_PROJECT, 'add_overlay'] }),
  scenario('fragmented-sse', 'Fragmented SSE transport', 'Add one title and report the completed edit.', { requiredToolSequence: [READ_PROJECT, 'add_overlay'] }),
  scenario('visible-range-reference', 'Visible timeline reference', 'Tighten this visible section without changing the rest.', { requiredToolSequence: [READ_PROJECT], minimumSuccessfulMutations: 1 }),
  scenario('spatial-cursor-reference', 'Spatial cursor reference', 'Put a small label where my cursor is right now.', { requiredToolSequence: [READ_PROJECT, 'add_overlay'] }),
  scenario('reference-style-transfer', 'Reference style transfer', 'Match the pacing and graphic restraint of my reference video.', { requiredToolSequence: ['extract_style', 'apply_style'], minimumSuccessfulMutations: 1 }),
  scenario('post-edit-render-proof', 'Post-edit pixel and audio proof', 'Add a title, then verify it is readable in the rendered video.', { requiredToolSequence: [READ_PROJECT, 'add_overlay'], requireRenderedEvidence: true }),
] as const;

export function getChatEditBattleScenario(id: string): ChatBattleScenario | undefined {
  return CHAT_EDIT_BATTLE_SCENARIOS.find((item) => item.id === id);
}

export async function runChatEditBattleJourney(
  input: RunChatBattleJourneyInput,
  runtime: ChatBattleRuntime,
): Promise<ChatBattleJourneyReport> {
  const scenarioDefinition = getChatEditBattleScenario(input.scenarioId);
  if (!scenarioDefinition) throw new Error(`Unknown chat battle scenario: ${input.scenarioId}`);
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const beforeProject = await runtime.loadMongoProject(input.projectId, 'before');
  const mongoBefore = buildChatBattleProjectSnapshot(beforeProject, 'mongo-before', startedAt);

  let invocation: ChatBattleInvocationEvidence;
  try {
    invocation = await runtime.invokeAgent({
      scenario: scenarioDefinition,
      projectId: input.projectId,
      userId: input.userId,
      selectedOverlayId: input.selectedOverlayId,
      clientContext: input.clientContext,
    });
  } catch (error) {
    invocation = {
      agentRunId: input.journeyId ?? `failed-${Date.now()}`,
      mode: 'live-provider',
      prompt: scenarioDefinition.prompt,
      responseText: '',
      toolEvents: [],
      error: errorMessage(error),
    };
  }

  const afterProject = await runtime.loadMongoProject(input.projectId, 'after');
  const completedAt = now().toISOString();
  const mongoAfter = buildChatBattleProjectSnapshot(afterProject, 'mongo-after', completedAt);
  let uiReload: ChatBattleProjectSnapshot | null = null;
  try {
    const reloaded = await runtime.reloadUiProject(input.projectId);
    uiReload = buildChatBattleProjectSnapshot(reloaded, 'ui-reload', completedAt);
  } catch {
    uiReload = null;
  }
  const renderEvidence = await runtime.captureRenderEvidence({
    projectId: input.projectId,
    startedAt,
    mongoAfter: afterProject,
  }).catch((error) => ({
    status: 'missing' as const,
    artifactRefs: [],
    issues: [],
    reason: errorMessage(error),
  }));

  return evaluateChatEditBattleJourney({
    journeyId: input.journeyId ?? invocation.agentRunId,
    scenario: scenarioDefinition,
    projectId: input.projectId,
    startedAt,
    completedAt,
    invocation,
    mongoBefore,
    mongoAfter,
    uiReload,
    renderEvidence,
  });
}

export function evaluateChatEditBattleJourney(input: {
  journeyId: string;
  scenario: ChatBattleScenario;
  projectId: string;
  startedAt: string;
  completedAt: string;
  invocation: ChatBattleInvocationEvidence;
  mongoBefore: ChatBattleProjectSnapshot;
  mongoAfter: ChatBattleProjectSnapshot;
  uiReload: ChatBattleProjectSnapshot | null;
  renderEvidence: ChatBattleRenderEvidence;
}): ChatBattleJourneyReport {
  const checks: ChatBattleCheck[] = [];
  const events = input.invocation.toolEvents;
  const completedEvents = events.filter((event) => Boolean(event.completedAt));
  const successfulMutations = completedEvents.filter((event) => isMutatingTool(event.name) && isSuccessfulToolOutput(event.output));
  const failedMutations = completedEvents.filter((event) => isMutatingTool(event.name) && !isSuccessfulToolOutput(event.output));
  const stateChanged = input.mongoBefore.digest !== input.mongoAfter.digest;

  checks.push(check(
    'agent.dynamic-run',
    input.invocation.agentRunId && input.invocation.prompt === input.scenario.prompt && !input.invocation.error ? 'pass' : 'fail',
    true,
    'The report must come from a real agent invocation for this exact prompt.',
    { agentRunId: input.invocation.agentRunId, mode: input.invocation.mode, promptMatches: input.invocation.prompt === input.scenario.prompt, error: input.invocation.error },
  ));
  checks.push(check(
    'agent.tool-completion',
    events.length > 0 && completedEvents.length === events.length ? 'pass' : 'fail',
    true,
    'Every selected tool must have a completed result.',
    { selected: events.map((event) => ({ id: event.id, name: event.name, args: event.args })), completedCount: completedEvents.length },
  ));

  const toolNames = events.map((event) => event.name);
  const sequenceResult = requiredSequenceResult(toolNames, input.scenario.requiredToolSequence);
  checks.push(check(
    'agent.required-owner-path',
    sequenceResult.ok ? 'pass' : 'fail',
    true,
    sequenceResult.ok ? 'The required evidence/owner tool path executed in order.' : 'The required evidence/owner tool path did not execute in order.',
    { toolNames, missingRequirement: sequenceResult.missing },
  ));

  const forbiddenTools = events.filter((event) => input.scenario.forbiddenTools.includes(event.name));
  const forbiddenArguments = input.scenario.forbiddenArguments.flatMap((rule) => events
    .filter((event) => event.name === rule.tool && deepEqual(readPath(event.args, rule.path), rule.equals))
    .map((event) => ({ tool: event.name, args: event.args, reason: rule.reason })));
  checks.push(check(
    'agent.no-forbidden-authority',
    forbiddenTools.length === 0 && forbiddenArguments.length === 0 ? 'pass' : 'fail',
    true,
    'Legacy or ungrounded authority must not satisfy the journey.',
    { forbiddenTools: forbiddenTools.map((event) => event.name), forbiddenArguments },
  ));

  const firstMutationIndex = events.findIndex((event) => isMutatingTool(event.name));
  const priorEvidenceReads = firstMutationIndex > 0
    ? events.slice(0, firstMutationIndex).filter((event) => !isMutatingTool(event.name) && isSuccessfulToolOutput(event.output))
    : [];
  const evidenceSatisfied = !input.scenario.requireEvidenceBeforeMutation || priorEvidenceReads.length > 0;
  checks.push(check(
    'agent.evidence-before-mutation',
    evidenceSatisfied ? 'pass' : 'fail',
    true,
    'Grounding evidence must be read before the first mutation.',
    { firstMutationIndex, priorEvidenceTools: priorEvidenceReads.map((event) => event.name) },
  ));

  const mutationStatus = mutationCheckStatus(input.scenario, successfulMutations.length, failedMutations.length, stateChanged);
  checks.push(check(
    'mongo.mutation-truth',
    mutationStatus,
    true,
    'Successful mutating tools and Mongo state changes must agree.',
    {
      expectation: input.scenario.mutationExpectation,
      successfulMutations: successfulMutations.map((event) => event.name),
      failedMutations: failedMutations.map((event) => event.name),
      stateChanged,
      beforeDigest: input.mongoBefore.digest,
      afterDigest: input.mongoAfter.digest,
    },
  ));

  const reloadMatches = input.uiReload != null && input.uiReload.digest === input.mongoAfter.digest;
  const reloadStatus: ChatBattleStatus = input.scenario.requireUiReload ? (reloadMatches ? 'pass' : 'fail') : (input.uiReload == null || reloadMatches ? 'pass' : 'warn');
  checks.push(check(
    'ui.reload-parity',
    reloadStatus,
    input.scenario.requireUiReload,
    'The editor reload payload must reflect the persisted Mongo result.',
    { required: input.scenario.requireUiReload, mongoDigest: input.mongoAfter.digest, uiDigest: input.uiReload?.digest ?? null },
  ));

  const renderFresh = isFreshTimestamp(input.renderEvidence.capturedAt, input.startedAt);
  const renderStatus: ChatBattleStatus = input.scenario.requireRenderedEvidence
    ? input.renderEvidence.status === 'pass' && renderFresh ? 'pass' : 'fail'
    : input.renderEvidence.status === 'fail' ? 'warn' : 'pass';
  checks.push(check(
    'render.fresh-evidence',
    renderStatus,
    input.scenario.requireRenderedEvidence,
    'Visual/audio mutations require rendered evidence captured after the chat journey began.',
    { required: input.scenario.requireRenderedEvidence, fresh: renderFresh, renderEvidence: input.renderEvidence },
  ));

  const envelopeFailures = completedEvents.filter((event) => !hasDeterministicToolEnvelope(event.output));
  checks.push(check(
    'agent.tool-envelope',
    envelopeFailures.length === 0 ? 'pass' : 'fail',
    true,
    'Every tool result must use the deterministic status/data/error/nextAction envelope.',
    { invalidTools: envelopeFailures.map((event) => event.name) },
  ));

  const verdict = checks.some((item) => item.status === 'fail' && item.blocking)
    ? 'fail'
    : checks.some((item) => item.status === 'warn')
      ? 'warn'
      : 'pass';
  return {
    version: CHAT_EDIT_BATTLE_HARNESS_VERSION,
    journeyId: input.journeyId,
    scenarioId: input.scenario.id,
    projectId: input.projectId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    verdict,
    invocation: input.invocation,
    mongoBefore: input.mongoBefore,
    mongoAfter: input.mongoAfter,
    uiReload: input.uiReload,
    renderEvidence: input.renderEvidence,
    checks,
  };
}

export function buildChatEditBattleSuite(reports: readonly ChatBattleJourneyReport[]): ChatBattleSuiteReport {
  const latestByScenario = new Map<string, ChatBattleJourneyReport>();
  for (const report of reports) {
    if (!getChatEditBattleScenario(report.scenarioId)) continue;
    const previous = latestByScenario.get(report.scenarioId);
    if (!previous || previous.completedAt < report.completedAt) latestByScenario.set(report.scenarioId, report);
  }
  const missingScenarioIds = CHAT_EDIT_BATTLE_SCENARIOS
    .filter((item) => !latestByScenario.has(item.id))
    .map((item) => item.id);
  const failedScenarioIds = [...latestByScenario.values()]
    .filter((report) => report.verdict === 'fail')
    .map((report) => report.scenarioId)
    .sort();
  const passedScenarioCount = [...latestByScenario.values()].filter((report) => report.verdict === 'pass').length;
  const hasWarnings = [...latestByScenario.values()].some((report) => report.verdict === 'warn');
  return {
    version: CHAT_EDIT_BATTLE_HARNESS_VERSION,
    verdict: missingScenarioIds.length > 0 || failedScenarioIds.length > 0 ? 'fail' : hasWarnings ? 'warn' : 'pass',
    requiredScenarioCount: CHAT_EDIT_BATTLE_SCENARIOS.length,
    executedScenarioCount: latestByScenario.size,
    passedScenarioCount,
    missingScenarioIds,
    failedScenarioIds,
  };
}

export function buildChatBattleProjectSnapshot(
  projectValue: unknown,
  source: ChatBattleProjectSnapshot['source'],
  capturedAt: string = new Date().toISOString(),
): ChatBattleProjectSnapshot {
  const project = asRecord(unwrapProject(projectValue));
  const overlays = Array.isArray(project.overlays) ? project.overlays.map(asRecord) : [];
  const overlaySnapshots = overlays.map((overlay) => {
    const material = sanitizeMaterialState(overlay);
    return {
      id: stringValue(overlay.id) ?? '',
      type: stringValue(overlay.type) ?? 'unknown',
      from: finiteNumber(overlay.from),
      durationInFrames: finiteNumber(overlay.durationInFrames),
      row: finiteNumber(overlay.row),
      assetId: stringValue(overlay.assetId),
      digest: digest(material),
    };
  });
  const materialProject = {
    projectId: stringValue(project.projectId ?? project.id) ?? '',
    durationInFrames: finiteNumber(project.durationInFrames),
    fps: finiteNumber(project.fps),
    width: finiteNumber(project.width),
    height: finiteNumber(project.height),
    overlays: overlays.map((overlay) => sanitizeMaterialState(overlay)),
  };
  return {
    source,
    projectId: materialProject.projectId,
    durationInFrames: materialProject.durationInFrames,
    fps: materialProject.fps,
    width: materialProject.width,
    height: materialProject.height,
    overlayCount: overlaySnapshots.length,
    overlays: overlaySnapshots,
    digest: digest(materialProject),
    capturedAt,
  };
}

export function extractPersistedChatBattleRenderEvidence(
  projectValue: unknown,
  startedAt: string,
): ChatBattleRenderEvidence {
  const project = asRecord(unwrapProject(projectValue));
  const intelligence = asRecord(project.intelligence);
  const evidence = asRecord(intelligence.phase0RenderedStillEvidence);
  const gate = asRecord(intelligence.phase0RenderedQualityGate);
  const report = asRecord(intelligence.phase0RenderedAestheticReport);
  const capturedAt = stringValue(evidence.completedAt ?? report.completedAt ?? gate.reviewedAt) ?? undefined;
  const evidenceStatus = stringValue(evidence.status);
  const reportSummary = asRecord(report.summary);
  const reportStatus = stringValue(reportSummary.status ?? report.status);
  const artifactRefs = uniqueStrings([
    ...readStrings(evidence.renderedFrames, ['url', 'artifactUrl', 'frameUrl']),
    ...readStrings(report, ['jsonReport', 'htmlReport', 'artifactUrl']),
  ]);
  const issues = Array.isArray(report.issues)
    ? report.issues.map(asRecord).slice(0, 100)
    : Array.isArray(evidence.issues)
      ? evidence.issues.map(asRecord).slice(0, 100)
      : [];
  if (!capturedAt || !isFreshTimestamp(capturedAt, startedAt)) {
    return { status: 'missing', capturedAt, artifactRefs, issues, reason: 'No fresh rendered evidence exists for this chat journey.' };
  }
  if (evidenceStatus === 'failed' || reportStatus === 'fail') return { status: 'fail', capturedAt, artifactRefs, issues };
  if (evidenceStatus === 'partial' || reportStatus === 'warn') return { status: 'warn', capturedAt, artifactRefs, issues };
  if (evidenceStatus === 'completed' && reportStatus === 'pass') return { status: 'pass', capturedAt, artifactRefs, issues };
  return { status: 'missing', capturedAt, artifactRefs, issues, reason: 'Rendered evidence did not contain a completed aesthetic verdict.' };
}

export function parseChatBattleSse(text: string): Array<Record<string, unknown>> {
  return text
    .split(/\r?\n\r?\n/)
    .flatMap((block) => block.split(/\r?\n/).filter((line) => line.startsWith('data: ')))
    .map((line) => line.slice(6).trim())
    .filter(Boolean)
    .map((payload) => {
      try {
        return asRecord(JSON.parse(payload));
      } catch {
        return { type: 'parse_error', raw: payload };
      }
    });
}

export function chatBattleToolEventsFromSse(
  records: readonly Record<string, unknown>[],
  fallbackStartedAt: string,
): ChatBattleToolEvent[] {
  const events = new Map<string, ChatBattleToolEvent>();
  for (const record of records) {
    const id = stringValue(record.id);
    if (!id) continue;
    if (record.type === 'tool_start') {
      events.set(id, {
        id,
        name: stringValue(record.tool) ?? 'unknown',
        args: asRecord(record.args),
        startedAt: stringValue(record.at) ?? fallbackStartedAt,
      });
    } else if (record.type === 'tool_end') {
      const existing = events.get(id);
      events.set(id, {
        id,
        name: stringValue(record.tool) ?? existing?.name ?? 'unknown',
        args: existing?.args ?? {},
        startedAt: existing?.startedAt ?? fallbackStartedAt,
        completedAt: stringValue(record.at) ?? new Date().toISOString(),
        output: record.output,
      });
    }
  }
  return [...events.values()];
}

function requiredSequenceResult(
  toolNames: readonly string[],
  requirements: ReadonlyArray<string | readonly string[]>,
): { ok: boolean; missing?: string | readonly string[] } {
  let cursor = 0;
  for (const requirement of requirements) {
    const accepted = Array.isArray(requirement) ? requirement : [requirement];
    let match = -1;
    for (let index = cursor; index < toolNames.length; index += 1) {
      if (accepted.includes(toolNames[index])) {
        match = index;
        break;
      }
    }
    if (match < 0) return { ok: false, missing: requirement };
    cursor = match + 1;
  }
  return { ok: true };
}

function mutationCheckStatus(
  scenarioDefinition: ChatBattleScenario,
  successfulMutationCount: number,
  failedMutationCount: number,
  stateChanged: boolean,
): ChatBattleStatus {
  if (scenarioDefinition.mutationExpectation === 'forbidden') {
    return successfulMutationCount === 0 && !stateChanged ? 'pass' : 'fail';
  }
  if (scenarioDefinition.mutationExpectation === 'conditional' && failedMutationCount > 0) {
    return stateChanged ? 'fail' : 'pass';
  }
  return successfulMutationCount >= scenarioDefinition.minimumSuccessfulMutations && stateChanged ? 'pass' : 'fail';
}

function isMutatingTool(name: string): boolean {
  return getChatToolMetadata(name)?.mutatesProject === true;
}

function isSuccessfulToolOutput(output: unknown): boolean {
  const parsed = parseToolOutput(output);
  if (!parsed) return false;
  return parsed.status === 'success' && (parsed.error == null || parsed.error === '');
}

function hasDeterministicToolEnvelope(output: unknown): boolean {
  const parsed = parseToolOutput(output);
  return parsed != null
    && (parsed.status === 'success' || parsed.status === 'error')
    && Object.prototype.hasOwnProperty.call(parsed, 'data')
    && Object.prototype.hasOwnProperty.call(parsed, 'error')
    && Object.prototype.hasOwnProperty.call(parsed, 'nextAction');
}

function parseToolOutput(output: unknown): Record<string, unknown> | null {
  if (output && typeof output === 'object') return asRecord(output);
  if (typeof output !== 'string' || !output.trim()) return null;
  try {
    return asRecord(JSON.parse(output));
  } catch {
    return null;
  }
}

function sanitizeMaterialState(value: unknown, parentKey = ''): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeMaterialState(item, parentKey));
  if (typeof value !== 'object') return String(value);
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    if (isEphemeralProjectKey(key, parentKey)) continue;
    output[key] = sanitizeMaterialState(child, key);
  }
  return output;
}

function isEphemeralProjectKey(key: string, parentKey: string): boolean {
  if (['createdAt', 'updatedAt', 'resolvedAt', 'expiresAt', 'signedUrl', 'publicUrl', 'cachedUrl', 'thumbnailUrl', 'frameUrls'].includes(key)) return true;
  if (key === 'appliedAt' && /receipt/i.test(parentKey)) return true;
  return /^(authorization|cookie|token|apiKey|secret)$/i.test(key);
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unwrapProject(value: unknown): unknown {
  const record = asRecord(value);
  return record.project && typeof record.project === 'object' ? record.project : value;
}

function check(id: string, status: ChatBattleStatus, blocking: boolean, summary: string, evidence: Record<string, unknown>): ChatBattleCheck {
  return { id, status, blocking, summary, evidence };
}

function readPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => asRecord(current)[segment], value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(sanitizeMaterialState(left)) === JSON.stringify(sanitizeMaterialState(right));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readStrings(value: unknown, keys: string[]): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => readStrings(item, keys));
  const record = asRecord(value);
  return keys.map((key) => stringValue(record[key])).filter((item): item is string => Boolean(item));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isFreshTimestamp(value: string | undefined, startedAt: string): boolean {
  if (!value) return false;
  const captured = Date.parse(value);
  const started = Date.parse(startedAt);
  return Number.isFinite(captured) && Number.isFinite(started) && captured >= started;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
