import type { CalosService, CalosServiceRef } from "@/schemas/calos-deliverable";

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
}

export interface GenerateResult {
  ok: boolean;
  serviceRef?: Pick<CalosServiceRef, "jobId" | "sessionId" | "projectId" | "variationId">;
  assetUrl?: string | null;
  assetText?: string | null;
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
