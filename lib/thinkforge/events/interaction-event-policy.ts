import { z } from 'zod';
import type { EventType } from '@/lib/thinkforge/services/db';
import {
  assessObserverTextPrivacy,
  type ObserverTextPrivacyRejectionReason,
} from './observer-memory-policy';

export const INTERACTION_EVENT_TYPES = [
  'content_deleted',
  'hook_rejected',
  'style_corrected',
  'regeneration_requested',
  'feedback_given',
] as const satisfies readonly EventType[];

export type InteractionEventType = typeof INTERACTION_EVENT_TYPES[number];

type InteractionPayloadAdmission =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; reason: 'invalid_interaction_payload' | ObserverTextPrivacyRejectionReason };

const ShortTextSchema = z.string().trim().min(1).max(500);
const PayloadSchemas = {
  content_deleted: z.object({
    charsDeleted: z.number().int().positive().max(1_000_000),
  }).strict(),
  hook_rejected: z.object({ reason: ShortTextSchema.optional() }).strict(),
  style_corrected: z.object({ feedback: ShortTextSchema }).strict(),
  regeneration_requested: z.object({ followUpPrompt: ShortTextSchema.optional() }).strict(),
  feedback_given: z.object({ feedback: ShortTextSchema.optional() }).strict(),
} satisfies Record<InteractionEventType, z.ZodTypeAny>;

export function admitInteractionEventPayload(
  type: InteractionEventType,
  value: unknown,
): InteractionPayloadAdmission {
  const parsed = PayloadSchemas[type].safeParse(value);
  if (!parsed.success) return { ok: false, reason: 'invalid_interaction_payload' };

  const payload = parsed.data as Record<string, unknown>;
  const text = interactionPayloadText(type, payload);
  if (text) {
    const privacy = assessObserverTextPrivacy(text);
    if (!privacy.allowed) return { ok: false, reason: privacy.reason };
  }

  switch (type) {
    case 'content_deleted':
      return { ok: true, payload: { charsDeleted: payload.charsDeleted } };
    case 'hook_rejected':
      return { ok: true, payload: optionalTextPayload('reason', payload.reason) };
    case 'style_corrected':
    case 'feedback_given':
      return { ok: true, payload: optionalTextPayload('feedback', payload.feedback) };
    case 'regeneration_requested':
      return { ok: true, payload: {} };
  }
}

function interactionPayloadText(type: InteractionEventType, payload: Record<string, unknown>): string | undefined {
  if (type === 'hook_rejected') return stringValue(payload.reason);
  if (type === 'style_corrected' || type === 'feedback_given') return stringValue(payload.feedback);
  return undefined;
}

function optionalTextPayload(key: string, value: unknown): Record<string, unknown> {
  const text = stringValue(value);
  return text ? { [key]: text } : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
