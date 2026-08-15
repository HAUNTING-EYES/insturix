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

import {
  resolvePersistedThinkForgeProjectMetadata,
  type ChatMessage,
  type ProjectMeta,
  type ScriptState,
} from '../state/types';
import type { SelectedTrend } from '../trends/selected-trend';
import type { WalletRef } from '@/lib/editron/services/project-ownership';
import { validateThinkForgeBlocks, type ThinkForgeBlock } from '../schemas/thinkforge-block';
import type { CIRDocument, CIRSection } from '../schemas/cir';
import type { ThinkForgeDocumentContract } from '../schemas/document-contract';
import {
  resolvePersistedThinkForgeDocumentAuthority,
  resolveThinkForgeDocumentWriteClassification,
} from '../persistence/document-authority';

// ==================== ThinkForge Database Connection ====================
// Production uses the dedicated 'thinkforge_db' database. The explicit override is
// reserved for isolated test environments, where every browser run needs its own DB.
function enforceThinkForgeBlocks(input: any): ThinkForgeBlock[] {
  const candidate = Array.isArray(input) ? input : [];
  const validated = validateThinkForgeBlocks(candidate);
  if (validated.length !== candidate.length) {
    throw new Error('Invalid block payload: persistence expects ThinkForgeBlock[].');
  }
  return validated;
}

const THINKFORGE_DB_NAME = process.env.THINKFORGE_MONGODB_DB_NAME?.trim() || 'thinkforge_db';

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
 * Uses the configured ThinkForge database name, defaulting to 'thinkforge_db'.
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

  thinkforgeDbCached.promise = mongoose.createConnection(mongoUri, opts).asPromise();
  
  thinkforgeDbCached.promise.catch((err) => {
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
  commitClaimedAt?: Date;
  billing?: GenerationBilling;
}

export interface GenerationBilling {
  transactionId: string;
  userId: string;
  amount: number;
  service: 'thinkforge';
  action: 'chat_message';
  status: 'reserved' | 'refund_pending' | 'refunding' | 'refunded' | 'settled';
  updatedAt: Date;
  /**
   * P3.1 stamp: the WalletRef this charge was billed to, resolved at WORK-START from the
   * request's org context + ORG_WALLET_BILLING flag. settleGenerationRefund routes the refund
   * through this stamp (D5) — never re-resolved from ambient context. Absent on legacy rows
   * (created before P3.1) => personal, the grandfathered rule.
   */
  billedWallet?: WalletRef;
}

export class GenerationStateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationStateConflictError';
  }
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
  scriptId: string;
  title: string;
  content: string;
  blocks?: ThinkForgeBlock[];
  richText?: Record<string, any>; // Tiptap JSON AST
  metadata?: Record<string, any>;
  version: number;
  documentType: string;
  contentContract: ThinkForgeDocumentContract;
  parentScriptId?: string;
  forkReason?: string;
  createdFromIntent?: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapStoredScript(doc: any): Script {
  const authority = resolvePersistedThinkForgeDocumentAuthority(doc);
  if (typeof doc.content !== 'string') {
    throw new Error('Persisted ThinkForge document content must be a string');
  }
  return {
    _id: String(doc._id),
    sessionId: authority.sessionId,
    scriptId: authority.scriptId,
    title: authority.title,
    content: doc.content,
    blocks: enforceThinkForgeBlocks(doc.blocks),
    richText: doc.richText,
    metadata: doc.metadata || {},
    version: authority.version,
    documentType: authority.documentType,
    contentContract: authority.contentContract,
    parentScriptId: doc.parentScriptId,
    forkReason: doc.forkReason,
    createdFromIntent: doc.createdFromIntent,
    createdAt: authority.createdAt,
    updatedAt: authority.updatedAt,
  };
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

// ==================== V2 Types ====================
export type ArtifactType = 'script' | 'chat' | 'whiteboard' | 'content_card';
export type ContentBlockType = 'text' | 'markdown' | 'code' | 'scene' | 'json' | 'chat_message';
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
  scriptId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  content: { type: String, default: '' },
  blocks: { type: Schema.Types.Mixed },
  richText: { type: Schema.Types.Mixed }, // Tiptap JSON AST
  metadata: { type: Schema.Types.Mixed, default: {} },
  version: { type: Number, default: 1 },
  documentType: { type: String, required: true },
  contentContract: { type: Schema.Types.Mixed, required: true },
  recordStatus: { type: String, required: true, enum: ['active', 'quarantined'] },
  parentScriptId: { type: String },
  forkReason: { type: String },
  createdFromIntent: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: COLL_SCRIPTS, timestamps: false });

