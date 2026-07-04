/**
 * ThinkForge Database Service Layer
 * Simple, robust database operations for ThinkForge
 * 
 * V2 Architecture:
 * - Projects (root container, replaces sessions)
 * - Artifacts (polymorphic: script | chat | whiteboard | content_card)
 * - Versions (immutable nodes referencing content blocks)
 * - ContentBlocks (global, hash-addressed, deduplicated)
 * - Events (optional audit trail)
 * 
 * IMMUTABILITY RULES (enforced in code):
 * - thinkforge_versions: INSERT ONLY, no updates allowed
 * - thinkforge_content_blocks: INSERT ONLY, no updates allowed
 * - These collections are append-only by design
 * - Any mutation attempt will throw ImmutabilityError
 * 
 * RUNTIME INVARIANTS (logged as warnings):
 * - Versions must reference existing content_blocks
 * - Versions must reference existing parent versions
 * - Version edges must reference existing versions
 */

import mongoose, { Schema, Model } from 'mongoose';
import crypto from 'crypto';
import { brandVaultSourceEnabled } from '../../shared/brand-flags';
import { brandSignalProfileToBrandDNA } from '../../shared/brand-signal-profile-adapter';
import type { BrandSignalProfile } from '../../shared/brand-signal-profile';
import {
  getDefaultBrandVaultRefineryStore,
  type BrandVaultRefineryStore,
} from '../../shared/brand-vault-refinery-api';
import type { BrandVaultStoreResult } from '../../shared/brand-vault-draft-orchestrator';

// ==================== Immutability Enforcement ====================

/**
 * Error thrown when attempting to mutate immutable collections.
 * Versions and ContentBlocks are append-only by design.
 */
export class ImmutabilityError extends Error {
  constructor(collection: string, operation: string) {
    super(`IMMUTABILITY VIOLATION: Cannot ${operation} in ${collection}. This collection is append-only.`);
    this.name = 'ImmutabilityError';
  }
}

/**
 * Throws ImmutabilityError if called. Used to block mutation paths.
 */
function blockMutation(collection: string, operation: string): never {
  throw new ImmutabilityError(collection, operation);
}

import type { ChatMessage, ProjectMeta, ScriptState } from '../state/types';
import { validateThinkForgeBlocks, type ThinkForgeBlock } from '../schemas/thinkforge-block';
import type { CIRDocument, CIRSection } from '../schemas/cir';

// ==================== ThinkForge Database Connection ====================
// All ThinkForge collections live in the 'thinkforge_db' database
function enforceThinkForgeBlocks(input: any): ThinkForgeBlock[] {
  const candidate = Array.isArray(input) ? input : [];
  const validated = validateThinkForgeBlocks(candidate);
  if (validated.length !== candidate.length) {
    throw new Error('Invalid block payload: persistence expects ThinkForgeBlock[].');
  }
  return validated;
}

const THINKFORGE_DB_NAME = 'thinkforge_db';

/**
 * Cached connection specifically for ThinkForge database.
 * Separate from the main app database connection.
 */
let thinkforgeDbCached: { conn: mongoose.Connection | null; promise: Promise<mongoose.Connection> | null } = {
  conn: null,
  promise: null
};

/**
 * Connect to the ThinkForge database specifically.
 * Uses 'thinkforge_db' as the database name.
 */
async function connectToThinkForgeDb(): Promise<mongoose.Connection> {
  // If already connected and ready, return immediately
  if (thinkforgeDbCached.conn && thinkforgeDbCached.conn.readyState === 1) {
    return thinkforgeDbCached.conn;
  }

  // If connection is in progress, wait for it
  if (thinkforgeDbCached.promise) {
    try {
      thinkforgeDbCached.conn = await thinkforgeDbCached.promise;
      return thinkforgeDbCached.conn;
    } catch (err) {
      // Connection failed, reset and retry
      console.error('[ThinkForge] DB connection failed, resetting:', err);
      thinkforgeDbCached.promise = null;
      thinkforgeDbCached.conn = null;
    }
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable is not defined');
  }

  const opts = {
    bufferCommands: false,
    dbName: THINKFORGE_DB_NAME,
    serverSelectionTimeoutMS: 10000, // 10s timeout for server selection
    connectTimeoutMS: 10000, // 10s timeout for initial connection
  };

  console.log('[ThinkForge] Connecting to database using createConnection...');
  thinkforgeDbCached.promise = mongoose.createConnection(mongoUri, opts).asPromise();
  
  thinkforgeDbCached.promise.then(() => {
    console.log(`[ThinkForge] Connected to database: ${THINKFORGE_DB_NAME}`);
  }).catch((err) => {
    console.error('[ThinkForge] Failed to connect to database:', err?.message || err);
    thinkforgeDbCached.promise = null;
    thinkforgeDbCached.conn = null;
    throw err;
  });

  thinkforgeDbCached.conn = await thinkforgeDbCached.promise;
  return thinkforgeDbCached.conn;
}

// ==================== Collection Names ====================
// V1 (Legacy) - kept for backward compatibility
const COLL_SESSIONS = 'thinkforge_sessions';
const COLL_SCRIPTS = 'thinkforge_scripts';
const COLL_CHAT = 'thinkforge_chat';
const COLL_USERS = 'thinkforge_users';
const COLL_RATE_USAGE = 'thinkforge_rate_usage';

// V2 (New architecture)
const COLL_PROJECTS = 'thinkforge_projects';
const COLL_ARTIFACTS = 'thinkforge_artifacts';
const COLL_VERSIONS = 'thinkforge_versions';
const COLL_CONTENT_BLOCKS = 'thinkforge_content_blocks';
const COLL_EVENTS = 'thinkforge_events';

// ==================== V1 Types (Legacy) ====================
export interface GenerationState {
  id: string;
  type: 'chat' | 'script_generate' | 'script_edit';
  scriptId?: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  intent?: string;
  progress?: number;
  startedAt: Date;
  updatedAt: Date;
  message?: string;
}

export interface Session {
  _id: string;
  userId: string;
  orgId?: string;  // null = personal, set = org-owned
  createdByName?: string;  // Creator's display name for org context
  projectMeta?: ProjectMeta;
  createdAt: Date;
  updatedAt: Date;
  activeGeneration?: GenerationState | null;
}

