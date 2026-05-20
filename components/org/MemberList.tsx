'use client';

/**
 * MemberList Component
 *
 * Displays organization members with role badges.
 * Insturix dark theme with gold/purple/cyan role colors.
 */

import { cn } from '@/lib/utils';
import { useOrgMembers, OrgMember } from '@/hooks/useOrganization';

interface MemberListProps {
  orgId: string;
  className?: string;
  onMemberClick?: (member: OrgMember) => void;
}

const roleOrder = { owner: 0, admin: 1, member: 2 };

const ROLE_AVATAR: Record<string, { bg: string; color: string; border: string }> = {
  owner: {
    bg: 'linear-gradient(135deg, rgba(212,166,82,0.2), rgba(212,166,82,0.05))',
    color: '#D4A652',
    border: '1.5px solid rgba(212,166,82,0.3)',
  },
  admin: {
    bg: 'linear-gradient(135deg, rgba(144,136,212,0.2), rgba(144,136,212,0.05))',
    color: '#9088D4',
    border: '1.5px solid rgba(144,136,212,0.3)',
  },
  member: {
    bg: 'linear-gradient(135deg, rgba(92,184,204,0.2), rgba(92,184,204,0.05))',
    color: '#5CB8CC',
    border: '1.5px solid rgba(92,184,204,0.3)',
  },
};

const ROLE_BADGE: Record<string, { bg: string; color: string; border: string }> = {
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

export function MemberList({ orgId, className, onMemberClick }: MemberListProps) {
  const { data, isLoading, error } = useOrgMembers(orgId);

  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md animate-pulse"
            style={{ background: '#0F0F0E' }}
          >
            <div className="w-8 h-8 rounded-full" style={{ background: '#1B1A18' }} />
            <div className="flex-1 space-y-1">
              <div className="h-3.5 rounded w-24" style={{ background: '#1B1A18' }} />
              <div className="h-2.5 rounded w-32" style={{ background: '#131312' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn("text-sm px-3 py-4", className)} style={{ color: '#7A776E' }}>
        Failed to load members
      </div>
    );
  }

  const sortedMembers = [...data.members].sort((a, b) =>
    roleOrder[a.role] - roleOrder[b.role]
  );

  return (
    <div className={cn("space-y-1", className)}>
      {sortedMembers.map((member) => {
        const avatar = ROLE_AVATAR[member.role] ?? ROLE_AVATAR.member;
        const badge = ROLE_BADGE[member.role] ?? ROLE_BADGE.member;

        return (
          <button
            key={member.clerkUserId}
            onClick={() => onMemberClick?.(member)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-md",
              "transition-colors text-left",
              onMemberClick && "cursor-pointer"
            )}
            style={{ background: 'transparent' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = '#131312';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{
                background: avatar.bg,
                color: avatar.color,
                border: avatar.border,
              }}
            >
              {member.imageUrl ? (
                <img
                  src={member.imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[11px] font-bold">
                  {(member.username || member.email).charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: '#ECE9E1' }}>
                {member.username || member.email.split('@')[0]}
              </p>
              <p className="text-[11px] truncate" style={{ color: '#7A776E' }}>
                {member.email}
              </p>
            </div>

            {/* Role Badge */}
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: badge.bg,
                color: badge.color,
                border: badge.border,
              }}
            >
              {member.role}
            </span>
          </button>
        );
      })}

      {/* Count */}
      <div className="pt-2 px-3 text-[11px]" style={{ color: '#5F5E5A' }}>
        {data.total} member{data.total !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