ScriptSchema.index(
  { sessionId: 1, scriptId: 1 },
  {
    name: 'uniq_active_thinkforge_document',
    unique: true,
    partialFilterExpression: { recordStatus: 'active' },
  },
);

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
        // Session refreshes carry partial browser state. Merge it with the
        // persisted authority instead of replacing it and losing brand/trend
        // lineage between opening a session and generating content.
        if (projectMeta) {
          const persistedProjectMeta = resolvePersistedThinkForgeProjectMetadata(
            existing.projectMeta || {},
            projectMeta,
          );
          await SessionModel.updateOne(
            { _id: sessionId },
            { $set: { projectMeta: persistedProjectMeta, updatedAt: new Date() } }
          );
          return {
            _id: String(existing._id),
            userId: existing.userId,
            orgId: existing.orgId,
            createdByName: existing.createdByName,
            projectMeta: persistedProjectMeta,
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

async function settleGenerationRefund(
  sessionId: string,
  generation: GenerationState,
): Promise<GenerationState> {
  const billing = generation.billing;
  if (
    !billing
    || (generation.status !== 'failed' && generation.status !== 'cancelled')
    || billing.status === 'refunded'
    || billing.status === 'settled'
  ) {
    return generation;
  }

  const { SessionModel } = await getModels();
  const now = new Date();
  const staleRefundLease = new Date(now.getTime() - 2 * 60_000);
  const claimed = await SessionModel.findOneAndUpdate(
    {
      _id: sessionId,
      'activeGeneration.id': generation.id,
      'activeGeneration.status': generation.status,
      $or: [
        { 'activeGeneration.billing.status': 'refund_pending' },
        {
          'activeGeneration.billing.status': 'refunding',
          'activeGeneration.billing.updatedAt': { $lt: staleRefundLease },
        },
      ],
    },
    {
      $set: {
        'activeGeneration.billing.status': 'refunding',
        'activeGeneration.billing.updatedAt': now,
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  ) as any;

  if (!claimed?.activeGeneration) {
    const latest = await SessionModel.findOne({ _id: sessionId }).lean() as any;
    return latest?.activeGeneration || generation;
  }

  const claimedGeneration = claimed.activeGeneration as GenerationState;
  const claimedBilling = claimedGeneration.billing;
  const hasRefundableCharge = Boolean(
    claimedBilling
    && typeof claimedBilling.userId === 'string'
    && typeof claimedBilling.transactionId === 'string'
    && typeof claimedBilling.amount === 'number'
    && Number.isFinite(claimedBilling.amount),
  );
  let refundSucceeded = !hasRefundableCharge
    || claimedBilling?.transactionId === 'no_charge'
    || (claimedBilling?.amount ?? 0) <= 0;
  let refundError: string | undefined;

  if (!refundSucceeded && claimedBilling && hasRefundableCharge) {
    const { CreditsService } = await import('@/lib/services/creditsService');
    const { resolveStampedWallet } = await import('@/lib/services/org-wallet-ops');
    // P3.1: refund the SAME wallet the charge was billed to, read from the persisted stamp
    // (D5). A generation stamped org bills the org wallet even if the member left the org by
    // now; a legacy row with no stamp bills personal (grandfathered). A malformed stamp
    // THROWS (fail loud) — the refund is retried after intervention, never guessed.
    const wallet = resolveStampedWallet(
      claimedBilling.billedWallet,
      claimedBilling.userId,
      `ThinkForge generation ${claimedGeneration.id}`,
    );
    const refund = await CreditsService.refundForWallet(
      wallet,
      claimedBilling.amount,
      claimedGeneration.message || `ThinkForge generation ${claimedGeneration.status}`,
      {
        service: claimedBilling.service,
        action: claimedBilling.action,
        originalTransactionId: claimedBilling.transactionId,
      },
    );
    refundSucceeded = refund.success;
    refundError = refund.error;
  }

  const settledAt = new Date();
  if (!refundSucceeded) {
    await SessionModel.updateOne(
      {
        _id: sessionId,
        'activeGeneration.id': generation.id,
        'activeGeneration.billing.status': 'refunding',
      },
      {
        $set: {
          'activeGeneration.billing.status': 'refund_pending',
          'activeGeneration.billing.updatedAt': settledAt,
          updatedAt: settledAt,
        },
      },
    );
    throw new Error(refundError || `Failed to refund ThinkForge generation ${generation.id}`);
  }

  const settled = await SessionModel.findOneAndUpdate(
    {
      _id: sessionId,
      'activeGeneration.id': generation.id,
      'activeGeneration.billing.status': 'refunding',
    },
    {
      $set: {
        'activeGeneration.billing.status': 'refunded',
        'activeGeneration.billing.updatedAt': settledAt,
        updatedAt: settledAt,
      },
    },
    { new: true, lean: true },
  ) as any;

  return settled?.activeGeneration || claimedGeneration;
}

export async function setActiveGeneration(
  sessionId: string,
  userId: string,
  generation: GenerationState,
): Promise<boolean> {
  const { SessionModel } = await getModels();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const session = await SessionModel.findOne({ _id: sessionId, userId }).lean() as any;
    if (!session) return false;

    const active = session.activeGeneration as GenerationState | null;
    if (active?.status === 'running') {
      if (active.commitClaimedAt) return false;
      await updateGenerationState(sessionId, active.id, {
        status: 'cancelled',
        message: 'Superseded by a newer generation',
      });
      continue;
    }

    if (active?.billing?.status === 'refund_pending' || active?.billing?.status === 'refunding') {
      await settleGenerationRefund(sessionId, active);
      continue;
    }

    const ownershipFilter = active
      ? {
          'activeGeneration.id': active.id,
          'activeGeneration.status': active.status,
        }
      : {
          $or: [
            { activeGeneration: null },
            { activeGeneration: { $exists: false } },
          ],
        };
    const admitted = await SessionModel.updateOne(
      { _id: sessionId, userId, ...ownershipFilter },
      { $set: { activeGeneration: generation, updatedAt: new Date() } },
    );
    if (admitted.modifiedCount === 1) return true;
  }

  throw new GenerationStateConflictError('Could not acquire ThinkForge generation ownership');
}

export async function clearActiveGeneration(sessionId: string): Promise<void> {
  const { SessionModel } = await getModels();
  await SessionModel.updateOne(
    { _id: sessionId },
    { $set: { activeGeneration: null, updatedAt: new Date() } }
  );
}

export async function claimInitialDraftIntent(sessionId: string): Promise<boolean> {
  const { SessionModel } = await getModels();
  const now = new Date();
  const session = await SessionModel.findOneAndUpdate(
    {
      _id: sessionId,
      'projectMeta.initialDraftIntent.status': 'pending',
    },
    {
      $set: {
        'projectMeta.initialDraftIntent.status': 'claimed',
        'projectMeta.initialDraftIntent.claimedAt': now,
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  ) as any;

  return Boolean(session);
}

/** Atomically records a user-confirmed trend without overwriting other session metadata. */
export async function setSessionSelectedTrend(sessionId: string, selectedTrend: SelectedTrend): Promise<ProjectMeta> {
  const { SessionModel } = await getModels();
  const doc = await SessionModel.findByIdAndUpdate(
    sessionId,
    {
      $set: {
        'projectMeta.selectedTrend': selectedTrend,
        updatedAt: new Date(),
      },
    },
    { new: true, lean: true },
  ) as any;

  if (!doc) {
    throw new Error(`Session ${sessionId} not found`);
  }

  return doc.projectMeta || {};
}

/**
 * Attaches analysis only if the same trend is still selected. This prevents a
 * slow media-analysis result from overwriting a newer user selection.
 */
export async function setSessionSelectedTrendAnalysis(
  sessionId: string,
  candidateId: string,
  selectedTrend: SelectedTrend,
  options: {
    expectedAnalysisJobId?: string;
    requireNoQueuedAnalysis?: boolean;
  } = {},
): Promise<ProjectMeta | null> {
  const { SessionModel } = await getModels();
  const query: Record<string, unknown> = {
    _id: sessionId,
    'projectMeta.selectedTrend.candidate.candidateId': candidateId,
  };
  if (options.expectedAnalysisJobId) {
    query['projectMeta.selectedTrend.analysis.status'] = 'queued';
    query['projectMeta.selectedTrend.analysis.jobId'] = options.expectedAnalysisJobId;
  } else if (options.requireNoQueuedAnalysis) {
    query.$or = [
      { 'projectMeta.selectedTrend.analysis': { $exists: false } },
      { 'projectMeta.selectedTrend.analysis.status': { $ne: 'queued' } },
    ];
  }
  const doc = await SessionModel.findOneAndUpdate(
    query,
    {
      $set: {
        'projectMeta.selectedTrend': selectedTrend,
        updatedAt: new Date(),
      },
    },
    { new: true, lean: true },
  ) as any;

  return doc?.projectMeta || null;
}

export async function getActiveGeneration(sessionId: string): Promise<GenerationState | null> {
  const { SessionModel } = await getModels();
  const doc = await SessionModel.findOne({ _id: sessionId }).lean() as any;
  const generation = doc?.activeGeneration as GenerationState | null;
  if (generation?.billing?.status === 'refund_pending' || generation?.billing?.status === 'refunding') {
    return settleGenerationRefund(sessionId, generation);
  }
  return generation || null;
}

export async function claimGenerationCommit(sessionId: string, generationId: string): Promise<boolean> {
  const { SessionModel } = await getModels();
  const now = new Date();
  const claimed = await SessionModel.updateOne(
    {
      _id: sessionId,
      'activeGeneration.id': generationId,
      'activeGeneration.status': 'running',
      'activeGeneration.commitClaimedAt': { $exists: false },
    },
    {
      $set: {
        'activeGeneration.commitClaimedAt': now,
        'activeGeneration.updatedAt': now,
        updatedAt: now,
      },
    },
  );
  return claimed.modifiedCount === 1;
}

export async function updateGenerationState(
  sessionId: string,
  generationId: string,
  updates: Partial<GenerationState>
): Promise<GenerationState | null> {
  const { SessionModel } = await getModels();
  const now = new Date();
  const query: Record<string, unknown> = {
    _id: sessionId,
    'activeGeneration.id': generationId,
    'activeGeneration.status': 'running',
  };
  if (updates.status === 'cancelled') {
    query['activeGeneration.commitClaimedAt'] = { $exists: false };
  }

  const setFields: Record<string, unknown> = {
    'activeGeneration.updatedAt': now,
    updatedAt: now,
  };
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'updatedAt' && value !== undefined) {
      setFields[`activeGeneration.${key}`] = value;
    }
  }
  if (updates.status === 'completed') {
    setFields['activeGeneration.billing.status'] = 'settled';
    setFields['activeGeneration.billing.updatedAt'] = now;
  } else if (updates.status === 'failed' || updates.status === 'cancelled') {
    setFields['activeGeneration.billing.status'] = 'refund_pending';
    setFields['activeGeneration.billing.updatedAt'] = now;
  }

  const updated = await SessionModel.findOneAndUpdate(
    query,
    { $set: setFields },
    { new: true, lean: true },
  ) as any;
  if (updated?.activeGeneration) {
    const generation = updated.activeGeneration as GenerationState;
    if (generation.status === 'failed' || generation.status === 'cancelled') {
      return settleGenerationRefund(sessionId, generation);
    }
    return generation;
  }

  const current = await SessionModel.findOne({ _id: sessionId }).lean() as any;
  const active = current?.activeGeneration as GenerationState | null;
  if (active?.id === generationId && active.status === updates.status) {
    return settleGenerationRefund(sessionId, active);
  }
  if (updates.status) {
    throw new GenerationStateConflictError(
      `Generation ${generationId} cannot transition to ${updates.status}; ownership or terminal state changed`,
    );
  }
  return null;
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

export async function getScript(sessionId: string, scriptId: string): Promise<Script | null> {
  try {
    const exactScriptId = scriptId.trim();
    if (!exactScriptId || exactScriptId !== scriptId) {
      throw new Error('ThinkForge document ID must be a non-empty trimmed string');
    }

    const { ScriptModel } = await getModels();
    const doc = await ScriptModel.findOne({ sessionId, scriptId: exactScriptId, recordStatus: 'active' })
      .sort({ updatedAt: -1 })
      .lean() as any;

    if (!doc) return null;

    return mapStoredScript(doc);
  } catch (error) {
    console.error('Error getting script:', error);
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
  scriptId: string,
): Promise<SaveScriptWithVersionResult> {
  try {
    const { ScriptModel } = await getModels();
    const now = new Date();
    const exactSessionId = sessionId.trim();
    const exactScriptId = scriptId.trim();
    if (!Number.isInteger(baseVersion) || baseVersion < 0) {
      throw new Error('ThinkForge base version must be a non-negative integer');
    }
    if (!exactSessionId || exactSessionId !== sessionId) {
      throw new Error('ThinkForge session ID must be a non-empty trimmed string');
    }
    if (!exactScriptId || exactScriptId !== scriptId) {
      throw new Error('ThinkForge document ID must be a non-empty trimmed string');
    }
    if (script.scriptId !== undefined && script.scriptId !== exactScriptId) {
      throw new Error('ThinkForge document ID conflicts with the persistence target');
    }
    if (script.title !== undefined
      && (typeof script.title !== 'string' || !script.title.trim() || script.title !== script.title.trim())) {
      throw new Error('ThinkForge document title must be a non-empty trimmed string');
    }

    const existing = await ScriptModel.findOne({
      sessionId: exactSessionId,
      scriptId: exactScriptId,
      recordStatus: 'active',
    }).sort({ updatedAt: -1 });
    const classification = resolveThinkForgeDocumentWriteClassification(script, existing as any);
    if (!existing) {
      if (baseVersion > 0) {
        return { ok: false, error: 'Version conflict', currentVersion: 0 };
      }

      if (script.title === undefined) {
        throw new Error('ThinkForge document title must be a non-empty trimmed string');
      }
      const blocks = enforceThinkForgeBlocks(script.blocks || []);
      const doc: Record<string, any> = {
        sessionId: exactSessionId,
        scriptId: exactScriptId,
        title: script.title,
        content: script.content ?? '',
        blocks,
        ...classification,
        recordStatus: 'active',
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
        script: mapStoredScript(created.toObject()),
      };
    }

    const blocks = script.blocks !== undefined
      ? enforceThinkForgeBlocks(script.blocks)
      : enforceThinkForgeBlocks(existing.blocks);
    const updateDoc: Record<string, any> = {
      scriptId: exactScriptId,
      title: script.title ?? existing.title,
      content: script.content ?? existing.content,
      blocks,
      ...classification,
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
      { _id: existing._id, version: baseVersion, recordStatus: 'active' },
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
      script: mapStoredScript(updated),
    };
  } catch (error) {
    console.error('Error saving script with version check:', error);
    throw error;
  }
}

export async function listScripts(sessionId: string): Promise<Array<{ scriptId: string; title: string; documentType: string; version: number; updatedAt: Date; createdAt: Date }>> {
  try {
    const { ScriptModel } = await getModels();
    const docs = await ScriptModel.find({ sessionId, recordStatus: 'active' }).sort({ updatedAt: -1 }).lean() as any[];
    return docs.map((doc) => {
      const authority = resolvePersistedThinkForgeDocumentAuthority(doc);
      return {
        scriptId: authority.scriptId,
        title: authority.title,
        documentType: authority.documentType,
        version: authority.version,
        updatedAt: authority.updatedAt,
        createdAt: authority.createdAt,
      };
    });
  } catch (error) {
    console.error('Error listing scripts:', error);
    throw error;
  }
}

/** All of a user's scripts across every session (for the unified content library). */
export async function listScriptsByUser(
  userId: string,
  limit = 100,
): Promise<Array<{ scriptId: string; sessionId: string; title: string; documentType: string; version: number; updatedAt: Date; createdAt: Date }>> {
  try {
    const { SessionModel, ScriptModel } = await getModels();
    const sessions = await SessionModel.find({ userId }, { _id: 1 }).lean() as Array<{ _id: string }>;
    if (sessions.length === 0) return [];
    const docs = await ScriptModel.find({
      sessionId: { $in: sessions.map((session) => session._id) },
      recordStatus: 'active',
    }).sort({ updatedAt: -1 }).limit(limit).lean() as any[];
    return docs.map((doc) => {
      const authority = resolvePersistedThinkForgeDocumentAuthority(doc);
      return {
        scriptId: authority.scriptId,
        sessionId: authority.sessionId,
        title: authority.title,
        documentType: authority.documentType,
        version: authority.version,
        updatedAt: authority.updatedAt,
        createdAt: authority.createdAt,
      };
    });
  } catch (error) {
    console.error('Error listing scripts by user:', error);
    throw error;
  }
}

export async function deleteScript(sessionId: string, scriptId: string): Promise<boolean> {
  try {
    const { ScriptModel } = await getModels();
    const result = await ScriptModel.deleteOne({ sessionId, scriptId, recordStatus: 'active' });
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
export type DataBankMemoryScope = 'project' | 'brand' | 'universal';
export type DataBankProvenanceStatus = 'verified' | 'quarantined';
export type DataBankOwnerType = 'user' | 'organization';
export type DataBankClassification = 'public' | 'business_confidential' | 'personal' | 'child_data';
export type DataBankConsentStatus = 'not_required' | 'granted' | 'withdrawn';
export type DataBankLifecycleStatus = 'active' | 'superseded' | 'expired';
export interface DataBankPrincipal {
  userId: string;
  orgId?: string | null;
}
export interface DataBankWriteGovernance {
  classification: DataBankClassification;
  consentStatus: DataBankConsentStatus;
  freshUntil?: Date;
  expiresAt?: Date;
}
export interface DataBankEntryWrite {
  type: DataBankEntryType;
  title: string;
  content: Record<string, any>;
  sourceUrl?: string;
  sourceEntryId?: string;
  tags?: string[];
  projectId?: string;
  scope?: DataBankScope;
  memoryScope?: DataBankMemoryScope;
  brandId?: string;
}
export interface GovernedDataBankEntryWrite extends DataBankEntryWrite {
  governance: DataBankWriteGovernance;
}
export type DataBankProvenanceReason =
  | 'missing_explicit_memory_scope'
  | 'conflicting_memory_scopes'
  | 'missing_brand_id'
  | 'conflicting_brand_ids'
  | 'universal_memory_has_brand';

/** Bump when vector metadata changes in a retrieval-relevant way. */
export const DATA_BANK_EMBEDDING_METADATA_VERSION = 3;

export interface DataBankEntry {
  _id: string;
  sessionId?: string;
  projectId?: string;
  userId: string;
  /** Optional only for legacy rows pending owner migration. */
  ownerType?: DataBankOwnerType;
  orgId?: string;
  classification?: DataBankClassification;
  consentStatus?: DataBankConsentStatus;
  lifecycleStatus?: DataBankLifecycleStatus;
  freshUntil?: Date;
  expiresAt?: Date;
  type: DataBankEntryType;
  scope: DataBankScope;
  /** First-class provenance for entries that can cross a session boundary. */
  memoryScope?: DataBankMemoryScope;
  brandId?: string;
  provenanceStatus?: DataBankProvenanceStatus;
  provenanceReason?: DataBankProvenanceReason;
  title: string;
  content: Record<string, any>;
  sourceUrl?: string;
  sourceEntryId?: string;
  tags?: string[];
  embeddingStatus?: EmbeddingStatus;
  embeddingAttempts?: number;
  embeddingLastAttemptAt?: Date;
  embeddingNextRetryAt?: Date;
  embeddingLeaseExpiresAt?: Date;
  embeddingMetadataVersion?: number;
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
  ownerType: { type: String, enum: ['user', 'organization'], index: true },
  orgId: { type: String, index: true },
  classification: {
    type: String,
    enum: ['public', 'business_confidential', 'personal', 'child_data'],
    index: true,
  },
  consentStatus: { type: String, enum: ['not_required', 'granted', 'withdrawn'], index: true },
  lifecycleStatus: { type: String, enum: ['active', 'superseded', 'expired'], index: true },
  freshUntil: { type: Date, index: true },
  expiresAt: { type: Date, index: true },
  brandId: { type: String, index: true },
  provenanceStatus: { type: String, enum: ['verified', 'quarantined'], index: true },
  provenanceReason: {
    type: String,
    enum: [
      'missing_explicit_memory_scope',
      'conflicting_memory_scopes',
      'missing_brand_id',
      'conflicting_brand_ids',
      'universal_memory_has_brand',
    ],
  },
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
  embeddingAttempts: { type: Number, default: 0 },
  embeddingLastAttemptAt: { type: Date },
  embeddingNextRetryAt: { type: Date, index: true },
  embeddingLeaseExpiresAt: { type: Date, index: true },
  embeddingMetadataVersion: { type: Number },
  vectorId: { type: String },
  embedding: { type: [Number], default: undefined },
  scope: { type: String, enum: ['project', 'global'], default: 'project', index: true },
  memoryScope: { type: String, enum: ['project', 'brand', 'universal'], index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: COLL_DATABANK, timestamps: false });

DataBankSchema.index({ userId: 1, type: 1 });
DataBankSchema.index({ userId: 1, embeddingStatus: 1 });
DataBankSchema.index({ userId: 1, scope: 1 });
DataBankSchema.index({ userId: 1, scope: 1, memoryScope: 1, brandId: 1 });
DataBankSchema.index({ ownerType: 1, orgId: 1, scope: 1, memoryScope: 1, brandId: 1 });
DataBankSchema.index({ lifecycleStatus: 1, expiresAt: 1 });
DataBankSchema.index({ embeddingStatus: 1, embeddingNextRetryAt: 1, createdAt: 1 });
DataBankSchema.index({ sessionId: 1, userId: 1 });
DataBankSchema.index({ projectId: 1, type: 1 });
DataBankSchema.index({ tags: 1 });

let DataBankModel: Model<any>;

function dataBankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function trustedPostMortemMetadata(content: Record<string, any>): {
  brandId?: string;
  memoryScope?: DataBankMemoryScope;
} {
  if (content?.source !== 'post-mortem') return {};
  const memoryScope = content.memoryScope;
  return {
    ...(dataBankString(content.brandId) ? { brandId: dataBankString(content.brandId) } : {}),
    ...(memoryScope === 'project' || memoryScope === 'brand' || memoryScope === 'universal'
      ? { memoryScope }
      : {}),
  };
}

function explicitTaggedMemoryScope(tags: string[] | undefined): 'brand' | 'universal' | undefined | 'conflict' {
  const scopes = new Set(
    (tags ?? [])
      .filter((tag) => tag === 'memory:brand' || tag === 'memory:universal')
      .map((tag) => tag.slice('memory:'.length)),
  );
  if (scopes.size > 1) return 'conflict';
  const [scope] = scopes;
  return scope === 'brand' || scope === 'universal' ? scope : undefined;
}

function explicitTaggedBrandIds(tags: string[] | undefined): string[] {
  return [...new Set(
    (tags ?? [])
      .filter((tag) => tag.startsWith('brand:'))
      .map((tag) => dataBankString(tag.slice('brand:'.length)))
      .filter((brandId): brandId is string => Boolean(brandId)),
  )];
}

function normalizedMemoryTags(
  tags: string[] | undefined,
  memoryScope: 'brand' | 'universal',
  brandId?: string,
): string[] {
  const normalized = new Set(
    (tags ?? []).map((tag) => tag.trim()).filter(Boolean)
      .filter((tag) => !tag.startsWith('memory:') && !tag.startsWith('brand:')),
  );
  normalized.add(`memory:${memoryScope}`);
  if (brandId) normalized.add(`brand:${brandId}`);
  return [...normalized];
}

export type LegacyDataBankProvenanceClassification =
  | {
      status: 'verified';
      memoryScope: 'brand' | 'universal';
      brandId?: string;
      tags: string[];
    }
  | {
      status: 'quarantined';
      reason: DataBankProvenanceReason;
    };

/**
 * Classifies legacy global memory using only provenance that already exists in
 * the record. This deliberately does not infer a brand from its prose.
 */
export function classifyLegacyGlobalDataBankProvenance(
  entry: Pick<DataBankEntry, 'scope' | 'memoryScope' | 'brandId' | 'content' | 'tags'>,
): LegacyDataBankProvenanceClassification {
  const firstClassScope = entry.memoryScope === 'brand' || entry.memoryScope === 'universal'
    ? entry.memoryScope
    : undefined;
  const trustedMetadata = trustedPostMortemMetadata(entry.content);
  const taggedScope = explicitTaggedMemoryScope(entry.tags);

  if (taggedScope === 'conflict') {
    return { status: 'quarantined', reason: 'conflicting_memory_scopes' };
  }

  const memoryScopes = new Set(
    [firstClassScope, trustedMetadata.memoryScope, taggedScope]
      .filter((scope): scope is 'brand' | 'universal' => scope === 'brand' || scope === 'universal'),
  );
  if (memoryScopes.size === 0) {
    return { status: 'quarantined', reason: 'missing_explicit_memory_scope' };
  }
  if (memoryScopes.size > 1) {
    return { status: 'quarantined', reason: 'conflicting_memory_scopes' };
  }

  const [memoryScope] = memoryScopes;
  const brandIds = new Set([
    dataBankString(entry.brandId),
    trustedMetadata.brandId,
    ...explicitTaggedBrandIds(entry.tags),
  ].filter((brandId): brandId is string => Boolean(brandId)));

  if (brandIds.size > 1) {
    return { status: 'quarantined', reason: 'conflicting_brand_ids' };
  }
  const [brandId] = brandIds;
  if (memoryScope === 'brand' && !brandId) {
    return { status: 'quarantined', reason: 'missing_brand_id' };
  }
  if (memoryScope === 'universal' && brandId) {
    return { status: 'quarantined', reason: 'universal_memory_has_brand' };
  }

  return {
    status: 'verified',
    memoryScope,
    ...(brandId ? { brandId } : {}),
    tags: normalizedMemoryTags(entry.tags, memoryScope, brandId),
  };
}

export function resolveDataBankEntryProvenance(entry: {
  content: Record<string, any>;
  scope?: DataBankScope;
  memoryScope?: DataBankMemoryScope;
  brandId?: string;
  tags?: string[];
}): { scope: DataBankScope; memoryScope: DataBankMemoryScope; brandId?: string; tags: string[] } {
  const scope = entry.scope ?? 'project';
  const trustedMetadata = trustedPostMortemMetadata(entry.content);
  const memoryScope = entry.memoryScope ?? trustedMetadata.memoryScope ?? (scope === 'project' ? 'project' : undefined);
  const brandId = dataBankString(entry.brandId) ?? trustedMetadata.brandId;

  if (!memoryScope) {
    throw new Error('Global DataBank entries require an explicit brand or universal memory scope.');
  }
  if (scope === 'project' && memoryScope !== 'project') {
    throw new Error('Project-scoped DataBank entries must use project memory scope.');
  }
  if (scope === 'global' && memoryScope === 'project') {
    throw new Error('Global DataBank entries require brand or universal memory scope.');
  }
  if (memoryScope === 'brand' && !brandId) {
    throw new Error('Brand memory requires a brandId.');
  }
  if (memoryScope === 'universal' && brandId) {
    throw new Error('Universal memory cannot be assigned to a brand.');
  }

  const tags = new Set((entry.tags ?? []).map((tag) => tag.trim()).filter(Boolean));
  tags.add(`memory:${memoryScope}`);
  if (brandId) tags.add(`brand:${brandId}`);
  return { scope, memoryScope, ...(brandId ? { brandId } : {}), tags: [...tags] };
}

export function resolveDataBankEntryAuthority(input: {
  userId: string;
  orgId?: string | null;
  classification: DataBankClassification;
  consentStatus: DataBankConsentStatus;
  freshUntil?: Date;
  expiresAt?: Date;
  now?: Date;
}): {
  ownerType: DataBankOwnerType;
  userId: string;
  orgId?: string;
  classification: Exclude<DataBankClassification, 'child_data'>;
  consentStatus: Exclude<DataBankConsentStatus, 'withdrawn'>;
  lifecycleStatus: 'active';
  freshUntil?: Date;
  expiresAt?: Date;
} {
  const principal = resolveDataBankPrincipal(input);
  if (input.classification === 'child_data') {
    throw new Error('Child data cannot be stored in ThinkForge memory.');
  }
  if (input.consentStatus === 'withdrawn') {
    throw new Error('Withdrawn data consent cannot create ThinkForge memory.');
  }
  if (input.classification === 'personal' && input.consentStatus !== 'granted') {
    throw new Error('Personal memory requires explicit consent.');
  }

  const now = input.now ?? new Date();
  const freshUntil = validDataBankDate(input.freshUntil, 'freshUntil');
  const expiresAt = validDataBankDate(input.expiresAt, 'expiresAt');
  if (expiresAt && expiresAt.getTime() <= now.getTime()) {
    throw new Error('DataBank memory cannot be expired when it is created.');
  }
  if (freshUntil && expiresAt && freshUntil.getTime() > expiresAt.getTime()) {
    throw new Error('DataBank freshness cannot extend beyond expiry.');
  }

  return {
    ...principal,
    classification: input.classification,
    consentStatus: input.consentStatus,
    lifecycleStatus: 'active',
    ...(freshUntil ? { freshUntil } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

export function resolveDataBankPrincipal(input: DataBankPrincipal): {
  ownerType: DataBankOwnerType;
  userId: string;
  orgId?: string;
} {
  const userId = dataBankString(input.userId);
  const orgId = dataBankString(input.orgId);
  if (!userId) throw new Error('DataBank authority requires a user actor.');
  return {
    ownerType: orgId ? 'organization' : 'user',
    userId,
    ...(orgId ? { orgId } : {}),
  };
}

export function buildDataBankPrincipalQuery(input: DataBankPrincipal): DataBankOwnershipQuery {
  const principal = resolveDataBankPrincipal(input);
  return principal.ownerType === 'organization'
    ? { ownerType: 'organization', orgId: principal.orgId }
    : { ownerType: 'user', userId: principal.userId };
}

export function assertDataBankSessionPrincipal(
  principalInput: DataBankPrincipal,
  session: Pick<Session, '_id' | 'userId' | 'orgId'>,
): ReturnType<typeof resolveDataBankPrincipal> {
  const principal = resolveDataBankPrincipal(principalInput);
  const sessionOrgId = dataBankString(session.orgId);
  if (sessionOrgId !== principal.orgId) {
    throw new Error('DataBank principal does not match the session owner.');
  }
  if (!sessionOrgId && session.userId !== principal.userId) {
    throw new Error('Personal DataBank memory requires the session owner.');
  }
  return principal;
}

function validDataBankDate(value: Date | undefined, field: string): Date | undefined {
  if (value === undefined) return undefined;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`DataBank ${field} must be a valid date.`);
  }
  return new Date(value.getTime());
}

type DataBankOwnershipQuery = Record<string, any>;

/**
 * Canonical Mongo predicate for records allowed to influence authoring or be
 * embedded. Missing legacy fields are never interpreted as project ownership.
 */
export function buildVerifiedDataBankOwnershipQuery(scope?: DataBankScope): DataBankOwnershipQuery {
  const projectOwnership = { scope: 'project', memoryScope: 'project' };
  const brandOwnership = {
    scope: 'global',
    memoryScope: 'brand',
    brandId: { $type: 'string', $ne: '' },
  };
  const universalOwnership = {
    scope: 'global',
    memoryScope: 'universal',
    $or: [
      { brandId: { $exists: false } },
      { brandId: null },
      { brandId: '' },
    ],
  };

  if (scope === 'project') {
    return { provenanceStatus: 'verified', ...projectOwnership };
  }
  if (scope === 'global') {
    return { provenanceStatus: 'verified', $or: [brandOwnership, universalOwnership] };
  }
  return {
    provenanceStatus: 'verified',
    $or: [projectOwnership, brandOwnership, universalOwnership],
  };
}

/**
 * Canonical read predicate for memory allowed to influence authoring. Ownership,
 * provenance, privacy, lifecycle, freshness, and retention are all enforced in
 * Mongo even when candidate IDs originated from an external vector index.
 */
export function buildAuthorizedDataBankReadQuery(
  principalInput: DataBankPrincipal,
  scope?: DataBankScope,
  now = new Date(),
): DataBankOwnershipQuery {
  if (!Number.isFinite(now.getTime())) throw new Error('DataBank read time must be valid.');
  return {
    $and: [
      buildDataBankPrincipalQuery(principalInput),
      buildVerifiedDataBankOwnershipQuery(scope),
      { lifecycleStatus: 'active' },
      { classification: { $in: ['public', 'business_confidential', 'personal'] } },
      { consentStatus: { $in: ['not_required', 'granted'] } },
      {
        $or: [
          { classification: { $ne: 'personal' } },
          { classification: 'personal', consentStatus: 'granted' },
        ],
      },
      {
        $or: [
          { freshUntil: { $exists: false } },
          { freshUntil: null },
          { freshUntil: { $gt: now } },
        ],
      },
      {
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: now } },
        ],
      },
    ],
  };
}

export function getDataBankModel(): Model<any> {
  if (!DataBankModel) {
    DataBankModel = mongoose.models[COLL_DATABANK] || mongoose.model(COLL_DATABANK, DataBankSchema);
  }
  return DataBankModel;
}

/**
 * Persist a DataBank record only after re-authorizing its exact session and
 * deriving ownership from that server-owned session. Callers choose a
 * conservative data classification; they cannot choose the record owner.
 */
export async function addGovernedDataBankEntry(
  principalInput: DataBankPrincipal,
  sessionId: string,
  entry: GovernedDataBankEntryWrite,
): Promise<DataBankEntry> {
  return writeGovernedDataBankEntry(principalInput, sessionId, entry);
}

/**
 * Idempotently persist a governed record for a server-owned operation slot.
 * Reusing a slot with different immutable content is an integrity error.
 */
export async function putGovernedDataBankEntry(
  principalInput: DataBankPrincipal,
  sessionId: string,
  operationKey: string,
  entry: GovernedDataBankEntryWrite,
): Promise<DataBankEntry> {
  return writeGovernedDataBankEntry(principalInput, sessionId, entry, operationKey);
}

async function writeGovernedDataBankEntry(
  principalInput: DataBankPrincipal,
  sessionId: string,
  entry: GovernedDataBankEntryWrite,
  operationKey?: string,
): Promise<DataBankEntry> {
  const principal = resolveDataBankPrincipal(principalInput);
  const normalizedSessionId = dataBankString(sessionId);
  if (!normalizedSessionId) throw new Error('DataBank writes require a session.');

  const session = await getSession(normalizedSessionId, principal.userId, principal.orgId);
  if (!session) throw new Error('DataBank session is unavailable to this actor.');
  assertDataBankSessionPrincipal(principal, session);
  const sessionOrgId = dataBankString(session.orgId);
  if (entry.scope !== 'global' && entry.projectId && entry.projectId !== normalizedSessionId) {
    throw new Error('Project DataBank memory must belong to the authorized session.');
  }

  const authority = resolveDataBankEntryAuthority({
    userId: principal.userId,
    orgId: sessionOrgId,
    ...entry.governance,
  });
  const { governance: _governance, ...recordEntry } = entry;
  return createDataBankEntryRecord(
    normalizedSessionId,
    {
      ...recordEntry,
      projectId: entry.scope === 'global' ? entry.projectId : normalizedSessionId,
    },
    authority,
    operationKey,
  );
}

async function createDataBankEntryRecord(
  sessionId: string,
  entry: DataBankEntryWrite,
  authority: ReturnType<typeof resolveDataBankEntryAuthority>,
  operationKey?: string,
): Promise<DataBankEntry> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const now = new Date();
  const provenance = resolveDataBankEntryProvenance(entry);
  const record: DataBankEntry = {
    _id: operationKey ? buildDataBankIdempotentRecordId(operationKey) : crypto.randomUUID(),
    sessionId: sessionId || undefined,
    projectId: entry.projectId || undefined,
    ...authority,
    type: entry.type,
    scope: provenance.scope,
    memoryScope: provenance.memoryScope,
    brandId: provenance.brandId,
    provenanceStatus: 'verified',
    title: entry.title,
    content: entry.content,
    sourceUrl: entry.sourceUrl,
    sourceEntryId: entry.sourceEntryId,
    tags: provenance.tags,
    embeddingStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  if (!operationKey) {
    const doc = await model.create(record);
    return doc.toObject() as DataBankEntry;
  }

  const persisted = await model.findOneAndUpdate(
    { _id: record._id },
    { $setOnInsert: record },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean() as DataBankEntry | null;
  if (!persisted) throw new Error('DataBank idempotent write did not return a record.');
  assertDataBankIdempotentWriteCompatible(persisted, record, operationKey);
  return persisted;
}

export function buildDataBankIdempotentRecordId(operationKey: string): string {
  const normalizedKey = dataBankString(operationKey);
  if (!normalizedKey || normalizedKey.length > 512) {
    throw new Error('DataBank idempotent writes require an operation key of at most 512 characters.');
  }
  return `tfdb_${generateContentHash({ version: 1, operationKey: normalizedKey }).slice(0, 48)}`;
}

export function assertDataBankIdempotentWriteCompatible(
  persisted: DataBankEntry,
  expected: DataBankEntry,
  operationKey: string,
): void {
  if (dataBankImmutableWriteFingerprint(persisted) !== dataBankImmutableWriteFingerprint(expected)) {
    throw new Error(`DataBank idempotency conflict for operation ${operationKey}.`);
  }
}

function dataBankImmutableWriteFingerprint(entry: DataBankEntry): string {
  return generateContentHash({
    sessionId: dataBankString(entry.sessionId) ?? null,
    projectId: dataBankString(entry.projectId) ?? null,
    userId: dataBankString(entry.userId) ?? null,
    ownerType: dataBankString(entry.ownerType) ?? null,
    orgId: dataBankString(entry.orgId) ?? null,
    classification: dataBankString(entry.classification) ?? null,
    consentStatus: dataBankString(entry.consentStatus) ?? null,
    type: entry.type,
    title: entry.title,
    content: entry.content,
    sourceUrl: dataBankString(entry.sourceUrl) ?? null,
    sourceEntryId: dataBankString(entry.sourceEntryId) ?? null,
  });
}

/** Get all DataBank entries for a session, optionally filtered by type */
export async function getDataBankEntries(
  sessionId: string,
  userId: string,
  type?: DataBankEntryType
): Promise<DataBankEntry[]> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const query: Record<string, any> = {
    sessionId,
    userId,
    ...buildVerifiedDataBankOwnershipQuery(),
  };
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
  const query: Record<string, any> = {
    userId,
    ...buildVerifiedDataBankOwnershipQuery(options?.scope),
  };
  if (options?.type) query.type = options.type;
  if (options?.tags?.length) query.tags = { $in: options.tags };
  if (options?.embeddingStatus) query.embeddingStatus = options.embeddingStatus;
  const docs = await model
    .find(query)
    .sort({ createdAt: -1 })
    .limit(options?.limit ?? 100)
    .lean();
  return docs as unknown as DataBankEntry[];
}

/** Read current workspace memory through exact user/organization authority. */
export async function getAuthorizedDataBankEntries(
  principalInput: DataBankPrincipal,
  options?: {
    type?: DataBankEntryType;
    tags?: string[];
    embeddingStatus?: EmbeddingStatus;
    scope?: DataBankScope;
    limit?: number;
    now?: Date;
  },
): Promise<DataBankEntry[]> {
  await connectToThinkForgeDb();
  const query: Record<string, any> = buildAuthorizedDataBankReadQuery(
    principalInput,
    options?.scope,
    options?.now,
  );
  if (options?.type) query.type = options.type;
  if (options?.tags?.length) query.tags = { $in: options.tags };
  if (options?.embeddingStatus) query.embeddingStatus = options.embeddingStatus;
  const docs = await getDataBankModel()
    .find(query)
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(options?.limit ?? 100, 500)))
    .lean();
  return docs as unknown as DataBankEntry[];
}

/** Get verified project-scoped DataBank entries for a specific session. */
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
    ...buildVerifiedDataBankOwnershipQuery('project'),
  };
  if (options?.type) query.type = options.type;
  const docs = await model
    .find(query)
    .sort({ createdAt: -1 })
    .limit(options?.limit ?? 100)
    .lean();
  return docs as unknown as DataBankEntry[];
}

/** Read current project memory through exact user/organization authority. */
export async function getAuthorizedProjectScopedEntries(
  principalInput: DataBankPrincipal,
  sessionId: string,
  options?: { type?: DataBankEntryType; limit?: number; now?: Date },
): Promise<DataBankEntry[]> {
  await connectToThinkForgeDb();
  const query: Record<string, any> = {
    sessionId,
    ...buildAuthorizedDataBankReadQuery(principalInput, 'project', options?.now),
  };
  if (options?.type) query.type = options.type;
  const docs = await getDataBankModel()
    .find(query)
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(options?.limit ?? 100, 500)))
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
  const doc = await model.findOne({
    _id: entryId,
    userId,
    ...buildVerifiedDataBankOwnershipQuery(),
  }).lean();
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
  const docs = await model.find({
    _id: { $in: entryIds },
    userId,
    ...buildVerifiedDataBankOwnershipQuery(),
  }).lean();
  return docs as unknown as DataBankEntry[];
}

