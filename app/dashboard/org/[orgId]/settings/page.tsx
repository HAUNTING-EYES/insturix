'use client';

/**
 * Organization Settings Page
 * 
 * Manage org settings, members, and danger zone.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganizationDetail, useOrganizationMutations, useOrgMembers } from '@/hooks/useOrganization';
import { MemberList } from '@/components/org';
import { cn } from '@/lib/utils';
import { OrganizationProfile } from '@clerk/nextjs';

export default function OrgSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  
  const { data: orgData, isLoading } = useOrganizationDetail(orgId);
  const [activeSection, setActiveSection] = useState<'general' | 'members' | 'danger'>('general');

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
        <p className="text-white/40">Organization not found</p>
      </div>
    );
  }

  const { organization, userRole } = orgData;
  const canManage = userRole === 'owner' || userRole === 'admin';
  const isOwner = userRole === 'owner';

  if (!canManage) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <p className="text-white/40">You don't have permission to manage this organization</p>
      </div>
    );
  }

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
          <OrganizationProfile
            routing="hash"
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'bg-transparent shadow-none border-0 w-full',
                navbar: 'hidden',
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
            These actions are irreversible. Please be certain.
          </p>
          <button
            onClick={() => {
              if (confirm(`Are you sure you want to delete ${organization.name}? This cannot be undone.`)) {
                // Handle deletion via Clerk
                router.push('/dashboard/org');
              }
            }}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md",
              "border border-red-500/30 text-red-400",
              "hover:bg-red-500/10 transition-colors"
            )}
          >
            Delete Organization
          </button>
        </div>
      )}
    </div>
  );
}
