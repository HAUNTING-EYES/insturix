'use client';

/**
 * OrgDashboard
 *
 * Client-side orchestrator that composes ConstellationHero, OrgStatsBar,
 * and MemberTable. Fetches members via useOrgMembers and pipes data to
 * all sub-components. Handles star-click -> table-scroll interaction.
 */

import { useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import {
  useOrgMembers,
  useOrganizationMutations,
  type OrgMember,
} from '@/hooks/useOrganization';
import { ConstellationHero } from './ConstellationHero';
import { OrgStatsBar, type OrgStats } from './OrgStatsBar';
import { MemberTable, type MemberTableHandle } from './MemberTable';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OrgDashboardProps {
  orgId: string;
  orgName: string;
  userRole: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function OrgDashboard({ orgId, orgName, userRole }: OrgDashboardProps) {
  const { data, isLoading, error } = useOrgMembers(orgId);
  const mutations = useOrganizationMutations(orgId);
  const tableRef = useRef<MemberTableHandle>(null);

  const members: OrgMember[] = data?.members ?? [];
  const canManage = userRole === 'owner' || userRole === 'admin';

  // Stats derived from member data (projects/videos/storage are placeholders
  // until a real stats API exists -- better to show member count accurately)
  const stats: OrgStats = useMemo(
    () => ({
      activeProjects: 0,
      activeMembers: members.length,
      videosRendered: 0,
      storageUsedGB: 0,
    }),
    [members.length],
  );

  // Click a star in constellation -> scroll to that member in the table
  const handleMemberClick = useCallback((member: OrgMember) => {
    tableRef.current?.scrollToMember(member.clerkUserId);
  }, []);

  // Role change with optimistic UI
  const handleRoleChange = useCallback(
    (memberId: string, newRole: 'admin' | 'member') => {
      mutations.updateMemberRole.mutate({ memberId, role: newRole });
    },
    [mutations.updateMemberRole],
  );

  // Remove member
  const handleRemove = useCallback(
    (memberId: string) => {
      mutations.removeMember.mutate(memberId);
    },
    [mutations.removeMember],
  );

  // Loading skeleton
  if (isLoading) {
    return (
      <div style={{ background: '#0B0B0A', minHeight: '100vh' }}>
        {/* Hero skeleton */}
        <div
          className="w-full animate-pulse"
          style={{
            height: 600,
            background: '#0F0F0E',
            borderBottom: '1px solid #1C1B19',
          }}
        />
        {/* Stats skeleton */}
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
          {/* Table skeleton */}
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

  if (error) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ background: '#0B0B0A', minHeight: '100vh', color: '#7A776E' }}
      >
        <p className="text-sm">Failed to load organization data</p>
      </div>
    );
  }

  return (
    <div style={{ background: '#0B0B0A', minHeight: '100vh' }}>
      <div style={{ position: 'relative' }}>
        <ConstellationHero
          members={members}
          orgName={orgName}
          onMemberClick={handleMemberClick}
        />
        {/* Settings was previously reachable only by typing the URL — every
            manageable org page now links to it (rename, invites, danger zone). */}
        {canManage && (
          <Link
            href={`/dashboard/org/${orgId}/settings`}
            style={{
              position: 'absolute',
              top: 20,
              right: 24,
              zIndex: 5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 14px',
              borderRadius: 7,
              border: '1px solid #282724',
              background: 'rgba(15, 15, 14, 0.82)',
              color: '#B5B2A8',
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Settings size={14} aria-hidden />
            Settings
          </Link>
        )}
      </div>

      <div className="py-10">
        <OrgStatsBar stats={stats} />
        <MemberTable
          ref={tableRef}
          members={members}
          orgId={orgId}
          canManage={canManage}
          onRoleChange={handleRoleChange}
          onRemove={handleRemove}
        />
      </div>
    </div>
  );
}
