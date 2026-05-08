'use client';

/**
 * Organization List/Create Page
 * 
 * Shows user's organizations and option to create new one.
 */

import { useRouter } from 'next/navigation';
import { useOrganizations } from '@/hooks/useOrganization';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export default function OrganizationsPage() {
  const router = useRouter();
  const { data: organizations, isLoading } = useOrganizations();

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <div className="h-8 bg-white/10 rounded w-48 mb-6 animate-pulse" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Team</h1>
          <p className="text-sm text-white/40 mt-1">
            Collaborate with your team
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/org/create')}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md",
            "bg-white text-black hover:bg-white/90 transition-colors"
          )}
        >
          Create Organization
        </button>
      </div>

      {/* List */}
      {!organizations || organizations.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-lg">
          <p className="text-white/40 text-sm">No organizations yet</p>
          <p className="text-white/25 text-xs mt-1">
            Create one to start collaborating with your team
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {organizations.map((org) => (
            <button
              key={org.clerkOrgId}
              onClick={() => router.push(`/dashboard/org/${org.clerkOrgId}`)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-lg text-left",
                "border border-white/[0.06] bg-white/[0.02]",
                "hover:border-white/10 hover:bg-white/[0.04] transition-colors"
              )}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {org.imageUrl ? (
                  <img src={org.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm text-white/50 font-medium">
                    {org.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{org.name}</p>
                <p className="text-[11px] text-white/40">
                  {org.memberCount} member{org.memberCount !== 1 ? 's' : ''} · Joined {formatDistanceToNow(new Date(org.joinedAt), { addSuffix: true })}
                </p>
              </div>

              {/* Role */}
              <span className={cn(
                "text-[10px] font-medium px-2 py-1 rounded uppercase tracking-wide",
                org.role === 'owner' && "text-white/70 bg-white/10",
                org.role === 'admin' && "text-white/50 bg-white/[0.06]",
                org.role === 'member' && "text-white/40"
              )}>
                {org.role}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