/** Re-authorize vector candidates in Mongo before they can reach a writer. */
export async function getAuthorizedDataBankEntriesByIds(
  entryIds: string[],
  principalInput: DataBankPrincipal,
  now = new Date(),
): Promise<DataBankEntry[]> {
  if (entryIds.length === 0) return [];
  await connectToThinkForgeDb();
  const docs = await getDataBankModel().find({
    _id: { $in: entryIds },
    ...buildAuthorizedDataBankReadQuery(principalInput, undefined, now),
  }).lean();
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
  const query: Record<string, any> = {
    userId,
    embeddingStatus: 'success',
    embedding: { $exists: true },
    ...buildVerifiedDataBankOwnershipQuery(scope),
  };
  const docs = await model
    .find(query)
    .select('_id title tags embedding content sourceUrl type scope memoryScope brandId provenanceStatus')
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
    .find({
      $and: [
        buildVerifiedDataBankOwnershipQuery(),
        { embeddingStatus: 'pending' },
      ],
    })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
  return docs as unknown as DataBankEntry[];
}

const EMBEDDING_MAX_ATTEMPTS = 3;
const EMBEDDING_LEASE_MS = 5 * 60 * 1000;

function retryableEmbeddingQuery(now: Date, maxAttempts: number): Record<string, any> {
  return {
    $or: [
      { embeddingStatus: 'pending' },
      {
        embeddingStatus: 'failed',
        $and: [
          { $or: [{ embeddingAttempts: { $lt: maxAttempts } }, { embeddingAttempts: { $exists: false } }] },
          { $or: [{ embeddingNextRetryAt: { $lte: now } }, { embeddingNextRetryAt: { $exists: false } }] },
        ],
      },
      {
        embeddingStatus: 'processing',
        $or: [
          { embeddingLeaseExpiresAt: { $lte: now } },
          { embeddingLeaseExpiresAt: { $exists: false } },
          { embeddingLeaseExpiresAt: null },
        ],
      },
    ],
  };
}

