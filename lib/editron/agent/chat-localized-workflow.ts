import {
  resolveChatLocalizedWorkflowAdapter,
  type ChatLocalizedEditRequest,
  type ChatLocalizedWorkflowAdapter,
} from './chat-command-authority';
import type {
  ChatToolExecutionOutcome,
  ChatToolTurnLedger,
  CompletedChatToolExecution,
} from './chat-tool-execution-policy';
import type { ChatRequestOwnerLicense } from './chat-request-owner';

export type ServerOwnedLocalizedWorkflowStep =
  | {
      kind: 'tool-call';
      toolCall: {
        id: string;
        name: string;
        args: Record<string, unknown>;
      };
    }
  | { kind: 'complete'; message: string }
  | { kind: 'halt'; message: string };

const COMPLETED_MUTATION_OUTCOMES = new Set<ChatToolExecutionOutcome>([
  'success',
  'no-op',
]);

export function resolveServerOwnedLocalizedWorkflowStep(input: {
  requestOwnerLicense?: ChatRequestOwnerLicense;
  ledger: ChatToolTurnLedger;
  projectId: string;
  projectRevision: string | null;
}): ServerOwnedLocalizedWorkflowStep | null {
  const license = input.requestOwnerLicense;
  if (
    license?.owner !== 'semantic-editorial-planner'
    || license.semanticWorkflow !== 'localized-mutation'
  ) {
    return null;
  }

  const edits = license.routingFacts?.localizedEdits ?? [];
  if (!input.projectRevision) {
    return {
      kind: 'halt',
      message: 'I could not read the current project revision, so I did not make the edit.',
    };
  }
  if (edits.length === 0) {
    return {
      kind: 'halt',
      message: 'I could not preserve the exact media target for this edit. Please restate what to find and what to change.',
    };
  }

  for (const [index, edit] of edits.entries()) {
    const requestedAdapter = resolveChatLocalizedWorkflowAdapter(edit);
    if (!requestedAdapter) {
      return {
        kind: 'halt',
        message: `I cannot safely perform the requested ${edit.operation} operation on ${edit.modality} evidence yet.`,
      };
    }
    if (isLocalizedZoom(edit)) {
      const zoomStep = resolveLocalizedZoomWorkflowStep({
        edit,
        index,
        adapter: requestedAdapter,
        ledger: input.ledger,
        projectId: input.projectId,
        projectRevision: input.projectRevision,
      });
      if (zoomStep) return zoomStep;
      continue;
    }
    const adapter = resolveGroundedWorkflowAdapter(
      edit,
      requestedAdapter,
      input.ledger.completedExecutions,
    );

    const resolver = latestMatchingResolver(
      input.ledger.completedExecutions,
      adapter.resolverTool,
      adapter.resolverArgs,
    );
    const authorizedMutation = resolver
      ? firstAuthorizedMutation(resolver, adapter.mutationTools)
      : null;
    const mutation = resolver && authorizedMutation
      ? matchingMutationAfter(
        input.ledger.completedExecutions,
        resolver,
        authorizedMutation,
      )
      : null;

    if (mutation && COMPLETED_MUTATION_OUTCOMES.has(mutation.outcome)) {
      continue;
    }
    if (mutation) {
      return { kind: 'halt', message: humanizeWorkflowFailure(mutation) };
    }
    if (resolver && resolver.outcome !== 'success') {
      return { kind: 'halt', message: humanizeWorkflowFailure(resolver) };
    }
    if (resolver && !authorizedMutation) {
      return {
        kind: 'halt',
        message: 'I found the requested moment, but it did not authorize a safe edit, so I left the timeline unchanged.',
      };
    }

    if (!hasCurrentTimelineEvidence(input.ledger, input.projectId, input.projectRevision)) {
      const failedTimelineRead = latestFailedTimelineRead(input.ledger.completedExecutions);
      if (failedTimelineRead) {
        return { kind: 'halt', message: humanizeWorkflowFailure(failedTimelineRead) };
      }
      return toolCall(index, 'timeline', 'get_timeline_view', {
        granularity: 'detailed',
        includeVideo: true,
        includeAudio: true,
        includeText: true,
      }, input.ledger);
    }

    if (!resolver || !authorizedMutation || authorizationIsStale(
      resolver,
      input.projectId,
      input.projectRevision,
    )) {
      return toolCall(
        index,
        'resolver',
        adapter.resolverTool,
        adapter.resolverArgs,
        input.ledger,
      );
    }

    return toolCall(
      index,
      'mutation',
      authorizedMutation.toolName,
      authorizedMutation.args,
      input.ledger,
    );
  }

  return {
    kind: 'complete',
    message: edits.length === 1
      ? 'Done. I grounded the requested moment and completed the authorized workflow.'
      : `Done. I grounded and completed all ${edits.length} authorized workflows in order.`,
  };
}

