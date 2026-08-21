'use client';

/**
 * Organization Settings Page
 *
 * Manage org settings, members, and danger zone.
 *
 * 2026-08 audit batch C:
 * - "Delete Organization" previously confirm()'d and then only redirected — the
 *   org survived. It now runs the real flow: server ownership check
 *   (DELETE /api/org/[orgId]) → Clerk organization.destroy() → cache
 *   invalidation → redirect. Guarded by a typed-name confirmation instead of a
 *   native confirm(), with visible pending + error states.
 * - Clerk's OrganizationProfile navbar is no longer hidden: its Members page
 *   (with invitations) was unreachable anywhere in the product — this is the
 *   invite path until a first-party invite flow exists.
 * - "Not found" / "no permission" states link back instead of dead-ending.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useOrganizationDetail, useInvalidateOrganizations } from '@/hooks/useOrganization';
import { MemberList } from '@/components/org';
import { cn } from '@/lib/utils';
import { OrganizationProfile } from '@clerk/nextjs';
import { useClerk } from '@clerk/nextjs';

export default function OrgSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const clerk = useClerk();
  const orgId = params.orgId as string;

  const { data: orgData, isLoading } = useOrganizationDetail(orgId);
  const { invalidateAll } = useInvalidateOrganizations();
  const [activeSection, setActiveSection] = useState<'general' | 'members' | 'danger'>('general');

  // Danger-zone state: the delete button stays disabled until the user types
  // the organization's exact name (native confirm() is too easy to click through
  // for an irreversible action).
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto animate-pulse">
        <div className="h-8 bg-white/10 rounded w-48 mb-6" />
        <div className="h-64 bg-white/5 rounded-lg" />
      </div>
    );
  }

  if (!orgData) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <p className="text-white/40">Organization not found.</p>
        <Link href="/dashboard/org" className="mt-3 inline-block text-sm text-white/60 underline underline-offset-2 hover:text-white">
          ← Back to organizations
        </Link>
      </div>
    );
  }

  const { organization, userRole } = orgData;
  const canManage = userRole === 'owner' || userRole === 'admin';
  const isOwner = userRole === 'owner';

  if (!canManage) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <p className="text-white/40">You don&apos;t have permission to manage this organization.</p>
        <Link href={`/dashboard/org/${orgId}`} className="mt-3 inline-block text-sm text-white/60 underline underline-offset-2 hover:text-white">
          ← Back to {organization.name}
        </Link>
      </div>
    );
  }

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      // 1. Server-side ownership check (also our audit trail of the intent).
      const check = await fetch(`/api/org/${orgId}`, { method: 'DELETE' });
      const body = await check.json().catch(() => ({}));
      if (!check.ok || !body.canDelete) {
        throw new Error(body.error || 'The server refused the deletion.');
      }
      // 2. The actual deletion happens through Clerk (orgs are Clerk-owned).
      const clerkOrg = await clerk.getOrganization(orgId);
      await clerkOrg.destroy();
      // 3. Drop every cached org query so the list can't show a ghost org.
      invalidateAll();
      router.push('/dashboard/org');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Deletion failed — nothing was deleted.');
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push(`/dashboard/org/${orgId}`)}
          className="text-sm text-white/40 hover:text-white/60 transition-colors mb-4"
        >
          ← Back to {organization.name}
        </button>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-white/40 mt-1">
          Manage {organization.name}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/[0.06]">
        {['general', 'members', ...(isOwner ? ['danger'] : [])].map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section as 'general' | 'members' | 'danger')}
            className={cn(
              "px-4 py-2 text-sm capitalize transition-colors relative",
              activeSection === section
                ? "text-white"
                : "text-white/40 hover:text-white/60",
              section === 'danger' && "text-red-400/60 hover:text-red-400/80"
            )}
          >
            {section}
            {activeSection === section && (
              <span className={cn(
                "absolute bottom-0 left-0 right-0 h-px",
                section === 'danger' ? "bg-red-400" : "bg-white"
              )} />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeSection === 'general' && (
        <div className={cn(
          "rounded-lg border border-white/[0.06] bg-white/[0.02] p-6",
          // Clerk style overrides
          "[&_.cl-card]:bg-transparent [&_.cl-card]:border-0 [&_.cl-card]:shadow-none",
          "[&_.cl-headerTitle]:text-white [&_.cl-headerSubtitle]:text-white/50",
          "[&_.cl-formFieldLabel]:text-white/70 [&_.cl-formFieldInput]:bg-white/5",
          "[&_.cl-formFieldInput]:border-white/10 [&_.cl-formFieldInput]:text-white"
        )}>
          {/* Navbar intentionally visible: Clerk's own Members page (with
              invitations) is the product's invite path — hiding it made
              inviting anyone impossible from anywhere in the dashboard. */}
          <OrganizationProfile
            routing="hash"
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'bg-transparent shadow-none border-0 w-full',
                pageScrollBox: 'p-0',
              }
            }}
          />
        </div>
      )}

      {activeSection === 'members' && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <MemberList orgId={orgId} />
        </div>
      )}

      {activeSection === 'danger' && isOwner && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6">
          <h3 className="text-lg font-medium text-red-400">Danger Zone</h3>
          <p className="text-sm text-white/40 mt-1 mb-4">
            Deleting an organization removes it for every member. This cannot be undone.
          </p>
          <label className="block text-xs text-white/50 mb-2" htmlFor="org-delete-confirm">
            Type <span className="font-semibold text-white/80">{organization.name}</span> to confirm
          </label>
          <input
            id="org-delete-confirm"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={organization.name}
            disabled={deleting}
            className="mb-3 w-full max-w-sm rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-red-400/60 focus:outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleDelete}
              disabled={deleting || confirmName.trim() !== organization.name}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                "border border-red-500/30 text-red-400",
                deleting || confirmName.trim() !== organization.name
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-red-500/10"
              )}
            >
              {deleting ? 'Deleting…' : 'Delete Organization'}
            </button>
            {deleteError && (
              <span className="text-sm text-red-400" role="alert">{deleteError}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
