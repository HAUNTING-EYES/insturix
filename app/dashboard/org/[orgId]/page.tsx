'use client';

/**
 * Organization Dashboard Page
 * 
 * Main org view showing projects and team overview.
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganizationDetail, useOrgMembers } from '@/hooks/useOrganization';
import { MemberList, OrgProjectsList } from '@/components/org';
import { cn } from '@/lib/utils';

interface OrgProject {
  projectId: string;
  name: string;
  thumbnail?: string;
  updatedAt: string;
  durationInFrames: number;
  aspectRatio: string;
}

export default function OrgDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  
  const { data: orgData, isLoading: orgLoading } = useOrganizationDetail(orgId);
  const [projects, setProjects] = useState<OrgProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'projects' | 'members'>('projects');

  // Fetch projects
  useEffect(() => {
    if (!orgId) return;
    
    const fetchProjects = async () => {
      try {
        const res = await fetch(`/api/org/${orgId}/projects`);
        const data = await res.json();
        if (data.success) {
          setProjects(data.projects);
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        setProjectsLoading(false);
      }
    };

    fetchProjects();
  }, [orgId]);

  const handleCreateProject = async () => {
    try {
      const res = await fetch(`/api/org/${orgId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled Project' }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/dashboard/editron/${data.project.projectId}`);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    }
  };

  if (orgLoading) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto animate-pulse">
        <div className="h-8 bg-white/10 rounded w-48 mb-2" />
        <div className="h-4 bg-white/5 rounded w-32" />
      </div>
    );
  }

  if (!orgData) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto">
        <p className="text-white/40">Organization not found</p>
      </div>
    );
  }

  const { organization, userRole } = orgData;
  const canManage = userRole === 'owner' || userRole === 'admin';

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
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

          {/* Actions */}
          <div className="flex items-center gap-2">
            {canManage && (
              <button
                onClick={() => router.push(`/dashboard/org/${orgId}/settings`)}
                className="px-3 py-1.5 text-sm text-white/60 hover:text-white/80 transition-colors"
              >
                Settings
              </button>
            )}
            <button
              onClick={handleCreateProject}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md",
                "bg-white text-black hover:bg-white/90 transition-colors"
              )}
            >
              New Project
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/[0.06]">
        <button
          onClick={() => setActiveTab('projects')}
          className={cn(
            "px-4 py-2 text-sm transition-colors relative",
            activeTab === 'projects' 
              ? "text-white" 
              : "text-white/40 hover:text-white/60"
          )}
        >
          Projects
          {activeTab === 'projects' && (
            <span className="absolute bottom-0 left-0 right-0 h-px bg-white" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('members')}
          className={cn(
            "px-4 py-2 text-sm transition-colors relative",
            activeTab === 'members' 
              ? "text-white" 
              : "text-white/40 hover:text-white/60"
          )}
        >
          Members
          {activeTab === 'members' && (
            <span className="absolute bottom-0 left-0 right-0 h-px bg-white" />
          )}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'projects' ? (
        <OrgProjectsList 
          orgId={orgId} 
          projects={projects} 
          isLoading={projectsLoading} 
        />
      ) : (
        <div className="max-w-md">
          <MemberList orgId={orgId} />
        </div>
      )}
    </div>
  );
}
