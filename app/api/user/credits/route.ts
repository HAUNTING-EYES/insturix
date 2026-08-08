/**
 * GET /api/user/credits
 *
 * Get the current user's credits balance.
 *
 * `?wallet=auto` (P2 org UX): when org-wallet billing is enabled AND the caller's ACTIVE Clerk
 * context is an organization (OrgSwitcher setActive → auth().orgId), returns THAT org's wallet
 * with walletOwner:'org' — so the dashboard shows the wallet the user is standing in. DISPLAY
 * routes on active context; actual billing still routes on each project's persisted ownership
 * (D9). Without the param (or flag off) the response is the personal wallet, byte-identical to
 * before — consumers with personal-wallet semantics (init/migration, top-up verify) never opt in.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { CreditsService } from "@/lib/services/creditsService";
import { CreditsMigrationService } from "@/lib/services/creditsMigrationService";
import { isOrgWalletBillingEnabled } from "@/lib/services/org-wallet-flag";
import type { ICreditTransaction } from "@/schemas/user";

export async function GET(request: NextRequest) {
  try {
    const { userId, orgId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const walletMode = new URL(request.url).searchParams.get("wallet");
    const useOrgWallet = walletMode === "auto" && isOrgWalletBillingEnabled() && !!orgId;

    if (useOrgWallet) {
      // Org wallet may be absent (never funded) — display zeros, never seed on a read.
      const orgBalance = await CreditsService.getOrgCreditsBalance(orgId);
      const b = (orgBalance ?? {}) as Partial<Record<string, number>> & {
        subscriptionCreditsExpiry?: Date | null;
        mediaCreditsExpiry?: Date | null;
        creditHistory?: ICreditTransaction[];
      };
      const subscriptionCredits = b.subscriptionCredits ?? 0;
      const topupCredits = b.topupCredits ?? 0;
      const mediaCredits = b.mediaCredits ?? 0;
      const mediaTopupCredits = b.mediaTopupCredits ?? 0;
      return NextResponse.json({
        success: true,
        walletOwner: "org",
        orgId,
        balance: {
          subscriptionCredits,
          topupCredits,
          totalCredits: subscriptionCredits + topupCredits,
          subscriptionCreditsExpiry: b.subscriptionCreditsExpiry ?? null,
          mediaCredits,
          mediaTopupCredits,
          totalMediaCredits: mediaCredits + mediaTopupCredits,
          mediaCreditsExpiry: b.mediaCreditsExpiry ?? null,
        },
        // Same recency contract as the personal wallet: last 10, newest first.
        recentTransactions: (b.creditHistory ?? []).slice(-10).reverse(),
      });
    }

    // Ensure existing users are migrated to credits system
    await CreditsMigrationService.ensureMigrated(userId);

    const balance = await CreditsService.getBalance(userId);

    return NextResponse.json({
      success: true,
      walletOwner: "personal",
      balance: {
        // MAIN pool (everyday workflow)
        subscriptionCredits: balance.subscriptionCredits,
        topupCredits: balance.topupCredits,
        totalCredits: balance.totalCredits,
        subscriptionCreditsExpiry: balance.subscriptionCreditsExpiry,
        // MEDIA pool (image/video/audio generation)
        mediaCredits: balance.mediaCredits,
        mediaTopupCredits: balance.mediaTopupCredits,
        totalMediaCredits: balance.totalMediaCredits,
        mediaCreditsExpiry: balance.mediaCreditsExpiry,
      },
      recentTransactions: balance.recentTransactions,
    });
  } catch (error) {
    console.error("[GET /api/user/credits] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get credits balance" },
      { status: 500 }
    );
  }
}