async function claimDataBankEmbedding(
  filter: Record<string, any>,
  now: Date,
): Promise<DataBankEntry | null> {
  const model = getDataBankModel();
  const doc = await model.findOneAndUpdate(
    filter,
    {
      $set: {
        embeddingStatus: 'processing',
        embeddingLastAttemptAt: now,
        embeddingLeaseExpiresAt: new Date(now.getTime() + EMBEDDING_LEASE_MS),
        updatedAt: now,
      },
      $unset: { embeddingNextRetryAt: '' },
      $inc: { embeddingAttempts: 1 },
    },
    { new: true },
  ).lean();
  return doc as DataBankEntry | null;
}

/** Claim one entry atomically before an immediate embedding attempt. */
export async function claimDataBankEntryForEmbedding(
  entryId: string,
  maxAttempts: number = EMBEDDING_MAX_ATTEMPTS,
): Promise<DataBankEntry | null> {
  await connectToThinkForgeDb();
  const now = new Date();
  return claimDataBankEmbedding({
    _id: entryId,
    $and: [
      buildVerifiedDataBankOwnershipQuery(),
      retryableEmbeddingQuery(now, maxAttempts),
    ],
  }, now);
}

/** Claim a bounded batch for a worker without duplicate concurrent embedding. */
export async function claimDataBankEntriesForEmbedding(
  limit: number = 50,
  maxAttempts: number = EMBEDDING_MAX_ATTEMPTS,
): Promise<DataBankEntry[]> {
  await connectToThinkForgeDb();
  const entries: DataBankEntry[] = [];
  const cappedLimit = Math.max(1, Math.min(limit, 200));

  for (let index = 0; index < cappedLimit; index++) {
    const now = new Date();
    const entry = await claimDataBankEmbedding({
      $and: [
        buildVerifiedDataBankOwnershipQuery(),
        retryableEmbeddingQuery(now, maxAttempts),
      ],
    }, now);
    if (!entry) break;
    entries.push(entry);
  }
  return entries;
}

