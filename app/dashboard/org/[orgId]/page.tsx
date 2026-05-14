'use client';

/**
 * Organization Dashboard Page
 *
 * Constellation-style org view with star-field hero, stats bar, and member table.
 * Note: Projects are created from individual services (Editron, etc.)
 * when in org context, not from this page.
 */

import { useParams } from 'next/navigation';
import { useOrganizationDetail } from '@/hooks/useOrganization';
import { OrgDashboard } from '@/components/dashboard/Org';

export default function OrgDashboardPage() {
  const params = useParams();
  const orgId = params.orgId as string;

  const { data: orgData, isLoading: orgLoading } = useOrganizationDetail(orgId);

  // Loading skeleton (dark theme consistent)
  if (orgLoading) {
    return (
      <div style={{ background: '#0B0B0A', minHeight: '100vh' }}>
        <div
          className="w-full animate-pulse"
          style={{
            height: 600,
            background: '#0F0F0E',
            borderBottom: '1px solid #1C1B19',
          }}
        />
        <div className="max-w-[1100px] mx-auto px-10 pt-10">
          <div className="grid grid-cols-4 gap-4 mb-9">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-xl animate-pulse"
                style={{ background: '#0F0F0E', border: '1px solid #1C1B19' }}
              />
            ))}
          </div>
          <div
            className="rounded-[14px] animate-pulse"
            style={{
              background: '#0F0F0E',
              border: '1px solid #1C1B19',
              height: 300,
            }}
          />
        </div>
      </div>
    );
  }

  if (!orgData) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ background: '#0B0B0A', minHeight: '100vh', color: '#7A776E' }}
      >
        <p className="text-sm">Organization not found</p>
      </div>
    );
  }

  const { organization, userRole } = orgData;

  return (
    <OrgDashboard
      orgId={orgId}
      orgName={organization.name}
      userRole={userRole}
    />
  );
}
