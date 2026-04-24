import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";
import { getLinkedInScopes } from "@/lib/uploaderx/linkedinScopes";
import { getLinkedInDashboardUrl, getLinkedInRedirectUri } from "@/lib/uploaderx/linkedinUrl";

/**
 * GET /api/services/uploaderx/linkedin/callback
 * Handles LinkedIn OAuth callback and exchanges code for tokens
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const code = searchParams.get("code");
        const state = searchParams.get("state");
        const error = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        if (error) {
            console.error("LinkedIn OAuth error:", error, errorDescription);
            return NextResponse.redirect(getLinkedInDashboardUrl(`/dashboard/uploaderx?error=linkedin_auth_failed&message=${encodeURIComponent(errorDescription || error)}`, request));
        }

        if (!code || !state) {
            console.error("LinkedIn callback missing code or state. Code:", !!code, "State:", state);
            return NextResponse.redirect(getLinkedInDashboardUrl("/dashboard/uploaderx?error=linkedin_auth_invalid", request));
        }

        const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
        const redirectUri = getLinkedInRedirectUri(request);

        if (!clientId || !clientSecret) {
            console.error("LinkedIn credentials not configured");
            return NextResponse.redirect(getLinkedInDashboardUrl("/dashboard/uploaderx?error=linkedin_config_error", request));
        }

        const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || tokenData.error) {
            console.error("LinkedIn token exchange failed:", tokenData);
            return NextResponse.redirect(getLinkedInDashboardUrl("/dashboard/uploaderx?error=linkedin_token_exchange_failed", request));
        }

        const { access_token, expires_in, refresh_token, id_token } = tokenData;
        const { scopes, options } = getLinkedInScopes();
        const missingScopes: string[] = [];

        let profileData: any = {};
        if (options.includeProfile) {
            if (id_token) {
                try {
                    const [, payload] = id_token.split(".");
                    if (payload) {
                        const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
                        profileData = {
                            id: decoded.sub,
                            localizedFirstName: decoded.given_name,
                            localizedLastName: decoded.family_name,
                            name: decoded.name,
                            picture: decoded.picture,
                        };
                    }
                } catch (decodeError) {
                    console.warn("LinkedIn ID token decode failed:", decodeError);
                }
            }

            if (!profileData?.id) {
                try {
                    const userInfoResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
                        headers: {
                            Authorization: `Bearer ${access_token}`,
                        },
                    });
                    const userInfoData = await userInfoResponse.json();
                    if (userInfoResponse.ok && userInfoData?.sub) {
                        profileData = {
                            id: userInfoData.sub,
                            localizedFirstName: userInfoData.given_name,
                            localizedLastName: userInfoData.family_name,
                            name: userInfoData.name,
                            picture: userInfoData.picture,
                        };
                    } else {
                        console.warn("LinkedIn userinfo fetch failed:", userInfoData);
                        missingScopes.push("profile");
                    }
                } catch (profileError) {
                    console.warn("LinkedIn userinfo fetch failed:", profileError);
                    missingScopes.push("profile");
                }
            }
        }

        if (options.includeEmail) {
            try {
                const emailResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                    },
                });
                const emailData = await emailResponse.json();
                if (!emailResponse.ok || !emailData?.email) {
                    missingScopes.push("email");
                }
            } catch (emailError) {
                console.warn("LinkedIn email fetch failed:", emailError);
                missingScopes.push("email");
            }
        }

        let organizations = [];
        if (options.includeOrganizationAdmin || options.includeOrganizationSocial) {
            try {
                const orgsResponse = await fetch("https://api.linkedin.com/v2/organizations?q=organizations", {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                        "X-Restli-Protocol-Version": "2.0.0",
                    },
                });

                if (orgsResponse.ok) {
                    const orgsData = await orgsResponse.json();
                    organizations = orgsData.elements?.map((org: any) => ({
                        id: org.id,
                        name: org.localizedName,
                        vanityName: org.vanityName,
                    })) || [];
                } else {
                    console.warn("LinkedIn organizations fetch failed");
                    if (options.includeOrganizationAdmin) {
                        missingScopes.push("rw_organization_admin");
                    }
                    if (options.includeOrganizationSocial) {
                        missingScopes.push("w_organization_social");
                    }
                }
            } catch (orgError) {
                console.warn("LinkedIn organizations fetch error:", orgError);
                if (options.includeOrganizationAdmin) {
                    missingScopes.push("rw_organization_admin");
                }
                if (options.includeOrganizationSocial) {
                    missingScopes.push("w_organization_social");
                }
            }
        }

        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        const expiresAt = new Date(Date.now() + expires_in * 1000);
        const linkedinTokens: any = {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt,
            connectedAt: new Date(),
            organizations,
            scopes,
            missingScopes: Array.from(new Set(missingScopes)),
        };

        if (profileData?.id) {
            linkedinTokens.userId = profileData.id;
            linkedinTokens.userName = `${profileData.localizedFirstName || ""} ${profileData.localizedLastName || ""}`.trim() || undefined;
        }

        await User.updateOne(
            { clerkUserId: state },
            {
                $set: {
                    linkedinTokens,
                },
            },
            { upsert: true }
        );

        const redirectUrl = getLinkedInDashboardUrl(`/dashboard/uploaderx?success=linkedin_connected&t=${Date.now()}`, request);
        return NextResponse.redirect(redirectUrl);
    } catch (error) {
        console.error("LinkedIn callback error:", error);
        return NextResponse.redirect(getLinkedInDashboardUrl("/dashboard/uploaderx?error=linkedin_callback_error", request));
    }
}
