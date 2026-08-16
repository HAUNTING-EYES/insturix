import type { CalosService, CalosServiceRef } from "@/schemas/calos-deliverable";
import type { PostWriterResult } from "@/lib/thinkforge/agents/post-writer-agent";
import type { ScriptWriterResult } from "@/lib/thinkforge/agents/script-writer-agent";
import type { ProductionBrief } from "@/lib/editron/production-brief/production-brief";
import type { ThinkForgeAuthoringContextSnapshot } from "@/lib/thinkforge/context/brand-authoring-context";
import type { SourceLedger } from "@/lib/thinkforge/provenance/source-ledger";
import type {
  ThinkForgeDocumentContract,
  ThinkForgeWriterKind,
} from "@/lib/thinkforge/schemas/document-contract";
import type { ThinkForgeSignalTrace } from "@/lib/thinkforge/signals/signal-trace";

export interface GenerateParams {
  ownerUserId: string;
  /** Active org for brand-resolution scope (agency isolation; null for solo/no-org). */
  orgId?: string | null;
  brandId: string;
  campaignId?: string | null;
  deliverableId: string; // the card.id
  format: string;
  platform: string;
  title: string;
  angle?: string;
  /** Exact carousel form selected on the calendar card. Never inferred by a writer. */
  carouselSlideCount?: number;
  /** Exact calendar-owned runtime intent. Required by long_video cadence validation. */
  targetDurationSeconds?: number;
}

export interface ThinkForgePostWriterOutput {
  writerType: "post";
  contentAnalysis: PostWriterResult["contentAnalysis"];
  hashtags: PostWriterResult["hashtags"];
  visualPrompts: PostWriterResult["clickatron"];
  sourceLedger: SourceLedger;
  writerMetadata: PostWriterResult["metadata"];
}

export interface ThinkForgeScriptWriterOutput {
  writerType: "script";
  contentAnalysis: ScriptWriterResult["contentAnalysis"];
  visualPrompts: ScriptWriterResult["visualMetadata"];
  scriptSidecar: ScriptWriterResult["sidecar"];
  sidecarVersion: ScriptWriterResult["sidecar"]["sidecarVersion"];
  sourceLedger: SourceLedger;
  writerMetadata: ScriptWriterResult["metadata"];
}

interface ThinkForgeArtifactBase {
  content: string;
  contentContract: ThinkForgeDocumentContract;
  briefSnapshot: ProductionBrief;
  authoringContextSnapshot: ThinkForgeAuthoringContextSnapshot;
  signalTrace: ThinkForgeSignalTrace;
}

export type ThinkForgeGeneratedArtifact =
  | (ThinkForgeArtifactBase & {
      documentType: Extract<ThinkForgeWriterKind, "social_post" | "carousel">;
      writerOutput: ThinkForgePostWriterOutput;
    })
  | (ThinkForgeArtifactBase & {
      documentType: Extract<ThinkForgeWriterKind, "video_script">;
      writerOutput: ThinkForgeScriptWriterOutput;
    });

export interface GenerateResult {
  ok: boolean;
  serviceRef?: Pick<CalosServiceRef, "jobId" | "sessionId" | "projectId" | "variationId">;
  assetUrl?: string | null;
  assetText?: string | null;
  /** Complete ThinkForge artifact. Required when a writer ran; never reconstruct it from assetText. */
  thinkforgeArtifact?: ThinkForgeGeneratedArtifact;
  /** Editorial status to land the deliverable in. Defaults to 'generated'. A generator that only
   *  produced a draft/brief (e.g. graphics: copy + image prompt, image still pending) returns
   *  'drafting' so we don't claim a finished asset. */
  status?: "generated" | "drafting";
  /** Image-generation prompt the writer emitted for a graphics format (PostWriter's
   *  clickatron.singleImagePrompt). Carried so the dispatcher can kick off Clickatron image
   *  generation for the card; absent for text/video formats. */
  imagePrompt?: string;
  error?: string;
}

export type GeneratorFn = (params: GenerateParams) => Promise<GenerateResult>;

/**
 * Generator registry — empty until a service's generator is wired (mirrors the publish-queue
 * contract). getGenerator returns null when a service has no generator yet, so the dispatcher
 * records the routing as a handoff instead of faking generation (fail-closed, honest).
 *
 * To wire one: registerGenerator("thinkforge", async (p) => { ... }) at module load.
 */
const REGISTRY: Partial<Record<CalosService, GeneratorFn>> = {};

export function registerGenerator(service: CalosService, fn: GeneratorFn): void {
  REGISTRY[service] = fn;
}

export function getGenerator(service: CalosService): GeneratorFn | null {
  return REGISTRY[service] ?? null;
}
