import {
  getInstagramTokenHealth,
  type InstagramTokenHealth,
} from "@/lib/uploaderx/instagram-token-health";

type InstagramAssignmentLike = {
  platform?: string;
  ownerUserId?: string;
};

type InstagramOwnerRow = {
  clerkUserId?: string;
  instagramTokens?: {
    userAccessToken?: string;
    expiresAt?: Date | string | null;
  } | null;
};

export async function loadInstagramAssignmentHealth(
  assignments: InstagramAssignmentLike[],
): Promise<Map<string, InstagramTokenHealth>> {
  const ownerIds = Array.from(new Set(
    assignments
      .filter((assignment) => assignment.platform === "instagram")
      .map((assignment) => assignment.ownerUserId?.trim())
      .filter((ownerId): ownerId is string => Boolean(ownerId)),
  ));
  if (ownerIds.length === 0) return new Map();

  const { User } = await import("@/schemas/user");
  const users = await User.find({ clerkUserId: { $in: ownerIds } })
    .select("clerkUserId instagramTokens.userAccessToken instagramTokens.expiresAt")
    .lean<InstagramOwnerRow[]>();
  const byOwner = new Map(
    users
      .filter((user): user is InstagramOwnerRow & { clerkUserId: string } => Boolean(user.clerkUserId))
      .map((user) => [user.clerkUserId, user.instagramTokens] as const),
  );

  return new Map(
    ownerIds.map((ownerId) => [
      ownerId,
      getInstagramTokenHealth(byOwner.get(ownerId)),
    ]),
  );
}
