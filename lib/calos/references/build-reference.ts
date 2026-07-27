import type { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import type {
  CalosCampaignReference,
  CalosIngestedFacts,
  CalosReferenceType,
} from "@/schemas/calos-campaign";
import { extractBrandVaultUploadEvidenceFromBuffer } from "@/lib/shared/brand-vault-upload-parser";
import { uploadToR2, isR2Available } from "@/lib/editron/services/r2-service";
import { createIngestorAgent } from "@/lib/thinkforge/agents/ingestor-agent";

/**
 * Shared "turn an add-reference request into a CalosCampaignReference" logic, reused by BOTH the
 * campaign-scoped and the brand-scoped reference routes (references are brand knowledge and must work
 * with or without a campaign — so the ingestion can't live inside the campaign route).
 *
 * Extracts text (link fetch / document parse / pasted), stores files in R2, and deconstructs via
 * ThinkForge's IngestorAgent into cached atomic facts. Images are stored as visual references (no
 * ingestion) for the Clickatron referenceImageRefs wire. Bad INPUT throws ReferenceInputError (the
 * route maps `.status`); extraction/ingestion FAILURE is captured on the reference (status 'failed')
 * rather than thrown, so a bad source still records with a reason.
 */

export const MAX_REFERENCE_FILE_BYTES = 15_000_000; // 15MB — above real decks/PDFs, below memory danger

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"]);
const PDF_EXTS = new Set(["pdf"]);

/** Bad request input — the route turns `.status` into the HTTP response. */
export class ReferenceInputError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ReferenceInputError";
    this.status = status;
  }
}

export interface BuildReferenceContext {
  userId: string;
  /** Project context for the IngestorAgent — the campaign name, or a brand label. */
  label: string;
  systemBrief?: string;
}

const extOf = (name: string): string => (name.split(".").pop() || "").toLowerCase();

/** Classify an uploaded file (image = stored only; pdf/doc = parsed to text). */
function fileRefType(name: string, mime?: string): CalosReferenceType {
  const ext = extOf(name);
  if (IMAGE_EXTS.has(ext) || (mime || "").startsWith("image/")) return "image";
  if (PDF_EXTS.has(ext) || mime === "application/pdf") return "pdf";
  return "doc"; // docx/pptx/txt/md/csv → the parser extracts text
}

/** Strip HTML to rough text for a fetched link (dependency-free; Firecrawl is a later upgrade). */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20_000);
}

/** Deconstruct extracted text into flattened facts the writers can consume. */
async function ingestText(text: string, ctx: BuildReferenceContext): Promise<CalosIngestedFacts> {
  const agent = createIngestorAgent();
  const result = await agent.deconstruct({
    context: { projectSummary: ctx.label, systemBrief: ctx.systemBrief ?? "" },
    userPrompt: text.slice(0, 20_000),
  });
  return {
    summary: result.summary,
    atomicFacts: (result.atomicFacts ?? []).map((f) => f.fact).filter(Boolean),
    viralHooks: (result.viralHooks ?? []).map((h) => h.hook).filter(Boolean),
  };
}

export async function buildReferenceFromRequest(
  req: NextRequest,
  ctx: BuildReferenceContext,
): Promise<CalosCampaignReference> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ReferenceInputError("A file is required", 400);
    if (file.size > MAX_REFERENCE_FILE_BYTES) throw new ReferenceInputError("File is too large (max 15MB).", 413);
    if (!isR2Available()) throw new ReferenceInputError("File storage is not configured.", 503);

    const name = (form.get("name") as string) || file.name || "upload";
    const type = fileRefType(file.name, file.type);
    const buffer = Buffer.from(await file.arrayBuffer());
    const { publicUrl } = await uploadToR2(buffer, ctx.userId, file.name, file.type || "application/octet-stream");

    const ref: CalosCampaignReference = {
      id: nanoid(), type, name, url: publicUrl, text: null, ingested: null,
      status: "pending", error: null, addedAt: new Date(),
    };

    if (type === "image") {
      ref.status = "ready"; // stored visual reference — no text ingestion
      return ref;
    }
    try {
      const { source } = await extractBrandVaultUploadEvidenceFromBuffer({ name: file.name, mimeType: file.type, buffer });
      const text = source.text?.trim() || "";
      if (!text) throw new Error("No text could be extracted from this file.");
      ref.text = text;
      ref.ingested = await ingestText(text, ctx);
      ref.status = "ready";
    } catch (e) {
      ref.status = "failed";
      ref.error = e instanceof Error ? e.message : "Could not read this file.";
    }
    return ref;
  }

  const body = await req.json().catch(() => ({}));
  const type = body?.type as CalosReferenceType;

  if (type === "link") {
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) throw new ReferenceInputError("A valid http(s) link is required", 400);
    const ref: CalosCampaignReference = {
      id: nanoid(), type: "link", name: body?.name?.trim() || url, url, text: null, ingested: null,
      status: "pending", error: null, addedAt: new Date(),
    };
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`Link returned ${res.status}`);
      const text = htmlToText(await res.text());
      if (!text) throw new Error("No readable text at this link.");
      ref.text = text;
      ref.ingested = await ingestText(text, ctx);
      ref.status = "ready";
    } catch (e) {
      ref.status = "failed";
      ref.error = e instanceof Error ? e.message : "Could not fetch this link.";
    }
    return ref;
  }

  if (type === "text") {
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) throw new ReferenceInputError("Text is required", 400);
    const ref: CalosCampaignReference = {
      id: nanoid(), type: "text", name: body?.name?.trim() || "Pasted note", url: null, text, ingested: null,
      status: "pending", error: null, addedAt: new Date(),
    };
    try {
      ref.ingested = await ingestText(text, ctx);
      ref.status = "ready";
    } catch (e) {
      ref.status = "failed";
      ref.error = e instanceof Error ? e.message : "Could not process this text.";
    }
    return ref;
  }

  throw new ReferenceInputError("Unsupported reference type", 400);
}
