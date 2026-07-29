import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosScheduledPublish from "@/schemas/calos-scheduled-publish";
import CalosConnectedAccount from "@/schemas/calos-connected-account";
import { requireCalosBrandAccess } from "@/lib/calos/brand-access";
import { calosScope } from "@/lib/calos/scope";
import { loadInstagramAssignmentHealth } from "@/lib/calos/instagram-assignment-health";

export const dynamic = "force-dynamic";

type PublishRow = {
  _id?: unknown;
  deliverableId: string;
  platform: string;
  accountRef?: string | null;
  status: string;
  postId?: string | null;
  postUrl?: string | null;
  lastError?: string | null;
  updatedAt?: Date | string | null;
};

type AccountRow = {
  platform?: string;
  accountRef?: string;
  displayName?: string | null;
  ownerUserId?: string;
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  expiresAt?: Date | string | null;
};

type ConnectionHealth = {
  state: "assigned" | "attention" | "reconnect";
  accountRef: string | null;
  displayName: string | null;
  message: string | null;
};

type InstagramHealthByOwner = Awaited<ReturnType<typeof loadInstagramAssignmentHealth>>;

function asTime(value: Date | string | null | undefined) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function requiresReconnect(account: AccountRow) {
  return (
    Boolean(account.accessTokenEnc) &&
    asTime(account.expiresAt) > 0 &&
    asTime(account.expiresAt) <= Date.now() &&
    !account.refreshTokenEnc
  );
}

function buildConnectionHealth(
  rows: PublishRow[],
  accounts: AccountRow[],
  instagramHealthByOwner: InstagramHealthByOwner,
) {
  const byPlatform = new Map<string, AccountRow[]>();
  for (const account of accounts) {
    const platform = account.platform?.trim();
    if (!platform) continue;
    byPlatform.set(platform, [...(byPlatform.get(platform) ?? []), account]);
  }

  const health: Record<string, ConnectionHealth> = {};
  for (const [platform, platformAccounts] of byPlatform) {
    if (platformAccounts.length !== 1) {
      health[platform] = {
        state: "attention",
        accountRef: null,
        displayName: null,
        message: "Multiple accounts are assigned. Keep one active account before publishing.",
      };
      continue;
    }

    const account = platformAccounts[0];
    const accountRef = account.accountRef?.trim() || null;
    if (!accountRef || !account.ownerUserId) {
      health[platform] = {
        state: "attention",
        accountRef,
        displayName: account.displayName ?? null,
        message: "This account assignment is incomplete. Reconnect it before publishing.",
      };
      continue;
    }

    if (requiresReconnect(account)) {
      health[platform] = {
        state: "reconnect",
        accountRef,
        displayName: account.displayName ?? null,
        message: "Stored connection expired and cannot refresh. Reconnect before publishing.",
      };
      continue;
    }

    const instagramHealth = platform === "instagram"
      ? instagramHealthByOwner.get(account.ownerUserId)
      : null;
    if (platform === "instagram" && !instagramHealth?.connected) {
      health[platform] = {
        state: "reconnect",
        accountRef,
        displayName: account.displayName ?? null,
        message: instagramHealth?.message || "Instagram must be reconnected before publishing.",
      };
      continue;
    }

    const lastFailure = rows
      .filter(
        (row) =>
          row.platform === platform &&
          row.accountRef === accountRef &&
          row.status === "failed" &&
          Boolean(row.lastError),
      )
      .sort((a, b) => asTime(b.updatedAt) - asTime(a.updatedAt))[0];

    health[platform] = {
      state: lastFailure ? "attention" : "assigned",
      accountRef,
      displayName: account.displayName ?? null,
      message: lastFailure ? `Last publish failed: ${lastFailure.lastError}` : null,
    };
  }

  return health;
}

