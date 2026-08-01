import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import CalosScheduledPublish from "@/schemas/calos-scheduled-publish";
import CalosConnectedAccount from "@/schemas/calos-connected-account";
import { requireCalosBrandAccess } from "@/lib/calos/brand-access";
import { calosScope } from "@/lib/calos/scope";
import {
  loadCalosAssignmentHealth,
  type CalosAssignmentLike,
  type CalosConnectionHealth,
} from "@/lib/calos/publishing-assignment-health";

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

function asTime(value: Date | string | null | undefined) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildConnectionHealth(
  rows: PublishRow[],
  assignmentHealth: Record<string, CalosConnectionHealth>,
) {
  const health = { ...assignmentHealth };
  for (const [platform, connection] of Object.entries(health)) {
    if (connection.state !== "assigned" || !connection.accountRef) continue;
    const lastFailure = rows
      .filter(
        (row) =>
          row.platform === platform &&
          row.accountRef === connection.accountRef &&
          row.status === "failed" &&
          Boolean(row.lastError),
      )
      .sort((a, b) => asTime(b.updatedAt) - asTime(a.updatedAt))[0];
    if (lastFailure) {
      health[platform] = {
        ...connection,
        state: "attention",
        message: `Last publish failed: ${lastFailure.lastError}`,
      };
    }
  }

  return health;
}

/**
 * The calendar delivery view. Credential preflight is read-only: it checks the same
 * stored owner identity used by the publishers and asks Clerk for YouTube OAuth state,
 * but never calls a social publishing endpoint.
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
        .select("platform accountRef accountType displayName ownerUserId accessTokenEnc refreshTokenEnc expiresAt scopes")
        .lean<CalosAssignmentLike[]>(),
    ]);
    const assignmentHealth = await loadCalosAssignmentHealth(accounts);

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

    const connectionHealth = buildConnectionHealth(rows, assignmentHealth);
    const connectedPlatforms = Object.entries(assignmentHealth)
      .filter(([, connection]) => connection.state === "assigned")
      .map(([platform]) => platform);

    return NextResponse.json({
      statuses,
      connectedPlatforms,
      connectionHealth,
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
    const assignedAccount = assignment as unknown as CalosAssignmentLike;
    const assignmentHealth = await loadCalosAssignmentHealth([
      {
        platform: row.platform,
        accountRef: assignedAccount.accountRef,
        accountType: assignedAccount.accountType,
        displayName: assignedAccount.displayName,
        ownerUserId: assignedAccount.ownerUserId,
        accessTokenEnc: assignedAccount.accessTokenEnc,
        refreshTokenEnc: assignedAccount.refreshTokenEnc,
        expiresAt: assignedAccount.expiresAt,
        scopes: assignedAccount.scopes,
      },
    ]);
    const connection = assignmentHealth[row.platform];
    if (!connection || connection.state !== "assigned") {
      return NextResponse.json(
        { error: connection?.message || "The scheduled account must be reconnected before retrying." },
        { status: 409 },
      );
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