export async function completeDataBankEmbedding(
  entryId: string,
  vectorId: string,
): Promise<void> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  await model.updateOne(
    { _id: entryId },
    {
      $set: {
        embeddingStatus: 'success',
        embeddingMetadataVersion: DATA_BANK_EMBEDDING_METADATA_VERSION,
        vectorId,
        updatedAt: new Date(),
      },
      $unset: { embeddingLeaseExpiresAt: '', embeddingNextRetryAt: '' },
    },
  );
}

export async function failDataBankEmbedding(
  entryId: string,
  attempt: number,
): Promise<void> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const cappedAttempt = Math.max(1, attempt);
  const retryDelayMs = Math.min(60 * 60 * 1000, 60 * 1000 * 2 ** (cappedAttempt - 1));
  await model.updateOne(
    { _id: entryId },
    {
      $set: {
        embeddingStatus: 'failed',
        embeddingNextRetryAt: new Date(Date.now() + retryDelayMs),
        updatedAt: new Date(),
      },
      $unset: { embeddingLeaseExpiresAt: '' },
    },
  );
}

export interface DataBankProvenanceBackfillResult {
  scanned: number;
  verified: number;
  quarantined: number;
  reembeddingQueued: number;
}

/**
 * Incrementally stamps trusted legacy global records and queues only those
 * records for vector metadata refresh. Ambiguous records are explicitly
 * quarantined so subsequent cron runs progress rather than revisiting them.
 */
