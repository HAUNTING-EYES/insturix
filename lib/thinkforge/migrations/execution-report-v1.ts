import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import type { ClientSession, Db, Document, Filter, MongoClient } from 'mongodb';

export const THINKFORGE_MIGRATION_EXECUTION_EVENT_VERSION = 1;
export const THINKFORGE_MIGRATION_EXECUTION_COLLECTION = 'thinkforge_migration_execution_events';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/u;
const SAFE_DETAIL_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]{0,63}$/u;
const SAFE_CODE_PATTERN = /^[a-z][a-z0-9_:-]{0,95}$/u;

export type ThinkForgeMigrationMode = 'dry_run' | 'apply' | 'rollback';
export type ThinkForgeMigrationExecutionState =
  | 'started'
  | 'planned'
  | 'backed_up'
  | 'applied'
  | 'verified'
  | 'rolled_back'
  | 'failed';

export interface ThinkForgeMigrationGitIdentity {
  commitSha: string;
  treeSha: string;
  branch: string | null;
  dirty: boolean;
}

export interface ThinkForgeMigrationSafeDetails {
  counts?: Record<string, number>;
  hashes?: Record<string, string>;
  codes?: string[];
}

export interface ThinkForgeMigrationExecutionEventV1 {
  version: typeof THINKFORGE_MIGRATION_EXECUTION_EVENT_VERSION;
  runId: string;
  migrationName: string;
  migrationVersion: number;
  mode: ThinkForgeMigrationMode;
  database: string;
  operator: string | null;
  git: ThinkForgeMigrationGitIdentity | null;
  sequence: number;
  state: ThinkForgeMigrationExecutionState;
  occurredAt: string;
  previousEventHash: string | null;
  details: ThinkForgeMigrationSafeDetails;
  eventHash: string;
}

export interface ThinkForgeMigrationCasField {
  path: string;
  exists: boolean;
  value?: unknown;
}

interface ReporterCheckpoint {
  nextSequence: number;
  previousEventHash: string | null;
  previousState: ThinkForgeMigrationExecutionState | null;
}

const EXECUTION_STATES_BY_MODE: Record<
  ThinkForgeMigrationMode,
  ReadonlySet<ThinkForgeMigrationExecutionState>
> = {
  dry_run: new Set(['started', 'planned', 'verified', 'failed']),
  apply: new Set(['started', 'planned', 'backed_up', 'applied', 'verified', 'failed']),
  rollback: new Set(['started', 'planned', 'rolled_back', 'failed']),
};

const EXECUTION_STATE_TRANSITIONS: Record<
  ThinkForgeMigrationExecutionState,
  ReadonlySet<ThinkForgeMigrationExecutionState>
> = {
  started: new Set(['planned', 'failed']),
  planned: new Set(['backed_up', 'applied', 'verified', 'rolled_back', 'failed']),
  backed_up: new Set(['applied', 'failed']),
  applied: new Set(['verified', 'failed']),
  verified: new Set(),
  rolled_back: new Set(),
  failed: new Set(),
};

function executionStateError(input: {
  mode: ThinkForgeMigrationMode;
  previousState: ThinkForgeMigrationExecutionState | null;
  state: ThinkForgeMigrationExecutionState;
  sequence: number;
}): string | null {
  if (!EXECUTION_STATES_BY_MODE[input.mode].has(input.state)) {
    return `mode_state:${input.sequence}:${input.mode}:${input.state}`;
  }
  if (input.sequence === 0) return input.state === 'started' ? null : `initial_state:${input.state}`;
  if (!input.previousState) return `missing_previous_state:${input.sequence}`;
  return EXECUTION_STATE_TRANSITIONS[input.previousState].has(input.state)
    ? null
    : `transition:${input.sequence}:${input.previousState}:${input.state}`;
}

function canonicalizeMigrationValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === undefined) return { $type: 'undefined' };
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Migration evidence cannot contain non-finite numbers');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'bigint') return { $type: 'bigint', value: value.toString() };
  if (typeof value !== 'object') {
    throw new Error(`Migration evidence cannot contain ${typeof value} values`);
  }
  if (value instanceof Date) return { $type: 'date', value: value.toISOString() };
  if (Buffer.isBuffer(value)) return { $type: 'buffer', value: value.toString('hex') };

  const bsonValue = value as { _bsontype?: unknown; toHexString?: unknown };
  if (typeof bsonValue._bsontype === 'string' && typeof bsonValue.toHexString === 'function') {
    return {
      $type: bsonValue._bsontype,
      value: (bsonValue.toHexString as () => string).call(value),
    };
  }

  if (ancestors.has(value)) throw new Error('Migration evidence cannot contain circular references');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => canonicalizeMigrationValue(entry, ancestors));
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeMigrationValue(entry, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

export function stableSerializeMigrationValue(value: unknown): string {
  return JSON.stringify(canonicalizeMigrationValue(value, new WeakSet<object>()));
}

export function hashMigrationValue(value: unknown): string {
  return createHash('sha256').update(stableSerializeMigrationValue(value)).digest('hex');
}

function migrationEventHashPayload(event: Omit<ThinkForgeMigrationExecutionEventV1, 'eventHash'>) {
  return {
    version: event.version,
    runId: event.runId,
    migrationName: event.migrationName,
    migrationVersion: event.migrationVersion,
    mode: event.mode,
    database: event.database,
    operator: event.operator,
    git: event.git,
    sequence: event.sequence,
    state: event.state,
    occurredAt: event.occurredAt,
    previousEventHash: event.previousEventHash,
    details: event.details,
  };
}

function assertExactText(value: string, label: string): void {
  if (!value || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be an exact non-empty string without control characters`);
  }
}

function validateSafeDetails(details: ThinkForgeMigrationSafeDetails): ThinkForgeMigrationSafeDetails {
  const counts = details.counts
    ? Object.fromEntries(Object.entries(details.counts).map(([key, value]) => {
        if (!SAFE_DETAIL_KEY_PATTERN.test(key)) throw new Error(`Unsafe migration count key: ${key}`);
        if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid migration count: ${key}`);
        return [key, value];
      }))
    : undefined;
  const hashes = details.hashes
    ? Object.fromEntries(Object.entries(details.hashes).map(([key, value]) => {
        if (!SAFE_DETAIL_KEY_PATTERN.test(key)) throw new Error(`Unsafe migration hash key: ${key}`);
        if (!SHA256_PATTERN.test(value)) throw new Error(`Invalid migration hash: ${key}`);
        return [key, value];
      }))
    : undefined;
  const codes = details.codes
    ? [...new Set(details.codes)].sort().map((code) => {
        if (!SAFE_CODE_PATTERN.test(code)) throw new Error(`Unsafe migration code: ${code}`);
        return code;
      })
    : undefined;
  return {
    ...(counts ? { counts } : {}),
    ...(hashes ? { hashes } : {}),
    ...(codes ? { codes } : {}),
  };
}

export function createMigrationExecutionEvent(input: Omit<
  ThinkForgeMigrationExecutionEventV1,
  'version' | 'eventHash' | 'details'
> & { details?: ThinkForgeMigrationSafeDetails }): ThinkForgeMigrationExecutionEventV1 {
  if (!RUN_ID_PATTERN.test(input.runId)) throw new Error('Invalid migration run ID');
  assertExactText(input.migrationName, 'Migration name');
  assertExactText(input.database, 'Migration database');
  if (!Number.isSafeInteger(input.migrationVersion) || input.migrationVersion < 1) {
    throw new Error('Migration version must be a positive integer');
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 0) {
    throw new Error('Migration event sequence must be a non-negative integer');
  }
  if (Number.isNaN(Date.parse(input.occurredAt))) throw new Error('Migration event timestamp must be ISO-compatible');
  if (input.previousEventHash !== null && !SHA256_PATTERN.test(input.previousEventHash)) {
    throw new Error('Invalid previous migration event hash');
  }
  if (input.mode !== 'dry_run' && !input.operator) {
    throw new Error(`Migration operator is required for ${input.mode}`);
  }
  if (input.operator) assertExactText(input.operator, 'Migration operator');

  const eventWithoutHash: Omit<ThinkForgeMigrationExecutionEventV1, 'eventHash'> = {
    ...input,
    version: THINKFORGE_MIGRATION_EXECUTION_EVENT_VERSION,
    details: validateSafeDetails(input.details ?? {}),
  };
  return {
    ...eventWithoutHash,
    eventHash: hashMigrationValue(migrationEventHashPayload(eventWithoutHash)),
  };
}

export function verifyMigrationExecutionChain(events: readonly ThinkForgeMigrationExecutionEventV1[]): {
  valid: boolean;
  errors: string[];
} {
  if (events.length === 0) return { valid: false, errors: ['empty_chain'] };
  const errors: string[] = [];
  let previousHash: string | null = null;
  let previousState: ThinkForgeMigrationExecutionState | null = null;
  const first = events[0];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.sequence !== index) errors.push(`sequence:${index}`);
    if (event.previousEventHash !== previousHash) errors.push(`previous_hash:${index}`);
    if (first && (
      event.runId !== first.runId
      || event.migrationName !== first.migrationName
      || event.migrationVersion !== first.migrationVersion
      || event.mode !== first.mode
      || event.database !== first.database
      || event.operator !== first.operator
      || stableSerializeMigrationValue(event.git) !== stableSerializeMigrationValue(first.git)
    )) {
      errors.push(`identity:${index}`);
    }
    if (hashMigrationValue(migrationEventHashPayload(event)) !== event.eventHash) {
      errors.push(`event_hash:${index}`);
    }
    const stateError = executionStateError({
      mode: event.mode,
      previousState,
      state: event.state,
      sequence: index,
    });
    if (stateError) errors.push(stateError);
    previousHash = event.eventHash;
    previousState = event.state;
  }
  return { valid: errors.length === 0, errors };
}

