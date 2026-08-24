import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { hashEditronCanonicalJsonV1 } from '../../lib/editron/services/canonical-json-v1';
import type { ExecutableImportClosureReceiptV1 }
  from '../../lib/editron/services/executable-import-closure-v1';
import {
  NO_SPEND_REQUIRED_SENTINELS_BY_LANE_V1,
  assertNoSpendExecutableClosureV1,
  hashNoSpendProviderRequestTextV1,
  type NoSpendFairnessRuleBindingInputV1,
  type NoSpendSentinelClaimInputV1,
} from '../../lib/editron/research/open-ended-planner/no-spend-readiness-policy-v1';
import * as readinessModule
  from '../../lib/editron/research/open-ended-planner/no-spend-readiness-receipt-v1';
import {
  NO_SPEND_READINESS_AUTHORITY_V1,
  assertNoSpendReadinessDraftV1,
  issueNoSpendReadinessDraftV1,
  type NoSpendReadinessDraftInputV1,
} from '../../lib/editron/research/open-ended-planner/no-spend-readiness-receipt-v1';

let closureFixtureRoot = '';

beforeAll(() => { closureFixtureRoot = createClosureFixture(); });
afterAll(() => rmSync(closureFixtureRoot, { recursive: true, force: true }));
afterEach(() => { vi.unstubAllGlobals(); });

