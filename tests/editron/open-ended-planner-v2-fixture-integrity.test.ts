import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type JsonObject = Record<string, unknown>

interface SourceBinding {
  path: string
  sha256: string
}

interface V1Asset {
  assetId: string
  type: string
  generator: string
  seed: number
  recipe: string
  rightsStatus: string
}

interface V1Task {
  taskId: string
  userRequest: string
  project: { assets: V1Asset[] }
}

interface V1Operator {
  operatorId: string
  supportStatus: string
  owner: { path: string; symbol: string }
}

interface IoContract {
  fields: string[]
  required: string[]
}

interface V2Operator {
  operatorId: string
  ownerRef?: string
  owner?: { path: string; symbol: string; domain: string }
  supportStatus: string
  compilerEligibility: string
  input: IoContract
  output: IoContract
  stateEffects: string[]
  proof: string[]
  constraints?: string[]
}

interface TaskPredicate {
  predicateId: string
  requiredEvidenceIds: string[]
}

interface ConditionCase {
  conditionId: string
  availableEvidenceIds: string[]
  omittedEvidenceIds: string[]
  activePredicateIds: string[]
  allowedDispositions: string[]
}

interface V2Task {
  taskId: string
  split: 'DEVELOPMENT' | 'HOLDOUT'
  sealed: boolean
  originalRequest: string
  mediaBindings: Array<{
    assetId: string
    recipeSha256: string
    artifactSha256: string | null
    materializationStatus: string
  }>
  evidenceIds: string[]
  predicates: TaskPredicate[]
  conditionCases: ConditionCase[]
  evaluatorOnly: { baselineDisposition: string }
}

const fixtureRoot = 'tests/fixtures/editron/open-ended-planner-v2'
const v1Root = 'tests/fixtures/editron/open-ended-planner-v1'

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as T
}

