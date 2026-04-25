import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/uploaderx/twitter/status
 * Returns the current Twitter connection status for the authenticated user.
 * Automatically refreshes tokens if expired.
 * Returns detailed permission information.
 */
export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        const user = await User.findOne(
            { clerkUserId: session.userId },
            { twitterTokens: 1 }
        );

        // Check if user exists AND has valid Twitter tokens
        if (!user || !user.twitterTokens || !user.twitterTokens.accessToken) {
            return NextResponse.json({
                connected: false,
                message: "Twitter not connected",
            });
        }

        const twitterTokens = user.twitterTokens;

        // Required scopes for full Twitter functionality
        const REQUIRED_SCOPES = [
            "tweet.read",
            "tweet.write",
            "users.read",
            "offline.access",
        ];

        // Scope descriptions for user-friendly display
        const SCOPE_DESCRIPTIONS: Record<string, { label: string; icon: string; description: string }> = {
            "tweet.read": { label: "Read tweets", icon: "📖", description: "Read user's tweets and timeline" },
            "tweet.write": { label: "Create tweets", icon: "✏️", description: "Post tweets with media (videos/images)" },
            "users.read": { label: "Read profile", icon: "👤", description: "Read user's profile info and username" },
            "offline.access": { label: "Long-term access", icon: "🔄", description: "Get refresh tokens for persistent access" },
        };

        // Get granted scopes from database or default to checking from token
        const grantedScopes = twitterTokens.scopes || [];
        const missingScopes = twitterTokens.missingScopes || [];

        // Build permission status for each scope
        const permissions = REQUIRED_SCOPES.map(scope => ({
            scope,
            label: SCOPE_DESCRIPTIONS[scope]?.label || scope,
            icon: SCOPE_DESCRIPTIONS[scope]?.icon || "🔑",
            description: SCOPE_DESCRIPTIONS[scope]?.description || "",
            granted: grantedScopes.includes(scope),
            missing: missingScopes.includes(scope),
        }));

        // Check overall permission status
        const allPermissionsGranted = missingScopes.length === 0 && grantedScopes.length >= REQUIRED_SCOPES.length;

        // Check if token is expired and try to refresh
        const now = new Date();
        let isExpired = !twitterTokens.expiresAt || twitterTokens.expiresAt < now;
        let userName = twitterTokens.userName;
        let userId = twitterTokens.userId;

        // If username is missing, fetch it from Twitter API
        if (!userName && twitterTokens.accessToken) {
            try {
                const meRes = await fetch("https://api.x.com/2/users/me", {
                    headers: {
                        "Authorization": `Bearer ${twitterTokens.accessToken}`,
                    },
                });
                const meData = await meRes.json();
                if (meRes.status === 200 && meData.data) {
                    userName = meData.data.username;
                    userId = meData.data.id;
                    await User.updateOne(
                        { clerkUserId: session.userId },
                        {
                            $set: {
                                "twitterTokens.userName": userName,
                                "twitterTokens.userId": userId,
                            }
                        }
                    );
                }
            } catch (fetchError) {
                // Silently fail - username will be fetched later
            }
        }

        if (isExpired && twitterTokens.refreshToken) {
            try {
                const clientId = process.env.TWITTER_CLIENT_ID!;
                const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
                const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

                const refreshBody = new URLSearchParams();
                refreshBody.set("grant_type", "refresh_token");
                refreshBody.set("refresh_token", twitterTokens.refreshToken);

                const refreshRes = await fetch("https://api.x.com/2/oauth2/token", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Authorization": `Basic ${credentials}`,
                    },
                    body: refreshBody.toString(),
                });

                const refreshData = await refreshRes.json();

                if (refreshRes.status === 200 && !refreshData.error) {
                    const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000);
                    await User.updateOne(
                        { clerkUserId: session.userId },
                        {
                            $set: {
                                "twitterTokens.accessToken": refreshData.access_token,
                                "twitterTokens.refreshToken": refreshData.refresh_token,
                                "twitterTokens.expiresAt": newExpiresAt,
                            }
                        }
                    );

                    isExpired = false;

                    // If username is still missing after refresh, try to fetch it
                    if (!userName) {
                        try {
                            const meRes = await fetch("https://api.x.com/2/users/me", {
                                headers: {
                                    "Authorization": `Bearer ${refreshData.access_token}`,
                                },
                            });
                            const meData = await meRes.json();
                            if (meRes.status === 200 && meData.data) {
                                userName = meData.data.username;
                                userId = meData.data.id;
                                await User.updateOne(
                                    { clerkUserId: session.userId },
                                    {
                                        $set: {
                                            "twitterTokens.userName": userName,
                                            "twitterTokens.userId": userId,
                                        }
                                    }
                                );
                            }
                        } catch (fetchError) {
                            // Silently fail
                        }
                    }

                    // Return updated status
                    return NextResponse.json({
                        connected: true,
                        userName: userName,
                        userId: userId,
                        connectedAt: twitterTokens.connectedAt,
                        expiresAt: newExpiresAt,
                        isExpired: false,
                        tokenRefreshed: true,
                        permissions,
                        allPermissionsGranted,
                        grantedScopes,
                        missingScopes: [],
                    });
                }
            } catch (refreshError) {
                // Silently fail - will return expired status
            }
        }

        // Final check: if we don't have a valid access token, return not connected
        if (!twitterTokens.accessToken) {
            return NextResponse.json({
                connected: false,
                message: "Twitter not connected",
            });
        }

        return NextResponse.json({
            connected: true,
            userName: userName,
            userId: userId,
            connectedAt: twitterTokens.connectedAt,
            expiresAt: twitterTokens.expiresAt,
            isExpired,
            permissions,
            allPermissionsGranted,
            grantedScopes,
            missingScopes,
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to check status" },
            { status: 500 }
        );
    }
}
