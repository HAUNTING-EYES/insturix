# Admin Panel Documentation

Welcome to the Insturix Admin Panel documentation. This directory contains all resources for the administrative interface.

## 📁 Structure

```
/app/admin/
├── login/
│   └── page.tsx           # Admin login page (redesigned)
├── dashboard/
│   └── page.tsx           # Main admin dashboard
├── creator-approvals/
│   └── page.tsx           # Creator pass approvals
├── bronze-promotions/
│   └── page.tsx           # Bronze promotion submissions
└── layout.tsx             # Shared admin layout

/components/admin/
├── AdminDashboard.tsx
├── AdminDashboardClient.tsx
├── CreatorApprovalsAdmin.tsx
├── BronzePromotionsAdmin.tsx
└── [other admin components]

/Documentation/
├── ADMIN_LOGIN_IMPROVEMENTS.md        # Detailed improvements
├── ADMIN_STYLE_GUIDE.md              # Design system reference
├── ADMIN_COMPONENT_LIBRARY.md        # Reusable components
├── ADMIN_IMPROVEMENTS_SUMMARY.md     # Overview of changes
└── ADMIN_TESTING_CHECKLIST.md        # Testing procedures
```

## 🚀 Quick Start

### Accessing the Admin Panel

1. **Go to Login**: Navigate to `/admin/login`
2. **Sign In**: Use your admin email and password
3. **Access Dashboard**: You'll be redirected to `/admin/dashboard`
4. **Manage Data**: Use the dashboard to manage event data, approvals, etc.

### For Non-Admins
Non-admin users will be automatically redirected to the home page if they try to access admin pages.

## 🎨 Design System

The admin panel follows a **minimalist, professional design** with:

