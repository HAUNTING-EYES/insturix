'use client';

/**
 * OrgProjectsList Component
 * 
 * Displays organization projects in a grid.
 * Matches existing project list patterns.
 */

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface OrgProject {
  projectId: string;
  name: string;
  thumbnail?: string;
  updatedAt: string;
  durationInFrames: number;
  aspectRatio: string;
}

interface OrgProjectsListProps {
  orgId: string;
  projects: OrgProject[];
  isLoading?: boolean;
  className?: string;
}

export function OrgProjectsList({ orgId, projects, isLoading, className }: OrgProjectsListProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden animate-pulse">
            <div className="aspect-video bg-white/5" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-white/10 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className={cn("text-center py-12", className)}>
        <p className="text-white/40 text-sm">No projects yet</p>
        <p className="text-white/25 text-[11px] mt-1">Create your first organization project</p>
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
      {projects.map((project) => (
        <button
          key={project.projectId}
          onClick={() => router.push(`/dashboard/editron/${project.projectId}`)}
          className={cn(
            "rounded-lg border border-white/[0.06] bg-white/[0.02]",
            "hover:border-white/10 hover:bg-white/[0.04] transition-colors",
            "overflow-hidden text-left group"
          )}
        >
          {/* Thumbnail */}
          <div className="aspect-video bg-black/20 relative overflow-hidden">
            {project.thumbnail ? (
              <img 
                src={project.thumbnail} 
                alt="" 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-white/20 text-[11px]">{project.aspectRatio}</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-3">
            <p className="text-sm text-white/90 font-medium truncate group-hover:text-white transition-colors">
              {project.name}
            </p>
            <p className="text-[11px] text-white/40 mt-0.5">
              {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
