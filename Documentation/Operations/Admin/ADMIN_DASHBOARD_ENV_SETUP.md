# Admin Dashboard Environment Setup

## Required Environment Variables

Add these to your `.env.local` file to enable the admin dashboard:

### Admin Email Configuration

```bash
# Add your admin email(s) here - comma-separated
# Only users with these emails can access the admin dashboard
ADMIN_EMAILS=admin@insturix.com,manager@insturix.com

# For development/testing
# ADMIN_EMAILS=your-email@gmail.com,another-admin@company.com

# For production (multiple admins)
# ADMIN_EMAILS=admin1@insturix.com,admin2@insturix.com,analytics@insturix.com,manager@insturix.com
```

## Required Existing Variables

These should already be in your `.env.local`:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_key
CLERK_SECRET_KEY=your_secret

# MongoDB Connection
MONGODB_URI=your_mongodb_connection_string

# Other existing configs...
```

## Setup Instructions

### 1. Add Admin Emails

```bash
# Edit .env.local
ADMIN_EMAILS=your-admin-email@insturix.com
```

### 2. Verify Clerk Setup

Make sure Clerk is properly configured:
- [ ] Clerk project created
- [ ] Publishable and Secret keys added to `.env.local`
- [ ] Webhook configured (if needed)

### 3. Verify MongoDB Setup

Make sure MongoDB is connected:
- [ ] Connection string in `MONGODB_URI`
- [ ] Player and Team schemas accessible
- [ ] Database "ics25" exists

### 4. Test the Dashboard

```bash
# Start dev server
npm run dev

# Visit the admin dashboard
http://localhost:3000/admin
```

### 5. Verify Everything Works

- [ ] Login page appears at `/admin/login`
- [ ] Can sign in with admin email
- [ ] Dashboard loads with data
- [ ] Tabs and animations work
- [ ] Data updates automatically

## Email Format

Admin emails must be:
- ✅ Exact email addresses (case-insensitive in validation)
- ✅ Comma-separated if multiple
- ✅ Trimmed (spaces removed automatically)
- ✅ Valid email format

### Valid Examples

```bash
# Single admin
ADMIN_EMAILS=admin@insturix.com

# Multiple admins (comma-separated)
ADMIN_EMAILS=admin@insturix.com,manager@insturix.com

# With spaces (spaces are trimmed)
ADMIN_EMAILS=admin@insturix.com, manager@insturix.com , analytics@insturix.com
```

### Invalid Examples

```bash
# ❌ No spaces between commas
ADMIN_EMAILS=admin@insturix.com, manager@insturix.com  # Space will be trimmed

# ❌ Empty or only whitespace
ADMIN_EMAILS=

# ❌ Invalid email format
ADMIN_EMAILS=not-an-email
```

## Security Notes

- **Server-Side Validation**: Email checking happens on the server and cannot be bypassed
- **Clerk Required**: Users must be authenticated with Clerk first
- **Environment Variable**: Emails are stored in environment, not in code
- **Case-Insensitive**: Email matching is case-insensitive
- **Hidden from Search**: Admin routes have `robots: noindex, nofollow`

## Database Requirements

The admin dashboard requires these MongoDB collections:

```
Database: ics25
Collections:
- Ics25Player (or players)
  - Fields: clerkUserId, game, payment.status, createdAt
  
- Ics25Team (or teams)
  - Fields: members, leader, createdAt
  
- Ics25Attendee (optional)
  - For pass registration tracking
```

## API Requirements

These API endpoints must be working:

```
GET /api/ics25/admin/analytics
  - Returns ICS'25 event statistics
  - Requires admin email validation

GET /api/ics25/admin/analytics/general
  - Returns general platform analytics
  - Requires admin email validation
```

## Troubleshooting

### Admin Can't Login

**Problem**: Email login fails or redirects to home page

**Solution**:
1. Verify email is in `ADMIN_EMAILS` (exact match)
2. Check `.env.local` is reloaded (restart dev server)
3. Verify Clerk is working (test sign up/in)

```bash
# Restart dev server
npm run dev
```

### Dashboard Shows No Data

**Problem**: Analytics page loads but no statistics

**Solution**:
1. Check MongoDB connection
2. Verify Player/Team schemas exist
3. Check API response in browser console

```bash
# Test API in browser console
fetch('/api/ics25/admin/analytics')
  .then(r => r.json())
  .then(d => console.log(d))
```

### Environment Variable Not Working

**Problem**: Added ADMIN_EMAILS but dashboard still doesn't work

**Solution**:
1. Stop dev server: `Ctrl+C`
2. Clear cache: `rm -rf .next`
3. Restart dev server: `npm run dev`
4. Verify environment file is `.env.local` (not `.env`)

## Production Deployment

### Before Deployment

```bash
# Test build locally
npm run build

# Verify no errors
npm start
```

### Set Admin Emails in Production

For Vercel:
```bash
# In Vercel dashboard or CLI:
vercel env add ADMIN_EMAILS

# Enter: admin@insturix.com,manager@insturix.com
```

For other platforms:
```bash
# Add to environment variables UI or CLI:
ADMIN_EMAILS=admin@insturix.com,manager@insturix.com
```

### Verify Production

```bash
# Test production URL
https://your-domain.com/admin

# Should redirect to login
# Login with admin email should work
```

## Monitoring

Monitor these metrics:

- Admin login attempts (check Clerk logs)
- API response times (`/api/ics25/admin/*`)
- Data accuracy (compare with source)
- Page load performance
- Error rates

## Support

If issues persist:

1. Check MongoDB logs
2. Check API response in Network tab
3. Verify Clerk configuration
4. Ensure all required schemas exist
5. Check browser console for errors

---

**Last Updated**: October 31, 2025  
**Status**: Ready for deployment ✅
