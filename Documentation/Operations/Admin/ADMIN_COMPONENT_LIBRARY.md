# Admin Component Library - Ready-to-Use Examples

This file contains copy-paste ready admin components following the Insturix design system.

## 📦 Button Components

### Primary Button
```tsx
export function PrimaryButton({ 
  children, 
  onClick, 
  disabled = false 
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-sky-600 hover:bg-sky-700 disabled:bg-zinc-400 dark:disabled:bg-zinc-600 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
```

### Secondary Button
```tsx
export function SecondaryButton({ 
  children, 
  onClick, 
  disabled = false 
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 text-zinc-900 dark:text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
```

### Danger Button 
```tsx
export function DangerButton({ 
  children, 
  onClick, 
  disabled = false 
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
```

## 📝 Input Components

### Text Input
```tsx
export function TextInput({
  label,
  placeholder,
  value,
  onChange,
  error,
  required = false,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="text-red-600 ml-1">*</span>}
      </label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
```

### Textarea
```tsx
export function Textarea({
  label,
  placeholder,
  value,
  onChange,
  error,
  rows = 4,
  required = false,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="text-red-600 ml-1">*</span>}
      </label>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
```

### Select Input
```tsx
export function SelectInput({
  label,
  value,
  onChange,
  options,
  error,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="text-red-600 ml-1">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
      >
        <option value="">Select an option</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
```

## 🎴 Card Components

### Info Card
```tsx
export function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="text-sm text-blue-900 dark:text-blue-200">{children}</div>
      </div>
    </div>
  );
}
```

### Success Card
```tsx
export function SuccessCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="text-sm text-green-900 dark:text-green-200">{children}</div>
      </div>
    </div>
  );
}
```

### Warning Card
```tsx
export function WarningCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4">
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="text-sm text-yellow-900 dark:text-yellow-200">{children}</div>
      </div>
    </div>
  );
}
```

### Error Card
```tsx
export function ErrorCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="text-sm text-red-900 dark:text-red-200">{children}</div>
      </div>
    </div>
  );
}
```

### Standard Card
```tsx
export function Card({ 
  title, 
  children 
}: { 
  title?: string; 
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
      {title && (
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}
```

## 📊 Table Component

```tsx
export function DataTable({
  columns,
  data,
  onRowClick,
}: {
  columns: { key: string; label: string }[];
  data: any[];
  onRowClick?: (row: any) => void;
}) {
  return (
    <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-6 py-3 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr
              key={idx}
              onClick={() => onRowClick?.(row)}
              className="border-b border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="px-6 py-3 text-sm text-zinc-900 dark:text-zinc-100"
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

## 🎯 Dialog/Modal Component

```tsx
"use client";

import { useState } from "react";

export function ConfirmDialog({
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDangerous = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-zinc-900 rounded-lg max-w-md w-full p-6 space-y-4">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
          {title}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
        <div className="flex gap-3 pt-4">
          <button
            onClick={onCancel}
            className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 text-white font-medium py-2.5 rounded-lg transition-colors ${
              isDangerous
                ? "bg-red-600 hover:bg-red-700"
                : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
```

## 🔄 Loading Component

```tsx
export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-8 h-8 animate-spin rounded-full border-4 border-zinc-300 dark:border-zinc-600 border-t-sky-500" />
    </div>
  );
}
```

## 📋 Form Layout

```tsx
export function AdminForm({ 
  onSubmit, 
  children 
}: { 
  onSubmit: (e: React.FormEvent) => void; 
  children: React.ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {children}
    </form>
  );
}

// Usage:
<AdminForm onSubmit={handleSubmit}>
  <TextInput label="Name" {...} />
  <SelectInput label="Status" {...} />
  <Textarea label="Description" {...} />
  <div className="flex gap-4 pt-4">
    <SecondaryButton>Cancel</SecondaryButton>
    <PrimaryButton>Submit</PrimaryButton>
  </div>
</AdminForm>
```

## 📱 Page Layout

```tsx
export function AdminPage({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">
              {title}
            </h1>
            {description && (
              <p className="text-zinc-600 dark:text-zinc-400 mt-2">
                {description}
              </p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
```

---

## 💡 Usage Tips

1. **Import these components** into your admin pages and components
2. **Customize colors** by changing the Tailwind classes if needed
3. **Maintain consistency** by using these components instead of creating new styles
4. **Follow naming conventions** to keep the codebase organized
5. **Test dark mode** when implementing new components

## 📁 Suggested File Location

Create a new file: `/components/admin/ui/` to store these reusable components:
- `/components/admin/ui/buttons.tsx`
- `/components/admin/ui/inputs.tsx`
- `/components/admin/ui/cards.tsx`
- `/components/admin/ui/table.tsx`
- `/components/admin/ui/dialog.tsx`
- `/components/admin/ui/loading.tsx`
- `/components/admin/ui/layouts.tsx`

---

**Last Updated**: November 1, 2025
**Status**: Ready to Use
