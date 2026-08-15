/** Commit a prepared post-mortem plan into governed learning records. */

import {
  deleteInteractionEventsByIds,
  deleteProjectScopedEntries,
  getSession,
  putGovernedDataBankEntry,
  type DataBankEntry,
} from '../services/db';
import { embedDataBankEntry } from '../services/embedding-service';
import { inspectDataForStorage } from '../privacy/provider-privacy-gateway';
import {
  buildPostMortemMemoryTags,
  PostMortemPreparedPlanSchema,
  resolvePostMortemLessonStorage,
  type PostMortemInput,
  type PostMortemResult,
} from '../post-mortem/post-mortem-contract';
import { preparePostMortemPlan } from '../post-mortem/post-mortem-planner';

export type { PostMortemInput, PostMortemResult } from '../post-mortem/post-mortem-contract';
export { preparePostMortemPlan } from '../post-mortem/post-mortem-planner';

export async function runPostMortemAgent(input: PostMortemInput): Promise<PostMortemResult> {
  return commitPostMortemPlan(await preparePostMortemPlan(input));
}

export async function commitPostMortemPlan(rawPlan: unknown): Promise<PostMortemResult> {
  const plan = PostMortemPreparedPlanSchema.parse(rawPlan);
  const authorizedSession = await getSession(plan.sessionId, plan.userId, plan.orgId);
  if (!authorizedSession) throw new Error('Post-mortem session is unavailable to this actor.');

  const sessionOrgId = nonEmptyString(authorizedSession.orgId) ?? null;
  const sessionBrandId = nonEmptyString(authorizedSession.projectMeta?.brandId) ?? null;
  if (sessionOrgId !== plan.orgId || sessionBrandId !== plan.brandId) {
    throw new Error('Post-mortem prepared plan no longer matches the session authority.');
  }
  if (!plan.output) {
    return { summaryEntryId: null, lessonsExtracted: 0, eventsDeleted: 0, entriesDeleted: 0 };
  }

  const storageInspection = inspectDataForStorage({
    text: JSON.stringify(plan.output),
    declaredPrivacyClass: 'business_confidential',
  });
  if (storageInspection.privacyClass === 'child_data') {
    throw new Error('Post-mortem output contains child data and cannot enter learning.');
  }
  if (storageInspection.containsPersonalData || storageInspection.privacyClass === 'personal') {
    throw new Error('Post-mortem output contains personal data without explicit consent.');
  }

  const principal = { userId: plan.userId, orgId: plan.orgId };
  const scopedInput: PostMortemInput = {
    userId: plan.userId,
    orgId: plan.orgId,
    sessionId: plan.sessionId,
    ...(plan.projectId ? { projectId: plan.projectId } : {}),
    ...(plan.brandId ? { brandId: plan.brandId } : {}),
    ...(plan.projectTitle ? { projectTitle: plan.projectTitle } : {}),
    ...(plan.qualityScore !== null ? { qualityScore: plan.qualityScore } : {}),
    userPublished: plan.userPublished,
  };
  const commitKey = `thinkforge:post-mortem:v${plan.version}:${plan.sessionId}:${plan.sourceEvidenceFingerprint}`;
  const replacementEntries: DataBankEntry[] = [];

  const summaryEntry = await putGovernedDataBankEntry(principal, plan.sessionId, `${commitKey}:summary`, {
    type: 'research',
    title: `Project Summary: ${plan.projectTitle || plan.sessionId.slice(0, 8)}`,
    content: {
      summary: plan.output.projectSummary,
      source: 'post-mortem',
      memoryScope: 'project',
      projectId: plan.projectId ?? undefined,
      brandId: plan.brandId ?? undefined,
      sourceEvidenceFingerprint: plan.sourceEvidenceFingerprint,
    },
    tags: buildPostMortemMemoryTags(
      ['project-summary', 'auto-compressed'],
      { memoryScope: 'project', dataBankScope: 'project', reason: 'project_summary' },
      scopedInput,
    ),
    projectId: plan.sessionId,
    scope: 'project',
    memoryScope: 'project',
    governance: {
      classification: 'business_confidential',
      consentStatus: 'not_required',
    },
  });
  replacementEntries.push(summaryEntry);

  for (const [lessonIndex, lesson] of plan.output.lessons.entries()) {
    const storage = resolvePostMortemLessonStorage(scopedInput);
    replacementEntries.push(await putGovernedDataBankEntry(
      principal,
      plan.sessionId,
      `${commitKey}:lesson:${lessonIndex}`,
      {
        type: 'brand_insight',
        title: lesson.insight.slice(0, 120),
        content: {
          claim: lesson.insight,
          category: lesson.category,
          source: 'post-mortem',
          memoryScope: storage.memoryScope,
          promotionReason: storage.reason,
          projectId: plan.projectId ?? undefined,
          brandId: plan.brandId ?? undefined,
          qualityScore: plan.qualityScore ?? undefined,
          userPublished: plan.userPublished,
          sourceEvidenceFingerprint: plan.sourceEvidenceFingerprint,
        },
        tags: buildPostMortemMemoryTags(
          [lesson.category, 'lesson-learned', 'auto-extracted'],
          storage,
          scopedInput,
        ),
        projectId: plan.sessionId,
        scope: storage.dataBankScope,
        memoryScope: storage.memoryScope,
        governance: {
          classification: 'business_confidential',
          consentStatus: 'not_required',
        },
      },
    ));
  }

  const embeddingResults = await Promise.all(
    replacementEntries.map((entry) => embedDataBankEntry(entry, { alreadyClaimed: true })),
  );
  if (embeddingResults.some((stored) => stored !== true)) {
    throw new Error('Post-mortem replacement embeddings were not durably stored.');
  }

  const eventsDeleted = await deleteInteractionEventsByIds(
    plan.sessionId,
    principal,
    plan.sourceEventIds,
  );
  const entriesDeleted = await deleteProjectScopedEntries(
    plan.sessionId,
    principal,
    plan.sourceEntryIds,
  );
  return {
    summaryEntryId: summaryEntry._id,
    lessonsExtracted: plan.output.lessons.length,
    eventsDeleted,
    entriesDeleted,
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
