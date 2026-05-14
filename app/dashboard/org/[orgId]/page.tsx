'use client';

/**
 * Organization Dashboard Page
 * 
 * Main org view showing team members and activity.
 * Note: Projects are created from individual services (Editron, etc.)
 * when in org context, not from this page.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganizationDetail } from '@/hooks/useOrganization';
import { MemberList } from '@/components/org';
import { cn } from '@/lib/utils';

export default function OrgDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  
  const { data: orgData, isLoading: orgLoading } = useOrganizationDetail(orgId);

  if (orgLoading) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto animate-pulse">
        <div className="h-8 bg-white/10 rounded w-48 mb-2" />
        <div className="h-4 bg-white/5 rounded w-32" />
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

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {organization.name}
            </h1>
            <p className="text-sm text-white/40 mt-1">
              {organization.memberCount} member{organization.memberCount !== 1 ? 's' : ''} · You're {userRole === 'owner' ? 'the owner' : `a${userRole === 'admin' ? 'n admin' : ' member'}`}
            </p>
          </div>

          {canManage && (
            <button
              onClick={() => router.push(`/dashboard/org/${orgId}/settings`)}
              className="px-3 py-1.5 text-sm text-white/60 hover:text-white/80 transition-colors"
            >
              Settings
            </button>
          )}
        </div>
      </div>

      {/* Members */}
      <div>
        <h2 className="text-lg font-medium text-white mb-4">Team Members</h2>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
          <MemberList orgId={orgId} />
        </div>
      </div>
    </div>
  );
}

