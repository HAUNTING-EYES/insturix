import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/uploaderx/linkedin/status
 * Checks LinkedIn connection status and returns user/org info
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        const user = await User.findOne({
            clerkUserId: session.userId,
            linkedinTokens: { $exists: true, $ne: null },
        });

        if (!user || !user.linkedinTokens) {
            return NextResponse.json({
                success: true,
                connected: false,
                message: "LinkedIn not connected"
            });
        }

        const tokens = user.linkedinTokens;
        const now = new Date();
        const isExpired = tokens.expiresAt && tokens.expiresAt < now;

        // If token is expired, try to refresh it
        if (isExpired && tokens.refreshToken) {
            try {
                const clientId = process.env.LINKEDIN_CLIENT_ID;
                const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

                if (clientId && clientSecret) {
                    const refreshResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: new URLSearchParams({
                            grant_type: 'refresh_token',
                            refresh_token: tokens.refreshToken,
                            client_id: clientId,
                            client_secret: clientSecret,
                        }),
                    });

                    const refreshData = await refreshResponse.json();

                    if (refreshResponse.ok && refreshData.access_token) {
                        const newExpiresAt = new Date(Date.now() + (refreshData.expires_in * 1000));

                        await User.updateOne(
                            { clerkUserId: session.userId },
                            {
                                $set: {
                                    'linkedinTokens.accessToken': refreshData.access_token,
                                    'linkedinTokens.refreshToken': refreshData.refresh_token || tokens.refreshToken,
                                    'linkedinTokens.expiresAt': newExpiresAt,
                                }
                            }
                        );

                        tokens.accessToken = refreshData.access_token;
                        tokens.expiresAt = newExpiresAt;
                    }
                }
            } catch (refreshError) {
                console.warn("⚠️ LinkedIn token refresh failed:", refreshError);
            }
        }

        return NextResponse.json({
            success: true,
            connected: true,
            canPostPersonal: !!tokens.userId,
            userName: tokens.userName,
            userId: tokens.userId,
            organizations: tokens.organizations || [],
            isExpired: tokens.expiresAt && tokens.expiresAt < new Date(),
            connectedAt: tokens.connectedAt,
        });

    } catch (error) {
        console.error("❌ LinkedIn status error:", error);
        return NextResponse.json({
            success: false,
            error: "Failed to check LinkedIn status"
        }, { status: 500 });
    }
}