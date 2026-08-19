import {
  requireCalosWriterInvocationTrace,
  type ThinkForgeGeneratedArtifact,
} from "@/lib/calos/generate/contract";
import { createThinkForgeSessionBrandBinding } from "@/lib/thinkforge/context/brand-authoring-context";
import { hashJsonArtifact } from "@/lib/thinkforge/persistence/script-sidecar-binding";
import { verifyWriterOutputBinding } from "@/lib/thinkforge/persistence/writer-output-binding";
import {
  createThinkForgeWriterContract,
  ThinkForgeDocumentContractSchema,
  type ThinkForgeDocumentContract,
} from "@/lib/thinkforge/schemas/document-contract";
import { applyCommand } from "@/lib/thinkforge/services/command-service";
import * as db from "@/lib/thinkforge/services/db";
import type { ProjectMeta } from "@/lib/thinkforge/state/types";

export interface CreateLinkedSessionParams {
  userId: string;
  orgId: string | null;
  brandId: string;
  deliverableId: string;
  campaignId: string | null;
  format: string;
  platform: string;
  title: string;
  artifact: ThinkForgeGeneratedArtifact;
}

function contractsMatch(left: ThinkForgeDocumentContract, right: ThinkForgeDocumentContract): boolean {
  return left.version === right.version
    && left.documentKind === right.documentKind
    && left.outputKind === right.outputKind
    && left.artifactType === right.artifactType;
}

function writerOutputRecord(artifact: ThinkForgeGeneratedArtifact): Record<string, unknown> {
  return artifact.writerOutput as unknown as Record<string, unknown>;
}

function artifactPersistenceHash(input: {
  artifact: ThinkForgeGeneratedArtifact;
  deliverableId: string;
  campaignId: string | null;
  format: string;
  platform: string;
  title: string;
}): string {
  return hashJsonArtifact({
    content: input.artifact.content,
    documentType: input.artifact.documentType,
    contentContract: input.artifact.contentContract,
    briefSnapshot: input.artifact.briefSnapshot,
    authoringContextSnapshot: input.artifact.authoringContextSnapshot,
    signalTrace: input.artifact.signalTrace,
    writerOutput: input.artifact.writerOutput,
    calos: {
      deliverableId: input.deliverableId,
      campaignId: input.campaignId,
      format: input.format,
      platform: input.platform,
    },
    title: input.title,
  });
}

function validateArtifact(params: CreateLinkedSessionParams): ThinkForgeDocumentContract {
  const artifact = params.artifact;
  if (!params.userId.trim() || !params.brandId.trim() || !params.deliverableId.trim()) {
    throw new Error("CalOS user, brand, and deliverable authority are required for ThinkForge persistence.");
  }
  if (!artifact.content.trim()) throw new Error("CalOS writer artifact content is empty.");
  if (!params.title.trim()) throw new Error("CalOS content-card title is required for ThinkForge persistence.");
  if (!params.platform.trim() || !params.format.trim()) {
    throw new Error("CalOS format and platform are required for ThinkForge persistence.");
  }

  const contract = ThinkForgeDocumentContractSchema.parse(artifact.contentContract);
  const expected = createThinkForgeWriterContract(artifact.documentType);
  if (!contractsMatch(contract, expected)) {
    throw new Error("CalOS writer artifact conflicts with its declared ThinkForge document type.");
  }
  const expectedWriterType = artifact.documentType === "video_script" ? "script" : "post";
  if (artifact.writerOutput.writerType !== expectedWriterType) {
    throw new Error("CalOS writer artifact carries the wrong writer output family.");
  }
  const writerTraceValue = artifact.writerOutput.writerTrace;
  const editorialPlan = writerTraceValue && typeof writerTraceValue === "object" && !Array.isArray(writerTraceValue)
    ? (writerTraceValue as Record<string, unknown>).editorialPlan
    : null;
  requireCalosWriterInvocationTrace({
    value: writerTraceValue,
    writerType: expectedWriterType,
    editorialPlan,
    sourceLedger: artifact.writerOutput.sourceLedger,
  });
  const brandRevision = artifact.authoringContextSnapshot.brand;
  if (brandRevision?.brandId?.trim() !== params.brandId.trim()
    || !brandRevision.recordId?.trim()
    || !brandRevision.profileUpdatedAt?.trim()
    || !/^[a-f0-9]{64}$/.test(brandRevision.profileFingerprint)) {
    throw new Error("CalOS writer artifact brand revision does not match the requested brand.");
  }
  const expectedScope = params.orgId?.trim() ? "organization" : "personal";
  if (artifact.authoringContextSnapshot.scope.kind !== expectedScope) {
    throw new Error("CalOS writer artifact scope does not match the active principal.");
  }
  return contract;
}

