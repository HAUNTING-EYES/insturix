import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { ClickatronR2Manager } from "@/lib/clickatron-r2";
import { z } from "zod";
import {
  requireClickatronOwnedStorageKey,
  StorageOwnershipError,
} from "@/app/api/services/shared/storage-ownership";

const requestSchema = z.object({
  r2Url: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { r2Url } = requestSchema.parse(body);
    const ownedKey = requireClickatronOwnedStorageKey(session.userId, r2Url);

    const signedUrl = await ClickatronR2Manager.getSignedUrl(ownedKey);

    return NextResponse.json({ signedUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid signed URL request" }, { status: 400 });
    }
    if (error instanceof StorageOwnershipError) {
      return NextResponse.json({ error: "Asset not found" }, { status: error.status });
    }

    console.error("Failed to get signed URL:", error);
    return NextResponse.json({ error: "Failed to get signed URL" }, { status: 500 });
  }
}