export function resolveMigrationMode(input: { apply: boolean; rollback: boolean }): ThinkForgeMigrationMode {
  if (input.apply && input.rollback) throw new Error('Choose either --apply or --rollback');
  if (input.apply) return 'apply';
  if (input.rollback) return 'rollback';
  return 'dry_run';
}

function argumentValue(argumentsList: readonly string[], name: string): string | null {
  const prefix = `--${name}=`;
  const matches = argumentsList.filter((value) => value.startsWith(prefix));
  if (matches.length > 1) throw new Error(`Specify --${name} only once`);
  return matches[0]?.slice(prefix.length) ?? null;
}

export function resolveMigrationOperator(
  mode: ThinkForgeMigrationMode,
  argumentsList: readonly string[],
): string | null {
  const operator = argumentValue(argumentsList, 'operator');
  if (mode !== 'dry_run' && !operator) throw new Error(`Mutation mode requires --operator=<operator-id>`);
  if (!operator) return null;
  assertExactText(operator, 'Migration operator');
  if (operator.length > 128) throw new Error('Migration operator must be at most 128 characters');
  return operator;
}

export function resolveMigrationRunId(argumentsList: readonly string[]): string {
  const requested = argumentValue(argumentsList, 'run-id');
  const runId = requested ?? `tfmig_${randomUUID().replaceAll('-', '')}`;
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error('Migration run ID must be 8-128 letters, numbers, underscores, or hyphens');
  }
  return runId;
}

function readGitValue(cwd: string, argumentsList: string[]): string | null {
  const result = spawnSync('git', argumentsList, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

export function readMigrationGitIdentity(cwd = process.cwd()): ThinkForgeMigrationGitIdentity | null {
  const commitSha = readGitValue(cwd, ['rev-parse', 'HEAD']);
  const treeSha = readGitValue(cwd, ['rev-parse', 'HEAD^{tree}']);
  if (!commitSha || !treeSha) return null;
  const branch = readGitValue(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    commitSha,
    treeSha,
    branch,
    dirty: status.status !== 0 || status.stdout.trim().length > 0,
  };
}

function readOwnPath(record: Record<string, unknown>, path: string): { exists: boolean; value?: unknown } {
  const parts = path.split('.');
  let current: unknown = record;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)
      || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { exists: false };
    }
    current = (current as Record<string, unknown>)[part];
  }
  return { exists: true, value: current };
}

export function captureMigrationCasFields(
  record: Record<string, unknown>,
  paths: readonly string[],
): ThinkForgeMigrationCasField[] {
  const uniquePaths = [...new Set(paths)];
  return uniquePaths.map((path) => {
    if (!path || path.startsWith('$') || path.split('.').some((part) => !part || part.startsWith('$'))) {
      throw new Error(`Invalid migration CAS path: ${path}`);
    }
    return { path, ...readOwnPath(record, path) };
  });
}

export function buildMigrationCasFilter<TSchema extends Document>(
  identity: Filter<TSchema>,
  fields: readonly ThinkForgeMigrationCasField[],
): Filter<TSchema> {
  const fieldFilters = fields.map((field) => ({
    [field.path]: field.exists
      ? { $exists: true, $eq: field.value }
      : { $exists: false },
  })) as Filter<TSchema>[];
  return fieldFilters.length > 0
    ? { $and: [identity, ...fieldFilters] } as Filter<TSchema>
    : identity;
}

export function createMigrationFailureDetails(error: unknown): ThinkForgeMigrationSafeDetails {
  const errorName = error instanceof Error ? error.name : typeof error;
  const safeCode = errorName.toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '') || 'unknown';
  return {
    codes: [`execution_failed:${safeCode}`],
    hashes: {
      failure: hashMigrationValue({
        name: errorName,
        message: error instanceof Error ? error.message : String(error),
      }),
    },
  };
}

export class ThinkForgeMigrationExecutionReporter {
  private nextSequence = 0;
  private previousEventHash: string | null = null;
  private previousState: ThinkForgeMigrationExecutionState | null = null;