export interface Script {
  _id: string;
  sessionId: string;
  scriptId?: string;
  title: string;
  content: string;
  blocks?: ThinkForgeBlock[];
  richText?: Record<string, any>; // Tiptap JSON AST
  metadata?: Record<string, any>;
  version?: number;
  documentType?: string;
  parentScriptId?: string;
  forkReason?: string;
  createdFromIntent?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageDoc {
  _id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export type SentenceLength = 'fragment' | 'short' | 'medium' | 'long';
export type OpeningPattern = 'question' | 'statistic' | 'story' | 'provocation' | 'scene_set' | 'direct_claim';
export type TransitionStyle = 'conjunction' | 'implicit' | 'question_bridge' | 'callback' | 'tonal_shift';
export type ClosingPattern = 'cta' | 'callback_open' | 'reframe' | 'cliffhanger' | 'landing';
export type ListStyle = 'numbered' | 'bulleted' | 'inline' | 'none';

export interface VoiceFingerprint {
  topBigrams: [string, number][];
  avgWordsPerSentence: number;
  sentenceLengthVariance: number;
  passiveVoiceRatio: number;
  questionFrequency: number;
  punctuationProfile: Record<string, number>;
  sentenceRhythm: SentenceLength[];
  openingPattern: OpeningPattern;
  transitionStyle: TransitionStyle;
  closingPattern: ClosingPattern;
  listStyle: ListStyle;
  extractedFromCount: number;
}

export interface VoiceExemplar {
  id: string;
  text: string;
  signalProfile: Record<string, number>;
  contentType: string;
  pinned: boolean;
  weight: number;
}

export interface BrandDNA {
  voiceLock?: string;
  nicheMap?: string;
  killList?: string[];
  hookArchetypes?: string[];
  structuralHabits?: string[];
  recurringAssets?: string[];
  voiceFingerprint?: VoiceFingerprint;
  voiceExemplars?: VoiceExemplar[];
}

export type BrandVaultBrandDNAProfileGetter = (
  filter: { brandId?: string; userId?: string; orgId?: string | null },
) => BrandVaultStoreResult<BrandSignalProfile | null>;

export interface ResolveEffectiveBrandDNAOptions {
  enabled?: boolean;
  orgId?: string | null;
  getAcceptedProfile?: BrandVaultBrandDNAProfileGetter;
  onVaultFallback?: (message: string, error: unknown) => void;
}

export interface EffectiveBrandDNAResolution {
  brandDNA: BrandDNA;
  brandSignalProfile: BrandSignalProfile | null;
  source: 'legacy' | 'brand_vault';
}

export interface UserPreferences {
  _id: string;
  preferences: Record<string, any>;
  brandDNA?: BrandDNA;
  updatedAt: Date;
}

// ==================== V2 Types ====================
export type ArtifactType = 'script' | 'chat' | 'whiteboard' | 'content_card';
export type ContentBlockType = 'text' | 'markdown' | 'code' | 'scene' | 'json' | 'chat_message';
export type VersionEdgeType = 'inspired_by' | 'derived_from' | 'remix_of' | 'references';
export type EventType =
  | 'project_created' | 'project_updated' | 'project_deleted'
  | 'artifact_created' | 'artifact_updated' | 'artifact_deleted'
  | 'version_created' | 'version_merged' | 'version_restored'
  | 'content_deleted' | 'hook_rejected' | 'style_corrected'
  | 'regeneration_requested' | 'feedback_given';

export interface Project {
  _id: string;
  userId: string;
  name: string;
  description?: string;
  archived: boolean;
  settings: {
    modelPreference?: string;
    memoryLevel?: string;
  };
  brandDNA?: BrandDNA;
  // Legacy compatibility - maps to old projectMeta
  projectMeta?: ProjectMeta;
  createdAt: Date;
  updatedAt: Date;
}

export interface Artifact {
  _id: string;
  projectId: string;
  type: ArtifactType;
  title: string;
  rootVersionId?: string;
  activeVersionId?: string;
  metadata: {
    language?: string;
    genre?: string;
    purpose?: string;
    [key: string]: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Version {
  _id: string;
  artifactId: string;
  parentIds: string[];  // Usually 1, >1 for merges
  contentBlockRefs: string[];  // References to ContentBlock hashes
  createdAt: Date;
  createdBy?: string;
  mergeMeta?: {
    baseVersionId: string;
    leftVersionId: string;
    rightVersionId: string;
    strategy: string;
    conflictsResolved: boolean;
  };
}

export interface ContentBlock {
  _id: string;  // This IS the hash (content-addressed)
  hash: string; // Same as _id, kept for clarity
  type: ContentBlockType;
  content: string;  // The actual content (normalized)
  createdAt: Date;
}

export interface VersionEdge {
  _id: string;
  fromVersionId: string;
  toVersionId: string;
  type: VersionEdgeType;
  createdAt: Date;
}

export interface ThinkForgeEvent {
  _id: string;
  projectId: string;
  artifactId?: string;
  versionId?: string;
  type: EventType;
  payload: Record<string, any>;
  userId?: string;
  createdAt: Date;
}

// ==================== Canonical Serialization & Hashing ====================

/**
 * Normalize content for consistent hashing.
 * Ensures semantically identical content produces the same hash.
 * 
 * Steps:
 * 1. Normalize line endings (\r\n → \n)
 * 2. Trim trailing whitespace per line
 * 3. Stable JSON stringification for objects (sorted keys)
 * 4. Explicit UTF-8 encoding
 */
export function normalizeContent(content: unknown): string {
  let normalized: string;

  if (typeof content === 'string') {
    normalized = content;
  } else if (content === null || content === undefined) {
    normalized = '';
  } else {
    // For objects/arrays: stable JSON with sorted keys
    normalized = stableStringify(content);
  }

  // Normalize line endings: \r\n and \r → \n
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Trim trailing whitespace per line (but preserve intentional indentation)
  normalized = normalized
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n');

  // Trim trailing newlines at end of content
  normalized = normalized.trimEnd();

  return normalized;
}

/**
 * Stable JSON stringify with sorted keys.
 * Ensures objects with same content but different key order produce identical output.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return '';
  }

  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => stableStringify(item)).join(',') + ']';
  }

  // Sort keys and recursively stringify
  const sortedKeys = Object.keys(obj as object).sort();
  const pairs = sortedKeys.map(key => {
    const value = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + stableStringify(value);
  });

  return '{' + pairs.join(',') + '}';
}

/**
 * Generate SHA-256 hash of normalized content.
 * Returns a hex string that serves as the content-addressed ID.
 */
export function generateContentHash(content: unknown): string {
  const normalized = normalizeContent(content);
  // Explicit UTF-8 encoding
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Create or retrieve a content block by its hash.
 * If content already exists, returns existing block (deduplication).
 */
export async function getOrCreateContentBlock(
  content: unknown,
  type: ContentBlockType
): Promise<ContentBlock> {
  const { ContentBlockModel } = await getModels();
  const normalized = normalizeContent(content);
  const hash = generateContentHash(content);

  // Upsert: create if not exists, return existing if it does
  const now = new Date();
  const result = await ContentBlockModel.findOneAndUpdate(
    { _id: hash },
    {
      $setOnInsert: {
        _id: hash,
        hash,
        type,
        content: normalized,
        createdAt: now
      }
    },
    { upsert: true, new: true, lean: true }
  ) as any;

  return {
    _id: result._id,
    hash: result.hash,
    type: result.type,
    content: result.content,
    createdAt: result.createdAt
  };
}

// ==================== Runtime Invariant Validation ====================

/**
 * Validate that a version's content block references exist.
 * Logs warnings for missing blocks (does not throw).
 */
export async function validateVersionContentBlocks(versionId: string): Promise<{
  valid: boolean;
  missingBlocks: string[];
}> {
  const { VersionModel, ContentBlockModel } = await getModels();

  const version = await VersionModel.findById(versionId).lean() as any;
  if (!version) {
    console.warn(`[INVARIANT] Version ${versionId} does not exist`);
    return { valid: false, missingBlocks: [] };
  }

  const refs = version.contentBlockRefs || [];
  if (refs.length === 0) {
    return { valid: true, missingBlocks: [] };
  }

  const existingBlocks = await ContentBlockModel.find({ _id: { $in: refs } }).lean() as any[];
  const existingIds = new Set(existingBlocks.map(b => b._id));
  const missingBlocks = refs.filter((ref: string) => !existingIds.has(ref));

  if (missingBlocks.length > 0) {
    console.warn(`[INVARIANT] Version ${versionId} references ${missingBlocks.length} missing content blocks:`, missingBlocks);
  }

  return { valid: missingBlocks.length === 0, missingBlocks };
}

/**
 * Validate that a version's parent references exist.
 * Logs warnings for missing parents (does not throw).
 */
export async function validateVersionParents(versionId: string): Promise<{
  valid: boolean;
  missingParents: string[];
}> {
  const { VersionModel } = await getModels();

  const version = await VersionModel.findById(versionId).lean() as any;
  if (!version) {
    console.warn(`[INVARIANT] Version ${versionId} does not exist`);
    return { valid: false, missingParents: [] };
  }

  const parentIds = version.parentIds || [];
  if (parentIds.length === 0) {
    return { valid: true, missingParents: [] };
  }

  const existingParents = await VersionModel.find({ _id: { $in: parentIds } }).lean() as any[];
  const existingIds = new Set(existingParents.map(v => v._id));
  const missingParents = parentIds.filter((id: string) => !existingIds.has(id));

  if (missingParents.length > 0) {
    console.warn(`[INVARIANT] Version ${versionId} references ${missingParents.length} missing parent versions:`, missingParents);
  }

  return { valid: missingParents.length === 0, missingParents };
}

/**
 * Validate a version edge's references.
 * Logs warnings for missing versions (does not throw).
 */
export async function validateVersionEdge(edgeId: string): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const { VersionEdgeModel, VersionModel } = await getModels();

  const edge = await VersionEdgeModel.findById(edgeId).lean() as any;
  if (!edge) {
    console.warn(`[INVARIANT] Version edge ${edgeId} does not exist`);
    return { valid: false, issues: ['Edge not found'] };
  }

  const issues: string[] = [];

  const fromVersion = await VersionModel.findById(edge.fromVersionId).lean();
  if (!fromVersion) {
    issues.push(`fromVersionId ${edge.fromVersionId} does not exist`);
  }

  const toVersion = await VersionModel.findById(edge.toVersionId).lean();
  if (!toVersion) {
    issues.push(`toVersionId ${edge.toVersionId} does not exist`);
  }

  if (issues.length > 0) {
    console.warn(`[INVARIANT] Version edge ${edgeId} has issues:`, issues);
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Comprehensive validation for a newly created version.
 * Call this after createVersion() to catch issues early.
 */
export async function validateNewVersion(versionId: string): Promise<boolean> {
  const [blocksResult, parentsResult] = await Promise.all([
    validateVersionContentBlocks(versionId),
    validateVersionParents(versionId)
  ]);

  const isValid = blocksResult.valid && parentsResult.valid;

  if (!isValid) {
    console.error(`[INVARIANT FAILURE] Version ${versionId} failed validation checks`);
  }

  return isValid;
}

// ==================== Orphan Detection (for future GC) ====================

/**
 * Count orphaned content blocks (not referenced by any version).
 * Does NOT delete - just logs for monitoring.
 */
export async function countOrphanedContentBlocks(): Promise<{
  totalBlocks: number;
  orphanedBlocks: number;
  orphanedBytes: number;
}> {
  const { ContentBlockModel, VersionModel } = await getModels();

  // Get all content block refs from all versions
  const versions = await VersionModel.find({}, { contentBlockRefs: 1 }).lean() as any[];
  const referencedHashes = new Set<string>();
  for (const v of versions) {
    for (const ref of (v.contentBlockRefs || [])) {
      referencedHashes.add(ref);
    }
  }

  // Count all blocks and find orphans
  const allBlocks = await ContentBlockModel.find({}, { _id: 1, content: 1 }).lean() as any[];
  const totalBlocks = allBlocks.length;

  let orphanedBlocks = 0;
  let orphanedBytes = 0;

  for (const block of allBlocks) {
    if (!referencedHashes.has(block._id)) {
      orphanedBlocks++;
      orphanedBytes += (block.content || '').length;
    }
  }

  if (orphanedBlocks > 0) {
    console.info(`[ORPHAN COUNT] ${orphanedBlocks}/${totalBlocks} content blocks orphaned (${(orphanedBytes / 1024).toFixed(2)} KB)`);
  }

  return { totalBlocks, orphanedBlocks, orphanedBytes };
}

/**
 * Count orphaned versions (artifact deleted but versions remain).
 * Does NOT delete - just logs for monitoring.
 */
export async function countOrphanedVersions(): Promise<{
  totalVersions: number;
  orphanedVersions: number;
}> {
  const { VersionModel, ArtifactModel } = await getModels();

  // Get all artifact IDs
  const artifacts = await ArtifactModel.find({}, { _id: 1 }).lean() as any[];
  const artifactIds = new Set(artifacts.map(a => a._id));

  // Count versions with missing artifacts
  const versions = await VersionModel.find({}, { _id: 1, artifactId: 1 }).lean() as any[];
  const totalVersions = versions.length;

  let orphanedVersions = 0;
  for (const v of versions) {
    if (!artifactIds.has(v.artifactId)) {
      orphanedVersions++;
    }
  }

  if (orphanedVersions > 0) {
    console.info(`[ORPHAN COUNT] ${orphanedVersions}/${totalVersions} versions orphaned (artifact deleted)`);
  }

  return { totalVersions, orphanedVersions };
}

/**
 * Run all orphan detection checks and log summary.
 * Call this periodically (e.g., daily cron) to monitor data health.
 */
export async function runOrphanReport(): Promise<{
  contentBlocks: { total: number; orphaned: number; orphanedBytes: number };
  versions: { total: number; orphaned: number };
}> {
  console.info('[ORPHAN REPORT] Starting orphan detection...');

  const [blockStats, versionStats] = await Promise.all([
    countOrphanedContentBlocks(),
    countOrphanedVersions()
  ]);

  console.info('[ORPHAN REPORT] Complete:', {
    contentBlocks: `${blockStats.orphanedBlocks}/${blockStats.totalBlocks} orphaned`,
    versions: `${versionStats.orphanedVersions}/${versionStats.totalVersions} orphaned`
  });

  return {
    contentBlocks: {
      total: blockStats.totalBlocks,
      orphaned: blockStats.orphanedBlocks,
      orphanedBytes: blockStats.orphanedBytes
    },
    versions: {
      total: versionStats.totalVersions,
      orphaned: versionStats.orphanedVersions
    }
  };
}

// ==================== Blocked Mutation Functions ====================
// These exist to explicitly block any accidental mutation paths

/**
 * BLOCKED: Updating content blocks is not allowed.
 * Content blocks are immutable and content-addressed.
 */
export async function updateContentBlock(): Promise<never> {
  blockMutation(COLL_CONTENT_BLOCKS, 'update');
}

/**
 * BLOCKED: Deleting content blocks directly is not allowed.
 * Use garbage collection for orphan cleanup instead.
 */
export async function deleteContentBlock(): Promise<never> {
  blockMutation(COLL_CONTENT_BLOCKS, 'delete');
}

/**
 * BLOCKED: Updating versions is not allowed.
 * Versions are immutable - create a new version instead.
 */
export async function updateVersion(): Promise<never> {
  blockMutation(COLL_VERSIONS, 'update');
}

/**
 * BLOCKED: Deleting versions directly is not allowed.
 * Use garbage collection for orphan cleanup instead.
 */
export async function deleteVersion(): Promise<never> {
  blockMutation(COLL_VERSIONS, 'delete');
}

// ==================== V1 Mongoose Schemas (Legacy) ====================
const SessionSchema = new Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  orgId: { type: String, index: true },  // Index for org-level queries
  createdByName: { type: String },  // Creator's name for display
  projectMeta: { type: Schema.Types.Mixed, default: {} },
  activeGeneration: { type: Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: COLL_SESSIONS, timestamps: false });

// Compound index for org-level session queries
SessionSchema.index({ orgId: 1, updatedAt: -1 });

const ScriptSchema = new Schema({
  sessionId: { type: String, required: true, index: true },
  scriptId: { type: String, index: true },
  title: { type: String, required: true },
  content: { type: String, default: '' },
  blocks: { type: Schema.Types.Mixed },
  richText: { type: Schema.Types.Mixed }, // Tiptap JSON AST
  metadata: { type: Schema.Types.Mixed, default: {} },
  version: { type: Number, default: 1 },
  documentType: { type: String, default: 'screenplay' },
  parentScriptId: { type: String },
  forkReason: { type: String },
  createdFromIntent: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: COLL_SCRIPTS, timestamps: false });

const ChatMessageSchema = new Schema({
  sessionId: { type: String, required: true, index: true },
  threadId: { type: String, index: true, default: 'default' },
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { collection: COLL_CHAT, timestamps: false });

const UserSchema = new Schema({
  _id: { type: String, required: true },
  preferences: { type: Schema.Types.Mixed, default: {} },
  brandDNA: {
    voiceLock: { type: String, default: '' },
    nicheMap: { type: String, default: '' },
    killList: [{ type: String }],
    hookArchetypes: [{ type: String }],
    structuralHabits: [{ type: String }],
    recurringAssets: [{ type: String }],
    voiceFingerprint: { type: Schema.Types.Mixed },
    voiceExemplars: [{ type: Schema.Types.Mixed }],
  },
  updatedAt: { type: Date, default: Date.now }
}, { collection: COLL_USERS, timestamps: false });

const RateUsageSchema = new Schema({
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  planName: { type: String, required: true },
  count: { type: Number, default: 0 },
  resetAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: COLL_RATE_USAGE, timestamps: false });

// ==================== V2 Mongoose Schemas ====================

const ProjectSchema = new Schema({
  _id: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  archived: { type: Boolean, default: false },
  settings: {
    modelPreference: { type: String },
    memoryLevel: { type: String }
  },
  brandDNA: {
    voiceLock: { type: String, default: '' },
    nicheMap: { type: String, default: '' },
    killList: [{ type: String }],
    hookArchetypes: [{ type: String }],
    structuralHabits: [{ type: String }],
    recurringAssets: [{ type: String }],
    voiceFingerprint: { type: Schema.Types.Mixed },
    voiceExemplars: [{ type: Schema.Types.Mixed }],
  },
  // Legacy compatibility
  projectMeta: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: COLL_PROJECTS, timestamps: false });

const ArtifactSchema = new Schema({
  _id: { type: String, required: true },
  projectId: { type: String, required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: ['script', 'chat', 'whiteboard', 'content_card'],
    index: true
  },
  title: { type: String, required: true },
  rootVersionId: { type: String },
  activeVersionId: { type: String },
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: COLL_ARTIFACTS, timestamps: false });

const VersionSchema = new Schema({
  _id: { type: String, required: true },
  artifactId: { type: String, required: true, index: true },
  parentIds: [{ type: String }],
  contentBlockRefs: [{ type: String }],  // Array of content block hashes
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String },
  mergeMeta: {
    baseVersionId: { type: String },
    leftVersionId: { type: String },
    rightVersionId: { type: String },
    strategy: { type: String },
    conflictsResolved: { type: Boolean }
  }
}, { collection: COLL_VERSIONS, timestamps: false });

const ContentBlockSchema = new Schema({
  _id: { type: String, required: true },  // This IS the hash
  hash: { type: String, required: true, unique: true },
  type: {
    type: String,
    required: true,
    enum: ['text', 'markdown', 'code', 'scene', 'json', 'chat_message']
  },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { collection: COLL_CONTENT_BLOCKS, timestamps: false });

const VersionEdgeSchema = new Schema({
  fromVersionId: { type: String, required: true, index: true },
  toVersionId: { type: String, required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: ['inspired_by', 'derived_from', 'remix_of', 'references']
  },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'thinkforge_version_edges', timestamps: false });

const EventSchema = new Schema({
  projectId: { type: String, required: true, index: true },
  sessionId: { type: String, index: true },
  artifactId: { type: String, index: true },
  versionId: { type: String },
  type: {
    type: String,
    required: true,
    enum: [
      'project_created', 'project_updated', 'project_deleted',
      'artifact_created', 'artifact_updated', 'artifact_deleted',
      'version_created', 'version_merged', 'version_restored',
      'content_deleted', 'hook_rejected', 'style_corrected',
      'regeneration_requested', 'feedback_given'
    ]
  },
  payload: { type: Schema.Types.Mixed, default: {} },
  userId: { type: String, index: true },
  createdAt: { type: Date, default: Date.now }
}, { collection: COLL_EVENTS, timestamps: false });

// ==================== Model Getters ====================
// V1 Models (Legacy)
let SessionModel: Model<any>;
let ScriptModel: Model<any>;
let ChatModel: Model<any>;
let UserModel: Model<any>;
let RateUsageModel: Model<any>;

// V2 Models
let ProjectModel: Model<any>;
let ArtifactModel: Model<any>;
let VersionModel: Model<any>;
let ContentBlockModel: Model<any>;
let VersionEdgeModel: Model<any>;
let EventModel: Model<any>;

async function getModels() {
  // Connect to ThinkForge-specific database (thinkforge_db)
  const tfConn = await connectToThinkForgeDb();

  // V1 Models (Legacy)
  if (!SessionModel) {
    SessionModel = tfConn.models[COLL_SESSIONS] || tfConn.model(COLL_SESSIONS, SessionSchema);
  }
  if (!ScriptModel) {
    ScriptModel = tfConn.models[COLL_SCRIPTS] || tfConn.model(COLL_SCRIPTS, ScriptSchema);
  }
  if (!ChatModel) {
    ChatModel = tfConn.models[COLL_CHAT] || tfConn.model(COLL_CHAT, ChatMessageSchema);
  }
  if (!UserModel) {
    UserModel = tfConn.models[COLL_USERS] || tfConn.model(COLL_USERS, UserSchema);
  }
  if (!RateUsageModel) {
    RateUsageModel = tfConn.models[COLL_RATE_USAGE] || tfConn.model(COLL_RATE_USAGE, RateUsageSchema);
  }

  // V2 Models
  if (!ProjectModel) {
    ProjectModel = tfConn.models[COLL_PROJECTS] || tfConn.model(COLL_PROJECTS, ProjectSchema);
  }
  if (!ArtifactModel) {
    ArtifactModel = tfConn.models[COLL_ARTIFACTS] || tfConn.model(COLL_ARTIFACTS, ArtifactSchema);
  }
  if (!VersionModel) {
    VersionModel = tfConn.models[COLL_VERSIONS] || tfConn.model(COLL_VERSIONS, VersionSchema);
  }
  if (!ContentBlockModel) {
    ContentBlockModel = tfConn.models[COLL_CONTENT_BLOCKS] || tfConn.model(COLL_CONTENT_BLOCKS, ContentBlockSchema);
  }
  if (!VersionEdgeModel) {
    VersionEdgeModel = tfConn.models['thinkforge_version_edges'] || tfConn.model('thinkforge_version_edges', VersionEdgeSchema);
  }
  if (!EventModel) {
    EventModel = tfConn.models[COLL_EVENTS] || tfConn.model(COLL_EVENTS, EventSchema);
  }

  return {
    // V1
    SessionModel, ScriptModel, ChatModel, UserModel, RateUsageModel,
    // V2
    ProjectModel, ArtifactModel, VersionModel, ContentBlockModel, VersionEdgeModel, EventModel
  };
}

// ==================== Session Operations ====================

export async function getSession(sessionId: string, userId: string, orgId?: string | null): Promise<Session | null> {
  try {
    const { SessionModel } = await getModels();
    // STEP 4: Support org-based session access (same pattern as getOrCreateSession)
    const query = orgId
      ? { _id: sessionId, $or: [{ userId }, { orgId }] }
      : { _id: sessionId, userId };
    const doc = await SessionModel.findOne(query).lean() as any;
    if (!doc) return null;
    return {
      _id: String(doc._id),
      userId: doc.userId,
      orgId: doc.orgId,
      createdByName: doc.createdByName,
      projectMeta: doc.projectMeta || {},
      activeGeneration: doc.activeGeneration || null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  } catch (error: any) {
    console.error('[ThinkForge][db] Error getting session:', error?.message || error);
    throw error;
  }
}

export async function getOrCreateSession(
  userId: string,
  sessionId?: string,
  projectMeta?: ProjectMeta,
  orgId?: string | null,  // null = personal, set = org-owned
  createdByName?: string  // Creator's name for org context display
): Promise<Session> {
  // STEP 6: Defensive validation - assert userId exists
  if (!userId) {
    throw new Error('[ThinkForge] getOrCreateSession: userId is required');
  }

  try {
    const { SessionModel } = await getModels();

    if (sessionId) {
      // STEP 3: Fix org session lookup - allow access if userId matches OR orgId matches
      // This enables team members in the same org to access shared sessions
      const query: any = { _id: sessionId };
      if (orgId) {
        // User is in an org - allow access if they own it OR if it belongs to their org
        query.$or = [
          { userId },
          { orgId }
        ];
      } else {
        // Personal user - must match userId
        query.userId = userId;
      }

      const existing = await SessionModel.findOne(query).lean() as any;
      if (existing) {
        // Update projectMeta if provided
        if (projectMeta) {
          await SessionModel.updateOne(
            { _id: sessionId },
            { $set: { projectMeta, updatedAt: new Date() } }
          );
          return {
            _id: String(existing._id),
            userId: existing.userId,
            orgId: existing.orgId,
            createdByName: existing.createdByName,
            projectMeta,
            activeGeneration: existing.activeGeneration || null,
            createdAt: existing.createdAt,
            updatedAt: new Date()
          };
        }
        return {
          _id: String(existing._id),
          userId: existing.userId,
          orgId: existing.orgId,
          createdByName: existing.createdByName,
          projectMeta: existing.projectMeta || {},
          activeGeneration: existing.activeGeneration || null,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt
        };
      }

      // STEP 3: Prevent duplicate creation - if sessionId was provided but not found,
      // the session doesn't exist for this user/org. Do NOT create with the same ID.
      // Instead, generate a new ID to prevent MongoDB duplicate key errors.
      console.warn(`[ThinkForge] Session ${sessionId} not found for user ${userId} (orgId: ${orgId}). Creating new session.`);
    }

    // Create new session
    const newSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const doc = {
      _id: newSessionId,
      userId,
      orgId: orgId || undefined,  // Store org context (undefined = personal)
      createdByName,  // Store creator name for org display
      projectMeta: projectMeta || {},
      activeGeneration: null,
      createdAt: now,
      updatedAt: now
    };

    await SessionModel.create(doc);
    return doc as Session;
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

export async function setActiveGeneration(sessionId: string, generation: GenerationState): Promise<void> {
  const { SessionModel } = await getModels();
  await SessionModel.updateOne(
    { _id: sessionId },
    { $set: { activeGeneration: generation, updatedAt: new Date() } }
  );
}

export async function clearActiveGeneration(sessionId: string): Promise<void> {
  const { SessionModel } = await getModels();
  await SessionModel.updateOne(
    { _id: sessionId },
    { $set: { activeGeneration: null, updatedAt: new Date() } }
  );
}

export async function getActiveGeneration(sessionId: string): Promise<GenerationState | null> {
  const { SessionModel } = await getModels();
  const doc = await SessionModel.findOne({ _id: sessionId }).lean() as any;
  return doc?.activeGeneration || null;
}

export async function updateGenerationState(
  sessionId: string,
  generationId: string,
  updates: Partial<GenerationState>
): Promise<void> {
  const { SessionModel } = await getModels();
  const session = await SessionModel.findOne({ _id: sessionId }).lean() as any;
  if (!session || !session.activeGeneration || session.activeGeneration.id !== generationId) {
    return;
  }

  const updatedGen = {
    ...session.activeGeneration,
    ...updates,
    updatedAt: new Date()
  };

  await SessionModel.updateOne(
    { _id: sessionId },
    { $set: { activeGeneration: updatedGen, updatedAt: new Date() } }
  );
}

export async function updateSession(sessionId: string, updates: Partial<Session>): Promise<Session> {
  try {
    const { SessionModel } = await getModels();
    const updateDoc = {
      ...updates,
      ...((updates as any).blocks ? { blocks: enforceThinkForgeBlocks((updates as any).blocks) } : {}),
      updatedAt: new Date()
    };

    const doc = await SessionModel.findByIdAndUpdate(
      sessionId,
      { $set: updateDoc },
      { new: true, lean: true }
    ) as any;

    if (!doc) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      _id: String(doc._id),
      userId: doc.userId,
      projectMeta: doc.projectMeta || {},
      activeGeneration: doc.activeGeneration || null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    } as Session;
  } catch (error) {
    console.error('Error updating session:', error);
    throw error;
  }
}

export async function getUserSessions(userId: string, orgId?: string | null): Promise<Session[]> {
  try {
    const { SessionModel } = await getModels();

    // Build query based on org context
    // In org context: show all org items
    // In personal context (orgId = null or undefined): show only items without orgId
    const query = orgId
      ? { orgId }  // Org context: filter by orgId
      : { userId, $or: [{ orgId: { $exists: false } }, { orgId: null }] };  // Personal: user's items without orgId

    const docs = await SessionModel.find(query)
      .sort({ updatedAt: -1 })
      .lean() as any[];

    return docs.map(doc => ({
      _id: String(doc._id),
      userId: doc.userId,
      orgId: doc.orgId,
      createdByName: doc.createdByName,
      projectMeta: doc.projectMeta || {},
      activeGeneration: doc.activeGeneration || null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
  } catch (error) {
    console.error('Error getting user sessions:', error);
    return [];
  }
}

export async function deleteSession(sessionId: string, userId: string): Promise<boolean> {
  try {
    const { SessionModel, ScriptModel, ChatModel, RateUsageModel } = await getModels();

    // Verify ownership first
    const session = await SessionModel.findOne({ _id: sessionId, userId });
    if (!session) {
      throw new Error('Session not found or access denied');
    }

    // Delete all associated data in parallel
    await Promise.all([
      // Delete the session
      SessionModel.deleteOne({ _id: sessionId }),
      // Delete all scripts for this session
      ScriptModel.deleteMany({ sessionId }),
      // Delete all chat messages for this session
      ChatModel.deleteMany({ sessionId }),
      // Delete rate usage records for this session
      RateUsageModel.deleteMany({ sessionId })
    ]);

    console.log(`Deleted session ${sessionId} and all associated data`);
    return true;
  } catch (error) {
    console.error('Error deleting session:', error);
    throw error;
  }
}

export async function getSessionsCount(userId: string): Promise<number> {
  try {
    const { SessionModel } = await getModels();
    return await SessionModel.countDocuments({ userId });
  } catch (error) {
    console.error('Error counting sessions:', error);
    return 0;
  }
}

// ==================== Script Operations ====================

export async function getScript(sessionId: string, scriptId?: string | null): Promise<Script | null> {
  try {
    const { ScriptModel } = await getModels();
    const filter: any = { sessionId };
    if (scriptId) {
      filter.scriptId = scriptId;
    }
    let doc = await ScriptModel.findOne(filter)
      .sort({ updatedAt: -1 })
      .lean() as any;

    if (!doc && scriptId) {
      // Fallback to legacy default (no scriptId set)
      doc = await ScriptModel.findOne({ sessionId, scriptId: { $exists: false } })
        .sort({ updatedAt: -1 })
        .lean() as any;
    }

    if (!doc) return null;

    const blocks = enforceThinkForgeBlocks(doc.blocks);

    return {
      _id: String(doc._id),
      sessionId: doc.sessionId,
      scriptId: doc.scriptId || 'default',
      title: doc.title,
      content: doc.content || '',
      blocks,
      richText: doc.richText, // Tiptap JSON AST
      metadata: doc.metadata || {},
      version: typeof doc.version === 'number' ? doc.version : 1,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  } catch (error) {
    console.error('Error getting script:', error);
    return null;
  }
}

export async function saveScript(sessionId: string, script: Partial<Script>, scriptId?: string | null): Promise<Script> {
  try {
    const { ScriptModel } = await getModels();
    const now = new Date();
    const effectiveScriptId = scriptId || (script as any)?.scriptId || 'default';

    // Check if script exists
    const existing = await ScriptModel.findOne({ sessionId, scriptId: effectiveScriptId }).sort({ updatedAt: -1 });

    if (existing) {
      // Update existing
      const blocks = script.blocks !== undefined ? enforceThinkForgeBlocks(script.blocks) : enforceThinkForgeBlocks(existing.blocks);
      const nextVersion = (typeof existing.version === 'number' ? existing.version : 1) + 1;
      const updateDoc: Record<string, any> = {
        scriptId: effectiveScriptId,
        title: script.title ?? existing.title,
        content: script.content ?? existing.content,
        blocks,
        version: nextVersion,
        updatedAt: now
      };

      // Include richText (Tiptap JSON) if provided
      if (script.richText !== undefined) {
        updateDoc.richText = script.richText;
      }
      if (script.metadata !== undefined) {
        updateDoc.metadata = script.metadata;
      }

      await ScriptModel.findByIdAndUpdate(existing._id, { $set: updateDoc });
      const updated = await ScriptModel.findById(existing._id).lean() as any;
      if (!updated) throw new Error('Failed to update script');

      return {
        _id: String(updated._id),
        sessionId: updated.sessionId,
        scriptId: updated.scriptId || effectiveScriptId,
        title: updated.title,
        content: updated.content || '',
        blocks: updated.blocks,
        richText: updated.richText,
        metadata: updated.metadata || {},
        version: typeof updated.version === 'number' ? updated.version : nextVersion,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt
      };
    } else {
      // Create new
      const blocks = enforceThinkForgeBlocks(script.blocks || []);
      const doc: Record<string, any> = {
        sessionId,
        scriptId: effectiveScriptId,
        title: script.title || 'Untitled Script',
        content: script.content || '',
        blocks,
        version: 1,
        createdAt: now,
        updatedAt: now
      };

      // Include richText (Tiptap JSON) if provided
      if (script.richText !== undefined) {
        doc.richText = script.richText;
      }
      if (script.metadata !== undefined) {
        doc.metadata = script.metadata;
      }

      const created = await ScriptModel.create(doc);
      return {
        _id: String(created._id),
        sessionId: created.sessionId,
        scriptId: (created as any).scriptId || effectiveScriptId,
        title: created.title,
        content: created.content || '',
        blocks: created.blocks,
        richText: (created as any).richText,
        metadata: (created as any).metadata || {},
        version: typeof (created as any).version === 'number' ? (created as any).version : 1,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt
      };
    }
  } catch (error) {
    console.error('Error saving script:', error);
    throw error;
  }
}

export type SaveScriptWithVersionResult =
  | { ok: true; script: Script }
  | { ok: false; error: 'Version conflict'; currentVersion: number };

export async function saveScriptWithVersion(
  sessionId: string,
  script: Partial<Script>,
  baseVersion: number,
  scriptId?: string | null
): Promise<SaveScriptWithVersionResult> {
  try {
    const { ScriptModel } = await getModels();
    const now = new Date();
    const effectiveScriptId = scriptId || (script as any)?.scriptId || 'default';

    const existing = await ScriptModel.findOne({ sessionId, scriptId: effectiveScriptId }).sort({ updatedAt: -1 });
    if (!existing) {
      if (baseVersion > 0) {
        return { ok: false, error: 'Version conflict', currentVersion: 0 };
      }

      const blocks = enforceThinkForgeBlocks(script.blocks || []);
      const doc: Record<string, any> = {
        sessionId,
        scriptId: effectiveScriptId,
        title: script.title || 'Untitled Script',
        content: script.content || '',
        blocks,
        documentType: script.documentType || 'screenplay',
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      if (script.richText !== undefined) {
        doc.richText = script.richText;
      }
      if (script.metadata !== undefined) {
        doc.metadata = script.metadata;
      }

      const created = await ScriptModel.create(doc);
      return {
        ok: true,
        script: {
          _id: String(created._id),
          sessionId: created.sessionId,
          scriptId: (created as any).scriptId || effectiveScriptId,
          title: created.title,
          content: created.content || '',
          blocks: created.blocks,
          richText: (created as any).richText,
          metadata: (created as any).metadata || {},
          documentType: (created as any).documentType || 'screenplay',
          version: typeof (created as any).version === 'number' ? (created as any).version : 1,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      };
    }

    const blocks = script.blocks !== undefined
      ? enforceThinkForgeBlocks(script.blocks)
      : enforceThinkForgeBlocks(existing.blocks);
    const updateDoc: Record<string, any> = {
      scriptId: effectiveScriptId,
      title: script.title ?? existing.title,
      content: script.content ?? existing.content,
      blocks,
      documentType: script.documentType ?? (existing as any).documentType ?? 'screenplay',
      version: baseVersion + 1,
      updatedAt: now,
    };
    if (script.richText !== undefined) {
      updateDoc.richText = script.richText;
    }
    if (script.metadata !== undefined) {
      updateDoc.metadata = script.metadata;
    }

    const updated = await ScriptModel.findOneAndUpdate(
      { _id: existing._id, version: baseVersion },
      { $set: updateDoc },
      { new: true }
    ).lean() as any;

    if (!updated) {
      const latest = await ScriptModel.findById(existing._id).lean() as any;
      const latestVersion = typeof latest?.version === 'number'
        ? latest.version
        : (typeof existing.version === 'number' ? existing.version : 1);
      return { ok: false, error: 'Version conflict', currentVersion: latestVersion };
    }

    return {
      ok: true,
      script: {
        _id: String(updated._id),
        sessionId: updated.sessionId,
        scriptId: updated.scriptId || effectiveScriptId,
        title: updated.title,
        content: updated.content || '',
        blocks: updated.blocks,
        richText: updated.richText,
        metadata: updated.metadata || {},
        documentType: updated.documentType || 'screenplay',
        version: typeof updated.version === 'number' ? updated.version : baseVersion + 1,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    };
  } catch (error) {
    console.error('Error saving script with version check:', error);
    throw error;
  }
}

export async function updateScript(sessionId: string, updates: Partial<Script>, scriptId?: string | null): Promise<Script> {
  try {
    const { ScriptModel } = await getModels();
    const effectiveScriptId = scriptId || (updates as any)?.scriptId || 'default';
    const existing = await ScriptModel.findOne({ sessionId, scriptId: effectiveScriptId }).sort({ updatedAt: -1 });

    if (!existing) {
      throw new Error(`Script not found for session ${sessionId}`);
    }
    const nextVersion = (typeof (existing as any).version === 'number' ? (existing as any).version : 1) + 1;
    const updateDoc = {
      ...updates,
      scriptId: effectiveScriptId,
      version: nextVersion,
      updatedAt: new Date()
    };

    await ScriptModel.findByIdAndUpdate(existing._id, { $set: updateDoc });
    const updated = await ScriptModel.findById(existing._id).lean() as any;
    if (!updated) throw new Error('Failed to update script');

    return {
      _id: String(updated._id),
      sessionId: updated.sessionId,
      scriptId: updated.scriptId || effectiveScriptId,
      title: updated.title,
      content: updated.content || '',
      blocks: enforceThinkForgeBlocks(updated.blocks),
      richText: updated.richText,
      version: typeof updated.version === 'number' ? updated.version : nextVersion,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    };
  } catch (error) {
    console.error('Error updating script:', error);
    throw error;
  }
}

export async function listScripts(sessionId: string): Promise<Array<{ scriptId: string; title: string; documentType: string; version: number; updatedAt: Date; createdAt: Date }>> {
  try {
    const { ScriptModel } = await getModels();
    const docs = await ScriptModel.find({ sessionId }).sort({ updatedAt: -1 }).lean() as any[];
    const seen = new Set<string>();
    const items: Array<{ scriptId: string; title: string; documentType: string; version: number; updatedAt: Date; createdAt: Date }> = [];
    for (const doc of docs) {
      const sid = doc.scriptId || 'default';
      if (seen.has(sid)) continue;
      seen.add(sid);
      items.push({
        scriptId: sid,
        title: doc.title || 'Untitled Script',
        documentType: doc.documentType || 'screenplay',
        version: doc.version || 1,
        updatedAt: doc.updatedAt || doc.createdAt,
        createdAt: doc.createdAt,
      });
    }
    return items;
  } catch (error) {
    console.error('Error listing scripts:', error);
    return [];
  }
}

/** All of a user's scripts across every session (for the unified content library). */
export async function listScriptsByUser(
  userId: string,
  limit = 100,
): Promise<Array<{ scriptId: string; sessionId: string; title: string; documentType: string; version: number; updatedAt: Date; createdAt: Date }>> {
  try {
    const { ScriptModel } = await getModels();
    const docs = (await ScriptModel.find({ userId }).sort({ updatedAt: -1 }).limit(limit * 3).lean()) as any[];
    const seen = new Set<string>();
    const items: Array<{ scriptId: string; sessionId: string; title: string; documentType: string; version: number; updatedAt: Date; createdAt: Date }> = [];
    for (const doc of docs) {
      const sid = doc.scriptId || 'default';
      const key = `${doc.sessionId}:${sid}`;
      if (seen.has(key)) continue; // keep the latest per (session, script)
      seen.add(key);
      items.push({
        scriptId: sid,
        sessionId: doc.sessionId,
        title: doc.title || 'Untitled Script',
        documentType: doc.documentType || 'screenplay',
        version: doc.version || 1,
        updatedAt: doc.updatedAt || doc.createdAt,
        createdAt: doc.createdAt,
      });
      if (items.length >= limit) break;
    }
    return items;
  } catch (error) {
    console.error('Error listing scripts by user:', error);
    return [];
  }
}

export async function deleteScript(sessionId: string, scriptId: string): Promise<boolean> {
  try {
    const { ScriptModel } = await getModels();
    const result = await ScriptModel.deleteMany({ sessionId, scriptId });
    return (result.deletedCount ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting script:', error);
    throw error;
  }
}

// ==================== Chat Operations ====================

export async function appendChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  threadId?: string | null
): Promise<void> {
  try {
    const { ChatModel } = await getModels();
    await ChatModel.create({
      sessionId,
      threadId: threadId || 'default',
      role,
      content,
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Error appending chat message:', error);
    throw error;
  }
}

export async function getChatHistory(sessionId: string, limit: number = 50, threadId?: string | null): Promise<ChatMessage[]> {
  try {
    const { ChatModel } = await getModels();
    const filter: any = { sessionId };
    if (threadId) {
      filter.$or = [
        { threadId },
        ...(threadId === 'default' ? [{ threadId: { $exists: false } }] : [])
      ];
    }
    const docs = await ChatModel.find(filter)
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean() as any[];

    return docs.map(doc => ({
      role: doc.role,
      content: doc.content,
      createdAt: doc.createdAt,
      _id: String(doc._id)
    }));
  } catch (error) {
    console.error('Error getting chat history:', error);
    return [];
  }
}

export async function listChatThreads(sessionId: string): Promise<Array<{ threadId: string; lastEdited: Date; lastMessage?: string }>> {
  try {
    const { ChatModel } = await getModels();
    const docs = await ChatModel.aggregate([
      { $match: { sessionId } },
      { $addFields: { threadKey: { $ifNull: ['$threadId', 'default'] } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$threadKey',
          lastEdited: { $first: '$createdAt' },
          lastMessage: { $first: '$content' }
        }
      },
      { $sort: { lastEdited: -1 } }
    ]);

    return docs.map((d: any) => ({
      threadId: d._id || 'default',
      lastEdited: d.lastEdited,
      lastMessage: d.lastMessage || ''
    }));
  } catch (error) {
    console.error('Error listing chat threads:', error);
    return [];
  }
}

// ==================== User Operations ====================

export async function getUserPreferences(userId: string): Promise<Record<string, any>> {
  try {
    const { UserModel } = await getModels();
    const doc = await UserModel.findById(userId).lean() as any;
    return doc?.preferences || {};
  } catch (error) {
    console.error('Error getting user preferences:', error);
    return {};
  }
}

export async function saveUserPreferences(userId: string, preferences: Record<string, any>): Promise<void> {
  try {
    const { UserModel } = await getModels();
    await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          preferences,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error saving user preferences:', error);
    throw error;
  }
}

// ==================== Rate Limiting ====================

export interface ChatLimitStatus {
  allowed: boolean;
  planName: string;
  remaining: number;
  maxAllowed: number;
  currentUsage: number;
  resetAt: Date;
}

export const CHAT_LIMITS: Record<string, number> = {
  free: 50,
  plus: 200,
  pro: 500,
  premium: 5000
};

export function getChatMaxAllowed(planName: string): number {
  const key = (planName || '').toLowerCase();
  return CHAT_LIMITS[key] ?? CHAT_LIMITS.free;
}

export function evaluateChatLimit(planName: string, currentUsage: number): { allowed: boolean; remaining: number; maxAllowed: number } {
  const maxAllowed = getChatMaxAllowed(planName);
  const remaining = Math.max(0, maxAllowed - Math.max(0, currentUsage || 0));
  return {
    allowed: remaining > 0,
    remaining,
    maxAllowed,
  };
}

export async function checkChatLimit(
  userId: string,
  sessionId: string,
  planName: string
): Promise<ChatLimitStatus> {
  const normalizedPlan = (planName || 'free').toLowerCase();
  try {
    const { RateUsageModel } = await getModels();
    const now = new Date();
    const resetAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    // Find or create usage record
    let usage = await RateUsageModel.findOne({ userId, sessionId, planName: normalizedPlan });

    if (!usage) {
      usage = await RateUsageModel.create({
        userId,
        sessionId,
        planName: normalizedPlan,
        count: 0,
        resetAt
      });
    }

    // Check if reset needed
    if (usage.resetAt < now) {
      usage.count = 0;
      usage.resetAt = resetAt;
      await usage.save();
    }

    const evaluation = evaluateChatLimit(normalizedPlan, usage.count);
    return {
      allowed: evaluation.allowed,
      planName: normalizedPlan,
      remaining: evaluation.remaining,
      maxAllowed: evaluation.maxAllowed,
      currentUsage: usage.count,
      resetAt: usage.resetAt || resetAt,
    };
  } catch (error) {
    console.error('Error checking chat limit:', error);
    const evaluation = evaluateChatLimit(normalizedPlan, 0);
    // Fail open - allow request on error, but provide telemetry
    return {
      allowed: true,
      planName: normalizedPlan,
      remaining: evaluation.remaining,
      maxAllowed: evaluation.maxAllowed,
      currentUsage: 0,
      resetAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  }
}

export async function recordChatUsage(userId: string, sessionId: string, planName: string): Promise<void> {
  try {
    const { RateUsageModel } = await getModels();

    const normalizedPlan = (planName || 'free').toLowerCase();
    const now = new Date();
    const resetAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await RateUsageModel.findOneAndUpdate(
      { userId, sessionId, planName: normalizedPlan },
      {
        $inc: { count: 1 },
        $setOnInsert: { resetAt, createdAt: now },
        $set: { updatedAt: now }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error recording chat usage:', error);
    // Don't throw - usage tracking is best effort
  }
}


// ==================== V2 Project Operations ====================

/**
 * Generate a unique project ID
 */
function generateProjectId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique artifact ID
 */
function generateArtifactId(): string {
  return `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique version ID
 */
function generateVersionId(): string {
  return `version_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get a project by ID (V2)
 */
export async function getProject(projectId: string, userId: string): Promise<Project | null> {
  try {
    const { ProjectModel } = await getModels();
    const doc = await ProjectModel.findOne({ _id: projectId, userId }).lean() as any;
    if (!doc) return null;
    return {
      _id: String(doc._id),
      userId: doc.userId,
      name: doc.name,
      description: doc.description || '',
      archived: doc.archived || false,
      settings: doc.settings || {},
      projectMeta: doc.projectMeta || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  } catch (error) {
    console.error('Error getting project:', error);
    return null;
  }
}

/**
 * Get or create a project (V2)
 * Also dual-writes to V1 sessions for backward compatibility
 */
export async function getOrCreateProject(
  userId: string,
  projectId?: string,
  options?: {
    name?: string;
    description?: string;
    projectMeta?: ProjectMeta;
    settings?: Project['settings'];
  }
): Promise<Project> {
  try {
    const { ProjectModel, SessionModel } = await getModels();

    if (projectId) {
      const existing = await ProjectModel.findOne({ _id: projectId, userId }).lean() as any;
      if (existing) {
        // Update if options provided
        if (options) {
          const updateDoc: any = { updatedAt: new Date() };
          if (options.name) updateDoc.name = options.name;
          if (options.description) updateDoc.description = options.description;
          if (options.projectMeta) updateDoc.projectMeta = options.projectMeta;
          if (options.settings) updateDoc.settings = options.settings;

          await ProjectModel.updateOne({ _id: projectId }, { $set: updateDoc });

          // Dual-write to V1 sessions
          await SessionModel.updateOne(
            { _id: projectId },
            { $set: { projectMeta: options.projectMeta || existing.projectMeta, updatedAt: new Date() } }
          ).catch(() => { }); // Ignore V1 errors
        }

        return {
          _id: String(existing._id),
          userId: existing.userId,
          name: options?.name || existing.name,
          description: options?.description || existing.description || '',
          archived: existing.archived || false,
          settings: options?.settings || existing.settings || {},
          projectMeta: options?.projectMeta || existing.projectMeta || {},
          createdAt: existing.createdAt,
          updatedAt: new Date()
        };
      }
    }

    // Create new project
    const newProjectId = projectId || generateProjectId();
    const now = new Date();
    const projectDoc = {
      _id: newProjectId,
      userId,
      name: options?.name || 'Untitled Project',
      description: options?.description || '',
      archived: false,
      settings: options?.settings || {},
      projectMeta: options?.projectMeta || {},
      createdAt: now,
      updatedAt: now
    };

    await ProjectModel.create(projectDoc);

    // Dual-write to V1 sessions for backward compatibility
    try {
      await SessionModel.create({
        _id: newProjectId,
        userId,
        projectMeta: options?.projectMeta || {},
        createdAt: now,
        updatedAt: now
      });
    } catch (e) {
      // V1 write is best-effort
      console.warn('V1 session dual-write failed:', e);
    }

    // Log event
    await logEvent(newProjectId, 'project_created', { name: projectDoc.name }, userId);

    return projectDoc;
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  }
}

/**
 * Get all projects for a user (V2)
 */
export async function getUserProjects(userId: string): Promise<Project[]> {
  try {
    const { ProjectModel } = await getModels();
    const docs = await ProjectModel.find({ userId, archived: { $ne: true } })
      .sort({ updatedAt: -1 })
      .lean() as any[];

    return docs.map(doc => ({
      _id: String(doc._id),
      userId: doc.userId,
      name: doc.name,
      description: doc.description || '',
      archived: doc.archived || false,
      settings: doc.settings || {},
      projectMeta: doc.projectMeta || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
  } catch (error) {
    console.error('Error getting user projects:', error);
    return [];
  }
}

/**
 * Delete a project and all associated data (V2)
 */
export async function deleteProject(projectId: string, userId: string): Promise<boolean> {
  try {
    const { ProjectModel, ArtifactModel, VersionModel, SessionModel, ScriptModel, ChatModel, RateUsageModel } = await getModels();

    // Verify ownership
    const project = await ProjectModel.findOne({ _id: projectId, userId });
    if (!project) {
      throw new Error('Project not found or access denied');
    }

    // Delete V2 data
    const artifacts = await ArtifactModel.find({ projectId }).lean() as any[];
    const artifactIds = artifacts.map(a => a._id);

    await Promise.all([
      ProjectModel.deleteOne({ _id: projectId }),
      ArtifactModel.deleteMany({ projectId }),
      VersionModel.deleteMany({ artifactId: { $in: artifactIds } }),
      // V1 cleanup
      SessionModel.deleteOne({ _id: projectId }).catch(() => { }),
      ScriptModel.deleteMany({ sessionId: projectId }).catch(() => { }),
      ChatModel.deleteMany({ sessionId: projectId }).catch(() => { }),
      RateUsageModel.deleteMany({ sessionId: projectId }).catch(() => { })
    ]);

    // Note: ContentBlocks are NOT deleted (they may be referenced by other versions)
    // Garbage collection for orphaned blocks should be a separate maintenance task

    console.log(`Deleted project ${projectId} and all associated data`);
    return true;
  } catch (error) {
    console.error('Error deleting project:', error);
    throw error;
  }
}


// ==================== V2 Artifact Operations ====================

/**
 * Get an artifact by ID
 */
export async function getArtifact(artifactId: string): Promise<Artifact | null> {
  try {
    const { ArtifactModel } = await getModels();
    const doc = await ArtifactModel.findById(artifactId).lean() as any;
    if (!doc) return null;
    return {
      _id: String(doc._id),
      projectId: doc.projectId,
      type: doc.type,
      title: doc.title,
      rootVersionId: doc.rootVersionId,
      activeVersionId: doc.activeVersionId,
      metadata: doc.metadata || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  } catch (error) {
    console.error('Error getting artifact:', error);
    return null;
  }
}

/**
 * Get all artifacts for a project
 */
export async function getProjectArtifacts(
  projectId: string,
  type?: ArtifactType
): Promise<Artifact[]> {
  try {
    const { ArtifactModel } = await getModels();
    const query: any = { projectId };
    if (type) query.type = type;

    const docs = await ArtifactModel.find(query)
      .sort({ updatedAt: -1 })
      .lean() as any[];

    return docs.map(doc => ({
      _id: String(doc._id),
      projectId: doc.projectId,
      type: doc.type,
      title: doc.title,
      rootVersionId: doc.rootVersionId,
      activeVersionId: doc.activeVersionId,
      metadata: doc.metadata || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
  } catch (error) {
    console.error('Error getting project artifacts:', error);
    return [];
  }
}

/**
 * Create a new artifact with an initial version
 */
export async function createArtifact(
  projectId: string,
  type: ArtifactType,
  title: string,
  initialContent?: unknown,
  metadata?: Artifact['metadata'],
  userId?: string
): Promise<{ artifact: Artifact; version: Version }> {
  try {
    const { ArtifactModel, VersionModel } = await getModels();
    const now = new Date();

    const artifactId = generateArtifactId();
    const versionId = generateVersionId();

    // Create initial content block if content provided
    let contentBlockRefs: string[] = [];
    if (initialContent !== undefined && initialContent !== null && initialContent !== '') {
      const blockType = type === 'script' ? 'markdown' : type === 'chat' ? 'chat_message' : 'json';
      const block = await getOrCreateContentBlock(initialContent, blockType);
      contentBlockRefs = [block.hash];
    }

    // Create initial version
    const versionDoc = {
      _id: versionId,
      artifactId,
      parentIds: [],
      contentBlockRefs,
      createdAt: now,
      createdBy: userId
    };
    await VersionModel.create(versionDoc);

    // Create artifact
    const artifactDoc = {
      _id: artifactId,
      projectId,
      type,
      title,
      rootVersionId: versionId,
      activeVersionId: versionId,
      metadata: metadata || {},
      createdAt: now,
      updatedAt: now
    };
    await ArtifactModel.create(artifactDoc);

    // Log event
    await logEvent(projectId, 'artifact_created', { artifactId, type, title }, userId);

    return {
      artifact: artifactDoc,
      version: versionDoc
    };
  } catch (error) {
    console.error('Error creating artifact:', error);
    throw error;
  }
}

/**
 * Update artifact metadata (not content - use createVersion for that)
 */
export async function updateArtifact(
  artifactId: string,
  updates: Partial<Pick<Artifact, 'title' | 'metadata' | 'activeVersionId'>>
): Promise<Artifact> {
  try {
    const { ArtifactModel } = await getModels();
    const updateDoc = {
      ...updates,
      updatedAt: new Date()
    };

    const doc = await ArtifactModel.findByIdAndUpdate(
      artifactId,
      { $set: updateDoc },
      { new: true, lean: true }
    ) as any;

    if (!doc) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    return {
      _id: String(doc._id),
      projectId: doc.projectId,
      type: doc.type,
      title: doc.title,
      rootVersionId: doc.rootVersionId,
      activeVersionId: doc.activeVersionId,
      metadata: doc.metadata || {},
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  } catch (error) {
    console.error('Error updating artifact:', error);
    throw error;
  }
}


// ==================== V2 Version Operations ====================

/**
 * Get a version by ID
 */
export async function getVersion(versionId: string): Promise<Version | null> {
  try {
    const { VersionModel } = await getModels();
    const doc = await VersionModel.findById(versionId).lean() as any;
    if (!doc) return null;
    return {
      _id: String(doc._id),
      artifactId: doc.artifactId,
      parentIds: doc.parentIds || [],
      contentBlockRefs: doc.contentBlockRefs || [],
      createdAt: doc.createdAt,
      createdBy: doc.createdBy,
      mergeMeta: doc.mergeMeta
    };
  } catch (error) {
    console.error('Error getting version:', error);
    return null;
  }
}

/**
 * Get all versions for an artifact
 */
export async function getArtifactVersions(artifactId: string): Promise<Version[]> {
  try {
    const { VersionModel } = await getModels();
    const docs = await VersionModel.find({ artifactId })
      .sort({ createdAt: -1 })
      .lean() as any[];

    return docs.map(doc => ({
      _id: String(doc._id),
      artifactId: doc.artifactId,
      parentIds: doc.parentIds || [],
      contentBlockRefs: doc.contentBlockRefs || [],
      createdAt: doc.createdAt,
      createdBy: doc.createdBy,
      mergeMeta: doc.mergeMeta
    }));
  } catch (error) {
    console.error('Error getting artifact versions:', error);
    return [];
  }
}

/**
 * Create a new version for an artifact.
 * This is the primary way to "save" content changes.
 * Versions are immutable - updates create new versions.
 */
export async function createVersion(
  artifactId: string,
  content: unknown,
  options?: {
    parentVersionId?: string;
    contentBlockType?: ContentBlockType;
    userId?: string;
    updateActiveVersion?: boolean;
  }
): Promise<Version> {
  try {
    const { VersionModel, ArtifactModel } = await getModels();
    const now = new Date();

    // Get artifact to determine content block type
    const artifact = await ArtifactModel.findById(artifactId).lean() as any;
    if (!artifact) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    const blockType = options?.contentBlockType ||
      (artifact.type === 'script' ? 'markdown' : artifact.type === 'chat' ? 'chat_message' : 'json');

    // Create content block
    const block = await getOrCreateContentBlock(content, blockType);

    // Determine parent
    const parentIds = options?.parentVersionId
      ? [options.parentVersionId]
      : artifact.activeVersionId
        ? [artifact.activeVersionId]
        : [];

    const versionId = generateVersionId();
    const versionDoc = {
      _id: versionId,
      artifactId,
      parentIds,
      contentBlockRefs: [block.hash],
      createdAt: now,
      createdBy: options?.userId
    };

    await VersionModel.create(versionDoc);

    // Validate invariants (logs warnings if issues found)
    // This catches bugs early without blocking the write
    validateNewVersion(versionId).catch(err => {
      console.warn('[INVARIANT CHECK] Async validation failed:', err);
    });

    // Update artifact's active version if requested (default: true)
    if (options?.updateActiveVersion !== false) {
      await ArtifactModel.updateOne(
        { _id: artifactId },
        { $set: { activeVersionId: versionId, updatedAt: now } }
      );
    }

    // Log event
    await logEvent(artifact.projectId, 'version_created', {
      artifactId,
      versionId,
      parentIds
    }, options?.userId);

    return versionDoc;
  } catch (error) {
    console.error('Error creating version:', error);
    throw error;
  }
}

/**
 * Resolve version content by fetching all referenced content blocks
 */
export async function resolveVersionContent(versionId: string): Promise<{
  version: Version;
  blocks: ContentBlock[];
  content: string;
} | null> {
  try {
    const { VersionModel, ContentBlockModel } = await getModels();

    const version = await VersionModel.findById(versionId).lean() as any;
    if (!version) return null;

    // Fetch all referenced content blocks
    const blocks = await ContentBlockModel.find({
      _id: { $in: version.contentBlockRefs || [] }
    }).lean() as any[];

    // Combine content (for now, simple concatenation - may need smarter logic)
    const content = blocks.map(b => b.content).join('\n');

    return {
      version: {
        _id: String(version._id),
        artifactId: version.artifactId,
        parentIds: version.parentIds || [],
        contentBlockRefs: version.contentBlockRefs || [],
        createdAt: version.createdAt,
        createdBy: version.createdBy,
        mergeMeta: version.mergeMeta
      },
      blocks: blocks.map(b => ({
        _id: b._id,
        hash: b.hash,
        type: b.type,
        content: b.content,
        createdAt: b.createdAt
      })),
      content
    };
  } catch (error) {
    console.error('Error resolving version content:', error);
    return null;
  }
}


// ==================== V2 Event Logging ====================

/**
 * Log an event for audit trail (fire-and-forget)
 */
async function logEvent(
  projectId: string,
  type: EventType,
  payload: Record<string, any>,
  userId?: string,
  artifactId?: string,
  versionId?: string
): Promise<void> {
  try {
    const { EventModel } = await getModels();
    await EventModel.create({
      projectId,
      artifactId,
      versionId,
      type,
      payload,
      userId,
      createdAt: new Date()
    });
  } catch (error) {
    // Events are best-effort, don't throw
    console.warn('Failed to log event:', error);
  }
}

/**
 * Get events for a project (for audit/debugging)
 */
export async function getProjectEvents(
  projectId: string,
  limit: number = 100
): Promise<ThinkForgeEvent[]> {
  try {
    const { EventModel } = await getModels();
    const docs = await EventModel.find({ projectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean() as any[];

    return docs.map(doc => ({
      _id: String(doc._id),
      projectId: doc.projectId,
      artifactId: doc.artifactId,
      versionId: doc.versionId,
      type: doc.type,
      payload: doc.payload || {},
      userId: doc.userId,
      createdAt: doc.createdAt
    }));
  } catch (error) {
    console.error('Error getting project events:', error);
    return [];
  }
}


// ==================== V2 Script Convenience Functions ====================
// These wrap the V2 artifact/version system for script-specific use cases

/**
 * Get or create a script artifact for a project (V2)
 * Also dual-writes to V1 for backward compatibility
 */
export async function getOrCreateScriptArtifact(
  projectId: string,
  title: string = 'Untitled Script',
  initialContent?: string,
  userId?: string
): Promise<{ artifact: Artifact; version: Version }> {
  try {
    const { ArtifactModel, ScriptModel } = await getModels();

    // Check if script artifact already exists for this project
    const existing = await ArtifactModel.findOne({
      projectId,
      type: 'script'
    }).lean() as any;

    if (existing) {
      const version = await getVersion(existing.activeVersionId);
      return {
        artifact: {
          _id: String(existing._id),
          projectId: existing.projectId,
          type: existing.type,
          title: existing.title,
          rootVersionId: existing.rootVersionId,
          activeVersionId: existing.activeVersionId,
          metadata: existing.metadata || {},
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt
        },
        version: version!
      };
    }

    // Create new script artifact
    const result = await createArtifact(projectId, 'script', title, initialContent, {}, userId);

    // Dual-write to V1 scripts
    try {
      const now = new Date();
      await ScriptModel.create({
        sessionId: projectId,
        title,
        content: initialContent || '',
        blocks: [],
        createdAt: now,
        updatedAt: now
      });
    } catch (e) {
      console.warn('V1 script dual-write failed:', e);
    }

    return result;
  } catch (error) {
    console.error('Error getting/creating script artifact:', error);
    throw error;
  }
}

/**
 * Save script content (V2 with V1 dual-write)
 */
export async function saveScriptV2(
  projectId: string,
  content: string,
  title?: string,
  blocks?: ThinkForgeBlock[],
  userId?: string
): Promise<{ artifact: Artifact; version: Version }> {
  try {
    const { ArtifactModel, ScriptModel } = await getModels();
    const now = new Date();
    const validatedBlocks = enforceThinkForgeBlocks(blocks || []);

    // Get or create script artifact
    let artifact = await ArtifactModel.findOne({ projectId, type: 'script' }).lean() as any;

    if (!artifact) {
      // Create new artifact
      const result = await createArtifact(
        projectId,
        'script',
        title || 'Untitled Script',
        { content, blocks: validatedBlocks },
        {},
        userId
      );
      artifact = result.artifact;
    }

    // Create new version with content
    const version = await createVersion(
      artifact._id,
      { content, blocks: validatedBlocks },
      { contentBlockType: 'json', userId }
    );

    // Update artifact title if provided
    if (title && title !== artifact.title) {
      await ArtifactModel.updateOne(
        { _id: artifact._id },
        { $set: { title, updatedAt: now } }
      );
      artifact.title = title;
    }

    // Dual-write to V1 scripts
    try {
      const existingScript = await ScriptModel.findOne({ sessionId: projectId }).sort({ updatedAt: -1 });
      if (existingScript) {
        await ScriptModel.updateOne(
          { _id: existingScript._id },
          { $set: { title: title || existingScript.title, content, blocks: validatedBlocks, updatedAt: now } }
        );
      } else {
        await ScriptModel.create({
          sessionId: projectId,
          title: title || 'Untitled Script',
          content,
          blocks: validatedBlocks,
          createdAt: now,
          updatedAt: now
        });
      }
    } catch (e) {
      console.warn('V1 script dual-write failed:', e);
    }

    return {
      artifact: {
        _id: String(artifact._id),
        projectId: artifact.projectId,
        type: artifact.type,
        title: artifact.title,
        rootVersionId: artifact.rootVersionId,
        activeVersionId: version._id,
        metadata: artifact.metadata || {},
        createdAt: artifact.createdAt,
        updatedAt: now
      },
      version
    };
  } catch (error) {
    console.error('Error saving script V2:', error);
    throw error;
  }
}


// ==================== V2 Chat Convenience Functions ====================

/**
 * Get or create a chat artifact for a project (V2)
 */
export async function getOrCreateChatArtifact(
  projectId: string,
  userId?: string
): Promise<Artifact> {
  try {
    const { ArtifactModel } = await getModels();

    // Check if chat artifact already exists
    const existing = await ArtifactModel.findOne({
      projectId,
      type: 'chat'
    }).lean() as any;

    if (existing) {
      return {
        _id: String(existing._id),
        projectId: existing.projectId,
        type: existing.type,
        title: existing.title,
        rootVersionId: existing.rootVersionId,
        activeVersionId: existing.activeVersionId,
        metadata: existing.metadata || {},
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt
      };
    }

    // Create new chat artifact
    const result = await createArtifact(projectId, 'chat', 'Chat History', null, {}, userId);
    return result.artifact;
  } catch (error) {
    console.error('Error getting/creating chat artifact:', error);
    throw error;
  }
}

/**
 * Append a chat message (V2 with V1 dual-write)
 * For chat, each message becomes a content block, and versions track conversation state
 */
export async function appendChatMessageV2(
  projectId: string,
  role: 'user' | 'assistant',
  content: string,
  userId?: string
): Promise<ContentBlock> {
  try {
    const { ChatModel } = await getModels();

    // Create content block for the message
    const block = await getOrCreateContentBlock(
      { role, content, timestamp: new Date().toISOString() },
      'chat_message'
    );

    // Dual-write to V1 chat
    try {
      await ChatModel.create({
        sessionId: projectId,
        role,
        content,
        createdAt: new Date()
      });
    } catch (e) {
      console.warn('V1 chat dual-write failed:', e);
    }

    return block;
  } catch (error) {
    console.error('Error appending chat message V2:', error);
    throw error;
  }
}

/**
 * Get chat history (prefers V1 for now since it has sequential messages)
 */
export async function getChatHistoryV2(
  projectId: string,
  limit: number = 50
): Promise<ChatMessage[]> {
  // For now, delegate to V1 since chat messages are stored sequentially there
  return getChatHistory(projectId, limit);
}

// ==================== DataBank ====================
// Tiered memory storage: research artifacts, atomic facts, and semantic knowledge

const COLL_DATABANK = 'thinkforge_databank';

export type DataBankEntryType =
  | 'url_brief'
  | 'note'
  | 'reference'
  | 'research'
  | 'atomic_fact'
  | 'brand_insight'
  | 'rejection_pattern';

export type EmbeddingStatus = 'pending' | 'processing' | 'success' | 'failed';
export type DataBankScope = 'project' | 'global';

export interface DataBankEntry {
  _id: string;
  sessionId?: string;
  projectId?: string;
  userId: string;
  type: DataBankEntryType;
  scope: DataBankScope;
  title: string;
  content: Record<string, any>;
  sourceUrl?: string;
  sourceEntryId?: string;
  tags?: string[];
  embeddingStatus?: EmbeddingStatus;
  vectorId?: string;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

const DataBankSchema = new Schema({
  _id: { type: String, required: true },
  sessionId: { type: String, index: true },
  projectId: { type: String, index: true },
  userId: { type: String, required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: ['url_brief', 'note', 'reference', 'research', 'atomic_fact', 'brand_insight', 'rejection_pattern'],
    index: true,
  },
  title: { type: String, required: true },
  content: { type: Schema.Types.Mixed, default: {} },
  sourceUrl: { type: String },
  sourceEntryId: { type: String, index: true },
  tags: [{ type: String }],
  embeddingStatus: {
    type: String,
    enum: ['pending', 'processing', 'success', 'failed'],
    default: 'pending',
  },
  vectorId: { type: String },
  embedding: { type: [Number], default: undefined },
  scope: { type: String, enum: ['project', 'global'], default: 'project', index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: COLL_DATABANK, timestamps: false });

DataBankSchema.index({ userId: 1, type: 1 });
DataBankSchema.index({ userId: 1, embeddingStatus: 1 });
DataBankSchema.index({ userId: 1, scope: 1 });
DataBankSchema.index({ sessionId: 1, userId: 1 });
DataBankSchema.index({ projectId: 1, type: 1 });
DataBankSchema.index({ tags: 1 });

let DataBankModel: Model<any>;

export function getDataBankModel(): Model<any> {
  if (!DataBankModel) {
    DataBankModel = mongoose.models[COLL_DATABANK] || mongoose.model(COLL_DATABANK, DataBankSchema);
  }
  return DataBankModel;
}

/** Add a new entry to the DataBank */
export async function addDataBankEntry(
  sessionId: string,
  userId: string,
  entry: {
    type: DataBankEntryType;
    title: string;
    content: Record<string, any>;
    sourceUrl?: string;
    sourceEntryId?: string;
    tags?: string[];
    projectId?: string;
    scope?: DataBankScope;
  }
): Promise<DataBankEntry> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const now = new Date();
  const doc = await model.create({
    _id: crypto.randomUUID(),
    sessionId: sessionId || undefined,
    projectId: entry.projectId || undefined,
    userId,
    type: entry.type,
    scope: entry.scope || 'project',
    title: entry.title,
    content: entry.content,
    sourceUrl: entry.sourceUrl,
    sourceEntryId: entry.sourceEntryId,
    tags: entry.tags || [],
    embeddingStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  return doc.toObject() as DataBankEntry;
}

/** Get all DataBank entries for a session, optionally filtered by type */
export async function getDataBankEntries(
  sessionId: string,
  userId: string,
  type?: DataBankEntryType
): Promise<DataBankEntry[]> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const query: Record<string, any> = { sessionId, userId };
  if (type) query.type = type;
  const docs = await model.find(query).sort({ createdAt: -1 }).lean();
  return docs as unknown as DataBankEntry[];
}

/**
 * Get DataBank entries across all sessions for a user (workspace-level retrieval).
 * Used by the Multi-Hop context pipeline to pull relevant facts regardless of session.
 */
export async function getDataBankEntriesByUser(
  userId: string,
  options?: {
    type?: DataBankEntryType;
    tags?: string[];
    embeddingStatus?: EmbeddingStatus;
    scope?: DataBankScope;
    limit?: number;
  }
): Promise<DataBankEntry[]> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const query: Record<string, any> = { userId };
  if (options?.type) query.type = options.type;
  if (options?.tags?.length) query.tags = { $in: options.tags };
  if (options?.embeddingStatus) query.embeddingStatus = options.embeddingStatus;
  if (options?.scope === 'global') {
    query.scope = 'global';
  } else if (options?.scope === 'project') {
    query.$or = [{ scope: 'project' }, { scope: { $exists: false } }, { scope: null }];
  }
  const docs = await model
    .find(query)
    .sort({ createdAt: -1 })
    .limit(options?.limit ?? 100)
    .lean();
  return docs as unknown as DataBankEntry[];
}

/** Get project-scoped DataBank entries for a specific session.
 *  Treats entries with missing/null scope as 'project' (pre-migration entries). */
export async function getProjectScopedEntries(
  userId: string,
  sessionId: string,
  options?: { type?: DataBankEntryType; limit?: number }
): Promise<DataBankEntry[]> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const query: Record<string, any> = {
    userId,
    sessionId,
    $or: [{ scope: 'project' }, { scope: { $exists: false } }, { scope: null }],
  };
  if (options?.type) query.type = options.type;
  const docs = await model
    .find(query)
    .sort({ createdAt: -1 })
    .limit(options?.limit ?? 100)
    .lean();
  return docs as unknown as DataBankEntry[];
}

/** Get a single DataBank entry by ID */
export async function getDataBankEntry(
  entryId: string,
  userId: string
): Promise<DataBankEntry | null> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const doc = await model.findOne({ _id: entryId, userId }).lean();
  return doc as unknown as DataBankEntry | null;
}

/** Fetch multiple DataBank entries by their IDs */
export async function getDataBankEntriesByIds(
  entryIds: string[],
  userId: string
): Promise<DataBankEntry[]> {
  if (entryIds.length === 0) return [];
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const docs = await model.find({ _id: { $in: entryIds }, userId }).lean();
  return docs as unknown as DataBankEntry[];
}

/** Update the embedding status + vectorId after background processing */
export async function updateDataBankEmbeddingStatus(
  entryId: string,
  status: EmbeddingStatus,
  vectorId?: string
): Promise<void> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const update: Record<string, any> = { embeddingStatus: status, updatedAt: new Date() };
  if (vectorId) update.vectorId = vectorId;
  await model.updateOne({ _id: entryId }, { $set: update });
}

/** Store a computed embedding vector on a DataBank entry */
export async function updateDataBankEmbedding(
  entryId: string,
  embedding: number[],
): Promise<void> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  await model.updateOne(
    { _id: entryId },
    { $set: { embedding, embeddingStatus: 'success', updatedAt: new Date() } },
  );
}

/**
 * Retrieve entries for a user that have embeddings, for in-process
 * similarity search. Optionally filtered by scope.
 */
export async function getDataBankEntriesWithEmbeddings(
  userId: string,
  limit: number = 200,
  scope?: DataBankScope,
): Promise<DataBankEntry[]> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const query: Record<string, any> = { userId, embeddingStatus: 'success', embedding: { $exists: true } };
  if (scope === 'global') {
    query.scope = 'global';
  } else if (scope === 'project') {
    query.$or = [{ scope: 'project' }, { scope: { $exists: false } }, { scope: null }];
  }
  const docs = await model
    .find(query)
    .select('_id title tags embedding content sourceUrl type scope')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return docs as unknown as DataBankEntry[];
}

/** Get entries that need embedding (for background processing queue) */
export async function getDataBankEntriesPendingEmbedding(
  limit: number = 50
): Promise<DataBankEntry[]> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const docs = await model
    .find({ embeddingStatus: 'pending' })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
  return docs as unknown as DataBankEntry[];
}

/** Delete a DataBank entry (owner only) */
export async function deleteDataBankEntry(
  entryId: string,
  userId: string
): Promise<boolean> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const result = await model.deleteOne({ _id: entryId, userId });
  return result.deletedCount > 0;
}

// ==================== BrandDNA Operations ====================

/** Get a user's BrandDNA (from UserModel) */
export async function getUserBrandDNA(userId: string): Promise<BrandDNA | null> {
  try {
    const { UserModel } = await getModels();
    const doc = await UserModel.findById(userId).lean() as any;
    return doc?.brandDNA || null;
  } catch (error) {
    console.error('Error getting user BrandDNA:', error);
    return null;
  }
}

/** Update a user's BrandDNA (merges with existing) */
export async function updateUserBrandDNA(
  userId: string,
  updates: Partial<BrandDNA>
): Promise<BrandDNA> {
  try {
    const { UserModel } = await getModels();
    const setFields: Record<string, any> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        setFields[`brandDNA.${key}`] = value;
      }
    }
    const doc = await UserModel.findByIdAndUpdate(
      userId,
      { $set: setFields },
      { new: true, upsert: true, lean: true }
    ) as any;
    return doc?.brandDNA || {};
  } catch (error) {
    console.error('Error updating user BrandDNA:', error);
    throw error;
  }
}

/** Get a project's BrandDNA (overrides for a specific project) */
export async function getProjectBrandDNA(
  projectId: string,
  userId: string
): Promise<BrandDNA | null> {
  try {
    const { ProjectModel } = await getModels();
    const doc = await ProjectModel.findOne({ _id: projectId, userId }).lean() as any;
    return doc?.brandDNA || null;
  } catch (error) {
    console.error('Error getting project BrandDNA:', error);
    return null;
  }
}

/** Update a project's BrandDNA */
export async function updateProjectBrandDNA(
  projectId: string,
  userId: string,
  updates: Partial<BrandDNA>
): Promise<BrandDNA> {
  try {
    const { ProjectModel } = await getModels();
    const setFields: Record<string, any> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        setFields[`brandDNA.${key}`] = value;
      }
    }
    const doc = await ProjectModel.findOneAndUpdate(
      { _id: projectId, userId },
      { $set: setFields },
      { new: true, lean: true }
    ) as any;
    return doc?.brandDNA || {};
  } catch (error) {
    console.error('Error updating project BrandDNA:', error);
    throw error;
  }
}

export function mergeBrandDNA(userDNA: BrandDNA = {}, projectDNA: BrandDNA = {}): BrandDNA {
  const mergeArrays = (a?: string[], b?: string[]): string[] | undefined => {
    const combined = [...(a || []), ...(b || [])];
    return combined.length > 0 ? [...new Set(combined)] : undefined;
  };

  const mergeExemplars = (a?: VoiceExemplar[], b?: VoiceExemplar[]): VoiceExemplar[] | undefined => {
    const combined = [...(a || []), ...(b || [])];
    if (combined.length === 0) return undefined;

    const byKey = new Map<string, VoiceExemplar>();
    for (const exemplar of combined) {
      const key = exemplar.id || `${exemplar.contentType}:${exemplar.text}`;
      byKey.set(key, exemplar);
    }
    return [...byKey.values()];
  };

  return {
    voiceLock: projectDNA.voiceLock || userDNA.voiceLock,
    nicheMap: projectDNA.nicheMap || userDNA.nicheMap,
    killList: mergeArrays(userDNA.killList, projectDNA.killList),
    hookArchetypes: mergeArrays(userDNA.hookArchetypes, projectDNA.hookArchetypes),
    structuralHabits: mergeArrays(userDNA.structuralHabits, projectDNA.structuralHabits),
    recurringAssets: mergeArrays(userDNA.recurringAssets, projectDNA.recurringAssets),
    voiceFingerprint: projectDNA.voiceFingerprint || userDNA.voiceFingerprint,
    voiceExemplars: mergeExemplars(userDNA.voiceExemplars, projectDNA.voiceExemplars),
  };
}

function getDefaultBrandVaultBrandDNAProfile(): BrandVaultBrandDNAProfileGetter {
  const store: BrandVaultRefineryStore = getDefaultBrandVaultRefineryStore();
  return (filter) => store.getLatestAcceptedProfile(filter);
}

function warnBrandDNAVaultFallback(message: string, error: unknown): void {
  console.warn(`[resolveEffectiveBrandDNA] ${message}`, error);
}

export async function composeBrandDNAWithBrandVault(
  baseDNA: BrandDNA = {},
  userId: string,
  brandId?: string,
  options: ResolveEffectiveBrandDNAOptions = {},
): Promise<BrandDNA> {
  return (await composeBrandDNAWithBrandVaultProfile(baseDNA, userId, brandId, options)).brandDNA;
}

export async function composeBrandDNAWithBrandVaultProfile(
  baseDNA: BrandDNA = {},
  userId: string,
  brandId?: string,
  options: ResolveEffectiveBrandDNAOptions = {},
): Promise<EffectiveBrandDNAResolution> {
  const enabled = options.enabled ?? brandVaultSourceEnabled('thinkforge');
  if (!enabled || !brandId) return { brandDNA: baseDNA, brandSignalProfile: null, source: 'legacy' };

  try {
    const getAcceptedProfile = options.getAcceptedProfile ?? getDefaultBrandVaultBrandDNAProfile();
    const profile = await getAcceptedProfile({
      brandId,
      userId,
      ...(options.orgId !== undefined ? { orgId: options.orgId } : {}),
    });
    if (!profile) return { brandDNA: baseDNA, brandSignalProfile: null, source: 'legacy' };
    if (profile.brandId && profile.brandId !== brandId) return { brandDNA: baseDNA, brandSignalProfile: null, source: 'legacy' };
    if (profile.userId && profile.userId !== userId) return { brandDNA: baseDNA, brandSignalProfile: null, source: 'legacy' };
    return {
      brandDNA: brandSignalProfileToBrandDNA(profile, baseDNA),
      brandSignalProfile: profile,
      source: 'brand_vault',
    };
  } catch (error) {
    (options.onVaultFallback ?? warnBrandDNAVaultFallback)('vault accepted-profile read failed; using legacy BrandDNA.', error);
    return { brandDNA: baseDNA, brandSignalProfile: null, source: 'legacy' };
  }
}

/**
 * Resolve effective BrandDNA for a context: merges user-level defaults with project-level overrides.
 * Project-level fields take precedence; arrays are concatenated and deduplicated.
 */
export async function resolveEffectiveBrandDNA(
  userId: string,
  projectId?: string,
  brandId?: string,
  options?: ResolveEffectiveBrandDNAOptions,
): Promise<BrandDNA> {
  return (await resolveEffectiveBrandDNAWithProfile(userId, projectId, brandId, options)).brandDNA;
}

export async function resolveEffectiveBrandDNAWithProfile(
  userId: string,
  projectId?: string,
  brandId?: string,
  options?: ResolveEffectiveBrandDNAOptions,
): Promise<EffectiveBrandDNAResolution> {
  const userDNA = await getUserBrandDNA(userId) || {};
  if (!projectId) return composeBrandDNAWithBrandVaultProfile(userDNA, userId, brandId, options);

  const projectDNA = await getProjectBrandDNA(projectId, userId) || {};

  return composeBrandDNAWithBrandVaultProfile(mergeBrandDNA(userDNA, projectDNA), userId, brandId, options);
}

// ==================== Interaction Event Logging ====================

/**
 * Log an interaction event (shadow log) for the user's process memory.
 * Non-blocking, fire-and-forget.
 */
export async function logInteractionEvent(
  userId: string,
  projectId: string,
  type: EventType,
  payload: Record<string, any>,
  options?: {
    sessionId?: string;
    artifactId?: string;
    versionId?: string;
  }
): Promise<void> {
  try {
    const { EventModel } = await getModels();
    await EventModel.create({
      projectId,
      sessionId: options?.sessionId,
      artifactId: options?.artifactId,
      versionId: options?.versionId,
      type,
      payload,
      userId,
      createdAt: new Date(),
    });
  } catch (error) {
    console.warn('Failed to log interaction event:', error);
  }
}

/** Promote a DataBank entry from project to global scope */
export async function promoteEntryToGlobal(entryId: string): Promise<void> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  await model.updateOne({ _id: entryId }, { $set: { scope: 'global', updatedAt: new Date() } });
}

/** Delete all interaction events for a session (used by Post-Mortem agent) */
export async function deleteEventsBySession(
  sessionId: string,
  userId: string,
  types?: EventType[],
): Promise<number> {
  const { EventModel } = await getModels();
  const query: Record<string, any> = { sessionId, userId };
  if (types?.length) query.type = { $in: types };
  const result = await EventModel.deleteMany(query);
  return result.deletedCount ?? 0;
}

/** Delete project-scoped DataBank entries for a session (used by Post-Mortem agent) */
export async function deleteProjectScopedEntries(
  sessionId: string,
  userId: string,
): Promise<number> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const result = await model.deleteMany({ sessionId, userId, scope: 'project' });
  return result.deletedCount ?? 0;
}

/**
 * Get recent interaction events for a user across all projects.
 * Used by the context pipeline to build Procedural Memory.
 */
export async function getRecentInteractionEvents(
  userId: string,
  options?: {
    projectId?: string;
    types?: EventType[];
    limit?: number;
    since?: Date;
  }
): Promise<ThinkForgeEvent[]> {
  try {
    const { EventModel } = await getModels();
    const query: Record<string, any> = { userId };
    if (options?.projectId) query.projectId = options.projectId;
    if (options?.types?.length) query.type = { $in: options.types };
    if (options?.since) query.createdAt = { $gte: options.since };

    const docs = await EventModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(options?.limit ?? 50)
      .lean() as any[];

    return docs.map((doc: any) => ({
      _id: String(doc._id),
      projectId: doc.projectId,
      artifactId: doc.artifactId,
      versionId: doc.versionId,
      type: doc.type,
      payload: doc.payload || {},
      userId: doc.userId,
      createdAt: doc.createdAt,
    }));
  } catch (error) {
    console.error('Error getting interaction events:', error);
    return [];
  }
}
