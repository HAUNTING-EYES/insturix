import { isDeepStrictEqual } from "node:util";

import { z } from "zod";

import {
  projectGeneratedCompositionStateSchemaV1,
  type ProjectGeneratedCompositionStateV1,
} from "./project-generated-composition-state-v1";
import { parseProjectGeneratedCompositionStateV1 } from "./project-generated-composition-state-verifier-v1";

const lifecycleFields = {
  ownership: true,
  projectId: true,
  stateIdentity: true,
  renderArtifacts: true,
  verificationDisposition: true,
  proof: true,
} as const;

export const projectGeneratedCompositionDraftSchemaV1 =
  projectGeneratedCompositionStateSchemaV1.omit(lifecycleFields);

export type ProjectGeneratedCompositionDraftV1 = z.infer<
  typeof projectGeneratedCompositionDraftSchemaV1
>;

export const projectGeneratedCompositionEntrySchemaV1 = z.object({
  schemaVersion: z.literal(1),
  compositionId: projectGeneratedCompositionStateSchemaV1.shape.compositionId,
  activeState: projectGeneratedCompositionStateSchemaV1.nullable(),
  candidateState: projectGeneratedCompositionStateSchemaV1.nullable(),
}).strict();

export type ProjectGeneratedCompositionEntryV1 = z.infer<
  typeof projectGeneratedCompositionEntrySchemaV1
>;

export class ProjectGeneratedCompositionEntryValidationErrorV1 extends Error {
  readonly code = "PROJECT_GENERATED_COMPOSITION_ENTRY_INVALID";

  constructor(readonly diagnostics: readonly string[]) {
    super(`Generated composition entry is invalid: ${diagnostics.join(", ")}`);
    this.name = "ProjectGeneratedCompositionEntryValidationErrorV1";
  }
}

export function parseProjectGeneratedCompositionDraftV1(
  value: unknown,
): ProjectGeneratedCompositionDraftV1 {
  const parsed = projectGeneratedCompositionDraftSchemaV1.safeParse(value);
  if (!parsed.success) {
    throw new ProjectGeneratedCompositionEntryValidationErrorV1(
      parsed.error.issues
        .map((issue) => `DRAFT_SCHEMA:${issue.path.join(".")}:${issue.message}`)
        .sort(compareCodeUnits),
    );
  }
  return parsed.data;
}

export function parseProjectGeneratedCompositionStateTokenV1(
  value: unknown,
): string {
  const parsed = projectGeneratedCompositionStateSchemaV1.shape.stateIdentity
    .shape.token.safeParse(value);
  if (!parsed.success) {
    throw new ProjectGeneratedCompositionEntryValidationErrorV1([
      "STATE_TOKEN_INVALID",
    ]);
  }
  return parsed.data;
}

export function createPendingProjectGeneratedCompositionStateV1(
  projectId: string,
  stateToken: string,
  draftValue: unknown,
): ProjectGeneratedCompositionStateV1 {
  const draft = parseProjectGeneratedCompositionDraftV1(draftValue);
  const token = parseProjectGeneratedCompositionStateTokenV1(stateToken);
  return parseProjectGeneratedCompositionStateV1({
    ...draft,
    ownership: {
      projectStateOwner: "PROJECT_SERVICE",
      executionAuthority: "ISOLATED_SANDBOX_ONLY",
      directProjectMutation: "DENY",
    },
    projectId,
    stateIdentity: {
      issuer: "PROJECT_SERVICE",
      token,
    },
    renderArtifacts: [],
    verificationDisposition: "PENDING",
    proof: null,
  });
}

export function parseProjectGeneratedCompositionEntryV1(
  value: unknown,
): ProjectGeneratedCompositionEntryV1 {
  const parsed = projectGeneratedCompositionEntrySchemaV1.safeParse(value);
  if (!parsed.success) {
    throw new ProjectGeneratedCompositionEntryValidationErrorV1(
      parsed.error.issues
        .map((issue) => `ENTRY_SCHEMA:${issue.path.join(".")}:${issue.message}`)
        .sort(compareCodeUnits),
    );
  }

  const activeState = parsed.data.activeState
    ? parseProjectGeneratedCompositionStateV1(parsed.data.activeState)
    : null;
  const candidateState = parsed.data.candidateState
    ? parseProjectGeneratedCompositionStateV1(parsed.data.candidateState)
    : null;
  const diagnostics: string[] = [];
  if (!activeState && !candidateState) diagnostics.push("ENTRY_EMPTY");
  if (activeState?.compositionId !== undefined
    && activeState.compositionId !== parsed.data.compositionId) {
    diagnostics.push("ACTIVE_COMPOSITION_ID_MISMATCH");
  }
  if (candidateState?.compositionId !== undefined
    && candidateState.compositionId !== parsed.data.compositionId) {
    diagnostics.push("CANDIDATE_COMPOSITION_ID_MISMATCH");
  }
  if (activeState && activeState.verificationDisposition !== "PASS") {
    diagnostics.push("ACTIVE_STATE_NOT_PASSING");
  }
  if (candidateState?.verificationDisposition === "PASS") {
    diagnostics.push("PASSING_STATE_NOT_PROMOTED");
  }
  if (activeState && candidateState
    && activeState.projectId !== candidateState.projectId) {
    diagnostics.push("ENTRY_PROJECT_ID_MISMATCH");
  }
  if (activeState && candidateState
    && activeState.stateIdentity.token === candidateState.stateIdentity.token) {
    diagnostics.push("ACTIVE_CANDIDATE_TOKEN_REUSED");
  }
  if (diagnostics.length > 0) {
    throw new ProjectGeneratedCompositionEntryValidationErrorV1(
      diagnostics.sort(compareCodeUnits),
    );
  }

  return {
    ...parsed.data,
    activeState,
    candidateState,
  };
}

export function hasSamePreparedCompositionMaterialV1(
  pending: ProjectGeneratedCompositionStateV1,
  terminal: ProjectGeneratedCompositionStateV1,
): boolean {
  return isDeepStrictEqual(
    withoutLifecycleOutcome(pending),
    withoutLifecycleOutcome(terminal),
  );
}

function withoutLifecycleOutcome(
  state: ProjectGeneratedCompositionStateV1,
): Record<string, unknown> {
  const material = structuredClone(state) as unknown as Record<string, unknown>;
  delete material.renderArtifacts;
  delete material.verificationDisposition;
  delete material.proof;
  return material;
}

function compareCodeUnits(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
