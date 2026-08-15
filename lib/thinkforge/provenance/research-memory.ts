import { addGovernedDataBankEntry, type DataBankPrincipal } from '../services/db';
import { inspectDataForStorage } from '../privacy/provider-privacy-gateway';

export class ResearchMemoryPolicyError extends Error {
  constructor(public readonly code: 'child_data' | 'personal_data') {
    super(
      code === 'child_data'
        ? 'Research memory contains child data and requires an approved consent workflow.'
        : 'Research memory contains personal data and requires explicit consent.',
    );
    this.name = 'ResearchMemoryPolicyError';
  }
}

export async function persistGroundedResearchMemory(input: {
  principal: DataBankPrincipal;
  sessionId: string;
  query: string;
  response: string;
  verifiedSources: Array<{ title: string; url: string }>;
}) {
  const storageInspection = inspectDataForStorage({
    text: JSON.stringify({
      query: input.query,
      response: input.response,
      verifiedSources: input.verifiedSources,
    }),
  });
  if (storageInspection.privacyClass === 'child_data') {
    throw new ResearchMemoryPolicyError('child_data');
  }
  if (storageInspection.containsPersonalData || storageInspection.privacyClass === 'personal') {
    throw new ResearchMemoryPolicyError('personal_data');
  }

  return addGovernedDataBankEntry(input.principal, input.sessionId, {
    type: 'research',
    title: `Research: ${input.query.substring(0, 80)}`,
    content: {
      query: input.query,
      response: input.response,
      verifiedSources: input.verifiedSources,
    },
    tags: ['auto-research'],
    projectId: input.sessionId,
    scope: 'project',
    governance: {
      classification: storageInspection.privacyClass,
      consentStatus: 'not_required',
    },
  });
}
