/**
 * Organization Service
 * 
 * Core CRUD operations for organizations synced from Clerk.
 * Handles organization creation, updates, and deletion with member cleanup.
 */

import { Organization, IOrganization, IOrgSettings } from '@/schemas/Organization';
import { OrgMember } from '@/schemas/OrgMember';
import { User } from '@/schemas/user';
import connectToDatabase from '@/schemas/ConnectToDatabase';

// Types for Clerk webhook payloads
export interface ClerkOrganizationData {
  id: string;
  name: string;
  slug: string;
  image_url?: string;
  created_by: string;
  members_count?: number;
}

export interface OrganizationListItem {
  clerkOrgId: string;
  name: string;
  slug: string;
  imageUrl?: string;
  role: 'owner' | 'admin' | 'member';
  memberCount: number;
  joinedAt: Date;
}

class OrganizationService {
  /**
   * Get organization by Clerk ID
   */
  async getOrganization(clerkOrgId: string): Promise<IOrganization | null> {
    await connectToDatabase();
    return Organization.findOne({ clerkOrgId });
  }

  /**
   * Get organization by slug
   */
  async getOrganizationBySlug(slug: string): Promise<IOrganization | null> {
    await connectToDatabase();
    return Organization.findOne({ slug: slug.toLowerCase() });
  }

  /**
   * Get all organizations a user belongs to
   */
  async getUserOrganizations(clerkUserId: string): Promise<OrganizationListItem[]> {
    await connectToDatabase();

    // Get user's org memberships
    const memberships = await OrgMember.find({ clerkUserId }).sort({ joinedAt: -1 });
    
    if (memberships.length === 0) {
      return [];
    }

    // Get org details for each membership
    const orgIds = memberships.map(m => m.clerkOrgId);
    const orgs = await Organization.find({ clerkOrgId: { $in: orgIds } });
    
    // Create a map for quick lookup
    const orgMap = new Map(orgs.map(org => [org.clerkOrgId, org]));

    return memberships
      .filter(m => orgMap.has(m.clerkOrgId))
      .map(m => {
        const org = orgMap.get(m.clerkOrgId)!;
        return {
          clerkOrgId: org.clerkOrgId,
          name: org.name,
          slug: org.slug,
          imageUrl: org.imageUrl,
          role: m.role,
          memberCount: org.memberCount,
          joinedAt: m.joinedAt,
        };
      });
  }

  /**
   * Create organization from Clerk webhook
   */
  async createFromClerk(data: ClerkOrganizationData): Promise<IOrganization> {
    await connectToDatabase();

    const org = new Organization({
      clerkOrgId: data.id,
      name: data.name,
      slug: data.slug,
      imageUrl: data.image_url,
      createdBy: data.created_by,
      memberCount: data.members_count || 1,
      settings: {
        allowMemberProjects: true,
        defaultRole: 'member',
      },
    });

    await org.save();
    console.log(`✅ Organization created from Clerk: ${data.name} (${data.id})`);
    return org;
  }

  /**
   * Update organization from Clerk webhook
   */
  async updateFromClerk(data: Partial<ClerkOrganizationData> & { id: string }): Promise<IOrganization | null> {
    await connectToDatabase();

    const updateData: Partial<IOrganization> = {};
    
    if (data.name) updateData.name = data.name;
    if (data.slug) updateData.slug = data.slug;
    if (data.image_url !== undefined) updateData.imageUrl = data.image_url;
    if (data.members_count !== undefined) updateData.memberCount = data.members_count;

    const org = await Organization.findOneAndUpdate(
      { clerkOrgId: data.id },
      { $set: updateData },
      { new: true }
    );

    if (org) {
      console.log(`✅ Organization updated from Clerk: ${org.name} (${data.id})`);
    }

    return org;
  }

  /**
   * Update organization settings (internal use)
   */
  async updateSettings(clerkOrgId: string, settings: Partial<IOrgSettings>): Promise<IOrganization | null> {
    await connectToDatabase();

    const updateData: Record<string, unknown> = {};
    if (settings.allowMemberProjects !== undefined) {
      updateData['settings.allowMemberProjects'] = settings.allowMemberProjects;
    }
    if (settings.defaultRole !== undefined) {
      updateData['settings.defaultRole'] = settings.defaultRole;
    }

    return Organization.findOneAndUpdate(
      { clerkOrgId },
      { $set: updateData },
      { new: true }
    );
  }

  /**
   * Update member count (after member changes)
   */
  async updateMemberCount(clerkOrgId: string): Promise<void> {
    await connectToDatabase();

    const count = await OrgMember.countDocuments({ clerkOrgId });
    await Organization.updateOne(
      { clerkOrgId },
      { $set: { memberCount: count } }
    );
  }

  /**
   * Delete organization and cleanup all related data
   */
  async deleteOrganization(clerkOrgId: string): Promise<boolean> {
    await connectToDatabase();

    const org = await Organization.findOne({ clerkOrgId });
    if (!org) {
      console.warn(`Organization not found for deletion: ${clerkOrgId}`);
      return false;
    }

    // Get all members before deletion (for user cleanup)
    const members = await OrgMember.find({ clerkOrgId });

    // Delete all org members
    await OrgMember.deleteMany({ clerkOrgId });

    // Remove org from all users' organizations arrays
    const memberUserIds = members.map(m => m.clerkUserId);
    if (memberUserIds.length > 0) {
      await User.updateMany(
        { clerkUserId: { $in: memberUserIds } },
        { $pull: { organizations: { clerkOrgId } } }
      );
    }

    // Delete the organization
    await Organization.deleteOne({ clerkOrgId });

    console.log(`✅ Organization deleted: ${org.name} (${clerkOrgId}), removed ${members.length} members`);
    return true;
  }

  /**
   * Check if user can manage org (owner or admin)
   */
  async canManageOrg(clerkUserId: string, clerkOrgId: string): Promise<boolean> {
    await connectToDatabase();

    const member = await OrgMember.findOne({ clerkOrgId, clerkUserId });
    return member?.role === 'owner' || member?.role === 'admin';
  }

  /**
   * Check if user is org owner
   */
  async isOwner(clerkUserId: string, clerkOrgId: string): Promise<boolean> {
    await connectToDatabase();

    const member = await OrgMember.findOne({ clerkOrgId, clerkUserId });
    return member?.role === 'owner';
  }
}

export const organizationService = new OrganizationService();