### Colors
- **Primary**: Sky-600 (#0284C7)
- **Background**: Zinc-50 (light) / Zinc-950 (dark)
- **Cards**: White / Zinc-900
- **Borders**: Zinc-200 / Zinc-800

### Typography
- **Page Title**: 32-48px, Bold
- **Section Title**: 24-28px, Bold
- **Card Title**: 18-20px, Semibold
- **Body**: 14px, Regular

### Spacing
- **Section Gap**: 32px
- **Card Padding**: 24-32px
- **Form Fields**: 16px gap
- **Max Width**: 1280px container

## 📚 Documentation

### For Users
- [Admin Login Improvements](./ADMIN_LOGIN_IMPROVEMENTS.md) - What's new in the login page
- [Admin Improvements Summary](./ADMIN_IMPROVEMENTS_SUMMARY.md) - Overview of all changes

### For Developers
- [Admin Style Guide](./ADMIN_STYLE_GUIDE.md) - Complete design system
- [Admin Component Library](./ADMIN_COMPONENT_LIBRARY.md) - Reusable components
- [Testing Checklist](./ADMIN_TESTING_CHECKLIST.md) - QA procedures

## 🔐 Security

### Access Control
- Admin access is **email-based**
- Only approved admin emails can login
- Non-admins are silently redirected

### Configuration
```env
NEXT_PUBLIC_ADMIN_EMAILS=admin@insturix.com,user@insturix.com
```

### Search Engine Protection
All admin pages have:
- `robots: noindex, nofollow` meta tag
- No admin routes in sitemap
- Excluded from search engines

## 🎯 Pages

### 1. Admin Login (`/admin/login`)
**Purpose**: Authenticate admin users  
**Features**:
- Email/password authentication
- Social login support
- Password recovery
- Help and support links

**Design**:
- Minimalist interface
- Professional branding
- Full dark mode support
- Responsive layout

### 2. Dashboard (`/admin/dashboard`)
**Purpose**: Main administrative hub  
**Features**:
- Event overview
- User management
- Analytics and metrics
- Quick actions

### 3. Creator Approvals (`/admin/creator-approvals`)
**Purpose**: Manage creator pass applications  
**Features**:
- View pending applications
- Approve/reject submissions
- Verify social links
- Track application history

### 4. Bronze Promotions (`/admin/bronze-promotions`)
**Purpose**: Manage bronze pass promotions  
**Features**:
- View submissions
- Approve/reject promotions
- Manage promotion tiers
- Track statistics

## 💻 Development

### Setting Up Locally

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Environment Variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Access Admin Panel**
   ```
   http://localhost:3000/admin/login
   ```

### Creating New Admin Pages

Use the [Admin Component Library](./ADMIN_COMPONENT_LIBRARY.md) for pre-built components:

```tsx
import { AdminPage, PrimaryButton, Card } from "@/components/admin/ui";

export default function NewAdminPage() {
  return (
    <AdminPage 
      title="New Admin Page"
      description="Description here"
      action={<PrimaryButton>Action</PrimaryButton>}
    >
      <Card title="Content">
        {/* Your content here */}
      </Card>
    </AdminPage>
  );
}
```

### Following the Style Guide

When building admin components:

1. **Review** [Admin Style Guide](./ADMIN_STYLE_GUIDE.md)
2. **Use** colors from the defined palette
3. **Apply** consistent spacing and typography
4. **Support** dark mode with `dark:` prefix
5. **Test** accessibility with WCAG AA standards

## 🧪 Testing

### Running Tests
```bash
npm run test
```

### Manual Testing
See [Testing Checklist](./ADMIN_TESTING_CHECKLIST.md) for comprehensive testing procedures.

### Key Areas to Test
- [ ] Admin login functionality
- [ ] Admin authorization
- [ ] Non-admin redirect
- [ ] Dark mode switching
- [ ] Mobile responsiveness
- [ ] Keyboard navigation
- [ ] Form validation
- [ ] Error handling

## 🐛 Troubleshooting

### Can't Access Admin Panel
1. Verify your email is in `NEXT_PUBLIC_ADMIN_EMAILS`
2. Clear browser cache and cookies
3. Try incognito/private window
4. Check network tab for errors

### Styling Issues
1. Ensure Tailwind CSS is properly configured
2. Check for conflicting CSS classes
3. Verify dark mode toggle is working
4. Review browser DevTools

### Login Issues
1. Verify Clerk configuration
2. Check environment variables
3. Review browser console for errors
4. Check network tab for API calls

## 📞 Support

### Getting Help
- **Email**: support@insturix.com
- **Slack**: #admin-panel-support
- **Docs**: See documentation files
- **Issues**: File GitHub issue

### Reporting Bugs
When reporting bugs, include:
1. Browser and version
2. Steps to reproduce
3. Expected behavior
4. Actual behavior
5. Screenshots/video if possible

## 📈 Performance

### Optimization Tips
- Use React.lazy for large components
- Implement pagination for large tables
- Cache API responses appropriately
- Optimize images and assets
- Monitor bundle size

### Monitoring
- Set up error tracking (Sentry, etc.)
- Monitor user analytics
- Track page load times
- Monitor API response times
- Set up alerting for errors

## 🔄 Updates & Maintenance

### Recent Updates
- **Nov 1, 2025**: Admin login page redesigned with minimalist design

### Planned Updates
- Two-factor authentication
- Advanced analytics
- Bulk operations
- Audit logging
- Role-based access control

### Maintenance Schedule
- Security updates: As needed
- Bug fixes: Weekly sprint
- Feature updates: Bi-weekly
- Major redesigns: Quarterly

## 📋 Checklist for New Admins

When onboarding new admins:

- [ ] Add email to `NEXT_PUBLIC_ADMIN_EMAILS`
- [ ] Provide Clerk credentials
- [ ] Explain login process
- [ ] Show dashboard walkthrough
- [ ] Explain each admin page
- [ ] Provide help resources
- [ ] Set up security training
- [ ] Provide audit log access

## 🎓 Additional Resources

### Design References
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Clerk Documentation](https://clerk.com/docs)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

### Tools & Software
- VS Code (recommended editor)
- Chrome DevTools
- Figma (design tool)
- Git for version control

## 📝 Contributing

### Code Standards
- Follow TypeScript best practices
- Use meaningful variable names
- Add comments for complex logic
- Write accessible HTML
- Support dark mode

### Commit Messages
```
feat: Add new admin feature
fix: Fix bug in admin dashboard
docs: Update admin documentation
style: Improve admin page styling
test: Add admin page tests
```

### Pull Request Process
1. Create feature branch
2. Make changes following style guide
3. Write tests for changes
4. Update documentation
5. Submit PR with description
6. Address review feedback
7. Merge when approved

## 🚀 Deployment

### Staging
1. PR merged to `staging` branch
2. CI/CD builds and tests
3. Deploy to staging environment
4. QA testing
5. Approval for production

### Production
1. PR merged to `main` branch
2. CI/CD builds and tests
3. Deploy to production environment
4. Monitor logs and analytics
5. Notify stakeholders

## ✅ Status

| Component | Status | Last Updated |
|-----------|--------|--------------|
| Login Page | ✅ Complete | Nov 1, 2025 |
| Dashboard | ✅ Complete | Oct 15, 2025 |
| Creator Approvals | ✅ Complete | Oct 20, 2025 |
| Bronze Promotions | ✅ Complete | Oct 25, 2025 |
| Style Guide | ✅ Complete | Nov 1, 2025 |
| Component Library | ✅ Complete | Nov 1, 2025 |

## 📞 Questions?

Need help? Check the documentation files or contact support@insturix.com

---

**Last Updated**: November 1, 2025  
**Maintainer**: Development Team  
**Version**: 1.0
