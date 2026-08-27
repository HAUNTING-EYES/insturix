type DocumentRecord = Record<string, unknown>;
type Query = Record<string, unknown>;
type Update = Readonly<{
  $set?: Record<string, unknown>;
  $push?: Record<string, unknown>;
  $pull?: Record<string, unknown>;
  $inc?: Record<string, number>;
}>;
type UpdateOptions = Readonly<{
  arrayFilters?: readonly Query[];
}>;

type UpdateResult = Readonly<{
  acknowledged: true;
  matchedCount: number;
  modifiedCount: number;
}>;

/**
 * Stateful, single-project persistence used only to exercise the real
 * ProjectService owner across sequential reads and CAS writes. It implements
 * the bounded Mongo surface used by updateOverlay, cut locks and range cuts;
 * it is not a production-database emulator.
 */
export class StatefulProjectServicePersistenceV1<T extends DocumentRecord> {
  private project: T;
  private nextConflictMutation: ((current: T) => T) | null = null;
  private updateAttemptCount = 0;

  constructor(initialProject: T) {
    this.project = clone(initialProject);
  }

  asDatabase(): Readonly<{
    collection: (_name: string) => Readonly<{
      findOne: (filter: Query, options?: unknown) => Promise<T | null>;
      updateOne: (
        filter: Query,
        update: Update,
        options?: UpdateOptions,
      ) => Promise<UpdateResult>;
    }>;
  }> {
    return {
      collection: () => ({
        findOne: (filter) => this.findOne(filter),
        updateOne: (filter, update, options) => this.updateOne(filter, update, options),
      }),
    };
  }

  snapshot(): T {
    return clone(this.project);
  }

  updateAttempts(): number {
    return this.updateAttemptCount;
  }

  forceNextMatchedUpdateToLoseCas(mutate: (current: T) => T): void {
    if (this.nextConflictMutation) {
      throw new Error("PROJECT_SERVICE_TEST_CONFLICT_ALREADY_ARMED");
    }
    this.nextConflictMutation = mutate;
  }

  private async findOne(filter: Query): Promise<T | null> {
    return matches(this.project, filter) ? clone(this.project) : null;
  }

  private async updateOne(
    filter: Query,
    update: Update,
    options: UpdateOptions = {},
  ): Promise<UpdateResult> {
    this.updateAttemptCount += 1;
    if (!matches(this.project, filter)) return noMatch();
    if (this.nextConflictMutation) {
      const mutate = this.nextConflictMutation;
      this.nextConflictMutation = null;
      this.project = clone(mutate(clone(this.project)));
      return noMatch();
    }
    this.project = applyUpdate(this.project, update, options);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }
}

function noMatch(): UpdateResult {
  return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
}

function matches(record: unknown, filter: Query): boolean {
  return Object.entries(filter).every(([path, expected]) => (
    valuesAtPath(record, path.split(".")).some((actual) => matchesValue(actual, expected))
  ));
}

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (isOperatorRecord(expected)) {
    return Object.entries(expected).every(([operator, operand]) => {
      if (operator === "$elemMatch") {
        return Array.isArray(actual)
          && isRecord(operand)
          && actual.some((item) => isRecord(item) && matches(item, operand));
      }
      if (operator === "$gt") return compare(actual, operand) > 0;
      if (operator === "$gte") return compare(actual, operand) >= 0;
      if (operator === "$lt") return compare(actual, operand) < 0;
      if (operator === "$lte") return compare(actual, operand) <= 0;
      if (operator === "$in") {
        return Array.isArray(operand) && operand.some((item) => equal(actual, item));
      }
      if (operator === "$ne") return !equal(actual, operand);
      if (operator === "$not") return !matchesValue(actual, operand);
      throw new Error(`UNSUPPORTED_PROJECT_SERVICE_TEST_OPERATOR:${operator}`);
    });
  }
  return equal(actual, expected);
}

function valuesAtPath(value: unknown, segments: readonly string[]): unknown[] {
  if (segments.length === 0) return [value];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => valuesAtPath(entry, segments));
  }
  if (!isRecord(value)) return [undefined];
  const [head, ...tail] = segments;
  return valuesAtPath(value[head!], tail);
}

