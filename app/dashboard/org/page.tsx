'use client';

/**
 * Organization List/Create Page
 *
 * Shows user's organizations with Insturix dark theme and role-colored badges.
 */

import { useRouter } from 'next/navigation';
import { useOrganizations } from '@/hooks/useOrganization';
import { formatDistanceToNow } from 'date-fns';

const ROLE_BADGE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  owner: {
    bg: 'rgba(212,166,82,0.1)',
    color: '#D4A652',
    border: '1px solid rgba(212,166,82,0.2)',
  },
  admin: {
    bg: 'rgba(144,136,212,0.1)',
    color: '#9088D4',
    border: '1px solid rgba(144,136,212,0.2)',
  },
  member: {
    bg: 'rgba(92,184,204,0.1)',
    color: '#5CB8CC',
    border: '1px solid rgba(92,184,204,0.2)',
  },
};

export default function OrganizationsPage() {
  const router = useRouter();
  const { data: organizations, isLoading } = useOrganizations();

  if (isLoading) {
    return (
      <div
        className="p-6 md:p-8 max-w-4xl mx-auto"
        style={{ background: '#0B0B0A', minHeight: '100vh' }}
      >
        <div
          className="h-8 rounded w-48 mb-6 animate-pulse"
          style={{ background: '#1B1A18' }}
        />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-lg animate-pulse"
              style={{ background: '#0F0F0E', border: '1px solid #1C1B19' }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-6 md:p-8 max-w-4xl mx-auto"
      style={{ background: '#0B0B0A', minHeight: '100vh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: '#ECE9E1' }}>
            Team
          </h1>
          <p className="text-sm mt-1" style={{ color: '#7A776E' }}>
            Collaborate with your team
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/org/create')}
          className="px-4 py-2 text-sm font-medium rounded-md transition-all duration-200"
          style={{
            background: '#D4A652',
            color: '#0B0B0A',
            border: 'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.filter = 'brightness(1.1)';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.filter = '';
            (e.currentTarget as HTMLElement).style.transform = '';
          }}
        >
          Create Organization
        </button>
      </div>

      {/* List */}
      {!organizations || organizations.length === 0 ? (
        <div
          className="text-center py-16 rounded-lg"
          style={{
            border: '1px dashed #282724',
            background: '#0F0F0E',
          }}
        >
          <p className="text-sm" style={{ color: '#7A776E' }}>
            No organizations yet
          </p>
          <p className="text-[11px] mt-1" style={{ color: '#5F5E5A' }}>
            Create one to start collaborating with your team
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {organizations.map((org) => {
            const badge = ROLE_BADGE_STYLES[org.role] ?? ROLE_BADGE_STYLES.member;

            return (
              <button
                key={org.clerkOrgId}
                onClick={() => router.push(`/dashboard/org/${org.clerkOrgId}`)}
                className="w-full flex items-center gap-4 p-4 rounded-lg text-left
                           transition-all duration-200 cursor-pointer"
                style={{
                  background: '#0F0F0E',
                  border: '1px solid #1C1B19',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#282724';
                  (e.currentTarget as HTMLElement).style.background = '#131312';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#1C1B19';
                  (e.currentTarget as HTMLElement).style.background = '#0F0F0E';
                }}
              >
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden"
                  style={{
                    background: 'rgba(212,166,82,0.08)',
                    border: '1px solid rgba(212,166,82,0.15)',
                  }}
                >
                  {org.imageUrl ? (
                    <img src={org.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span
                      className="text-sm font-medium"
                      style={{ color: '#D4A652' }}
                    >
                      {org.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#ECE9E1' }}>
                    {org.name}
                  </p>
                  <p className="text-[11px]" style={{ color: '#7A776E' }}>
                    {org.memberCount} member{org.memberCount !== 1 ? 's' : ''} · Joined{' '}
                    {formatDistanceToNow(new Date(org.joinedAt), { addSuffix: true })}
                  </p>
                </div>

                {/* Role Badge */}
                <span
                  className="text-[10px] font-semibold px-2 py-1 rounded uppercase tracking-wider"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    background: badge.bg,
                    color: badge.color,
                    border: badge.border,
                  }}
                >
                  {org.role}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
