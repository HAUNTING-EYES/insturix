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

/**
 * Server-issued identity binding for a ThinkForge session. The selected brand
 * cannot change during the session; each document separately snapshots the
 * accepted profile revision used at generation time.
 */
export type ThinkForgeSessionBrandBinding =
  | {
      version: 1;
      brandId: string;
      scope: 'personal' | 'organization';
      boundAt: string;
    }
  | {
      version: 2;
      brandId: string;
      scope: 'personal' | 'organization';
      orgId: string | null;
      boundAt: string;
    };

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
  brandBinding?: ThinkForgeSessionBrandBinding;
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
  'brandBinding',
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
  return resolveThinkForgeSessionBrandBinding(projectMeta)?.brandId
    ?? firstNonEmptyString(projectMeta?.brandId);
}

export function resolveThinkForgeSessionBrandBinding(
  projectMeta?: ProjectMeta | null,
): ThinkForgeSessionBrandBinding | undefined {
  const binding = projectMeta?.brandBinding;
  if (
    !binding
    || (binding.version !== 1 && binding.version !== 2)
    || !firstNonEmptyString(binding.brandId)
    || (binding.scope !== 'personal' && binding.scope !== 'organization')
    || !firstNonEmptyString(binding.boundAt)
  ) {
    return undefined;
  }

  const common = {
    brandId: binding.brandId.trim(),
    scope: binding.scope,
    boundAt: binding.boundAt,
  } as const;
  if (binding.version === 1) return { version: 1, ...common };

  const orgId = firstNonEmptyString(binding.orgId) ?? null;
  if (
    (binding.scope === 'organization' && !orgId)
    || (binding.scope === 'personal' && binding.orgId !== null)
  ) {
    return undefined;
  }
  return { version: 2, ...common, orgId };
}

export function matchesThinkForgeSessionBrandBindingPrincipal(
  bindingInput: ThinkForgeSessionBrandBinding | undefined,
  orgIdInput: string | null | undefined,
): boolean {
  if (!bindingInput) return false;
  const binding = resolveThinkForgeSessionBrandBinding({ brandBinding: bindingInput });
  if (!binding) return false;
  const orgId = firstNonEmptyString(orgIdInput) ?? null;
  if (binding.version === 1) {
    return binding.scope === (orgId ? 'organization' : 'personal');
  }
  return binding.orgId === orgId
    && binding.scope === (orgId ? 'organization' : 'personal');
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
  const existingBinding = resolveThinkForgeSessionBrandBinding(existingProjectMeta);
  const incomingBinding = resolveThinkForgeSessionBrandBinding(incomingProjectMeta);
  const existingDirectBrandId = firstNonEmptyString(existingProjectMeta?.brandId);
  const incomingDirectBrandId = firstNonEmptyString(incomingProjectMeta?.brandId);
  const existingBrandId = existingBinding?.brandId ?? existingDirectBrandId;
  const incomingBrandId = incomingBinding?.brandId ?? incomingDirectBrandId;

  if (existingBinding && existingDirectBrandId && existingBinding.brandId !== existingDirectBrandId) {
    throw new Error('ThinkForge session contains conflicting brand authority. Re-open the session before editing metadata.');
  }
  if (incomingBinding && incomingDirectBrandId && incomingBinding.brandId !== incomingDirectBrandId) {
    throw new Error('ThinkForge session metadata contains conflicting brand authority.');
  }

  if (existingBrandId && incomingBrandId && existingBrandId !== incomingBrandId) {
    throw new Error('ThinkForge session brand binding cannot be changed. Create a new session to select a different brand.');
  }

  const { brandBinding: _incomingBinding, ...incomingWithoutBinding } = incomingProjectMeta || {};
  const merged = mergeThinkForgeProjectMetadata(existingProjectMeta, incomingWithoutBinding);
  // Never persist an unversioned browser scan as brand authority. Existing rows
  // are normalized on their next write; the accepted Brand Vault record wins.
  const { brandBrief: _legacyBrandBrief, brandBinding: _mergedBinding, ...metadata } = merged;
  const authoritativeBinding = existingBinding?.version === 2
    ? existingBinding
    : incomingBinding?.version === 2
      ? incomingBinding
      : existingBinding ?? incomingBinding;
  const authoritativeBrandId = authoritativeBinding?.brandId ?? existingBrandId ?? incomingBrandId;
  if (!authoritativeBrandId) return metadata;

  return {
    ...metadata,
    brandId: authoritativeBrandId,
    ...(authoritativeBinding ? { brandBinding: authoritativeBinding } : {}),
  };
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