function resolveGroundedWorkflowAdapter(
  edit: ChatLocalizedEditRequest,
  requestedAdapter: ChatLocalizedWorkflowAdapter,
  executions: CompletedChatToolExecution[],
): ChatLocalizedWorkflowAdapter {
  if (
    edit.operation !== 'camera-motion'
    || edit.cameraMotionJob != null
    || edit.modality !== 'visual'
    || requestedAdapter.resolverTool !== 'resolve_visual_edit'
  ) {
    return requestedAdapter;
  }

  const visualResolver = latestMatchingResolver(
    executions,
    requestedAdapter.resolverTool,
    requestedAdapter.resolverArgs,
  );
  if (!visualResolver || !resolverCandidateUsesAudioEvidence(visualResolver)) {
    return requestedAdapter;
  }

  return resolveChatLocalizedWorkflowAdapter({
    ...edit,
    modality: 'audio',
  }) ?? requestedAdapter;
}

function isLocalizedZoom(edit: ChatLocalizedEditRequest): boolean {
  return edit.operation === 'camera-motion'
    && (edit.cameraMotionJob === 'zoom-in' || edit.cameraMotionJob === 'zoom-out');
}

function resolveLocalizedZoomWorkflowStep(input: {
  edit: ChatLocalizedEditRequest;
  index: number;
  adapter: ChatLocalizedWorkflowAdapter;
  ledger: ChatToolTurnLedger;
  projectId: string;
  projectRevision: string;
}): ServerOwnedLocalizedWorkflowStep | null {
  if (!hasCurrentTimelineEvidence(input.ledger, input.projectId, input.projectRevision)) {
    const failedTimelineRead = latestFailedTimelineRead(input.ledger.completedExecutions);
    if (failedTimelineRead) {
      return { kind: 'halt', message: humanizeWorkflowFailure(failedTimelineRead) };
    }
    return toolCall(input.index, 'timeline', 'get_timeline_view', {
      granularity: 'detailed',
      includeVideo: true,
      includeAudio: true,
      includeText: true,
    }, input.ledger);
  }

  const locator = latestMatchingResolver(
    input.ledger.completedExecutions,
    input.adapter.resolverTool,
    input.adapter.resolverArgs,
  );
  if (!locator) {
    return toolCall(
      input.index,
      'anchor',
      input.adapter.resolverTool,
      input.adapter.resolverArgs,
      input.ledger,
    );
  }
  if (locator.outcome !== 'success') {
    return { kind: 'halt', message: humanizeWorkflowFailure(locator) };
  }

  const anchor = resolveSafeLocatorAnchor(locator);
  if (!anchor.ok) {
    return { kind: 'halt', message: anchor.message };
  }
  const keyframeArgs = {
    targetFrame: anchor.frame,
    direction: input.edit.cameraMotionJob === 'zoom-out' ? 'out' : 'in',
    evidenceModality: input.edit.modality,
    evidenceStrength: anchor.confidence,
  };
  const keyframeResolver = latestMatchingResolver(
    input.ledger.completedExecutions,
    'resolve_keyframe_edit',
    keyframeArgs,
  );
  const authorizedMutation = keyframeResolver
    ? firstAuthorizedMutation(keyframeResolver, new Set(['set_keyframes']))
    : null;
  const mutation = keyframeResolver && authorizedMutation
    ? matchingMutationAfter(
      input.ledger.completedExecutions,
      keyframeResolver,
      authorizedMutation,
    )
    : null;

  if (mutation && COMPLETED_MUTATION_OUTCOMES.has(mutation.outcome)) return null;
  if (mutation) return { kind: 'halt', message: humanizeWorkflowFailure(mutation) };
  if (keyframeResolver && keyframeResolver.outcome !== 'success') {
    return { kind: 'halt', message: humanizeWorkflowFailure(keyframeResolver) };
  }
  if (keyframeResolver && !authorizedMutation) {
    return {
      kind: 'halt',
      message: 'I found the requested moment, but the zoom-form owner declined a safe keyframe treatment, so I left the timeline unchanged.',
    };
  }
  if (
    !keyframeResolver
    || !authorizedMutation
    || authorizationIsStale(keyframeResolver, input.projectId, input.projectRevision)
  ) {
    return toolCall(
      input.index,
      'form',
      'resolve_keyframe_edit',
      keyframeArgs,
      input.ledger,
    );
  }

  return toolCall(
    input.index,
    'mutation',
    authorizedMutation.toolName,
    authorizedMutation.args,
    input.ledger,
  );
}