function applyUpdate<T extends DocumentRecord>(
  current: T,
  update: Update,
  options: UpdateOptions,
): T {
  const next = clone(current);
  for (const [path, value] of Object.entries(update.$set ?? {})) {
    const positional = /^(.*)\.\$\[([^\]]+)\]$/.exec(path);
    if (positional) {
      replaceArrayElement(next, positional[1]!, positional[2]!, value, options.arrayFilters ?? []);
    } else {
      setPath(next, path, clone(value));
    }
  }
  for (const [path, value] of Object.entries(update.$push ?? {})) {
    const existing = directPath(next, path);
    const values = Array.isArray(existing) ? [...existing] : [];
    if (isRecord(value) && Array.isArray(value.$each)) {
      values.push(...clone(value.$each));
      const slice = value.$slice;
      const sliced = typeof slice === "number" && slice < 0
        ? values.slice(slice)
        : values;
      setPath(next, path, sliced);
    } else {
      values.push(clone(value));
      setPath(next, path, values);
    }
  }
  for (const [path, predicate] of Object.entries(update.$pull ?? {})) {
    const existing = directPath(next, path);
    if (!Array.isArray(existing) || !isRecord(predicate)) {
      throw new Error(`UNSUPPORTED_PROJECT_SERVICE_TEST_PULL:${path}`);
    }
    setPath(next, path, existing.filter((entry) => (
      !isRecord(entry) || !matches(entry, predicate)
    )));
  }
  for (const [path, increment] of Object.entries(update.$inc ?? {})) {
    const prior = directPath(next, path);
    if (typeof prior !== "number") {
      throw new Error(`NON_NUMERIC_PROJECT_SERVICE_TEST_INCREMENT:${path}`);
    }
    setPath(next, path, prior + increment);
  }
  return next;
}

function replaceArrayElement(
  owner: DocumentRecord,
  path: string,
  identifier: string,
  value: unknown,
  arrayFilters: readonly Query[],
): void {
  const array = directPath(owner, path);
  if (!Array.isArray(array)) throw new Error(`NON_ARRAY_PROJECT_SERVICE_TEST_PATH:${path}`);
  const rawFilter = arrayFilters.find((candidate) => (
    Object.keys(candidate).some((key) => key.startsWith(`${identifier}.`))
  ));
  if (!rawFilter) throw new Error(`MISSING_PROJECT_SERVICE_TEST_ARRAY_FILTER:${identifier}`);
  const filter = Object.fromEntries(Object.entries(rawFilter).map(([key, expected]) => (
    [key.slice(identifier.length + 1), expected]
  )));
  const index = array.findIndex((entry) => isRecord(entry) && matches(entry, filter));
  if (index < 0) throw new Error(`PROJECT_SERVICE_TEST_ARRAY_FILTER_MISS:${identifier}`);
  const replacement = [...array];
  replacement[index] = clone(value);
  setPath(owner, path, replacement);
}

function directPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => (
    isRecord(current) ? current[segment] : undefined
  ), value);
}

function setPath(owner: DocumentRecord, path: string, value: unknown): void {
  const segments = path.split(".");
  let cursor = owner;
  for (const segment of segments.slice(0, -1)) {
    if (!isRecord(cursor[segment])) cursor[segment] = {};
    cursor = cursor[segment] as DocumentRecord;
  }
  cursor[segments.at(-1)!] = value;
}

function isRecord(value: unknown): value is DocumentRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date));
}

function isOperatorRecord(value: unknown): value is DocumentRecord {
  return isRecord(value) && Object.keys(value).some((key) => key.startsWith("$"));
}

function compare(left: unknown, right: unknown): number {
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;
  if (leftValue === rightValue) return 0;
  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue < rightValue ? -1 : 1;
  }
  if (typeof leftValue === "string" && typeof rightValue === "string") {
    return leftValue < rightValue ? -1 : 1;
  }
  return -1;
}

function equal(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
