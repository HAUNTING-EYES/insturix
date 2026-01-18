# Admin Dashboard - Quick Setup Guide

## ⚡ 1-Minute Setup

### Step 1: Add Admin Emails to `.env.local`

```bash
# .env.local
ADMIN_EMAILS=your-admin-email@insturix.com,another-admin@insturix.com
```

### Step 2: Access the Dashboard

**URL**: `https://insturix.com/admin` or `https://insturix.com/admin/login`

### Step 3: Sign In

- Sign in with your Clerk account using the admin email
- Backend automatically validates against `ADMIN_EMAILS`
- Only authorized admins can access

## 📋 What You'll See

### ICS'25 Events Tab
- Total pass registrations
- GameOn tournament registrations  
- Payment status overview
- Game type breakdown (Valorant vs BGMI)
- Real-time registration counts

### Analytics Tab
- Total users on platform
- Active users (last 30 days)
- Registrations by plan (Bronze/Silver/Gold/Platinum)
- 30-day registration trend chart

## 🔐 Security Checklist

✅ **Emails are validated server-side** - Cannot be bypassed  
✅ **Hidden from search engines** - robots.txt excludes /admin  
✅ **No navigation links on main site** - Only direct URL or search  
✅ **Clerk authentication required** - Standard identity verification  
✅ **Session-based** - Users can logout anytime  

## 🎯 Common Tasks

### Check Real-Time Registrations
1. Open `/admin/dashboard`
2. View "ICS'25 Events" tab
3. See live registration counts

### View Payment Status
1. Open `/admin/dashboard`
2. Click "Payments" sub-tab under ICS'25
3. See completed and pending payments

### Analyze Game Distribution
1. Open `/admin/dashboard`  
2. Click "Games" sub-tab
3. See Valorant vs BGMI breakdown

### Check User Engagement
1. Open `/admin/dashboard`
2. Switch to "Analytics" tab
3. View engagement metrics and trends

## 🛠️ Customization

### Add More Admins
Edit `.env.local`:
```bash
ADMIN_EMAILS=email1@domain.com,email2@domain.com,email3@domain.com
```

### Change Data Update Frequency
In component files:
```typescript
// Default: 30 seconds for ICS'25, 60 seconds for Analytics
const interval = setInterval(fetchData, 30000);
```

## 📱 Device Support

✅ Works on desktop  
✅ Works on tablet  
✅ Works on mobile  
✅ Works in light mode  
✅ Works in dark mode  

## 🔍 Troubleshooting

**Q: Admin can't login?**  
A: Check email is in `ADMIN_EMAILS` in `.env.local`

**Q: Data not updating?**  
A: Refresh the page or wait for auto-update (30-60 seconds)

**Q: Styling looks broken?**  
A: Clear cache: `rm -rf .next && npm run build`

## 📊 Data Points Available

### ICS'25 Tab
- Total registrations
- Pass registrations
- GameOn registrations
- Paid registrations
- Pending registrations
- Valorant teams
- BGMI teams
- Payment revenue

### Analytics Tab
- Total users
- Active users
- Engagement rate
- Registrations by plan
- 30-day trends

## 🎨 Design Features

- 🌈 Gradient backgrounds matching site aesthetic
- ✨ Smooth animations and transitions
- 🌙 Full dark mode support
- 📱 Fully responsive layout
- ⚡ Real-time data updates
- 🎯 Intuitive tab navigation
- 💡 Color-coded statistics

## 📞 Need Help?

Refer to `ADMIN_DASHBOARD_GUIDE.md` for detailed documentation.

---

**Status**: Ready to use ✅  
**Last Updated**: October 31, 2025