/**
 * The calendar delivery view. This is intentionally a structural health check:
 * provider APIs are only contacted by real publish attempts, avoiding latency and
 * rate-limit pressure on routine calendar polling.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const { userId, orgId } = session;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const brandId = req.nextUrl.searchParams.get("brandId");
    if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

    const accessError = await requireCalosBrandAccess(
      {
        userId,
        orgId,
        isOrgAdmin: Boolean(orgId && session.has?.({ role: "org:admin" })),
      },
      brandId,
    );
    if (accessError) return accessError;

    await connectToDatabase();
    const scope = calosScope({ userId, orgId }, brandId);

    const [rows, accounts] = await Promise.all([
      CalosScheduledPublish.find(scope)
        .select("deliverableId platform accountRef status postId postUrl lastError updatedAt")
        .lean<PublishRow[]>(),
      CalosConnectedAccount.find({ brandId, ...(orgId ? { orgId } : {}) })
        .select("platform accountRef displayName ownerUserId accessTokenEnc refreshTokenEnc expiresAt")
        .lean<AccountRow[]>(),
    ]);
    const instagramHealthByOwner = await loadInstagramAssignmentHealth(accounts);

    const statuses: Record<
      string,
      {
        platform: string;
        status: string;
        postUrl: string | null;
        error: string | null;
        accountRef: string | null;
        canRetry: boolean;
      }
    > = {};
    for (const row of rows) {
      statuses[row.deliverableId] = {
        platform: row.platform,
        status: row.status,
        postUrl: row.postUrl ?? null,
        error: row.lastError ?? null,
        accountRef: row.accountRef ?? null,
        canRetry: row.status === "failed" && !row.postId,
      };
    }

    const connectedPlatforms = Array.from(
      new Set(
        accounts
          .filter((account) =>
            account.platform !== "instagram" ||
            Boolean(account.ownerUserId && instagramHealthByOwner.get(account.ownerUserId)?.connected),
          )
          .map((account) => account.platform)
          .filter((platform): platform is string => Boolean(platform)),
      ),
    );

    return NextResponse.json({
      statuses,
      connectedPlatforms,
      connectionHealth: buildConnectionHealth(rows, accounts, instagramHealthByOwner),
    });
  } catch (error) {
    console.error("[CalOS] publish-status error:", error);
    return NextResponse.json({ error: "Failed to load publish status" }, { status: 500 });
  }
}

/**
 * Explicitly retries one failed, unpublished queue row. The caller must
 * acknowledge possible duplicates because a provider can accept a post before
 * the original request times out.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const { userId, orgId } = session;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      brandId?: string;
      deliverableId?: string;
      confirmPossibleDuplicate?: boolean;
    };
    const brandId = body.brandId?.trim();
    const deliverableId = body.deliverableId?.trim();
    if (!brandId || !deliverableId) {
      return NextResponse.json({ error: "brandId and deliverableId are required" }, { status: 400 });
    }
    if (body.confirmPossibleDuplicate !== true) {
      return NextResponse.json(
        { error: "Confirm the possible duplicate-post risk before retrying" },
        { status: 400 },
      );
    }

    const accessError = await requireCalosBrandAccess(
      {
        userId,
        orgId,
        isOrgAdmin: Boolean(orgId && session.has?.({ role: "org:admin" })),
      },
      brandId,
    );
    if (accessError) return accessError;

    await connectToDatabase();
    const scope = calosScope({ userId, orgId }, brandId);
    const row = (await CalosScheduledPublish.findOne({
      ...scope,
      deliverableId,
      status: "failed",
      postId: null,
    })) as PublishRow | null;

    if (!row) {
      return NextResponse.json({ error: "Only failed, unpublished jobs can be retried" }, { status: 409 });
    }

    const accountRef = row.accountRef?.trim();
    if (!accountRef) {
      return NextResponse.json(
        { error: "This legacy publish has no account snapshot and cannot be retried safely" },
        { status: 409 },
      );
    }

    const assignment = await CalosConnectedAccount.findOne({
      brandId,
      platform: row.platform,
      accountRef,
      ...(orgId ? { orgId } : {}),
    });
    if (!assignment) {
      return NextResponse.json(
        { error: "The scheduled account is no longer assigned. Reassign it before retrying." },
        { status: 409 },
      );
    }
    const assignedAccount = assignment as unknown as AccountRow;
    if (!assignedAccount.ownerUserId || requiresReconnect(assignedAccount)) {
      return NextResponse.json(
        { error: "The scheduled account must be reconnected before retrying." },
        { status: 409 },
      );
    }
    if (row.platform === "instagram") {
      const liveHealth = (
        await loadInstagramAssignmentHealth([{ ...assignedAccount, platform: "instagram" }])
      ).get(assignedAccount.ownerUserId);
      if (!liveHealth?.connected) {
        return NextResponse.json(
          { error: liveHealth?.message || "Instagram must be reconnected before retrying." },
          { status: 409 },
        );
      }
    }

    const retried = (await CalosScheduledPublish.findOneAndUpdate(
      {
        _id: row._id,
        ...scope,
        status: "failed",
        postId: null,
        accountRef,
      },
      {
        $set: {
          status: "pending",
          attempts: 0,
          lastError: null,
          lockedAt: null,
          postUrl: null,
          publishAt: new Date(),
        },
      },
      { new: true },
    )) as PublishRow | null;

    if (!retried) {
      return NextResponse.json({ error: "Publish state changed; reload before retrying" }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      deliverableId,
      status: "pending",
      accountRef,
    });
  } catch (error) {
    console.error("[CalOS] publish retry error:", error);
    return NextResponse.json({ error: "Failed to retry publish" }, { status: 500 });
  }
}