export async function backfillDataBankProvenanceAndQueueEmbeddings(
  limit: number = 50,
): Promise<DataBankProvenanceBackfillResult> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const cappedLimit = Math.max(1, Math.min(limit, 200));
  const legacyProvenanceQuery = {
    scope: 'global',
    $or: [
      {
        $and: [
          { memoryScope: { $nin: ['brand', 'universal'] } },
          { $or: [{ provenanceStatus: { $exists: false } }, { provenanceStatus: null }] },
        ],
      },
      {
        $and: [
          { memoryScope: { $in: ['brand', 'universal'] } },
          { embeddingMetadataVersion: { $ne: DATA_BANK_EMBEDDING_METADATA_VERSION } },
          { embeddingStatus: { $in: ['pending', 'success'] } },
        ],
      },
    ],
  };
  const candidates = await model.find(legacyProvenanceQuery)
    .sort({ createdAt: 1, _id: 1 })
    .limit(cappedLimit)
    .lean() as unknown as DataBankEntry[];

  if (candidates.length === 0) {
    return { scanned: 0, verified: 0, quarantined: 0, reembeddingQueued: 0 };
  }

  let verified = 0;
  let quarantined = 0;
  let reembeddingQueued = 0;
  const now = new Date();
  const operations = candidates.map((entry) => {
    const classification = classifyLegacyGlobalDataBankProvenance(entry);
    if (classification.status === 'quarantined') {
      quarantined++;
      return {
        updateOne: {
          filter: { _id: entry._id },
          update: {
            $set: {
              provenanceStatus: 'quarantined',
              provenanceReason: classification.reason,
              updatedAt: now,
            },
          },
        },
      };
    }

    verified++;
    reembeddingQueued++;
    return {
      updateOne: {
        filter: { _id: entry._id },
        update: {
          $set: {
            memoryScope: classification.memoryScope,
            ...(classification.brandId ? { brandId: classification.brandId } : {}),
            provenanceStatus: 'verified',
            embeddingStatus: 'pending',
            tags: classification.tags,
            updatedAt: now,
          },
          $unset: {
            provenanceReason: '',
            embeddingMetadataVersion: '',
            embeddingNextRetryAt: '',
            embeddingLeaseExpiresAt: '',
          },
        },
      },
    };
  });

  await model.bulkWrite(operations, { ordered: false });
  return { scanned: candidates.length, verified, quarantined, reembeddingQueued };
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