  private constructor(
    private readonly database: Db,
    private readonly identity: Pick<
      ThinkForgeMigrationExecutionEventV1,
      'runId' | 'migrationName' | 'migrationVersion' | 'mode' | 'database' | 'operator' | 'git'
    >,
  ) {}

  static async create(input: {
    database: Db;
    runId: string;
    migrationName: string;
    migrationVersion: number;
    mode: ThinkForgeMigrationMode;
    databaseName: string;
    operator: string | null;
    git: ThinkForgeMigrationGitIdentity | null;
  }): Promise<ThinkForgeMigrationExecutionReporter> {
    const collection = input.database.collection<ThinkForgeMigrationExecutionEventV1>(
      THINKFORGE_MIGRATION_EXECUTION_COLLECTION,
    );
    await collection.createIndexes([
      { key: { runId: 1, sequence: 1 }, name: 'uniq_thinkforge_migration_run_sequence', unique: true },
      { key: { eventHash: 1 }, name: 'uniq_thinkforge_migration_event_hash', unique: true },
      { key: { migrationName: 1, occurredAt: -1 }, name: 'thinkforge_migration_history' },
    ]);
    const reporter = new ThinkForgeMigrationExecutionReporter(input.database, {
      runId: input.runId,
      migrationName: input.migrationName,
      migrationVersion: input.migrationVersion,
      mode: input.mode,
      database: input.databaseName,
      operator: input.operator,
      git: input.git,
    });
    await reporter.append('started');
    return reporter;
  }

  get runId(): string {
    return this.identity.runId;
  }

  checkpoint(): ReporterCheckpoint {
    return {
      nextSequence: this.nextSequence,
      previousEventHash: this.previousEventHash,
      previousState: this.previousState,
    };
  }

  restore(checkpoint: ReporterCheckpoint): void {
    this.nextSequence = checkpoint.nextSequence;
    this.previousEventHash = checkpoint.previousEventHash;
    this.previousState = checkpoint.previousState;
  }

  async synchronize(): Promise<void> {
    const events = await this.database.collection<ThinkForgeMigrationExecutionEventV1>(
      THINKFORGE_MIGRATION_EXECUTION_COLLECTION,
    ).find({ runId: this.identity.runId }).sort({ sequence: 1 }).toArray();
    const verification = verifyMigrationExecutionChain(events);
    if (!verification.valid) {
      throw new Error(`Migration execution chain is invalid: ${verification.errors.join(', ')}`);
    }
    this.nextSequence = events.length;
    this.previousEventHash = events.at(-1)?.eventHash ?? null;
    this.previousState = events.at(-1)?.state ?? null;
  }

  async append(
    state: ThinkForgeMigrationExecutionState,
    details: ThinkForgeMigrationSafeDetails = {},
    session?: ClientSession,
  ): Promise<ThinkForgeMigrationExecutionEventV1> {
    const stateError = executionStateError({
      mode: this.identity.mode,
      previousState: this.previousState,
      state,
      sequence: this.nextSequence,
    });
    if (stateError) throw new Error(`Invalid migration execution state: ${stateError}`);
    const event = createMigrationExecutionEvent({
      ...this.identity,
      sequence: this.nextSequence,
      state,
      occurredAt: new Date().toISOString(),
      previousEventHash: this.previousEventHash,
      details,
    });
    const collection = this.database.collection<ThinkForgeMigrationExecutionEventV1>(
      THINKFORGE_MIGRATION_EXECUTION_COLLECTION,
    );
    if (session) await collection.insertOne(event, { session });
    else await collection.insertOne(event);
    this.nextSequence += 1;
    this.previousEventHash = event.eventHash;
    this.previousState = event.state;
    return event;
  }
}

export async function recordMigrationFailure(
  reporter: ThinkForgeMigrationExecutionReporter,
  error: unknown,
): Promise<void> {
  await reporter.synchronize();
  await reporter.append('failed', createMigrationFailureDetails(error));
}

export async function runMigrationTransaction<T>(input: {
  client: MongoClient;
  reporter: ThinkForgeMigrationExecutionReporter;
  execute: (session: ClientSession) => Promise<T>;
}): Promise<T> {
  const session = input.client.startSession();
  const checkpoint = input.reporter.checkpoint();
  try {
    session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    const result = await input.execute(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    let abortError: unknown;
    try {
      if (session.inTransaction()) await session.abortTransaction();
    } catch (caught) {
      abortError = caught;
    } finally {
      input.reporter.restore(checkpoint);
    }
    if (abortError) {
      throw new AggregateError([error, abortError], 'Migration transaction and abort both failed');
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
