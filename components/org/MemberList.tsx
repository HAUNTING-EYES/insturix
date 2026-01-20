'use client';

/**
 * MemberList Component
 * 
 * Displays organization members with role badges.
 * Clean, minimal design matching existing patterns.
 */

import { cn } from '@/lib/utils';
import { useOrgMembers, OrgMember } from '@/hooks/useOrganization';

interface MemberListProps {
  orgId: string;
  className?: string;
  onMemberClick?: (member: OrgMember) => void;
}

const roleOrder = { owner: 0, admin: 1, member: 2 };

export function MemberList({ orgId, className, onMemberClick }: MemberListProps) {
  const { data, isLoading, error } = useOrgMembers(orgId);

  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-white/[0.02] animate-pulse">
            <div className="w-8 h-8 rounded-full bg-white/10" />
            <div className="flex-1 space-y-1">
              <div className="h-3.5 bg-white/10 rounded w-24" />
              <div className="h-2.5 bg-white/5 rounded w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn("text-sm text-white/40 px-3 py-4", className)}>
        Failed to load members
      </div>
    );
  }

  const sortedMembers = [...data.members].sort((a, b) => 
    roleOrder[a.role] - roleOrder[b.role]
  );

  return (
    <div className={cn("space-y-1", className)}>
      {sortedMembers.map((member) => (
        <button
          key={member.clerkUserId}
          onClick={() => onMemberClick?.(member)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-md",
            "hover:bg-white/[0.04] transition-colors text-left",
            onMemberClick && "cursor-pointer"
          )}
        >
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {member.imageUrl ? (
              <img 
                src={member.imageUrl} 
                alt="" 
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs text-white/50 font-medium">
                {(member.username || member.email).charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white/90 truncate">
              {member.username || member.email.split('@')[0]}
            </p>
            <p className="text-[11px] text-white/40 truncate">
              {member.email}
            </p>
          </div>

          {/* Role Badge */}
          <span className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide",
            member.role === 'owner' && "text-white/70 bg-white/10",
            member.role === 'admin' && "text-white/50 bg-white/[0.06]",
            member.role === 'member' && "text-white/40"
          )}>
            {member.role}
          </span>
        </button>
      ))}

      {/* Count */}
      <div className="pt-2 px-3 text-[11px] text-white/30">
        {data.total} member{data.total !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
