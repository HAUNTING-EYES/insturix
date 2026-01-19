'use client';

/**
 * useOrganization Hook
 * 
 * React Query hook for managing organization data with automatic caching and refresh.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';

// Query keys
export const ORG_QUERY_KEYS = {
  all: ['organizations'] as const,
  list: () => [...ORG_QUERY_KEYS.all, 'list'] as const,
  detail: (orgId: string) => [...ORG_QUERY_KEYS.all, 'detail', orgId] as const,
  members: (orgId: string) => [...ORG_QUERY_KEYS.all, 'members', orgId] as const,
  projects: (orgId: string) => [...ORG_QUERY_KEYS.all, 'projects', orgId] as const,
};

// Types
export interface OrganizationListItem {
  clerkOrgId: string;
  name: string;
  slug: string;
  imageUrl?: string;
  role: 'owner' | 'admin' | 'member';
  memberCount: number;
  joinedAt: Date;
}

export interface OrganizationDetail {
  clerkOrgId: string;
  name: string;
  slug: string;
  imageUrl?: string;
  memberCount: number;
  settings: {
    allowMemberProjects: boolean;
    defaultRole: 'admin' | 'member';
  };
  createdAt: Date;
}

export interface OrgMember {
  clerkUserId: string;
  email: string;
  username?: string;
  imageUrl?: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
}

// Fetch functions
async function fetchOrganizations(): Promise<OrganizationListItem[]> {
  const response = await fetch('/api/org');
  if (!response.ok) {
    throw new Error('Failed to fetch organizations');
  }
  const data = await response.json();
  return data.organizations;
}

async function fetchOrganizationDetail(orgId: string): Promise<{ organization: OrganizationDetail; userRole: string }> {
  const response = await fetch(`/api/org/${orgId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch organization');
  }
  const data = await response.json();
  return { organization: data.organization, userRole: data.userRole };
}

async function fetchOrgMembers(orgId: string): Promise<{ members: OrgMember[]; total: number }> {
  const response = await fetch(`/api/org/${orgId}/members`);
  if (!response.ok) {
    throw new Error('Failed to fetch members');
  }
  const data = await response.json();
  return { members: data.members, total: data.total };
}

async function updateOrgSettings(orgId: string, settings: Partial<OrganizationDetail['settings']>): Promise<void> {
  const response = await fetch(`/api/org/${orgId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to update settings');
  }
}

async function updateMemberRole(orgId: string, memberId: string, role: 'admin' | 'member'): Promise<void> {
  const response = await fetch(`/api/org/${orgId}/members/${memberId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to update role');
  }
}

async function removeMember(orgId: string, memberId: string): Promise<void> {
  const response = await fetch(`/api/org/${orgId}/members/${memberId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to remove member');
  }
}

/**
 * Hook for listing user's organizations
 */
export function useOrganizations() {
  const { isSignedIn } = useAuth();

  return useQuery({
    queryKey: ORG_QUERY_KEYS.list(),
    queryFn: fetchOrganizations,
    enabled: isSignedIn,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook for getting a specific organization's details
 */
export function useOrganizationDetail(orgId: string | null) {
  const { isSignedIn } = useAuth();

  return useQuery({
    queryKey: ORG_QUERY_KEYS.detail(orgId || ''),
    queryFn: () => fetchOrganizationDetail(orgId!),
    enabled: isSignedIn && !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook for getting organization members
 */
export function useOrgMembers(orgId: string | null) {
  const { isSignedIn } = useAuth();

  return useQuery({
    queryKey: ORG_QUERY_KEYS.members(orgId || ''),
    queryFn: () => fetchOrgMembers(orgId!),
    enabled: isSignedIn && !!orgId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook for organization mutations (settings, members)
 */
export function useOrganizationMutations(orgId: string) {
  const queryClient = useQueryClient();

  const updateSettings = useMutation({
    mutationFn: (settings: Partial<OrganizationDetail['settings']>) => 
      updateOrgSettings(orgId, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEYS.detail(orgId) });
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: 'admin' | 'member' }) =>
      updateMemberRole(orgId, memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEYS.members(orgId) });
    },
  });

  const remove = useMutation({
    mutationFn: (memberId: string) => removeMember(orgId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEYS.members(orgId) });
      queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEYS.detail(orgId) });
    },
  });

  return {
    updateSettings,
    updateMemberRole: updateRole,
    removeMember: remove,
  };
}

/**
 * Hook for invalidating organization queries
 */
export function useInvalidateOrganizations() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEYS.all }),
    invalidateList: () => queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEYS.list() }),
    invalidateDetail: (orgId: string) => queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEYS.detail(orgId) }),
    invalidateMembers: (orgId: string) => queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEYS.members(orgId) }),
  };
}