/**
 * Persist a CalOS writer result as a first-class ThinkForge document. The canonical artifact is the
 * source of truth; visible copy is never used to reconstruct hidden prompts, provenance, or sidecars.
 */
export async function createLinkedThinkForgeSession(
  params: CreateLinkedSessionParams,
): Promise<string> {
  const {
    userId,
    orgId,
    brandId,
    deliverableId,
    campaignId,
    format,
    platform,
    title,
    artifact,
  } = params;
  const contentContract = validateArtifact(params);
  const normalizedUserId = userId.trim();
  const normalizedOrgId = orgId?.trim() || null;
  const normalizedBrandId = brandId.trim();
  const normalizedDeliverableId = deliverableId.trim();
  const normalizedCampaignId = campaignId?.trim() || null;
  const normalizedFormat = format.trim();
  const normalizedPlatform = platform.trim();
  const normalizedTitle = title.trim();
  const targetDurationSec = artifact.briefSnapshot.output.targetDurationSec;
  const projectMeta: ProjectMeta = {
    title: normalizedTitle,
    brandId: normalizedBrandId,
    brandBinding: createThinkForgeSessionBrandBinding({
      brandId: normalizedBrandId,
      orgId: normalizedOrgId,
    }),
    format: normalizedFormat,
    contentContract,
    platform: normalizedPlatform,
    contentCardId: normalizedDeliverableId,
    ...(typeof targetDurationSec === "number" ? { durationSec: targetDurationSec } : {}),
    ...(normalizedCampaignId ? { campaignId: normalizedCampaignId } : {}),
  };
  const session = await db.getOrCreateSessionForContentCard({
    userId: normalizedUserId,
    orgId: normalizedOrgId,
    brandId: normalizedBrandId,
    contentCardId: normalizedDeliverableId,
    projectMeta,
  });
  const sessionId = session._id;
  const existing = await db.getScript(sessionId, "default");
  const calosMetadata = {
    deliverableId: normalizedDeliverableId,
    campaignId: normalizedCampaignId,
    format: normalizedFormat,
    platform: normalizedPlatform,
  };
  const persistenceHash = artifactPersistenceHash({
    artifact,
    deliverableId: normalizedDeliverableId,
    campaignId: normalizedCampaignId,
    format: normalizedFormat,
    platform: normalizedPlatform,
    title: normalizedTitle,
  });

  if (existing
    && existing.content === artifact.content
    && existing.documentType === artifact.documentType
    && contractsMatch(existing.contentContract, contentContract)
    && existing.metadata?.calosArtifactHash === persistenceHash) {
    const existingWriterOutput = existing.metadata.writerOutput;
    if (existingWriterOutput && typeof existingWriterOutput === "object" && !Array.isArray(existingWriterOutput)) {
      const verification = verifyWriterOutputBinding({
        binding: (existingWriterOutput as Record<string, unknown>).artifactBinding,
        documentContent: existing.content,
        documentVersion: existing.version,
        writerOutput: existingWriterOutput as Record<string, unknown>,
      });
      if (verification.current) return sessionId;
    }
  }

  const result = await applyCommand(
    {
      type: "ReplaceDocument",
      sessionId,
      baseVersion: existing?.version ?? 0,
      source: "ai",
      payload: {
        scriptId: "default",
        title: normalizedTitle,
        content: artifact.content,
        documentType: artifact.documentType,
        contentContract,
        metadata: {
          workflow: "create",
          origin: "calos",
          calos: calosMetadata,
          calosArtifactHash: persistenceHash,
          authoringContextSnapshot: artifact.authoringContextSnapshot,
          signalTrace: artifact.signalTrace,
          briefSnapshot: artifact.briefSnapshot,
          writerOutput: writerOutputRecord(artifact),
        },
      },
    },
    normalizedUserId,
    normalizedOrgId,
  );
  if (!result.ok) {
    throw new Error(`CalOS could not persist the canonical ThinkForge artifact: ${result.error}`);
  }
  return sessionId;
}
