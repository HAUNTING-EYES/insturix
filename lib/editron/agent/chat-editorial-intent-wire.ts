import { z } from 'zod';

import {
  EDITORIAL_FAMILIES,
  type EditorialFamily,
  type EditorialFamilyPreference,
} from '@/lib/editron/production-brief/editorial-preferences';
import { CHAT_SCRIPT_MAX_CHARS } from '@/lib/editron/services/chat-script-recomposition';

import type { ChatEditorialIntentInput } from './chat-editorial-intent-tools';

const familyModeSchema = z.enum(['off', 'prefer']);

/**
 * Model-facing contract. It is deliberately flat: Gemini only has to emit
 * scalars and one overlay-id array. The richer internal shape is assembled
 * deterministically after validation.
 */
export const chatEditorialIntentWireSchema = z.object({
  goal: z.string().min(1).max(1_200),
  scopeKind: z.enum(['project', 'selection', 'moment']).default('project'),
  startFrame: z.number().int().min(0).optional(),
  endFrame: z.number().int().positive().optional(),
  overlayIds: z.array(z.union([z.string(), z.number()])).max(24).optional(),
  targetReference: z.string().min(1).max(600).optional(),
  constraintsText: z.string().min(1).max(6_000).optional()
    .describe('Optional constraints, one per line. Preserve user wording.'),
  strength: z.number().min(0).max(1).default(0.5)
    .describe('Requested restraint or expressiveness. Context only, never execution confidence.'),
  uncertainty: z.number().min(0).max(1).default(0)
    .describe('Uncertainty in interpreting the request, not evidence confidence.'),
  captionsMode: familyModeSchema.optional(),
  captionsFrequency: z.number().min(0).max(1).optional(),
  captionsIntensity: z.number().min(0).max(1).optional(),
  motionGraphicsMode: familyModeSchema.optional(),
  motionGraphicsFrequency: z.number().min(0).max(1).optional(),
  motionGraphicsIntensity: z.number().min(0).max(1).optional(),
  zoomMode: familyModeSchema.optional(),
  zoomFrequency: z.number().min(0).max(1).optional(),
  zoomIntensity: z.number().min(0).max(1).optional(),
  transitionsMode: familyModeSchema.optional(),
  transitionsFrequency: z.number().min(0).max(1).optional(),
  transitionsIntensity: z.number().min(0).max(1).optional(),
  sfxMode: familyModeSchema.optional(),
  sfxFrequency: z.number().min(0).max(1).optional(),
  sfxIntensity: z.number().min(0).max(1).optional(),
  musicMode: familyModeSchema.optional(),
  musicFrequency: z.number().min(0).max(1).optional(),
  musicIntensity: z.number().min(0).max(1).optional(),
  musicPrompt: z.string().min(1).max(500).optional(),
  notes: z.string().min(1).max(500).optional(),
  scriptText: z.string().min(1).max(CHAT_SCRIPT_MAX_CHARS).optional()
    .describe('Exact user-supplied script text. Omit when the user supplied no script.'),
  autoDirectorConfirmed: z.boolean().default(false)
    .describe('Director Mode (assist) projects only: set true ONLY after the user, in this conversation, explicitly confirmed handing this request to Auto-Director. Never set it on the first call.'),
}).strict();

export type ChatEditorialIntentWireInput = z.infer<typeof chatEditorialIntentWireSchema>;

const FAMILY_PREFIX = {
  captions: 'captions',
  motionGraphics: 'motionGraphics',
  zoom: 'zoom',
  transitions: 'transitions',
  sfx: 'sfx',
  music: 'music',
} as const satisfies Record<EditorialFamily, string>;

const ABSENT_SCRIPT_SENTINELS = new Set([
  'none',
  '(none)',
  'none provided',
  '(none provided)',
  'null',
  'undefined',
  'n/a',
  'not applicable',
]);

export function normalizeChatEditorialIntentWireAliases(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const args = { ...(input as Record<string, unknown>) };

  normalizeLegacyScope(args);
  normalizeLegacyConstraints(args);
  normalizeLegacyFamilies(args);
  normalizeLegacyScript(args);
  normalizeKnownNumericStrings(args);
  return args;
}

