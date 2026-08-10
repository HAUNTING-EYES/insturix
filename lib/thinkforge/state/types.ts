/**
 * Session state types for ThinkForge
 */

import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import {
  normalizeThinkForgeDocumentContract,
  ThinkForgeDocumentContractSchema,
  type ThinkForgeCanonicalDocumentType,
  type ThinkForgeDocumentContract,
  type ThinkForgeLegacyDocumentType,
} from '../schemas/document-contract';
import type { ScriptIntent } from '../protocol/intent';
import type { SelectedTrend } from '../trends/selected-trend';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts?: number;
  createdAt?: Date;
  _id?: string;
  id?: string;
}

export interface IdeaCardData {
  id: string;
  idea: string;
  purpose: string;
  style: string;
  format: string;
  platform: string;
  tone: string;
  durationSec?: number;
  sessionName?: string;
  brandId?: string;
  brandBrief?: string;
  clientId?: string;
  clientName?: string;
  campaignId?: string;
  campaignName?: string;
  seriesId?: string;
  calendarItemId?: string;
  contentCardId?: string;
}

export interface ProjectMeta {
  idea?: string;
  projectName?: string;
  title?: string;
  purpose?: string;
  style?: string;
  format?: string;
  contentContract?: ThinkForgeDocumentContract;
  platform?: string;
  tone?: string;
  durationSec?: number;
  sessionName?: string;
  brandId?: string;
  brandBrief?: string;
  clientId?: string;
  clientName?: string;
  campaignId?: string;
  campaignName?: string;
  seriesId?: string;
  calendarItemId?: string;
  contentCardId?: string;
  selectedTrend?: SelectedTrend;
  preferences?: Record<string, any>;
}

const SOURCE_OF_TRUTH_PROJECT_META_KEYS: Array<keyof ProjectMeta> = [
  'brandId',
  'brandBrief',
  'clientId',
  'clientName',
  'campaignId',
  'campaignName',
  'seriesId',
  'calendarItemId',
  'contentCardId',
];

function hasProjectMetaValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

export function resolveProjectMetaContentContract(
  projectMeta?: ProjectMeta | null,
): ThinkForgeDocumentContract | null {
  if (projectMeta?.contentContract !== undefined) {
    const parsed = ThinkForgeDocumentContractSchema.safeParse(projectMeta.contentContract);
    if (!parsed.success) {
      throw new Error('ThinkForge project metadata contains an invalid document contract');
    }
    return parsed.data;
  }
  return normalizeThinkForgeDocumentContract(projectMeta?.format);
}

export function mergeThinkForgeProjectMetadata(
  sessionProjectMeta?: ProjectMeta | null,
  providedProject?: ProjectMeta | null,
  preferences?: Record<string, any>,
): ProjectMeta {
  const merged: ProjectMeta = {
    ...(sessionProjectMeta || {}),
    ...(providedProject || {}),
  };

  const contentContract = resolveProjectMetaContentContract(sessionProjectMeta)
    ?? resolveProjectMetaContentContract(providedProject);
  if (contentContract) {
    merged.contentContract = contentContract;
  }

  for (const key of SOURCE_OF_TRUTH_PROJECT_META_KEYS) {
    const providedValue = providedProject?.[key];
    const sessionValue = sessionProjectMeta?.[key];
    if (!hasProjectMetaValue(providedValue) && hasProjectMetaValue(sessionValue)) {
      (merged as Record<string, unknown>)[key] = sessionValue;
    }
  }

  if (preferences) {
    merged.preferences = preferences;
  }

  return merged;
}

export function resolveProjectMetaBrandId(projectMeta?: ProjectMeta | null): string | undefined {
  return firstNonEmptyString(projectMeta?.brandId);
}

/**
 * Produces the only project metadata shape that may be persisted for an
 * existing ThinkForge session. Session refreshes routinely send partial
 * client state; replacing the stored object would silently discard its brand
 * authority, selected trend, and campaign lineage.
 */
export function resolvePersistedThinkForgeProjectMetadata(
  existingProjectMeta?: ProjectMeta | null,
  incomingProjectMeta?: ProjectMeta | null,
): ProjectMeta {
  const existingBrandId = resolveProjectMetaBrandId(existingProjectMeta);
  const incomingBrandId = resolveProjectMetaBrandId(incomingProjectMeta);

  if (existingBrandId && incomingBrandId && existingBrandId !== incomingBrandId) {
    throw new Error('ThinkForge session brand binding cannot be changed. Create a new session to select a different brand.');
  }

  const merged = mergeThinkForgeProjectMetadata(existingProjectMeta, incomingProjectMeta);
  const authoritativeBrandId = existingBrandId ?? incomingBrandId;
  if (!authoritativeBrandId) return merged;

  // A resolved Brand Vault profile is the authority for bound sessions. Never
  // keep a browser-provided free-text scan that can become stale beside it.
  const { brandBrief: _legacyBrandBrief, ...metadata } = merged;
  return { ...metadata, brandId: authoritativeBrandId };
}

// ---------------------------------------------------------------------------
// Document Type & Complexity (Dynamic Blueprints)
// ---------------------------------------------------------------------------

/** New writes use canonical document values. Legacy aliases remain readable during migration. */
export type DocumentType = ThinkForgeCanonicalDocumentType | ThinkForgeLegacyDocumentType;

export type ProjectComplexity = 'solo_ugc' | 'brand_doc' | 'short_film' | 'feature_film' | 'epic';

export interface ScriptState {
  title: string;
  blocks: ThinkForgeBlock[];
  content: string;
  richText?: any;
  draft: boolean;
  version: number;
  documentType?: DocumentType;
  parentScriptId?: string;
  forkReason?: string;
  createdFromIntent?: ScriptIntent;
}

export interface SessionState {
  sessionId: string;
  userId: string;
  chat: ChatMessage[];
  script: ScriptState | null;
  /** All documents in this session (multi-tab support) */
  documents: ScriptState[];
  /** Active document ID for the editor */
  activeDocumentId?: string;
  ideas: IdeaCardData[];
  metadata: ProjectMeta;
  /** Detected project complexity level */
  complexity?: ProjectComplexity;
  version: number;
  lastUpdated: Date;
}

// ---------------------------------------------------------------------------
// Sidecar Card Types (for structured agent outputs in the chat panel)
// ---------------------------------------------------------------------------

export type SidecarCardType =
  | 'asset'
  | 'context'
  | 'decision'
  | 'error'
  | 'action'
  | 'suggestion'
  | 'specialist_result';

export interface SidecarCard {
  id: string;
  type: SidecarCardType;
  title: string;
  body?: string;
  data?: Record<string, any>;
  actions?: SidecarCardAction[];
  dismissible?: boolean;
  timestamp?: number;
}

export interface SidecarCardAction {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  payload?: Record<string, any>;
}

