import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosCampaign, {
  type CalosCampaignReference,
  type CalosIngestedFacts,
  type CalosReferenceType,
} from "@/schemas/calos-campaign";
import { extractBrandVaultUploadEvidenceFromBuffer } from "@/lib/shared/brand-vault-upload-parser";
import { uploadToR2, isR2Available } from "@/lib/editron/services/r2-service";
import { createIngestorAgent } from "@/lib/thinkforge/agents/ingestor-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // link fetch + document parse + an IngestorAgent LLM call

const MAX_FILE_BYTES = 15_000_000; // 15MB — above real decks/PDFs, below memory danger
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"]);
const PDF_EXTS = new Set(["pdf"]);

const extOf = (name: string): string => (name.split(".").pop() || "").toLowerCase();

/** Classify an uploaded file into a reference type (image = stored only; pdf/doc = parsed to text). */
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

/** Run the ThinkForge IngestorAgent over extracted text → flattened facts the writers can consume. */
async function ingestText(
  text: string,
  campaignName: string,
  systemBrief: string,
): Promise<CalosIngestedFacts> {
  const agent = createIngestorAgent();
  const result = await agent.deconstruct({
    context: { projectSummary: campaignName, systemBrief },
    userPrompt: text.slice(0, 20_000),
  });
  return {
    summary: result.summary,
    atomicFacts: (result.atomicFacts ?? []).map((f) => f.fact).filter(Boolean),
    viralHooks: (result.viralHooks ?? []).map((h) => h.hook).filter(Boolean),
  };
}

/**
 * POST /api/services/calos/campaigns/[id]/references
 *
 * Attach a source material to a campaign so generation writes FROM it. Accepts multipart (a file:
 * pdf/doc/image) or JSON ({ type:'link', url } | { type:'text', name, text }). For everything but an
 * image, the text is extracted (link fetch / document parse / pasted) and deconstructed by ThinkForge's
 * IngestorAgent into cached atomic facts. Images are stored as visual references (no ingestion) for the
 * deferred Clickatron referenceImageRefs wire. Scoped by campaign ownership (no IDOR).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: campaignId } = await ctx.params;
    await connectToDatabase();

    let campaign;
    try {
      campaign = await CalosCampaign.findOne({ _id: campaignId, ownerUserId: userId, deletedAt: null });
    } catch {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const systemBrief = [campaign.theme, campaign.goal].filter(Boolean).join(" — ");

    // Resolve the reference: extract text (or store an image) then (best-effort) ingest.
    let ref: CalosCampaignReference;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "A file is required" }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File is too large (max 15MB)." }, { status: 413 });
      }
      const name = (form.get("name") as string) || file.name || "upload";
      const type = fileRefType(file.name, file.type);
      const buffer = Buffer.from(await file.arrayBuffer());

      if (!isR2Available()) {
        return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
      }
      const { publicUrl } = await uploadToR2(buffer, userId, file.name, file.type || "application/octet-stream");

      ref = {
        id: nanoid(),
        type,
        name,
        url: publicUrl,
        text: null,
        ingested: null,
        status: "pending",
        error: null,
        addedAt: new Date(),
      };

      if (type === "image") {
        ref.status = "ready"; // stored visual reference — no text ingestion
      } else {
        try {
          const { source } = await extractBrandVaultUploadEvidenceFromBuffer({ name: file.name, mimeType: file.type, buffer });
          const text = source.text?.trim() || "";
          if (!text) throw new Error("No text could be extracted from this file.");
          ref.text = text;
          ref.ingested = await ingestText(text, campaign.name, systemBrief);
          ref.status = "ready";
        } catch (e) {
          ref.status = "failed";
          ref.error = e instanceof Error ? e.message : "Could not read this file.";
        }
      }
    } else {
      const body = await req.json().catch(() => ({}));
      const type = body?.type as CalosReferenceType;
      if (type === "link") {
        const url = typeof body?.url === "string" ? body.url.trim() : "";
        if (!/^https?:\/\//i.test(url)) {
          return NextResponse.json({ error: "A valid http(s) link is required" }, { status: 400 });
        }
        ref = { id: nanoid(), type: "link", name: body?.name?.trim() || url, url, text: null, ingested: null, status: "pending", error: null, addedAt: new Date() };
        try {
          const res = await fetch(url, { redirect: "follow" });
          if (!res.ok) throw new Error(`Link returned ${res.status}`);
          const text = htmlToText(await res.text());
          if (!text) throw new Error("No readable text at this link.");
          ref.text = text;
          ref.ingested = await ingestText(text, campaign.name, systemBrief);
          ref.status = "ready";
        } catch (e) {
          ref.status = "failed";
          ref.error = e instanceof Error ? e.message : "Could not fetch this link.";
        }
      } else if (type === "text") {
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        if (!text) return NextResponse.json({ error: "Text is required" }, { status: 400 });
        ref = { id: nanoid(), type: "text", name: body?.name?.trim() || "Pasted note", url: null, text, ingested: null, status: "pending", error: null, addedAt: new Date() };
        try {
          ref.ingested = await ingestText(text, campaign.name, systemBrief);
          ref.status = "ready";
        } catch (e) {
          ref.status = "failed";
          ref.error = e instanceof Error ? e.message : "Could not process this text.";
        }
      } else {
        return NextResponse.json({ error: "Unsupported reference type" }, { status: 400 });
      }
    }

    campaign.references.push(ref);
    await campaign.save();
    return NextResponse.json({ reference: ref }, { status: 201 });
  } catch (error) {
    console.error("[CalOS] add campaign reference error:", error);
    return NextResponse.json({ error: "Failed to add reference" }, { status: 500 });
  }
}

/**
 * DELETE /api/services/calos/campaigns/[id]/references?refId=
 * Remove a reference from the campaign. Scoped by campaign ownership.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: campaignId } = await ctx.params;
    const refId = new URL(req.url).searchParams.get("refId");
    if (!refId) return NextResponse.json({ error: "refId is required" }, { status: 400 });

    await connectToDatabase();
    let campaign;
    try {
      campaign = await CalosCampaign.findOne({ _id: campaignId, ownerUserId: userId, deletedAt: null });
    } catch {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const before = campaign.references.length;
    campaign.references = campaign.references.filter((r: CalosCampaignReference) => r.id !== refId);
    if (campaign.references.length === before) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }
    await campaign.save();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[CalOS] delete campaign reference error:", error);
    return NextResponse.json({ error: "Failed to remove reference" }, { status: 500 });
  }
}
