import type { Collection } from 'mongodb';
import { hashEditronCanonicalJsonV1 } from './canonical-json-v1';
import {
  assertEditorialPlanExecutionDefinitionV1,
  EDITORIAL_PLAN_EXECUTION_DEFINITION_COLLECTION_V1,
  type EditorialPlanExecutionDefinitionV1,
} from './editorial-plan-execution-definition-v1';
import { assertEditorialPlanSuccessorV1 } from './editorial-plan-successor-v1';
import {
  assertEditorialPlanRevisionV1,
  EDITORIAL_PLAN_REVISION_COLLECTION_V1,
  type EditorialPlanRevisionV1,
} from './editorial-plan-v1';

export interface EditorialPlanRevisionRecordV1 {
  _id: string;
  tenantId: string;
  idempotencyKey: string;
  storedAt: Date;
  plan: Readonly<EditorialPlanRevisionV1>;
}

export interface EditorialPlanExecutionDefinitionRecordV1 {
  _id: string;
  tenantId: string;
  idempotencyKey: string;
  storedAt: Date;
  definition: Readonly<EditorialPlanExecutionDefinitionV1>;
}

type CollectionsV1 = Readonly<{
  plans: Collection<EditorialPlanRevisionRecordV1>;
  definitions: Collection<EditorialPlanExecutionDefinitionRecordV1>;
}>;
type CollectionsProvider = () => Promise<CollectionsV1>;

async function mongoCollections(): Promise<CollectionsV1> {
  const { getDatabase } = await import('@/lib/editron/db/mongodb');
  const db = await getDatabase();
  return {
    plans: db.collection(EDITORIAL_PLAN_REVISION_COLLECTION_V1),
    definitions: db.collection(EDITORIAL_PLAN_EXECUTION_DEFINITION_COLLECTION_V1),
  };
}

export class EditorialPlanStoreConflictErrorV1 extends Error {}
export class EditorialPlanStoreNotFoundErrorV1 extends Error {}

/** Sole persistence adapter for immutable editorial plans and definitions. */
export class EditorialPlanStoreV1 {
  constructor(private readonly collectionsProvider: CollectionsProvider = mongoCollections) {}

  async createInitial(
    planValue: unknown,
    now = new Date(),
  ): Promise<Readonly<{ plan: EditorialPlanRevisionV1; created: boolean }>> {
    const plan = assertEditorialPlanRevisionV1(planValue);
    if (plan.planRevision !== 1) throw new EditorialPlanStoreConflictErrorV1('PLAN_INITIAL_REVISION_INVALID');
    const latest = await this.getLatestAuthorized(scopeOf(plan));
    if (latest) return samePlan(latest, plan)
      ? { plan: latest, created: false }
      : conflict('PLAN_ALREADY_EXISTS');
    return this.insertPlan(plan, now);
  }

  async appendSuccessor(input: Readonly<{
    plan: unknown;
    expectedCurrentRevisionSha256: string;
    now?: Date;
  }>): Promise<Readonly<{ plan: EditorialPlanRevisionV1; created: boolean }>> {
    const next = assertEditorialPlanRevisionV1(input.plan);
    const current = await this.getLatestAuthorized(scopeOf(next));
    if (!current) throw new EditorialPlanStoreNotFoundErrorV1('PLAN_NOT_FOUND');
    if (samePlan(current, next)) return { plan: current, created: false };
    if (current.revisionSha256 !== input.expectedCurrentRevisionSha256) {
      throw new EditorialPlanStoreConflictErrorV1('PLAN_STALE_CURRENT_REVISION');
    }
    assertEditorialPlanSuccessorV1(current, next);
    return this.insertPlan(next, input.now ?? new Date());
  }

  async getRevisionAuthorized(input: Readonly<{
    tenantId: string; userId: string; projectId: string; planId: string; planRevision: number;
  }>): Promise<Readonly<EditorialPlanRevisionV1> | null> {
    const record = await (await this.collectionsProvider()).plans.findOne({
      'plan.tenantId': input.tenantId, 'plan.userId': input.userId,
      'plan.projectId': input.projectId, 'plan.planId': input.planId,
      'plan.planRevision': input.planRevision,
    });
    return record ? assertEditorialPlanRevisionV1(record.plan) : null;
  }

  async getLatestAuthorized(input: Readonly<{
    tenantId: string; userId: string; projectId: string; planId: string;
  }>): Promise<Readonly<EditorialPlanRevisionV1> | null> {
    const records = await (await this.collectionsProvider()).plans.find({
      'plan.tenantId': input.tenantId, 'plan.userId': input.userId,
      'plan.projectId': input.projectId, 'plan.planId': input.planId,
    }).sort({ 'plan.planRevision': -1 }).limit(1).toArray();
    return records[0] ? assertEditorialPlanRevisionV1(records[0].plan) : null;
  }