/**
 * Owner-approved promotion is the only path that can turn an otherwise
 * unscoped project note into universal memory. Brand-bound entries retain
 * their brand provenance; no inferred brand crosses this boundary.
 */
export async function promoteEntryToGlobal(entryId: string): Promise<void> {
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const existing = await model.findOne({ _id: entryId }).lean() as DataBankEntry | null;
  if (!existing) return;

  const trustedMetadata = trustedPostMortemMetadata(existing.content);
  const brandId = existing.brandId ?? trustedMetadata.brandId;
  const memoryScope: DataBankMemoryScope = brandId ? 'brand' : 'universal';
  const tags = new Set((existing.tags ?? []).map((tag) => tag.trim()).filter(Boolean));
  tags.delete('memory:project');
  tags.add(`memory:${memoryScope}`);
  if (brandId) tags.add(`brand:${brandId}`);

  await model.updateOne(
    { _id: entryId },
    {
      $set: {
        scope: 'global',
        memoryScope,
        ...(brandId ? { brandId } : {}),
        tags: [...tags],
        updatedAt: new Date(),
      },
    },
  );
}

export function buildInteractionEventDeletionQuery(input: {
  projectId: string;
  userId: string,
  eventIds: readonly string[];
}): Record<string, unknown> | null {
  const projectId = dataBankString(input.projectId);
  const userId = dataBankString(input.userId);
  if (!projectId || !userId) {
    throw new Error('Interaction cleanup requires an exact project and user.');
  }
  const eventIds = [...new Set(
    input.eventIds.map(dataBankString).filter((id): id is string => Boolean(id)),
  )];
  if (eventIds.length === 0) return null;
  return { _id: { $in: eventIds }, projectId, userId };
}

