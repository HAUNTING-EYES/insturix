import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/schemas/ConnectToDatabase";

/**
 * GET /api/services/uploaderx/linkedin/callback
 * Handles LinkedIn OAuth callback and exchanges code for tokens
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state'); // This should be the userId
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
            console.error("❌ LinkedIn OAuth error:", error, errorDescription);
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/uploaderx?error=linkedin_auth_failed&message=${encodeURIComponent(errorDescription || error)}`);
        }

        if (!code || !state) {
            console.error("❌ LinkedIn callback missing code or state. Code:", !!code, "State:", state);
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/uploaderx?error=linkedin_auth_invalid`);
        }

        console.log("[LinkedIn Callback] Received code and state. State (userId):", state);

        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/services/uploaderx/linkedin/callback`;

        console.log("[LinkedIn Callback] Using redirect URI:", redirectUri);

        if (!clientId || !clientSecret) {
            console.error("❌ LinkedIn credentials not configured");
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/uploaderx?error=linkedin_config_error`);
        }

        // Exchange code for access token
        const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || tokenData.error) {
            console.error("❌ LinkedIn token exchange failed:", tokenData);
            return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/uploaderx?error=linkedin_token_exchange_failed`);
        }

        const { access_token, expires_in, refresh_token } = tokenData;

        const requestProfileScope = process.env.LINKEDIN_REQUEST_PROFILE_SCOPE === 'true';

        let profileData: any = {};
        if (requestProfileScope) {
            const profileResponse = await fetch('https://api.linkedin.com/v2/me', {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });

            profileData = await profileResponse.json();
            if (!profileResponse.ok || profileData.serviceErrorCode) {
                console.warn("⚠️ LinkedIn profile fetch skipped or failed:", profileData);
                profileData = {};
            }
        }

        let emailAddress = undefined;
        if (process.env.LINKEDIN_REQUEST_EMAIL_SCOPE === 'true') {
            try {
                const emailResponse = await fetch('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
                    headers: {
                        'Authorization': `Bearer ${access_token}`,
                        'X-Restli-Protocol-Version': '2.0.0',
                    },
                });
                const emailData = await emailResponse.json();
                if (emailResponse.ok && emailData.elements?.[0]?.['handle~']?.emailAddress) {
                    emailAddress = emailData.elements[0]['handle~'].emailAddress;
                }
            } catch (emailError) {
                console.warn('⚠️ LinkedIn email fetch failed:', emailError);
            }
        }

        // Get user's organizations (companies they administer)
        let organizations = [];
        try {
            const orgsResponse = await fetch('https://api.linkedin.com/v2/organizations?q=organizations', {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'X-Restli-Protocol-Version': '2.0.0',
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
                console.warn("⚠️ LinkedIn organizations fetch failed, continuing without orgs");
            }
        } catch (orgError) {
            console.warn("⚠️ LinkedIn organizations fetch error:", orgError);
        }

        // Store tokens in database
        await connectToDatabase();
        const { User } = await import("@/schemas/user");

        const expiresAt = new Date(Date.now() + (expires_in * 1000));
        const linkedinTokens: any = {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt,
            connectedAt: new Date(),
            organizations: organizations,
        };

        if (profileData?.id) {
            linkedinTokens.userId = profileData.id;
            linkedinTokens.userName = `${profileData.localizedFirstName || ''} ${profileData.localizedLastName || ''}`.trim() || undefined;
        }

        await User.updateOne(
            { clerkUserId: state },
            {
                $set: {
                    'linkedinTokens': linkedinTokens,
                }
            },
            { upsert: true }
        );

        // Verify the tokens were saved
        const savedUser = await User.findOne({ clerkUserId: state });
        console.log("✅ LinkedIn tokens stored for user:", state);
        console.log("✅ Saved user data - linkedinTokens exists:", !!savedUser?.linkedinTokens);
        console.log("✅ Saved user data - accessToken exists:", !!savedUser?.linkedinTokens?.accessToken);
        console.log("✅ Saved user data - full tokens:", savedUser?.linkedinTokens);

        // Redirect back to dashboard with success
        const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/uploaderx?success=linkedin_connected&t=${Date.now()}`;
        console.log("[LinkedIn Callback] Redirecting to:", redirectUrl);
        return NextResponse.redirect(redirectUrl);

    } catch (error) {
        console.error("❌ LinkedIn callback error:", error);
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/uploaderx?error=linkedin_callback_error`);
    }
}