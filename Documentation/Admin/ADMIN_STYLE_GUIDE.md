# Admin Panel - Style Guide & Best Practices

## 🎨 Design System Overview

This guide ensures consistency across all admin pages and components in the Insturix admin panel.

## 🌈 Color Palette

### Primary Colors
```
Sky (Primary Action): #0284C7 (sky-600)
Sky Hover: #0369A1 (sky-700)
Sky Light BG: #F0F9FF (sky-50)
Sky Dark BG: #0C2340 (sky-900/30 dark)
```

### Neutral Colors
```
Zinc 50 (Light BG):    #FAFAFA
Zinc 100 (Light Alt):  #F4F4F5
Zinc 200 (Light Border): #E4E4E7
Zinc 300 (Light Border Focus): #D4D4D8
Zinc 400 (Light Text Tertiary): #A1A1A1
Zinc 600 (Dark Text Primary): #52525B
Zinc 700 (Dark Text Bold): #3F3F46
Zinc 800 (Dark Alt): #27272A
Zinc 900 (Dark Card): #18181B
Zinc 950 (Dark BG): #09090B
```

### Status Colors
```
Success (Green): #16A34A (green-600)
Warning (Yellow): #EAB308 (yellow-400)
Error (Red): #DC2626 (red-600)
Info (Blue): #2563EB (blue-600)
```

### Dark Mode Equivalents
All colors automatically adjust for dark mode using Tailwind's `dark:` prefix.

## 📐 Typography

### Heading Hierarchy
```
Page Title (H1):     32-48px, Bold (font-extrabold), tracking-tight
Section Title (H2):  24-28px, Bold (font-bold)
Card Title (H3):     18-20px, Semibold (font-semibold)
Label/Button:        14px, Medium (font-medium)
Body Text:           14px, Regular (font-normal)
Helper Text:         12px, Regular (font-normal), Text zinc-500
```

### Font Stack
```
Primary Font: System default (Tailwind default)
Line Height: 1.5 (normal)
Letter Spacing: -0.02em for headings (tracking-tight)
```

## 🎯 Spacing System

```
xs: 4px
sm: 8px
md: 16px
lg: 24px
xl: 32px
2xl: 48px
3xl: 64px
4xl: 80px
```

## 📦 Component Patterns

### Buttons

#### Primary Button
```tsx
<button className="bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors">
  Action
</button>
```

#### Secondary Button
```tsx
<button className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium py-2.5 px-4 rounded-lg transition-colors">
  Action
</button>
```

#### Danger Button
```tsx
<button className="bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors">
  Delete
</button>
```

### Input Fields

#### Text Input
```tsx
<input 
  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-white rounded-lg px-3 py-2.5 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
  type="text"
  placeholder="Placeholder text"
/>
```

#### Textarea
```tsx
<textarea 
  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-white rounded-lg px-3 py-2.5 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
  placeholder="Enter text..."
/>
```

### Cards

#### Standard Card
```tsx
<div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
  {/* Content */}
</div>
```

#### Info Card
```tsx
<div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
  <div className="flex gap-3">
    <div className="flex-shrink-0">
      <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" />
    </div>
    <p className="text-sm text-blue-900 dark:text-blue-200">Message</p>
  </div>
</div>
```

#### Success Card
```tsx
<div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
  {/* Similar structure */}
</div>
```

#### Warning Card
```tsx
<div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
  {/* Similar structure */}
</div>
```

### Tables

```tsx
<div className="overflow-x-auto">
  <table className="w-full">
    <thead>
      <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Header
        </th>
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
        <td className="px-6 py-3 text-sm text-zinc-900 dark:text-zinc-100">Data</td>
      </tr>
    </tbody>
  </table>
</div>
```

## 🧩 Layout Patterns

### Page Structure
```tsx
<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
  {/* Header */}
  <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
    {/* Navigation and title */}
  </header>

  {/* Main Content */}
  <main className="flex-1">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Content */}
    </div>
  </main>
</div>
```

### Content Grid
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Cards */}
</div>
```

## 🎭 Dark Mode

### Implementation
- Use Tailwind's `dark:` prefix for dark mode styles
- Base styles are for light mode
- Always provide dark mode alternatives

### Example
```tsx
<div className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
  {/* Content */}
</div>
```

## ✨ Interactive Elements

### Transitions
```tsx
className="transition-colors"  // For color changes
className="transition-opacity" // For opacity changes
className="transition-all"     // For all properties
```

### Hover States
```tsx
className="hover:bg-zinc-100 dark:hover:bg-zinc-800"
className="hover:text-sky-700"
className="hover:shadow-md"
```

### Focus States
```tsx
className="focus:outline-none focus:ring-2 focus:ring-sky-500"
```

## 🎬 Loading States

### Spinner
```tsx
<div className="w-8 h-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
```

### Skeleton
```tsx
<div className="bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse h-4 w-3/4" />
```

## 📱 Responsive Breakpoints

```
Mobile:  < 640px   (no prefix)
Tablet:  640px+    (sm:)
Desktop: 1024px+   (lg:)
Wide:    1280px+   (xl:)
```

## ♿ Accessibility Guidelines

1. **Color Contrast**: Minimum 4.5:1 for text
2. **Focus Indicators**: Always visible focus states
3. **Labels**: Every input has associated label
4. **Semantic HTML**: Use proper heading hierarchy
5. **ARIA**: Use when semantic HTML isn't enough
6. **Keyboard Navigation**: All interactive elements accessible via keyboard

## 📋 Admin Pages Checklist

When creating new admin pages:

- [ ] Add `robots: noindex, nofollow` to metadata
- [ ] Check admin authorization before rendering
- [ ] Implement proper error boundaries
- [ ] Use consistent header and footer
- [ ] Apply dark mode to all components
- [ ] Test keyboard navigation
- [ ] Add loading states
- [ ] Include confirmation dialogs for destructive actions
- [ ] Log admin actions for audit trail
- [ ] Add proper TypeScript types

## 🔗 Related Files

- `/app/admin/login/page.tsx` - Login page (reference implementation)
- `/app/admin/dashboard/page.tsx` - Dashboard page
- `/components/admin/` - Admin components
- `/tailwind.config.ts` - Tailwind configuration

## 📝 Examples

### Complete Form Component
```tsx
<form className="space-y-6">
  <div>
    <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
      Email Address
    </label>
    <input
      id="email"
      type="email"
      className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
    />
  </div>
  
  <button type="submit" className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 rounded-lg transition-colors">
    Submit
  </button>
</form>
```

---

**Last Updated**: November 1, 2025
**Version**: 1.0
**Maintainer**: Design Team
