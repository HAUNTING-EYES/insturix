import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

const debugLinkedInStatus = (...args: unknown[]) => {
    if (process.env.UPLOADERX_DEBUG_LOGS === "true") {
        console.log(...args);
    }
};

/**
 * GET /api/services/uploaderx/linkedin/status
 * Checks LinkedIn connection status and returns user/org info
 */
export async function GET() {
    try {
        const session = await auth();
        debugLinkedInStatus("[LinkedIn Status] Session userId:", session.userId);
        
        if (!session.userId) {
            console.error("[LinkedIn Status] Unauthorized - no userId in session");
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        debugLinkedInStatus("[LinkedIn Status] Looking for user with clerkUserId:", session.userId);
        
        // Use a more reliable query - check if linkedinTokens exists and has accessToken
        const user = await User.findOne({
            clerkUserId: session.userId,
            "linkedinTokens.accessToken": { $exists: true, $ne: "" }
        });
        
        debugLinkedInStatus("[LinkedIn Status] User found:", !!user);
        if (user) {
            debugLinkedInStatus("[LinkedIn Status] LinkedIn token present:", !!user.linkedinTokens?.accessToken);
        } else {
            debugLinkedInStatus("[LinkedIn Status] User not found for current session");
        }

        if (!user || !user.linkedinTokens || !user.linkedinTokens.accessToken) {
            debugLinkedInStatus("[LinkedIn Status] No LinkedIn connection for user");
            return NextResponse.json({
                success: true,
                connected: false,
                message: "LinkedIn not connected"
            });
        }

        const tokens = user.linkedinTokens;
        const now = new Date();
        const isExpired = tokens.expiresAt && tokens.expiresAt < now;

        // If userId is missing, try to fetch it from LinkedIn
        let userId = tokens.userId;
        if (!userId) {
            debugLinkedInStatus("[LinkedIn Status] userId not stored, fetching from LinkedIn...");
            
            // Try multiple approaches to get userId
            try {
                // Approach 1: Use the me endpoint with proper scope
                const profileResponse = await fetch('https://api.linkedin.com/v2/me', {
                    headers: {
                        'Authorization': `Bearer ${tokens.accessToken}`,
                        'X-Restli-Protocol-Version': '2.0.0',
                    },
                });
                
                if (profileResponse.ok) {
                    const profileData = await profileResponse.json();
                    userId = profileData.id;
                    debugLinkedInStatus("[LinkedIn Status] Fetched userId from profile");
                    
                    // Update stored userId
                    await User.updateOne(
                        { clerkUserId: session.userId },
                        { $set: { 'linkedinTokens.userId': userId } }
                    );
                } else {
                    console.warn("[LinkedIn Status] Could not fetch profile:", profileResponse.status, profileResponse.statusText);
                    
                    // Approach 2: Try using the OAuth token info endpoint
                    // Note: LinkedIn doesn't have a direct token introspection, but we can try
                    // Approach 3: If posting is allowed, the token is valid - we'll handle in upload
                    debugLinkedInStatus("[LinkedIn Status] Profile fetch failed. User will need to reconnect with LinkedIn profile scope.");
                }
            } catch (profileError) {
                console.warn("[LinkedIn Status] Error fetching profile:", profileError);
            }
        }

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
                        debugLinkedInStatus("[LinkedIn Status] Token refreshed successfully");
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
        
        const canPostPersonal = !!userId;
        const hasOrganizations = tokens.organizations && tokens.organizations.length > 0;
        const canPost = canPostPersonal || hasOrganizations;
        const missingScopes = tokens.missingScopes || [];
        const needsProfileReconnect = !canPostPersonal && (missingScopes.includes("profile") || missingScopes.includes("openid") || !hasOrganizations);
        const needsOrgReconnect = !hasOrganizations && (missingScopes.includes("rw_organization_admin") || missingScopes.includes("w_organization_social"));
        
        debugLinkedInStatus("[LinkedIn Status] User connected", {
            canPostPersonal,
            hasOrganizations,
            canPost,
            isExpired: finalIsExpired,
            refreshFailed,
        });
        
        if (!canPost) {
            console.warn("⚠️ LinkedIn user has no valid posting target (no userId and no organizations)");
        }
        
        const responseData = {
            success: true,
            connected: true,
            canPostPersonal: canPostPersonal,
            canPostOrganization: hasOrganizations,
            userName: tokens.userName,
            userId: userId,
            organizations: tokens.organizations || [],
            scopes: tokens.scopes || [],
            missingScopes,
            isExpired: finalIsExpired,
            canPost: canPost,
            connectedAt: tokens.connectedAt,
            needsReconnect: !canPostPersonal && !hasOrganizations,
            needsProfileReconnect,
            needsOrgReconnect,
            message: !canPost
                ? "LinkedIn personal posting needs OpenID profile access. Reconnect LinkedIn so we can request your profile permission."
                : !canPostPersonal
                    ? "LinkedIn is connected, but personal profile posting is unavailable until profile access is granted."
                    : undefined,
        };
        
        debugLinkedInStatus("[LinkedIn Status] Response ready", {
            connected: responseData.connected,
            canPost: responseData.canPost,
            needsReconnect: responseData.needsReconnect,
        });
        
        return NextResponse.json(responseData);

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

        debugLinkedInStatus("[LinkedIn Disconnect] Tokens removed for user:", session.userId);

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