describe('no-spend readiness draft v1', () => {
  it('emits only a pending, zero-authority, zero-effect draft without provider calls', () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network forbidden')));
    vi.stubGlobal('fetch', fetchSpy);
    const { input, nowUnixMs } = draftFixture('PILOT', null);
    const draft = issueNoSpendReadinessDraftV1(input);

    expect(draft).toMatchObject({
      authority: NO_SPEND_READINESS_AUTHORITY_V1,
      assessment: 'PENDING_LANE_SENTINEL_RECOMPUTATION',
      dispatchAuthorized: false,
      spendAuthorizedMicroUsd: 0,
      projectReadsAuthorized: 0,
      projectMutationsAuthorized: 0,
      mediaWritesAuthorized: 0,
      effects: {
        providerInferenceCalls: 0,
        productProjectReads: 0,
        productProjectMutations: 0,
        mediaWrites: 0,
        secretsPersisted: false,
        stateEffects: [],
      },
    });
    expect(draft.sentinelClaims.provenance)
      .toBe('CALLER_CLAIMS_UNVERIFIED_PENDING_4B2_RECOMPUTATION');
    expect(draft.executableClosure).toMatchObject({
      mode: 'verification', contentSource: 'GIT_HEAD_BLOB',
      sourceControl: { strict: true },
    });
    expect(draft.launcherPolicy).toMatchObject({
      zeroInferenceValidationLauncher: 'ALLOW_KNOWN_NON_DECLARED_LAUNCHER',
      paidRunnerLauncher: 'REQUIRE_DECLARED_LAUNCHER_MATCH',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(assertNoSpendReadinessDraftV1(draft, expected(input, nowUnixMs)))
      .toEqual(draft);
    expect(readinessModule).not.toHaveProperty('issueNoSpendReadinessReceiptV1');
  });

  it('separates pilot and scored-cohort stages and requires a pilot audit', () => {
    const missingAudit = draftFixture('SCORED_COHORT', null);
    expect(() => issueNoSpendReadinessDraftV1(missingAudit.input))
      .toThrow(/SCORED_COHORT_PILOT_AUDIT_REQUIRED/);

    const audited = draftFixture('SCORED_COHORT', hash('pilot-audit'));
    const draft = issueNoSpendReadinessDraftV1(audited.input);
    expect(draft.subject).toMatchObject({
      requestedStage: 'SCORED_COHORT',
      maximumProviderAttempts: 3,
      absoluteMaxSpendMicroUsd: 90_000,
    });
    expect(draft.assessment).toBe('PENDING_LANE_SENTINEL_RECOMPUTATION');
  });

  it('rejects forged self-consistent drafts against trusted expected inputs', () => {
    const { input, nowUnixMs } = draftFixture('PILOT', null);
    const draft = issueNoSpendReadinessDraftV1(input);
    const forged = clone(draft);
    forged.subject.manifestSha256 = hash('attacker-manifest');
    rehashDraft(forged);

    expect(forged.draftSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(() => assertNoSpendReadinessDraftV1(forged, expected(input, nowUnixMs)))
      .toThrow(/DRAFT_FORGED_STALE_OR_EXPECTATION_DRIFT/);
  });

  it('rejects stale nested hashes, alternate topology, nonzero effects, and READY injection', () => {
    const { input, nowUnixMs } = draftFixture('PILOT', null);
    const draft = issueNoSpendReadinessDraftV1(input);
    const candidates: Record<string, unknown>[] = [];

    const staleFairness = clone(draft);
    staleFairness.fairnessLedger.ledgerSha256 = hash('stale-ledger');
    rehashDraft(staleFairness);
    candidates.push(staleFairness);

    const alternateTopology = clone(draft);
    alternateTopology.executableClosure.roots.push('alternate/untrusted-entry.ts');
    rehashNestedClosure(alternateTopology.executableClosure);
    rehashDraft(alternateTopology);
    candidates.push(alternateTopology);

    const nonzero = clone(draft);
    nonzero.effects.providerInferenceCalls = 1;
    rehashDraft(nonzero);
    candidates.push(nonzero);

    const injectedReady = clone(draft);
    injectedReady.assessment = 'READY_FOR_EXPLICIT_PILOT_SPEND_APPROVAL';
    rehashDraft(injectedReady);
    candidates.push(injectedReady);

    for (const candidate of candidates) {
      expect(() => assertNoSpendReadinessDraftV1(candidate, expected(input, nowUnixMs)))
        .toThrow(/DRAFT_FORGED_STALE_OR_EXPECTATION_DRIFT/);
    }
  });

  it('rejects non-strict, unbound, missing-launcher, and declared-command mismatched closures', () => {
    const draft = issueNoSpendReadinessDraftV1(draftFixture('PILOT', null).input);

    const nonStrict = clone(draft.executableClosure);
    nonStrict.sourceControl.strict = false;
    rehashNestedClosure(nonStrict);
    expect(() => assertNoSpendExecutableClosureV1(asClosure(nonStrict)))
      .toThrow(/STRICT_VERIFICATION_REQUIRED/);

    const unbound = clone(draft.executableClosure);
    unbound.files[0].gitBlobOid = null;
    rehashNestedClosure(unbound);
    expect(() => assertNoSpendExecutableClosureV1(asClosure(unbound)))
      .toThrow(/GIT_BLOB_UNBOUND/);

    const missingLauncher = clone(draft.executableClosure);
    missingLauncher.toolchain.packageManager.launcher = null;
    missingLauncher.toolchain.packageManager.declaredMatchesLauncher = null;
    rehashNestedClosure(missingLauncher);
    expect(() => assertNoSpendExecutableClosureV1(asClosure(missingLauncher)))
      .toThrow(/VALIDATION_LAUNCHER_MISSING_OR_UNKNOWN/);

    const mismatchedCommand = clone(draft.executableClosure);
    mismatchedCommand.toolchain.packageManager.declaredMatchesResolvedCommand = false;
    rehashNestedClosure(mismatchedCommand);
    expect(() => assertNoSpendExecutableClosureV1(asClosure(mismatchedCommand)))
      .toThrow(/DECLARED_COMMAND_TOOLCHAIN_UNRESOLVED_OR_MISMATCHED/);

    const driftedVersion = clone(draft.executableClosure);
    Reflect.set(driftedVersion, 'resolverVersion', 'EDITRON_TYPESCRIPT_IMPORT_RESOLVER_V9_9');
    rehashNestedClosure(driftedVersion);
    expect(() => assertNoSpendExecutableClosureV1(asClosure(driftedVersion)))
      .toThrow(/EXECUTABLE_CLOSURE_VERSION_DRIFT/);

    const nonCanonicalRoots = clone(draft.executableClosure);
    nonCanonicalRoots.roots.push(nonCanonicalRoots.roots[0]);
    rehashNestedClosure(nonCanonicalRoots);
    expect(() => assertNoSpendExecutableClosureV1(asClosure(nonCanonicalRoots)))
      .toThrow(/EXECUTABLE_CLOSURE_ROOT_SET_NON_CANONICAL/);

    const inconsistentLauncherFlag = clone(draft.executableClosure);
    inconsistentLauncherFlag.toolchain.packageManager.declaredMatchesLauncher =
      !inconsistentLauncherFlag.toolchain.packageManager.declaredMatchesLauncher;
    rehashNestedClosure(inconsistentLauncherFlag);
    expect(() => assertNoSpendExecutableClosureV1(asClosure(inconsistentLauncherFlag)))
      .toThrow(/VALIDATION_LAUNCHER_MATCH_FLAG_INCONSISTENT/);
  });

  it('rejects expired drafts and unresolved executable roots', () => {
    const { input, nowUnixMs } = draftFixture('PILOT', null);
    const draft = issueNoSpendReadinessDraftV1(input);
    expect(() => assertNoSpendReadinessDraftV1(
      draft,
      expected(input, nowUnixMs + 20 * 60_000),
    )).toThrow(/DRAFT_EXPIRED_OR_NOT_FRESH/);

    expect(() => issueNoSpendReadinessDraftV1({
      ...input,
      executableClosure: { ...input.executableClosure, roots: ['missing/readiness-owner.ts'] },
    })).toThrow(/ROOT_MISSING/);
  });

  it('keeps the current repository NOT_READY while its bound package-lock is untracked', () => {
    const fixture = draftFixture('PILOT', null);
    expect(() => issueNoSpendReadinessDraftV1({
      ...fixture.input,
      executableClosure: {
        rootDir: process.cwd(),
        roots: ['lib/editron/services/canonical-json-v1.ts'],
      },
    })).toThrow(/STRICT_GIT_UNTRACKED: package-lock\.json/);
  });
});

function draftFixture(
  stage: NoSpendReadinessDraftInputV1['stage'],
  pilotAuditReceiptSha256: string | null,
): { input: NoSpendReadinessDraftInputV1; nowUnixMs: number } {
  const lane = 'STAGE25_LONG_FORM_PROVIDER_V3' as const;
  const nowUnixMs = Date.now();
  const publicRequest = '{"public":"long-form-context"}';
  const ruleBindings: NoSpendFairnessRuleBindingInputV1[] = [
    binding('LF_RANGE_SCOPE_DERIVATION', 'P_SCOPE', false),
    binding('LF_EVIDENCE_READINESS', 'P_READY', true),
    binding('LF_STRUCTURAL_PROOF_CEILING', 'P_PROOF', false),
  ];
  return {
    nowUnixMs,
    input: {
      lane,
      stage,
      manifestSha256: hash('manifest'),
      zeroInferencePreflightReceiptSha256: hash('preflight'),
      fairness: {
        publicPacketSetSha256: hash('public-packets'),
        hiddenEvaluatorSetSha256: hash('hidden-evaluator'),
        hiddenPredicateIds: ruleBindings.flatMap(({ hiddenPredicateIds }) => hiddenPredicateIds),
        evaluatorOnlyLeakageTokens: ['HIDDEN_EVALUATOR_ONLY_TOKEN'],
        providerRequestCaptures: [{
          captureId: 'capture-1', serializedRequest: publicRequest,
          requestSha256: hashNoSpendProviderRequestTextV1(publicRequest),
        }],
        ruleBindings,
      },
      sentinelClaims: sentinelClaims(),
      attemptAwareEvaluator: {
        evaluatorVersion: 'EDITRON_TEST_ATTEMPT_EVALUATOR_V1',
        evaluatorSourceSha256: hash('evaluator-source'),
        attemptEligibilityPolicySha256: hash('attempt-policy'),
      },
      pilotPolicy: {
        providerRouteIds: ['google', 'luna', 'terra'],
        pilotRows: rows('pilot'),
        scoredRows: rows('scored'),
        absoluteMaxPilotSpendMicroUsd: 30_000,
        absoluteMaxScoredCohortSpendMicroUsd: 90_000,
        pilotAuditReceiptSha256,
      },
      executableClosure: {
        rootDir: closureFixtureRoot,
        roots: ['src/entry.ts'],
      },
      createdAt: new Date(nowUnixMs).toISOString(),
      expiresAt: new Date(nowUnixMs + 5 * 60_000).toISOString(),
    },
  };
}

function sentinelClaims(): NoSpendSentinelClaimInputV1[] {
  return NO_SPEND_REQUIRED_SENTINELS_BY_LANE_V1.STAGE25_LONG_FORM_PROVIDER_V3
    .map((requirement) => ({
      sentinelId: requirement.sentinelId,
      fixtureSha256: hash(`${requirement.sentinelId}:fixture`),
      transformationSha256: requirement.kind === 'METAMORPHIC_EQUIVALENCE'
        ? hash(`${requirement.sentinelId}:transform`) : null,
      evaluatorResultSha256: hash(`${requirement.sentinelId}:result`),
      axes: {
        modelDecision: requirement.expected.modelDecision,
        ownerSafety: requirement.expected.ownerSafety,
        taskOutcome: requirement.expected.taskOutcome,
        proofClass: requirement.expected.proofClass,
        attemptedMutationCount: 0,
        unsafeAttemptCount: 0,
        ownerBlockedUnsafeAttemptCount: 0,
        safeStopCredit: requirement.expected.safeStopCredit,
        fallbackUsed: false,
        fallbackCountedAsModelSuccess: false as const,
      },
    }));
}

function binding(
  ruleId: string,
  predicateId: string,
  modelCreditAllowed: boolean,
): NoSpendFairnessRuleBindingInputV1 {
  return {
    ruleId,
    publicRuleRefs: [{ artifactSha256: hash(`${ruleId}:public`), jsonPointer: '/rules/0' }],
    hiddenPredicateIds: [predicateId],
    providerEchoRequired: false,
    modelCreditAllowed,
    maximumProofClass: 'STRUCTURAL_ONLY',
  };
}

function rows(prefix: string) {
  return ['google', 'luna', 'terra'].map((routeId) => ({
    rowId: `${prefix}-${routeId}`, routeId,
  }));
}

function expected(input: NoSpendReadinessDraftInputV1, nowUnixMs: number) {
  const { createdAt: _createdAt, expiresAt: _expiresAt, ...rest } = input;
  void _createdAt;
  void _expiresAt;
  return { ...rest, nowUnixMs };
}

function rehashNestedClosure<T extends { closureSha256: string }>(closure: T): void {
  const { closureSha256: _closureSha256, ...material } = closure;
  void _closureSha256;
  closure.closureSha256 = hashEditronCanonicalJsonV1(material);
}

function rehashDraft<T extends { draftSha256: string }>(draft: T): void {
  const { draftSha256: _draftSha256, ...material } = draft;
  void _draftSha256;
  draft.draftSha256 = hashEditronCanonicalJsonV1(material);
}

type DeepMutable<T> = T extends string ? string
  : T extends number ? number
    : T extends boolean ? boolean
      : T extends readonly (infer Item)[] ? DeepMutable<Item>[]
        : T extends object ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
          : T;

function clone<T>(value: T): DeepMutable<T> {
  return JSON.parse(JSON.stringify(value)) as DeepMutable<T>;
}

function asClosure(value: unknown): Readonly<ExecutableImportClosureReceiptV1> {
  return value as Readonly<ExecutableImportClosureReceiptV1>;
}

function hash(value: unknown): string {
  return hashEditronCanonicalJsonV1(value);
}

function createClosureFixture(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'editron-no-spend-readiness-'));
  mkdirSync(path.join(root, 'src'));
  const packageManager = (JSON.parse(readFileSync('package.json', 'utf8')) as {
    packageManager: string;
  }).packageManager;
  const files: Readonly<Record<string, string>> = {
    'package.json': JSON.stringify({ packageManager }),
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    'tsconfig.json': JSON.stringify({ compilerOptions: {} }),
    'vitest.config.ts': 'export default {};\n',
    'src/entry.ts': 'export const entry = true;\n',
  };
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(path.join(root, file), contents, 'utf8');
  }
  runGit(root, ['init', '--quiet']);
  runGit(root, ['config', 'user.email', 'readiness@example.invalid']);
  runGit(root, ['config', 'user.name', 'Readiness Fixture']);
  runGit(root, ['add', '--', ...Object.keys(files)]);
  runGit(root, ['commit', '--quiet', '-m', 'fixture']);
  return root;
}

function runGit(root: string, args: readonly string[]): void {
  execFileSync('git', args, { cwd: root, windowsHide: true, stdio: 'pipe' });
}
