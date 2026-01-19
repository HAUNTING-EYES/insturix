/**
 * Organization Member Service
 * 
 * Handles member management for organizations.
 * Syncs with Clerk organizationMembership events.
 */

import { OrgMember, IOrgMember, OrgRole } from '@/schemas/OrgMember';
import { Organization } from '@/schemas/Organization';
import { User } from '@/schemas/user';
import connectToDatabase from '@/schemas/ConnectToDatabase';
import { organizationService } from './organizationService';

// Types for Clerk webhook payloads
export interface ClerkMembershipData {
  id: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  public_user_data: {
    user_id: string;
    identifier: string; // email
    first_name?: string;
    last_name?: string;
    image_url?: string;
  };
  role: string;
  created_at: number;
}

export interface MemberListItem {
  clerkUserId: string;
  email: string;
  username?: string;
  imageUrl?: string;
  role: OrgRole;
  joinedAt: Date;
}

export interface MemberListOptions {
  page?: number;
  limit?: number;
  role?: OrgRole;
}

class OrgMemberService {
  /**
   * Get all members of an organization
   */
  async getMembers(
    clerkOrgId: string, 
    options: MemberListOptions = {}
  ): Promise<{ members: MemberListItem[]; total: number }> {
    await connectToDatabase();

    const { page = 1, limit = 50, role } = options;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = { clerkOrgId };
    if (role) {
      query.role = role;
    }

    const [members, total] = await Promise.all([
      OrgMember.find(query)
        .sort({ role: 1, joinedAt: -1 }) // owners first, then admins, then members
        .skip(skip)
        .limit(limit),
      OrgMember.countDocuments(query),
    ]);

    return {
      members: members.map(m => ({
        clerkUserId: m.clerkUserId,
        email: m.email,
        username: m.username,
        imageUrl: m.imageUrl,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      total,
    };
  }

  /**
   * Get a specific member
   */
  async getMember(clerkOrgId: string, clerkUserId: string): Promise<IOrgMember | null> {
    await connectToDatabase();
    return OrgMember.findOne({ clerkOrgId, clerkUserId });
  }

  /**
   * Check if user is a member of the organization
   */
  async isMember(clerkUserId: string, clerkOrgId: string): Promise<boolean> {
    await connectToDatabase();
    const member = await OrgMember.findOne({ clerkOrgId, clerkUserId });
    return !!member;
  }

  /**
   * Get user's role in an organization
   */
  async getUserRole(clerkUserId: string, clerkOrgId: string): Promise<OrgRole | null> {
    await connectToDatabase();
    const member = await OrgMember.findOne({ clerkOrgId, clerkUserId });
    return member?.role || null;
  }

  /**
   * Add member from Clerk webhook
   */
  async addMemberFromClerk(data: ClerkMembershipData): Promise<IOrgMember> {
    await connectToDatabase();

    const clerkOrgId = data.organization.id;
    const clerkUserId = data.public_user_data.user_id;
    
    // Map Clerk role to our role type
    const role = this.mapClerkRole(data.role);

    // Check if member already exists (avoid duplicates)
    const existing = await OrgMember.findOne({ clerkOrgId, clerkUserId });
    if (existing) {
      console.log(`Member already exists: ${clerkUserId} in ${clerkOrgId}`);
      return existing;
    }

    // Create member record
    const member = new OrgMember({
      clerkUserId,
      clerkOrgId,
      role,
      email: data.public_user_data.identifier,
      username: data.public_user_data.first_name 
        ? `${data.public_user_data.first_name} ${data.public_user_data.last_name || ''}`.trim()
        : undefined,
      imageUrl: data.public_user_data.image_url,
      joinedAt: new Date(data.created_at),
    });

    await member.save();

    // Add org to user's organizations array
    await User.updateOne(
      { clerkUserId },
      { 
        $addToSet: { 
          organizations: { 
            clerkOrgId, 
            role, 
            joinedAt: new Date(data.created_at) 
          } 
        } 
      }
    );

    // Update org member count
    await organizationService.updateMemberCount(clerkOrgId);

    console.log(`✅ Member added from Clerk: ${clerkUserId} as ${role} in ${clerkOrgId}`);
    return member;
  }

  /**
   * Update member from Clerk webhook (role change)
   */
  async updateFromClerk(data: ClerkMembershipData): Promise<IOrgMember | null> {
    await connectToDatabase();

    const clerkOrgId = data.organization.id;
    const clerkUserId = data.public_user_data.user_id;
    const role = this.mapClerkRole(data.role);

    // Update OrgMember
    const member = await OrgMember.findOneAndUpdate(
      { clerkOrgId, clerkUserId },
      { 
        $set: { 
          role,
          email: data.public_user_data.identifier,
          username: data.public_user_data.first_name 
            ? `${data.public_user_data.first_name} ${data.public_user_data.last_name || ''}`.trim()
            : undefined,
          imageUrl: data.public_user_data.image_url,
        } 
      },
      { new: true }
    );

    if (member) {
      // Update role in user's organizations array
      await User.updateOne(
        { clerkUserId, 'organizations.clerkOrgId': clerkOrgId },
        { $set: { 'organizations.$.role': role } }
      );
      console.log(`✅ Member updated from Clerk: ${clerkUserId} now ${role} in ${clerkOrgId}`);
    }

    return member;
  }

  /**
   * Remove member from Clerk webhook
   */
  async removeFromClerk(data: { organization: { id: string }; public_user_data: { user_id: string } }): Promise<boolean> {
    await connectToDatabase();

    const clerkOrgId = data.organization.id;
    const clerkUserId = data.public_user_data.user_id;

    return this.removeMember(clerkOrgId, clerkUserId);
  }

  /**
   * Remove a member from an organization
   */
  async removeMember(clerkOrgId: string, clerkUserId: string): Promise<boolean> {
    await connectToDatabase();

    // Check if this is the owner
    const member = await OrgMember.findOne({ clerkOrgId, clerkUserId });
    if (!member) {
      console.warn(`Member not found for removal: ${clerkUserId} in ${clerkOrgId}`);
      return false;
    }

    if (member.role === 'owner') {
      // Check if there are other admins who can become owner
      const adminCount = await OrgMember.countDocuments({ 
        clerkOrgId, 
        role: { $in: ['owner', 'admin'] },
        clerkUserId: { $ne: clerkUserId }
      });
      
      if (adminCount === 0) {
        throw new Error('Cannot remove owner - no other admins to transfer ownership');
      }
    }

    // Delete member record
    await OrgMember.deleteOne({ clerkOrgId, clerkUserId });

    // Remove org from user's organizations array
    await User.updateOne(
      { clerkUserId },
      { $pull: { organizations: { clerkOrgId } } }
    );

    // Update org member count
    await organizationService.updateMemberCount(clerkOrgId);

    console.log(`✅ Member removed: ${clerkUserId} from ${clerkOrgId}`);
    return true;
  }

  /**
   * Update member role (internal use, not from Clerk)
   */
  async updateMemberRole(
    clerkOrgId: string, 
    clerkUserId: string, 
    newRole: OrgRole
  ): Promise<IOrgMember | null> {
    await connectToDatabase();

    // Prevent changing owner role directly
    const member = await OrgMember.findOne({ clerkOrgId, clerkUserId });
    if (!member) {
      return null;
    }

    if (member.role === 'owner' && newRole !== 'owner') {
      throw new Error('Cannot demote owner - transfer ownership first');
    }

    // Update OrgMember
    member.role = newRole;
    await member.save();

    // Update user's organizations array
    await User.updateOne(
      { clerkUserId, 'organizations.clerkOrgId': clerkOrgId },
      { $set: { 'organizations.$.role': newRole } }
    );

    return member;
  }

  /**
   * Transfer ownership to another member
   */
  async transferOwnership(
    clerkOrgId: string, 
    currentOwnerId: string, 
    newOwnerId: string
  ): Promise<boolean> {
    await connectToDatabase();

    // Verify current owner
    const currentOwner = await OrgMember.findOne({ clerkOrgId, clerkUserId: currentOwnerId });
    if (!currentOwner || currentOwner.role !== 'owner') {
      throw new Error('Only the current owner can transfer ownership');
    }

    // Verify new owner is a member
    const newOwner = await OrgMember.findOne({ clerkOrgId, clerkUserId: newOwnerId });
    if (!newOwner) {
      throw new Error('New owner must be a member of the organization');
    }

    // Update roles
    await OrgMember.updateOne(
      { clerkOrgId, clerkUserId: currentOwnerId },
      { $set: { role: 'admin' } }
    );
    await OrgMember.updateOne(
      { clerkOrgId, clerkUserId: newOwnerId },
      { $set: { role: 'owner' } }
    );

    // Update user documents
    await User.updateOne(
      { clerkUserId: currentOwnerId, 'organizations.clerkOrgId': clerkOrgId },
      { $set: { 'organizations.$.role': 'admin' } }
    );
    await User.updateOne(
      { clerkUserId: newOwnerId, 'organizations.clerkOrgId': clerkOrgId },
      { $set: { 'organizations.$.role': 'owner' } }
    );

    console.log(`✅ Ownership transferred: ${currentOwnerId} → ${newOwnerId} in ${clerkOrgId}`);
    return true;
  }

  /**
   * Map Clerk role string to our OrgRole type
   */
  private mapClerkRole(clerkRole: string): OrgRole {
    switch (clerkRole.toLowerCase()) {
      case 'org:admin':
      case 'admin':
        return 'admin';
      case 'org:member':
      case 'member':
        return 'member';
      // Clerk uses 'org:admin' for the creator by default, but we track owner separately
      // The first member (creator) gets 'owner' role
      default:
        return 'member';
    }
  }
}

export const orgMemberService = new OrgMemberService();
