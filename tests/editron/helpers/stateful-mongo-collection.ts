import type { Collection } from 'mongodb';

type DocumentRecord = {
  _id: string;
  tenantId?: unknown;
  idempotencyKey?: unknown;
};
type Query = Record<string, unknown>;
type Update = Readonly<{
  $set?: Record<string, unknown>;
  $inc?: Record<string, number>;
}>;

export class StatefulMongoCollection<T extends DocumentRecord> {
  private readonly records = new Map<string, T>();

  constructor(initialRecords: readonly T[] = []) {
    for (const record of initialRecords) {
      if (this.records.has(record._id)) {
        throw new Error(`DUPLICATE_TEST_MONGO_RECORD:${record._id}`);
      }
      this.records.set(record._id, clone(record));
    }
  }

  asCollection(): Collection<T> {
    return this as unknown as Collection<T>;
  }

  async findOne(filter: Query): Promise<T | null> {
    const record = [...this.records.values()].find((entry) => matches(asRecord(entry), filter));
    return record ? clone(record) : null;
  }

  async insertOne(value: T): Promise<{ acknowledged: true; insertedId: string }> {
    const duplicate = this.records.has(value._id)
      || [...this.records.values()].some((entry) => (
        entry.tenantId === value.tenantId
        && entry.idempotencyKey === value.idempotencyKey
      ));
    if (duplicate) {
      throw Object.assign(new Error('duplicate key'), { code: 11000 });
    }
    this.records.set(value._id, clone(value));
    return { acknowledged: true, insertedId: value._id };
  }

  async updateOne(
    filter: Query,
    update: Update,
  ): Promise<{ acknowledged: true; matchedCount: number; modifiedCount: number }> {
    const entry = [...this.records.entries()]
      .find(([, value]) => matches(asRecord(value), filter));
    if (!entry) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    const [id, current] = entry;
    this.records.set(id, applyUpdate(current, update));
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }

  async findOneAndUpdate(
    filter: Query,
    update: Update,
  ): Promise<T | null> {
    const entry = [...this.records.entries()]
      .find(([, value]) => matches(asRecord(value), filter));
    if (!entry) return null;
    const [id, current] = entry;
    const updated = applyUpdate(current, update);
    this.records.set(id, updated);
    return clone(updated);
  }

  find(filter: Query) {
    let result = [...this.records.values()].filter((entry) => matches(asRecord(entry), filter));
    const cursor = {
      sort: (spec: Record<string, 1 | -1>) => {
        const [path, direction] = Object.entries(spec)[0] ?? [];
        if (path && direction) {
          result = result.sort((left, right) => (
            compare(getPath(asRecord(left), path), getPath(asRecord(right), path)) * direction
          ));
        }
        return cursor;
      },
      limit: (maximum: number) => {
        result = result.slice(0, maximum);
        return cursor;
      },
      toArray: async () => result.map(clone),
    };
    return cursor;
  }

  snapshot(): T[] {
    return [...this.records.values()].map(clone);
  }
}

function matches(record: Record<string, unknown>, filter: Query): boolean {
  return Object.entries(filter).every(([path, expected]) => {
    if (path === '$or') {
      return Array.isArray(expected)
        && expected.some((candidate) => matches(record, candidate as Query));
    }
    const actual = getPath(record, path);
    if (isOperatorRecord(expected)) {
      return Object.entries(expected).every(([operator, operand]) => {
        if (operator === '$in') {
          return Array.isArray(operand) && operand.some((item) => equal(actual, item));
        }
        if (operator === '$ne') return !equal(actual, operand);
        if (operator === '$gt') return compare(actual, operand) > 0;
        if (operator === '$gte') return compare(actual, operand) >= 0;
        if (operator === '$lt') return compare(actual, operand) < 0;
        if (operator === '$lte') return compare(actual, operand) <= 0;
        throw new Error(`UNSUPPORTED_TEST_MONGO_OPERATOR:${operator}`);
      });
    }
    return equal(actual, expected);
  });
}

function applyUpdate<T extends DocumentRecord>(current: T, update: Update): T {
  const next = asRecord(clone(current));
  for (const [path, value] of Object.entries(update.$set ?? {})) {
    setPath(next, path, clone(value));
  }
  for (const [path, amount] of Object.entries(update.$inc ?? {})) {
    const prior = getPath(next, path);
    if (typeof prior !== 'number') throw new Error(`NON_NUMERIC_TEST_INCREMENT:${path}`);
    setPath(next, path, prior + amount);
  }
  return next as T;
}

function asRecord(value: object): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function getPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => (
    current && typeof current === 'object'
      ? (current as Record<string, unknown>)[segment]
      : undefined
  ), value);
}

function setPath(value: Record<string, unknown>, path: string, next: unknown): void {
  const segments = path.split('.');
  let owner = value;
  for (const segment of segments.slice(0, -1)) {
    const child = owner[segment];
    if (!child || typeof child !== 'object' || Array.isArray(child)) {
      owner[segment] = {};
    }
    owner = owner[segment] as Record<string, unknown>;
  }
  owner[segments.at(-1)!] = next;
}

function isOperatorRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && !(value instanceof Date)
    && Object.keys(value as Record<string, unknown>).some((key) => key.startsWith('$')));
}

function compare(left: unknown, right: unknown): number {
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;
  if (leftValue === rightValue) return 0;
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return leftValue < rightValue ? -1 : 1;
  }
  if (typeof leftValue === 'string' && typeof rightValue === 'string') {
    return leftValue < rightValue ? -1 : 1;
  }
  return -1;
}

function equal(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