  async putExecutionDefinition(
    definitionValue: unknown,
    now = new Date(),
  ): Promise<Readonly<{ definition: EditorialPlanExecutionDefinitionV1; created: boolean }>> {
    const definition = assertEditorialPlanExecutionDefinitionV1(definitionValue);
    const source = await this.getRevisionAuthorized({
      tenantId: definition.tenantId, userId: definition.userId,
      projectId: definition.projectId, planId: definition.sourcePlanBinding.planId,
      planRevision: definition.sourcePlanBinding.planRevision,
    });
    if (!source || source.revisionSha256 !== definition.sourcePlanBinding.planRevisionSha256) {
      throw new EditorialPlanStoreNotFoundErrorV1('PLAN_DEFINITION_SOURCE_REVISION_NOT_FOUND');
    }
    const node = source.nodes.find(({ nodeId }) => nodeId === definition.sourcePlanBinding.nodeId);
    if (!node || node.nodeVersion !== definition.sourcePlanBinding.nodeVersion
      || hashEditronCanonicalJsonV1(node) !== definition.sourcePlanBinding.nodeSha256) {
      throw new EditorialPlanStoreNotFoundErrorV1('PLAN_DEFINITION_SOURCE_NODE_NOT_FOUND');
    }
    const collection = (await this.collectionsProvider()).definitions;
    const identity = definitionRecordId(definition);
    const existing = await collection.findOne({ _id: identity });
    if (existing) return sameDefinition(existing.definition, definition)
      ? { definition: assertEditorialPlanExecutionDefinitionV1(existing.definition), created: false }
      : conflict('PLAN_DEFINITION_ID_CONFLICT');
    const record: EditorialPlanExecutionDefinitionRecordV1 = {
      _id: identity, tenantId: definition.tenantId,
      idempotencyKey: definitionIdempotencyKey(definition), storedAt: now, definition,
    };
    try {
      await collection.insertOne(record);
      return { definition, created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const concurrent = await collection.findOne({ _id: identity });
      if (concurrent && sameDefinition(concurrent.definition, definition)) {
        return { definition: assertEditorialPlanExecutionDefinitionV1(concurrent.definition), created: false };
      }
      throw new EditorialPlanStoreConflictErrorV1('PLAN_DEFINITION_CONCURRENT_CONFLICT');
    }
  }

  async getExecutionDefinitionAuthorized(input: Readonly<{
    tenantId: string; userId: string; projectId: string; definitionId: string;
  }>): Promise<Readonly<EditorialPlanExecutionDefinitionV1> | null> {
    const record = await (await this.collectionsProvider()).definitions.findOne({
      'definition.tenantId': input.tenantId, 'definition.userId': input.userId,
      'definition.projectId': input.projectId, 'definition.definitionId': input.definitionId,
    });
    return record ? assertEditorialPlanExecutionDefinitionV1(record.definition) : null;
  }

  private async insertPlan(plan: Readonly<EditorialPlanRevisionV1>, now: Date) {
    const collection = (await this.collectionsProvider()).plans;
    const identity = planRecordId(plan);
    const record: EditorialPlanRevisionRecordV1 = {
      _id: identity, tenantId: plan.tenantId,
      idempotencyKey: planIdempotencyKey(plan), storedAt: now, plan,
    };
    try {
      await collection.insertOne(record);
      return { plan, created: true } as const;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const concurrent = await collection.findOne({ _id: identity });
      if (concurrent && samePlan(concurrent.plan, plan)) {
        return { plan: assertEditorialPlanRevisionV1(concurrent.plan), created: false } as const;
      }
      throw new EditorialPlanStoreConflictErrorV1('PLAN_CONCURRENT_REVISION_CONFLICT');
    }
  }
}

function scopeOf(plan: Readonly<EditorialPlanRevisionV1>) {
  return { tenantId: plan.tenantId, userId: plan.userId, projectId: plan.projectId, planId: plan.planId };
}
function planIdempotencyKey(plan: Readonly<EditorialPlanRevisionV1>) {
  return hashEditronCanonicalJsonV1({ ...scopeOf(plan), planRevision: plan.planRevision });
}
function definitionIdempotencyKey(definition: Readonly<EditorialPlanExecutionDefinitionV1>) {
  return hashEditronCanonicalJsonV1({ tenantId: definition.tenantId, projectId: definition.projectId, definitionId: definition.definitionId });
}
function planRecordId(plan: Readonly<EditorialPlanRevisionV1>) { return `epr_${planIdempotencyKey(plan)}`; }
function definitionRecordId(definition: Readonly<EditorialPlanExecutionDefinitionV1>) { return `epd_${definitionIdempotencyKey(definition)}`; }
function samePlan(left: Readonly<EditorialPlanRevisionV1>, right: Readonly<EditorialPlanRevisionV1>) { return left.revisionSha256 === right.revisionSha256; }
function sameDefinition(left: Readonly<EditorialPlanExecutionDefinitionV1>, right: Readonly<EditorialPlanExecutionDefinitionV1>) { return left.definitionSha256 === right.definitionSha256; }
function conflict(message: string): never { throw new EditorialPlanStoreConflictErrorV1(message); }
function isDuplicateKeyError(error: unknown) { return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 11000); }