/** Delete only interaction events snapshotted by a Post-Mortem run. */
export async function deleteInteractionEventsByIds(
  projectId: string,
  userId: string,
  eventIds: readonly string[],
): Promise<number> {
  const query = buildInteractionEventDeletionQuery({ projectId, userId, eventIds });
  if (!query) return 0;
  const { EventModel } = await getModels();
  const result = await EventModel.deleteMany(query);
  return result.deletedCount ?? 0;
}

export function buildProjectScopedDeletionQuery(input: {
  sessionId: string;
  userId: string;
  entryIds: readonly string[];
}): Record<string, unknown> | null {
  const sessionId = dataBankString(input.sessionId);
  const userId = dataBankString(input.userId);
  if (!sessionId || !userId) {
    throw new Error('Project memory cleanup requires an exact session and user.');
  }
  const entryIds = [...new Set(
    input.entryIds.map(dataBankString).filter((id): id is string => Boolean(id)),
  )];
  if (entryIds.length === 0) return null;
  return {
    _id: { $in: entryIds },
    sessionId,
    userId,
    scope: 'project',
  };
}

/** Delete only the project entries snapshotted by a Post-Mortem run. */
export async function deleteProjectScopedEntries(
  sessionId: string,
  userId: string,
  entryIds: readonly string[],
): Promise<number> {
  const query = buildProjectScopedDeletionQuery({ sessionId, userId, entryIds });
  if (!query) return 0;
  await connectToThinkForgeDb();
  const model = getDataBankModel();
  const result = await model.deleteMany(query);
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
    strict?: boolean;
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
    if (options?.strict) throw error;
    return [];
  }
}