function sha256File(path: string): string {
  return createHash('sha256')
    .update(readFileSync(resolve(process.cwd(), path)))
    .digest('hex')
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const object = value as JsonObject
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function recipeHash(asset: V1Asset): string {
  const material = {
    assetId: asset.assetId,
    type: asset.type,
    generator: asset.generator,
    seed: asset.seed,
    recipe: asset.recipe,
    rightsStatus: asset.rightsStatus,
  }
  return `sha256:${createHash('sha256').update(canonicalize(material)).digest('hex')}`
}

describe('open-ended planner V2 frozen research fixtures', () => {
  const contract = readJson<{
    version: string
    phase: string
    sourceBindings: SourceBinding[]
    hardRules: string[]
    stages: Array<{ stage: number; availability?: string }>
    requiredTelemetry: string[]
    trialBudget: Record<string, number | string>
    scorecard: { hardFailures: string[]; promotionGate: string }
  }>(`${fixtureRoot}/benchmark-contract-v2.json`)
  const catalog = readJson<{
    version: string
    productionEligibility: string
    fieldSchemas: Record<string, JsonObject>
    capabilityCoverage: Array<{ candidateId: string; coveredOperatorIds: string[] }>
    operators: V2Operator[]
  }>(`${fixtureRoot}/operator-specs-v2.json`)
  const taskFixture = readJson<{
    version: string
    modelVisibleFields: string[]
    tasks: V2Task[]
  }>(`${fixtureRoot}/tasks-v2.json`)
  const v1Catalog = readJson<{ operators: V1Operator[] }>(
    `${v1Root}/operator-specs-v1.json`,
  )
  const v1Tasks = [
    ...readJson<{ tasks: V1Task[] }>(`${v1Root}/development-tasks-v1.json`).tasks,
    ...readJson<{ tasks: V1Task[] }>(`${v1Root}/holdout-tasks-v1.json`).tasks,
  ]
  const cap0 = readJson<{ capabilities: Array<{ candidateId: string }> }>('docs/editron/capability-census/editron-capability-census-v1.json')

  it('binds every source fixture by its exact SHA-256', () => {
    expect(contract.sourceBindings).toHaveLength(5)
    for (const binding of contract.sourceBindings) {
      expect(binding.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(sha256File(binding.path)).toBe(binding.sha256)
    }
  })

  it('freezes seven independently scored stages without authorizing execution', () => {
    expect(contract.version).toBe('2.0.0')
    expect(contract.phase).toBe('V2-0_SPECIFICATION_ONLY')
    expect(contract.stages.map(({ stage }) => stage)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(contract.stages.slice(5).every(({ availability }) => availability === 'V2-1_ONLY')).toBe(true)
    expect(contract.hardRules).toContain(
      'V2-0 performs no provider call, render, network request, project read, or project write.',
    )
    expect(contract.scorecard.promotionGate).toContain('V2-0 alone cannot produce GO')
  })

  it('requires exact budget and provider termination telemetry', () => {
    expect(contract.trialBudget.maxRepairAttempts).toBe(1)
    expect(contract.trialBudget.maxProviderCostUsd).toBeGreaterThan(0)
    expect(contract.requiredTelemetry).toEqual(
      expect.arrayContaining([
        'inputTokens',
        'visibleOutputTokens',
        'reasoningTokens',
        'totalTokens',
        'finishReason',
        'truncated',
        'latencyMs',
        'providerCostUsd',
        'artifactSha256',
      ]),
    )
    expect(contract.scorecard.hardFailures).toContain('false success')
  })

  it('adapts all 39 existing operators without changing owner or support truth', () => {
    const adapted = catalog.operators.filter(({ ownerRef }) => ownerRef?.startsWith('v1:'))
    expect(adapted).toHaveLength(39)
    expect(new Set(adapted.map(({ operatorId }) => operatorId))).toEqual(
      new Set(v1Catalog.operators.map(({ operatorId }) => operatorId)),
    )
    for (const operator of adapted) {
      const source = v1Catalog.operators.find(
        ({ operatorId }) => operatorId === operator.operatorId,
      )
      expect(source, operator.operatorId).toBeDefined()
      expect(operator.ownerRef).toBe(`v1:${source?.operatorId}`)
      expect(operator.supportStatus).toBe(source?.supportStatus)
    }
  })

  it('accounts for every manual and chat capability in CAP-0', () => {
    expect(catalog.capabilityCoverage).toHaveLength(30)
    expect(new Set(catalog.capabilityCoverage.map(({ candidateId }) => candidateId))).toEqual(new Set(cap0.capabilities.map(({ candidateId }) => candidateId)))
    const operatorIds = new Set(catalog.operators.map(({ operatorId }) => operatorId))
    for (const coverage of catalog.capabilityCoverage) {
      expect(coverage.coveredOperatorIds.every((operatorId) => operatorIds.has(operatorId)), coverage.candidateId).toBe(true)
    }
  })

  it('makes every operator contract closed and mechanically resolvable', () => {
    const fieldNames = new Set(Object.keys(catalog.fieldSchemas))
    expect(catalog.productionEligibility).toBe('FORBIDDEN_ALL_V2')
    expect(catalog.operators).toHaveLength(40)
    for (const operator of catalog.operators) {
      for (const contractPart of [operator.input, operator.output]) {
        expect(new Set(contractPart.fields).size, operator.operatorId).toBe(
          contractPart.fields.length,
        )
        expect(contractPart.required.every((field) => contractPart.fields.includes(field))).toBe(
          true,
        )
        expect(contractPart.fields.every((field) => fieldNames.has(field))).toBe(true)
      }
      expect(operator.proof.length, operator.operatorId).toBeGreaterThan(0)
    }
  })

  it('keeps generated composition research-only, isolated, and non-mutating', () => {
    const generated = catalog.operators.find(
      ({ operatorId }) => operatorId === 'generated_composition_program',
    )
    expect(generated?.owner?.domain).toBe('RESEARCH_SPEC_ONLY')
    expect(generated?.supportStatus).toBe('RESEARCH_ONLY_NOT_IMPLEMENTED')
    expect(generated?.compilerEligibility).toBe('ISOLATED_PROXY_ONLY')
    expect(generated?.stateEffects).toEqual([])
    expect(generated?.constraints).toEqual(
      expect.arrayContaining(['No network', 'Allowlisted rendering API only', 'No production execution in V2-0']),
    )
  })

  it('preserves all original requests and binds recipes without fake media hashes', () => {
    expect(taskFixture.tasks).toHaveLength(12)
    expect(taskFixture.tasks.filter(({ split }) => split === 'DEVELOPMENT')).toHaveLength(4)
    expect(taskFixture.tasks.filter(({ split }) => split === 'HOLDOUT')).toHaveLength(8)
    expect(taskFixture.tasks.filter(({ split }) => split === 'HOLDOUT').every(({ sealed }) => sealed)).toBe(true)
    expect(taskFixture.modelVisibleFields).not.toContain('evaluatorOnly')

    for (const task of taskFixture.tasks) {
      const source = v1Tasks.find(({ taskId }) => taskId === task.taskId)
      expect(source, task.taskId).toBeDefined()
      expect(task.originalRequest).toBe(source?.userRequest)
      for (const binding of task.mediaBindings) {
        const asset = source?.project.assets.find(({ assetId }) => assetId === binding.assetId)
        expect(asset, `${task.taskId}/${binding.assetId}`).toBeDefined()
        expect(binding.recipeSha256).toBe(asset ? recipeHash(asset) : undefined)
        expect(binding.artifactSha256).toBeNull()
        expect(binding.materializationStatus).toBe('NOT_MATERIALIZED_V2_0')
      }
    }
  })

  it('never scores a predicate whose evidence is omitted by that condition', () => {
    const validDispositions = new Set([
      'PROCEED',
      'CLARIFICATION_REQUIRED',
      'CAPABILITY_GAP',
      'POLICY_BLOCKED',
      'CONFLICT',
      'FAIL',
      'UNVERIFIABLE',
    ])
    for (const task of taskFixture.tasks) {
      expect(new Set(task.evidenceIds).size).toBe(task.evidenceIds.length)
      const predicates = new Map(
        task.predicates.map((predicate) => [predicate.predicateId, predicate]),
      )
      for (const condition of task.conditionCases) {
        const omitted = new Set(condition.omittedEvidenceIds)
        expect(condition.allowedDispositions.every((item) => validDispositions.has(item))).toBe(true)
        for (const predicateId of condition.activePredicateIds) {
          const predicate = predicates.get(predicateId)
          expect(predicate, `${task.taskId}/${condition.conditionId}/${predicateId}`).toBeDefined()
          expect(predicate?.requiredEvidenceIds.some((evidenceId) => omitted.has(evidenceId))).toBe(
            false,
          )
        }
      }
      const baseline = task.conditionCases.find(({ conditionId }) => conditionId === 'BASELINE')
      expect(baseline?.allowedDispositions).toContain(task.evaluatorOnly.baselineDisposition)
    }
  })
})
