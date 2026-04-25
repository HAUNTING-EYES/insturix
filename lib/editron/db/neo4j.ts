/**
 * Neo4j Connection — Singleton driver for the knowledge graph intelligence layer.
 *
 * Mirrors mongodb.ts pattern: lazy singleton, env-validated, pooled.
 * Neo4j Aura Free tier (200K nodes). Driver handles connection pooling internally.
 */

import neo4j, { type Driver, type Session, type SessionConfig, Integer } from 'neo4j-driver';

// ─── Configuration ──────────────────────────────────────────────

interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database: string;
}

function loadConfig(): Neo4jConfig {
  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;
  const database = process.env.NEO4J_DATABASE;

  if (!uri || !username || !password || !database) {
    throw new Error(
      'Missing Neo4j env vars. Required: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE'
    );
  }

  return { uri, username, password, database };
}

// ─── Singleton Driver ───────────────────────────────────────────

let cachedDriver: Driver | null = null;
let cachedConfig: Neo4jConfig | null = null;

/**
 * Get the Neo4j driver singleton.
 * Creates it on first call, reuses on subsequent calls.
 * The driver manages its own connection pool — do NOT close it between requests.
 */
export function getDriver(): Driver {
  if (cachedDriver) return cachedDriver;

  const config = loadConfig();

  cachedDriver = neo4j.driver(
    config.uri,
    neo4j.auth.basic(config.username, config.password),
    {
      maxConnectionPoolSize: 10,
      connectionAcquisitionTimeout: 5000,
      connectionTimeout: 5000,
      maxTransactionRetryTime: 5000,
      logging: {
        level: 'warn',
        logger: (level, message) => console.log(`[neo4j][${level}]`, message),
      },
    }
  );

  cachedConfig = config;
  return cachedDriver;
}

/**
 * Get a Neo4j session configured for the correct database.
 * Caller MUST close the session when done (use try/finally).
 */
export function getSession(mode: 'READ' | 'WRITE' = 'WRITE'): Session {
  const driver = getDriver();
  const config = cachedConfig ?? loadConfig();

  const sessionConfig: SessionConfig = {
    database: config.database,
    defaultAccessMode: mode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE,
  };

  return driver.session(sessionConfig);
}

/**
 * Execute a single Cypher query with automatic session management.
 * For simple one-shot operations — use getSession() for transactions.
 */
export async function runCypher<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
  mode: 'READ' | 'WRITE' = 'WRITE'
): Promise<T[]> {
  const session = getSession(mode);
  try {
    const result = await session.run(cypher, params);
    return result.records.map((r) => toNativeTypes(r.toObject()) as T);
  } finally {
    await session.close();
  }
}

/**
 * Recursively convert neo4j Integer/DateTime objects to JS primitives.
 * neo4j-driver returns Integer{} objects for int fields — these silently
 * break arithmetic and comparisons if not converted.
 */
function toNativeTypes(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Integer.isInteger(obj)) return (obj as Integer).toNumber();
  if (neo4j.isDateTime(obj) || neo4j.isDate(obj) || neo4j.isTime(obj)) {
    return (obj as { toString(): string }).toString();
  }
  if (Array.isArray(obj)) return obj.map(toNativeTypes);
  if (typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out[k] = toNativeTypes(v);
    }
    return out;
  }
  return obj;
}

/**
 * Check if Neo4j is reachable. Returns false if connection fails.
 * Used for graceful degradation — pipeline falls back to MongoDB-only.
 */
export async function isNeo4jAvailable(): Promise<boolean> {
  try {
    const driver = getDriver();
    const info = await driver.getServerInfo();
    return !!info;
  } catch {
    return false;
  }
}

/**
 * Close the driver (only call on process shutdown, not between requests).
 */
export async function closeDriver(): Promise<void> {
  if (cachedDriver) {
    await cachedDriver.close();
    cachedDriver = null;
    cachedConfig = null;
  }
}