function resolveSafeLocatorAnchor(
  locator: CompletedChatToolExecution,
): { ok: true; frame: number; confidence: number }
  | { ok: false; message: string } {
  const envelope = parseRecord(locator.output);
  const data = asRecord(envelope?.data);
  const candidates = Array.isArray(data.candidates)
    ? data.candidates.map(asRecord)
    : [];
  const safeCandidates = candidates.filter((candidate) => candidate.safeForAutoEdit === true);
  if (safeCandidates.length !== 1) {
    const message = firstString(data.message, envelope?.message);
    return {
      ok: false,
      message: message
        ?? (candidates.length === 0
          ? 'I could not find a grounded moment for the requested zoom, so I left the timeline unchanged.'
          : 'I found more than one plausible zoom anchor. Please choose the moment before I edit.'),
    };
  }
  const frame = Number(safeCandidates[0]?.frame);
  const confidence = Number(safeCandidates[0]?.confidence);
  if (!Number.isFinite(frame) || frame < 0 || !Number.isFinite(confidence)) {
    return {
      ok: false,
      message: 'The localized zoom anchor was incomplete, so I left the timeline unchanged.',
    };
  }
  return {
    ok: true,
    frame: Math.round(frame),
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

function resolverCandidateUsesAudioEvidence(
  resolver: CompletedChatToolExecution,
): boolean {
  const envelope = parseRecord(resolver.output);
  const data = asRecord(envelope?.data);
  const candidate = asRecord(data.candidate);
  const source = asRecord(candidate.source);
  const path = firstString(source.path)?.toLocaleLowerCase() ?? '';
  return [
    '.audioanalysis.',
    '.audiofeatures.',
    '.musicanalysis.',
    '.musicstructure.',
    '.beatgrid.',
    '.fivetrackanalysis.',
    '.essentiaanalysis.',
  ].some((marker) => `.${path}.`.includes(marker));
}

function latestMatchingResolver(
  executions: CompletedChatToolExecution[],
  toolName: string,
  expectedArgs: Record<string, unknown>,
): CompletedChatToolExecution | null {
  for (let index = executions.length - 1; index >= 0; index -= 1) {
    const execution = executions[index];
    if (
      execution?.name === toolName
      && isDeepSubset(expectedArgs, execution.args)
    ) {
      return execution;
    }
  }
  return null;
}

function firstAuthorizedMutation(
  resolver: CompletedChatToolExecution,
  allowedTools: ReadonlySet<string>,
): { toolName: string; args: Record<string, unknown> } | null {
  for (const receipt of resolver.evidenceReceipts) {
    const mutation = (receipt.authorizedMutations ?? []).find(
      (candidate) => allowedTools.has(candidate.toolName),
    );
    if (mutation) return mutation;
  }
  return null;
}

function matchingMutationAfter(
  executions: CompletedChatToolExecution[],
  resolver: CompletedChatToolExecution,
  mutation: { toolName: string; args: Record<string, unknown> },
): CompletedChatToolExecution | null {
  const resolverIndex = executions.indexOf(resolver);
  return executions.slice(resolverIndex + 1).find(
    (execution) =>
      execution.name === mutation.toolName
      && isDeepSubset(mutation.args, execution.args),
  ) ?? null;
}

function hasCurrentTimelineEvidence(
  ledger: ChatToolTurnLedger,
  projectId: string,
  projectRevision: string,
): boolean {
  return ledger.completedExecutions.some((execution) =>
    execution.evidenceReceipts.some((receipt) =>
      receipt.projectId === projectId
      && receipt.projectRevision === projectRevision
      && receipt.evidenceClass === 'timeline-state',
    ),
  );
}

function latestFailedTimelineRead(
  executions: CompletedChatToolExecution[],
): CompletedChatToolExecution | null {
  for (let index = executions.length - 1; index >= 0; index -= 1) {
    const execution = executions[index];
    if (
      (execution?.name === 'get_timeline_view' || execution?.name === 'read_project_file')
      && execution.outcome !== 'success'
    ) {
      return execution;
    }
  }
  return null;
}

function authorizationIsStale(
  resolver: CompletedChatToolExecution,
  projectId: string,
  projectRevision: string,
): boolean {
  return !resolver.evidenceReceipts.some((receipt) =>
    receipt.projectId === projectId
    && receipt.projectRevision === projectRevision
    && (receipt.authorizedMutations?.length ?? 0) > 0,
  );
}

function toolCall(
  editIndex: number,
  stage: string,
  name: string,
  args: Record<string, unknown>,
  ledger: ChatToolTurnLedger,
): Extract<ServerOwnedLocalizedWorkflowStep, { kind: 'tool-call' }> {
  return {
    kind: 'tool-call',
    toolCall: {
      id: `server-localized:${editIndex}:${stage}:${ledger.completedExecutions.length}`,
      name,
      args,
    },
  };
}

function humanizeWorkflowFailure(execution: CompletedChatToolExecution): string {
  const envelope = parseRecord(execution.output);
  const data = asRecord(envelope?.data);
  const error = asRecord(envelope?.error);
  const message = firstString(
    envelope?.message,
    data.message,
    error.message,
  );
  if (message) return message;
  if (execution.outcome === 'needs-choice') {
    return 'I found more than one possible target. Please choose the moment you meant before I edit.';
  }
  return `I could not safely complete ${execution.name}, so I left the timeline unchanged.`;
}

function isDeepSubset(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((entry, index) => isDeepSubset(entry, actual[index]));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.entries(expected as Record<string, unknown>).every(
      ([key, value]) => isDeepSubset(value, (actual as Record<string, unknown>)[key]),
    );
  }
  return Object.is(expected, actual);
}

function parseRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
