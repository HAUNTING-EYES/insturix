import {
  ThinkForgeDocumentContractSchema,
  type ThinkForgeDocumentContract,
} from '@/lib/thinkforge/schemas/document-contract';

export type ThinkForgeExportDestination = 'clickatron' | 'editron';

export type ThinkForgeExportDestinationDecision =
  | {
      allowed: true;
      contentContract: ThinkForgeDocumentContract;
    }
  | {
      allowed: false;
      code: 'export-document-contract-invalid' | 'export-destination-incompatible';
      message: string;
      status: 409 | 422;
    };

function incompatibleDestinationMessage(
  contract: ThinkForgeDocumentContract,
  destination: ThinkForgeExportDestination,
): string {
  if (contract.outputKind === 'video_script') {
    return 'Video scripts can be exported to Editron, not Clickatron.';
  }
  if (contract.outputKind === 'social_post' || contract.outputKind === 'carousel') {
    return 'Posts and carousels can be exported to Clickatron, not Editron.';
  }
  return `Written documents cannot be exported to ${destination === 'clickatron' ? 'Clickatron' : 'Editron'}.`;
}

/**
 * Authorizes an export from the exact saved document contract. Session metadata
 * and client-selected controls are intentionally not accepted as authority.
 */
export function resolveThinkForgeExportDestination(
  contentContract: unknown,
  destination: ThinkForgeExportDestination,
): ThinkForgeExportDestinationDecision {
  const parsed = ThinkForgeDocumentContractSchema.safeParse(contentContract);
  if (!parsed.success) {
    return {
      allowed: false,
      code: 'export-document-contract-invalid',
      message: 'The saved document does not have a valid content contract. Regenerate or migrate it before exporting.',
      status: 422,
    };
  }

  const allowed = destination === 'clickatron'
    ? parsed.data.outputKind === 'social_post' || parsed.data.outputKind === 'carousel'
    : parsed.data.outputKind === 'video_script';
  if (!allowed) {
    return {
      allowed: false,
      code: 'export-destination-incompatible',
      message: incompatibleDestinationMessage(parsed.data, destination),
      status: 409,
    };
  }

  return { allowed: true, contentContract: parsed.data };
}
