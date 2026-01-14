
import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");

    if (!code) {
        return NextResponse.json({ success: false, error: "Missing authorization code" }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        process.env.YOUTUBE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
        return NextResponse.json({ success: false, error: "No access token received" }, { status: 400 });
    }

    // Redirect to dashboard with token
    const redirectUrl = `http://localhost:3000/dashboard/uploaderx?token=${tokens.access_token}`;
    return NextResponse.redirect(redirectUrl);
}
