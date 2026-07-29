import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { resolveUserOAuthToken } from "@/lib/calos/publish/token-crypto";
import {
  FACEBOOK_ATTENTION_MESSAGE,
  FACEBOOK_RECONNECT_MESSAGE,
  validateFacebookPageToken,
} from "@/lib/uploaderx/facebook-graph";

type StoredFacebookPage = {
  pageAccessToken?: string;
  pageId?: string | number;
  pageName?: string;
};

type StoredFacebookTokens = {
  connectedAt?: Date;
  pages?: StoredFacebookPage[];
  userId?: string;
  userName?: string;
};

function publicPage(page: StoredFacebookPage) {
  const pageId = String(page.pageId || "");
  return {
    pageId,
    pageName: page.pageName?.trim() || `Facebook Page ${pageId}`,
  };
}

/**
 * GET /api/services/uploaderx/facebook/pages
 * Returns only Pages that are live-valid or temporarily unverifiable.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");
    const user = await User.findOne({
      clerkUserId: session.userId,
      facebookTokens: { $exists: true, $ne: null },
    })
      .select("facebookTokens")
      .lean<{ facebookTokens?: StoredFacebookTokens | null } | null>();

    const facebookTokens = user?.facebookTokens;
    if (!facebookTokens) {
      return NextResponse.json({
        connected: false,
        connectionState: "disconnected",
        reconnectRequired: false,
        pages: [],
        unavailablePageCount: 0,
      });
    }

    const storedPages = Array.isArray(facebookTokens.pages)
      ? facebookTokens.pages
      : [];
    if (storedPages.length === 0) {
      return NextResponse.json({
        connected: false,
        connectionState: "reconnect",
        reconnectRequired: true,
        message: FACEBOOK_RECONNECT_MESSAGE,
        userName: facebookTokens.userName || null,
        userId: facebookTokens.userId || null,
        pages: [],
        unavailablePageCount: 0,
        connectedAt: facebookTokens.connectedAt || null,
      });
    }

    const healthRows = await Promise.all(
      storedPages.map(async (page) => ({
        health: await validateFacebookPageToken(
          String(page.pageId || ""),
          resolveUserOAuthToken(page.pageAccessToken) || "",
        ),
        page,
      })),
    );
    const validRows = healthRows.filter((row) => row.health.state === "valid");
    const attentionRows = healthRows.filter((row) => row.health.state === "attention");
    const reconnectRows = healthRows.filter((row) => row.health.state === "reconnect");
    const hasUsablePage = validRows.length > 0 || attentionRows.length > 0;
    const connectionState = attentionRows.length > 0
      ? "attention"
      : hasUsablePage
        ? "connected"
        : "reconnect";
    const visibleRows = attentionRows.length > 0
      ? [...validRows, ...attentionRows]
      : validRows;

    return NextResponse.json({
      connected: hasUsablePage,
      connectionState,
      reconnectRequired: !hasUsablePage,
      message: connectionState === "attention"
        ? FACEBOOK_ATTENTION_MESSAGE
        : connectionState === "reconnect"
          ? FACEBOOK_RECONNECT_MESSAGE
          : null,
      userName: facebookTokens.userName || null,
      userId: facebookTokens.userId || null,
      pages: visibleRows.map(({ page }) => publicPage(page)),
      unavailablePageCount: attentionRows.length + reconnectRows.length,
      connectedAt: facebookTokens.connectedAt || null,
    });
  } catch (error) {
    console.error("[UploaderX] Error fetching Facebook Pages:", error);
    return NextResponse.json({ error: "Failed to fetch pages" }, { status: 500 });
  }
}

/**
 * DELETE /api/services/uploaderx/facebook/pages
 * Disconnects Facebook by removing stored tokens.
 */
export async function DELETE() {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    const { User } = await import("@/schemas/user");
    await User.findOneAndUpdate(
      { clerkUserId: session.userId },
      { $unset: { facebookTokens: "" } },
    );

    return NextResponse.json({ success: true, message: "Facebook disconnected" });
  } catch (error) {
    console.error("[UploaderX] Error disconnecting Facebook:", error);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
