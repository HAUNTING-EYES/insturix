# Clerk Authentication & Google OAuth - Questions & Answers

## 1. Impact of Changing from Shared to Custom Google OAuth Credentials

### Summary
**No, users will NOT be signed out** when switching from Clerk's shared Google OAuth credentials to custom credentials. However, there are important considerations to be aware of.

### Technical Details

#### What Changes:
- **Shared Credentials (Development)**: Clerk provides preconfigured OAuth credentials and redirect URIs for testing
- **Custom Credentials (Production)**: You configure your own Google Cloud project with custom OAuth Client ID and Secret

#### Impact on Users:

**✅ Session Continuity:**
- Existing user sessions remain active during the transition
- Users are NOT automatically signed out
- Clerk manages authentication independently of which OAuth credentials are used

**⚠️ Potential Considerations:**

1. **OAuth Scope Changes**
   - If you modify OAuth scopes when setting up custom credentials, users may need to re-authorize
   - Only affects users on their next login attempt, not existing sessions

2. **Re-authentication Flow**
   - Users who sign in with Google after the switch will use the new OAuth app
   - The Google consent screen may show your app name/branding (instead of Clerk's) if configured

3. **Session Management**
   - Clerk's `signOut()` function behavior remains the same
   - Sign out ends the Clerk session but typically does NOT sign users out of their Google account

#### Best Practices for Migration:
- Make the change during low-traffic periods
- Test thoroughly in a staging environment first
- Monitor authentication logs for any issues
- Consider adding a notification banner for users

---

## 2. Google OAuth "App Not Verified" Error

### Understanding the Error

The "This app isn't verified" warning appears when:
- Your app requests sensitive/restricted OAuth scopes
- Your app hasn't completed Google's verification process
- The app is in "Testing" publishing status (limited to 100 test users)

### Local Development vs Production

#### Local/Development:
- **Error appears**: Yes, you'll see the warning with unverified apps
- **Can proceed**: Users can click "Advanced" → "Go to [app name] (unsafe)" to continue
- **Testing mode**: Limited to 100 test users added in Google Cloud Console
- **Re-authorization**: Users must re-authenticate every 7 days in testing mode

#### Production:
- **Error appears**: Yes, unless you complete Google's OAuth verification
- **User impact**: Users may be hesitant to use an unverified app
- **Limitations**: Unverified apps have daily login limits

### How to Get Verified for Production

#### Step 1: Configure Google Cloud Project

1. **OAuth Consent Screen**:
   - Set user type to "External"
   - Provide accurate app information:
     - App name
     - App logo
     - Public homepage URL
     - Privacy policy URL (required)
     - Terms of service URL (required)
   - Developer contact information

2. **Verify Domain Ownership**:
   - Use Google Search Console to verify all domains:
     - Homepage URL
     - Privacy policy URL
     - Terms of service URL
     - Authorized redirect URIs
     - Authorized JavaScript origins

3. **Configure Scopes**:
   - Only request minimal, necessary scopes
   - List all required scopes in OAuth Consent Screen
   - Ensure scopes in code match console configuration exactly

#### Step 2: Change Publishing Status

- Switch from "Testing" to "In production" in OAuth consent screen
- This enables submission for verification
- Removes the 7-day re-authorization requirement

#### Step 3: Submit for Verification

Required materials:
- **Scope Justification**: Detailed explanation of how each sensitive/restricted scope is used
- **Demo Video**: Showing:
  - App functionality
  - OAuth consent flow
  - How requested scopes are utilized
- **YouTube upload URL**: A public or unlisted YouTube video link

#### Step 4: Wait for Review

- Google's OAuth review team evaluates your submission
- Communication sent to project owners/editors
- May require third-party security assessment for restricted scopes
- Review can take 4-6 weeks typically

### Quick Fix for Development

If you only need testing and don't require verification immediately:

1. **Add Test Users** in Google Cloud Console:
   - Go to OAuth consent screen → Test users
   - Add email addresses of users who need access
   - These users won't see the "unverified" warning

2. **Alternative**: Use internal user type if app is only for your organization (Google Workspace accounts)

### Scopes to Watch Out For

**Sensitive Scopes** (require verification):
- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/gmail.send`
- Drive, Calendar, Contacts read/write access

**Restricted Scopes** (require verification + security assessment):
- Gmail read access
- Drive broad access
- Admin SDK scopes

---

## Recommendations for Your Project

### For UploaderX Specifically:

Since you're using YouTube upload functionality (`youtube.upload` scope), this is a **sensitive scope** that requires:
1. ✅ OAuth app verification for production use
2. ✅ Demo video showing the upload functionality
3. ✅ Privacy policy explaining data handling
4. ✅ Terms of service

### Migration Path:

1. **Development**: Continue using Clerk's shared credentials or set up custom credentials in "Testing" mode
2. **Staging**: Set up custom Google OAuth credentials, add test users
3. **Production**: Complete verification process before public launch
4. **Timeline**: Start verification process 6-8 weeks before planned production launch

---

## References

- [Clerk OAuth documentation](https://clerk.com/docs/authentication/social-connections/google)
- [Google OAuth verification guide](https://support.google.com/cloud/answer/9110914)
- [Google OAuth consent screen setup](https://support.google.com/cloud/answer/10311615)
