import {
  getInstagramTokenHealth,
  type InstagramTokenHealth,
} from "@/lib/uploaderx/instagram-token-health";

type InstagramAssignmentLike = {
  platform?: string;
  ownerUserId?: string;
  accountRef?: string;
};

type InstagramOwnerRow = {
  clerkUserId?: string;
  instagramTokens?: {
    userAccessToken?: string;
    userId?: string | number;
    accounts?: Array<{ instagramAccountId?: string | number }>;
    expiresAt?: Date | string | null;
  } | null;
};

export type InstagramAssignmentHealth = Omit<InstagramTokenHealth, "reason"> & {
  reason: InstagramTokenHealth["reason"] | "identity_mismatch";
};

export async function loadInstagramAssignmentHealth(
  assignments: InstagramAssignmentLike[],
): Promise<Map<string, InstagramAssignmentHealth>> {
  const ownerIds = Array.from(new Set(
    assignments
      .filter((assignment) => assignment.platform === "instagram")
      .map((assignment) => assignment.ownerUserId?.trim())
      .filter((ownerId): ownerId is string => Boolean(ownerId)),
  ));
  if (ownerIds.length === 0) return new Map();

  const { User } = await import("@/schemas/user");
  const users = await User.find({ clerkUserId: { $in: ownerIds } })
    .select("clerkUserId instagramTokens.userAccessToken instagramTokens.userId instagramTokens.accounts.instagramAccountId instagramTokens.expiresAt")
    .lean<InstagramOwnerRow[]>();
  const byOwner = new Map(
    users
      .filter((user): user is InstagramOwnerRow & { clerkUserId: string } => Boolean(user.clerkUserId))
      .map((user) => [user.clerkUserId, user.instagramTokens] as const),
  );

  const expectedRefsByOwner = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    if (assignment.platform !== "instagram") continue;
    const ownerId = assignment.ownerUserId?.trim();
    const accountRef = assignment.accountRef?.trim();
    if (!ownerId || !accountRef) continue;
    const refs = expectedRefsByOwner.get(ownerId) ?? new Set<string>();
    refs.add(accountRef);
    expectedRefsByOwner.set(ownerId, refs);
  }

  return new Map<string, InstagramAssignmentHealth>(
    ownerIds.map((ownerId): [string, InstagramAssignmentHealth] => {
      const tokens = byOwner.get(ownerId);
      const tokenHealth = getInstagramTokenHealth(tokens);
      if (!tokenHealth.connected) return [ownerId, tokenHealth];

      const connectedRefs = new Set<string>();
      if (tokens?.userId != null) connectedRefs.add(String(tokens.userId));
      for (const account of tokens?.accounts ?? []) {
        if (account.instagramAccountId != null) {
          connectedRefs.add(String(account.instagramAccountId));
        }
      }
      const expectedRefs = expectedRefsByOwner.get(ownerId) ?? new Set<string>();
      const identityMatches = expectedRefs.size > 0 &&
        Array.from(expectedRefs).every((accountRef) => connectedRefs.has(accountRef));
      if (identityMatches) return [ownerId, tokenHealth];

      return [ownerId, {
        ...tokenHealth,
        connected: false,
        reconnectRequired: true,
        reason: "identity_mismatch",
        message: "Assigned Instagram account no longer matches the owner's connected account. Reassign or reconnect it before publishing.",
      }];
    }),
  );
}