export function compileChatEditorialIntentWire(
  input: ChatEditorialIntentWireInput,
  context: { userTurnText?: string } = {},
): ChatEditorialIntentInput {
  if (
    input.startFrame !== undefined
    && input.endFrame !== undefined
    && input.endFrame <= input.startFrame
  ) {
    throw wireValidationError('endFrame', 'endFrame must be greater than startFrame.');
  }

  const constraints = parseConstraints(input.constraintsText);
  const families = buildFamilyPreferences(input);
  const script = normalizeOptionalChatScript(input.scriptText);
  if (script && !isScriptGroundedInUserTurn(script, context.userTurnText)) {
    throw wireValidationError(
      'scriptText',
      'scriptText must be copied from the current user message or an attachment explicitly marked as script.',
    );
  }

  return {
    goal: input.goal,
    scope: {
      kind: input.scopeKind,
      ...(input.startFrame !== undefined ? { startFrame: input.startFrame } : {}),
      ...(input.endFrame !== undefined ? { endFrame: input.endFrame } : {}),
      ...(input.overlayIds?.length ? { overlayIds: input.overlayIds } : {}),
    },
    ...(input.targetReference ? { targetReference: input.targetReference } : {}),
    constraints,
    strength: input.strength,
    uncertainty: input.uncertainty,
    ...(Object.keys(families).length > 0 ? { families } : {}),
    ...(input.musicPrompt ? { musicPrompt: input.musicPrompt } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(script ? { script } : {}),
    autoDirectorConfirmed: input.autoDirectorConfirmed,
  };
}

export function normalizeOptionalChatScript(value: string | undefined): string | undefined {
  const script = typeof value === 'string' ? value.trim().slice(0, CHAT_SCRIPT_MAX_CHARS) : '';
  if (!script) return undefined;
  return ABSENT_SCRIPT_SENTINELS.has(script.toLocaleLowerCase()) ? undefined : script;
}

function buildFamilyPreferences(
  input: ChatEditorialIntentWireInput,
): NonNullable<ChatEditorialIntentInput['families']> {
  const source = input as Record<string, unknown>;
  const families: NonNullable<ChatEditorialIntentInput['families']> = {};

  for (const family of EDITORIAL_FAMILIES) {
    const prefix = FAMILY_PREFIX[family];
    const mode = source[`${prefix}Mode`] as EditorialFamilyPreference['mode'] | undefined;
    const frequency = source[`${prefix}Frequency`] as number | undefined;
    const intensity = source[`${prefix}Intensity`] as number | undefined;
    if (!mode && (frequency !== undefined || intensity !== undefined)) {
      throw wireValidationError(`${prefix}Mode`, `${prefix}Mode is required when frequency or intensity is set.`);
    }
    if (mode === 'off' && (frequency !== undefined || intensity !== undefined)) {
      throw wireValidationError(`${prefix}Mode`, `${prefix} frequency/intensity cannot be set when the family is off.`);
    }
    if (!mode) continue;
    families[family] = {
      mode,
      ...(frequency !== undefined ? { frequency } : {}),
      ...(intensity !== undefined ? { intensity } : {}),
    };
  }

  return families;
}

function parseConstraints(value: string | undefined): string[] {
  if (!value) return [];
  const constraints = value.split(/\r?\n+/).map((entry) => entry.trim()).filter(Boolean);
  if (constraints.length > 20) {
    throw wireValidationError('constraintsText', 'At most 20 newline-separated constraints are allowed.');
  }
  const oversized = constraints.findIndex((entry) => entry.length > 300);
  if (oversized >= 0) {
    throw wireValidationError(
      'constraintsText',
      `Constraint ${oversized + 1} exceeds the 300-character limit.`,
    );
  }
  return constraints;
}

function isScriptGroundedInUserTurn(script: string, userTurnText: string | undefined): boolean {
  if (!userTurnText) return false;
  const normalizedScript = normalizeForGrounding(script);
  if (!normalizedScript) return false;

  const attachmentMarker = userTurnText.indexOf('<authorized_chat_attachments>');
  const inlineText = attachmentMarker >= 0 ? userTurnText.slice(0, attachmentMarker) : userTurnText;
  if (normalizeForGrounding(inlineText).includes(normalizedScript)) return true;

  const scriptAttachmentIds = new Set(
    parseTaggedJsonLines(userTurnText, 'authorized_chat_attachments')
      .filter((record) => record.role === 'script')
      .map((record) => String(record.attachmentId ?? ''))
      .filter(Boolean),
  );
  return parseTaggedJsonLines(userTurnText, 'untrusted_reference_content').some((record) => {
    const attachmentId = String(record.attachmentId ?? '');
    const excerpt = typeof record.contentExcerpt === 'string' ? record.contentExcerpt : '';
    return scriptAttachmentIds.has(attachmentId)
      && normalizeForGrounding(excerpt).includes(normalizedScript);
  });
}

function parseTaggedJsonLines(text: string, tag: string): Record<string, unknown>[] {
  const match = text.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`));
  if (!match?.[1]) return [];
  return match[1].split(/\r?\n/).flatMap((line) => {
    try {
      const value = JSON.parse(line);
      return value && typeof value === 'object' && !Array.isArray(value)
        ? [value as Record<string, unknown>]
        : [];
    } catch {
      return [];
    }
  });
}

function normalizeForGrounding(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeLegacyScope(args: Record<string, unknown>): void {
  if (!('scope' in args)) return;
  const scope = args.scope;
  if (typeof scope === 'string') {
    if (!('scopeKind' in args)) args.scopeKind = scope;
    delete args.scope;
    return;
  }
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return;
  const record = scope as Record<string, unknown>;
  const allowed = new Set(['kind', 'startFrame', 'endFrame', 'overlayIds']);
  if (Object.keys(record).some((key) => !allowed.has(key))) return;
  if (!('scopeKind' in args) && record.kind !== undefined) args.scopeKind = record.kind;
  if (!('startFrame' in args) && record.startFrame !== undefined) args.startFrame = record.startFrame;
  if (!('endFrame' in args) && record.endFrame !== undefined) args.endFrame = record.endFrame;
  if (!('overlayIds' in args) && record.overlayIds !== undefined) args.overlayIds = record.overlayIds;
  delete args.scope;
}

function normalizeLegacyConstraints(args: Record<string, unknown>): void {
  if (!('constraints' in args) || 'constraintsText' in args) return;
  const constraints = args.constraints;
  if (typeof constraints === 'string') {
    args.constraintsText = constraints;
    delete args.constraints;
  } else if (Array.isArray(constraints) && constraints.every((entry) => typeof entry === 'string')) {
    args.constraintsText = constraints.join('\n');
    delete args.constraints;
  }
}

function normalizeLegacyFamilies(args: Record<string, unknown>): void {
  if (!('families' in args)) return;
  const families = args.families;
  const mapped = new Map<EditorialFamily, EditorialFamilyPreference>();

  if (typeof families === 'string') {
    if (!isEditorialFamily(families)) return;
    mapped.set(families, { mode: 'prefer' });
  } else if (Array.isArray(families)) {
    if (!families.every(isEditorialFamily)) return;
    for (const family of families) mapped.set(family, { mode: 'prefer' });
  } else if (families && typeof families === 'object') {
    for (const [key, rawPreference] of Object.entries(families as Record<string, unknown>)) {
      if (!isEditorialFamily(key)) return;
      if (typeof rawPreference === 'string') {
        if (rawPreference === 'auto') continue;
        if (rawPreference !== 'off' && rawPreference !== 'prefer') return;
        mapped.set(key, { mode: rawPreference });
        continue;
      }
      if (!rawPreference || typeof rawPreference !== 'object' || Array.isArray(rawPreference)) return;
      const preference = rawPreference as Record<string, unknown>;
      if (Object.keys(preference).some((field) => !['mode', 'frequency', 'intensity'].includes(field))) return;
      if (preference.mode === 'auto') continue;
      if (preference.mode !== 'off' && preference.mode !== 'prefer') return;
      if (preference.frequency !== undefined && !isNumericValue(preference.frequency)) return;
      if (preference.intensity !== undefined && !isNumericValue(preference.intensity)) return;
      mapped.set(key, {
        mode: preference.mode,
        ...(preference.frequency !== undefined ? { frequency: Number(preference.frequency) } : {}),
        ...(preference.intensity !== undefined ? { intensity: Number(preference.intensity) } : {}),
      });
    }
  } else {
    return;
  }

  for (const [family, preference] of mapped) {
    const prefix = FAMILY_PREFIX[family];
    if (!(`${prefix}Mode` in args)) args[`${prefix}Mode`] = preference.mode;
    if (preference.frequency !== undefined && !(`${prefix}Frequency` in args)) {
      args[`${prefix}Frequency`] = preference.frequency;
    }
    if (preference.intensity !== undefined && !(`${prefix}Intensity` in args)) {
      args[`${prefix}Intensity`] = preference.intensity;
    }
  }
  delete args.families;
}

function normalizeLegacyScript(args: Record<string, unknown>): void {
  if (!('script' in args) || 'scriptText' in args || typeof args.script !== 'string') return;
  args.scriptText = args.script;
  delete args.script;
}

function normalizeKnownNumericStrings(args: Record<string, unknown>): void {
  const numericFields = new Set([
    'startFrame',
    'endFrame',
    'strength',
    'uncertainty',
    ...EDITORIAL_FAMILIES.flatMap((family) => {
      const prefix = FAMILY_PREFIX[family];
      return [`${prefix}Frequency`, `${prefix}Intensity`];
    }),
  ]);
  for (const field of numericFields) {
    const value = args[field];
    if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
      args[field] = Number(value);
    }
  }
}

function isNumericValue(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
    || typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim());
}

function isEditorialFamily(value: unknown): value is EditorialFamily {
  return typeof value === 'string' && (EDITORIAL_FAMILIES as readonly string[]).includes(value);
}

function wireValidationError(path: string, message: string): z.ZodError {
  return new z.ZodError([{
    code: z.ZodIssueCode.custom,
    path: [path],
    message,
  }]);
}
