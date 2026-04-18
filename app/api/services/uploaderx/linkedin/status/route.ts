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
        console.log("[LinkedIn Status] Session userId:", session.userId);
        
        if (!session.userId) {
            console.error("[LinkedIn Status] Unauthorized - no userId in session");
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        const user = await User.findOne({
            clerkUserId: session.userId,
            linkedinTokens: { $exists: true, $ne: null },
        });

        console.log("[LinkedIn Status] User found:", !!user, "Has tokens:", !!user?.linkedinTokens);

        if (!user || !user.linkedinTokens) {
            console.log("[LinkedIn Status] No LinkedIn connection for user");
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
        let refreshFailed = false;
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
                        console.log("✅ LinkedIn token refreshed successfully in status check");
                    } else {
                        console.warn("⚠️ LinkedIn token refresh failed:", refreshData);
                        refreshFailed = true;
                    }
                } else {
                    console.error("❌ LinkedIn credentials not configured");
                    refreshFailed = true;
                }
            } catch (refreshError) {
                console.warn("⚠️ LinkedIn token refresh failed:", refreshError);
                refreshFailed = true;
            }
        }

        const finalIsExpired = refreshFailed || (tokens.expiresAt && tokens.expiresAt < new Date());
        console.log("[LinkedIn Status] User connected - canPostPersonal:", !!tokens.userId, "isExpired:", finalIsExpired, "refreshFailed:", refreshFailed, "orgs:", tokens.organizations?.length || 0);
        
        return NextResponse.json({
            success: true,
            connected: true,
            canPostPersonal: !!tokens.userId,
            userName: tokens.userName,
            userId: tokens.userId,
            organizations: tokens.organizations || [],
            isExpired: finalIsExpired,
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

/**
 * DELETE /api/services/uploaderx/linkedin/status
 * Disconnects LinkedIn account by removing stored tokens
 */
export async function DELETE() {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        await User.updateOne(
            { clerkUserId: session.userId },
            { $unset: { linkedinTokens: 1 } }
        );

        console.log("[LinkedIn Disconnect] Tokens removed for user:", session.userId);

        return NextResponse.json({
            success: true,
            message: "LinkedIn account disconnected"
        });

    } catch (error) {
        console.error("❌ LinkedIn disconnect error:", error);
        return NextResponse.json({
            success: false,
            error: "Failed to disconnect LinkedIn"
        }, { status: 500 });
    }
}