/**
 * GET /api/user/credits
 * 
 * Get current user's credits balance
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { CreditsService } from "@/lib/services/creditsService";
import { CreditsMigrationService } from "@/lib/services/creditsMigrationService";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Ensure existing users are migrated to credits system
    await CreditsMigrationService.ensureMigrated(userId);

    const balance = await CreditsService.getBalance(userId);

    return NextResponse.json({
      success: true,
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

