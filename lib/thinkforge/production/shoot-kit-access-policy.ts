import {
  ThinkForgeDocumentContractSchema,
  type ThinkForgeDocumentContract,
} from '@/lib/thinkforge/schemas/document-contract';

export type ThinkForgeShootKitAccessDecision =
  | {
      allowed: true;
      contentContract: ThinkForgeDocumentContract;
    }
  | {
      allowed: false;
      code: 'shoot_kit_document_contract_invalid' | 'shoot_kit_not_applicable';
      message: string;
      status: 409 | 422;
    };

/**
 * Shoot Kit eligibility comes only from the exact persisted document contract.
 * Session metadata, idea labels, and visible prose are never classification authority.
 */
export function resolveThinkForgeShootKitAccess(
  contentContract: unknown,
): ThinkForgeShootKitAccessDecision {
  const parsed = ThinkForgeDocumentContractSchema.safeParse(contentContract);
  if (!parsed.success) {
    return {
      allowed: false,
      code: 'shoot_kit_document_contract_invalid',
      message: 'The saved document does not have a valid content contract. Regenerate or migrate it before opening Shoot Kit.',
      status: 422,
    };
  }
  if (parsed.data.outputKind !== 'video_script') {
    return {
      allowed: false,
      code: 'shoot_kit_not_applicable',
      message: 'Shoot Kit is available only for saved video-script documents.',
      status: 409,
    };
  }
  return { allowed: true, contentContract: parsed.data };
}
