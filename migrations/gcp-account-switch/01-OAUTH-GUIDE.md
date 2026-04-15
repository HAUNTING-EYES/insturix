# 1️⃣ OAuth Client Creation — Manual Guide

**Why:** Clerk's "Sign in with Google" needs an OAuth Client in the `clerk-oauth-v2` project on new account. This is the only piece that can't be automated — Google requires manual consent screen setup.

**Time:** ~10 minutes. Zero risk (old OAuth stays active).

---

## Step 1: Configure OAuth Consent Screen

**Open:** https://console.cloud.google.com/apis/credentials/consent?project=clerk-oauth-v2

Click **"Get started"** then fill in:

### App Information
- **App name:** `Insturix`
- **User support email:** `jnimit865@gmail.com` (or whatever email you're using for new account)

### Audience
- **Type:** `External`
- Select "External" — this allows ANY Google account to sign in, which is what Clerk needs for public signups

### Contact Information
- **Email addresses:** `jnimit865@gmail.com` (your email — for Google to reach you about this consent screen)

### Finish
- Agree to the Google API Services User Data Policy
- Click **"Create"**

---

## Step 2: Add Scopes

After consent screen is created:

1. You'll be in the consent screen config
2. Click **"Branding"** tab on left → it's already saved from Step 1
3. Click **"Data Access"** tab on left → click **"Add or remove scopes"**
4. Select these 3 non-sensitive scopes (should be checked by default):
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
5. Click **"Update"** then **"Save"**

**Note:** These are the same scopes Clerk already uses (visible in your Clerk screenshot). No app verification needed.

---

## Step 3: Create OAuth Client ID

1. Open: https://console.cloud.google.com/apis/credentials?project=clerk-oauth-v2
2. Click **"+ Create Credentials"** at top → **"OAuth client ID"**
3. Fill in:
   - **Application type:** `Web application`
   - **Name:** `Insturix_Clerk` (or any name you want)
   - **Authorized JavaScript origins:** *(leave empty — matches current config)*
   - **Authorized redirect URIs:** Click "Add URI" and enter exactly:
     ```
     https://clerk.insturix.com/v1/oauth_callback
     ```
4. Click **"Create"**

You'll get a popup with:
- **Client ID:** `NEW_PROJECT_NUMBER-xxxxx.apps.googleusercontent.com`
- **Client Secret:** `GOCSPX-xxxxx`

**📝 IMPORTANT: Copy both values to a secure place.** You cannot view the Client Secret again later — only at creation time.

---

## Step 4: Save Credentials

Create a secrets file (gitignored):

```bash
# In Git Bash, in project root:
cat > migrations/gcp-account-switch/secrets/oauth-credentials.txt <<'EOF'
NEW OAuth Client (for Clerk)
============================
Project: clerk-oauth-v2
Created: YYYY-MM-DD

Client ID:     PASTE_HERE
Client Secret: PASTE_HERE
Redirect URI:  https://clerk.insturix.com/v1/oauth_callback
EOF
```

Or just paste them to me in chat — I'll note them securely.

---

## Step 5: Update Clerk Dashboard

**⚠️ CRITICAL — this is the cutover step. Do this ONLY when you're ready to switch.**
Once you save the new credentials in Clerk, all new Google sign-ins use the new OAuth client. Existing user sessions are unaffected.

1. Go to https://dashboard.clerk.com → your application
2. Navigate: **User & Authentication → Social Connections → Google**
3. You'll see the current config (the one in your earlier screenshot)
4. Section: **"Use custom credentials"** — it's already enabled
5. **Update the fields:**
   - Client ID: paste NEW Client ID
   - Client Secret: paste NEW Client Secret
   - (Redirect URI stays the same: `https://clerk.insturix.com/v1/oauth_callback`)
6. Click **"Save"**

**Testing after save:**
- Open a private/incognito browser window
- Go to https://insturix.com/signin (or wherever your Clerk sign-in is)
- Click "Continue with Google"
- Try to sign in with a Google account
- Should work identically to before

**If it fails:**
- Open browser DevTools → Network tab → try again
- Look for the request to `oauth2/v2/auth` or the redirect chain
- Error message usually tells you the exact issue (wrong redirect URI, invalid client, etc.)
- Revert to old Client ID + Secret in Clerk Dashboard — instant fix

---

## Step 6: Rotate the OLD Client Secret (Optional but Recommended)

The old secret `GOCSPX-4uNEZeCHlLMEFaYuAfXa5-rO3AF` was visible in your screenshot (and in chat history). Even though we're not using it anymore after cutover, best practice is to rotate it:

1. Go to old project: https://console.cloud.google.com/apis/credentials?project=clerk-oauth-project
2. Click the OAuth Client that was used by Clerk
3. Click **"Add secret"** to generate a new secret
4. Mark the old secret as "Disabled" (don't delete — grace period)
5. After 48 hours of stability on new account, delete old secret entirely

---

## Rollback (if anything goes wrong)

Any time before Step 5, nothing affects production.
At Step 5, if something breaks, just paste the OLD credentials back into Clerk Dashboard:
- Client ID: `785444891498-5maafejqmig2u66kuujb979cp8u0punb.apps.googleusercontent.com`
- Client Secret: `GOCSPX-4uNEZeCHlLMEFaYuAfXa5-rO3AF` (from your screenshot)
- Takes effect immediately

---

## ✅ Completion Checklist

- [ ] OAuth consent screen created in `clerk-oauth-v2`
- [ ] Scopes configured (openid, email, profile)
- [ ] OAuth Client ID created with correct redirect URI
- [ ] Client ID + Secret saved securely
- [ ] (Later, during cutover) Clerk Dashboard updated with new credentials
- [ ] (Later, during cutover) Tested Google sign-in works
