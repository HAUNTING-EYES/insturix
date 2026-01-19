import mongoose, { Document, Schema } from "mongoose";

/**
 * OrgMember Schema
 * 
 * Represents membership of a user in an organization.
 * Synced from Clerk organizationMembership events.
 * Separate collection for efficient member queries and updates.
 */

export type OrgRole = 'owner' | 'admin' | 'member';

export interface IOrgMember extends Document {
  clerkUserId: string;       // Reference to user
  clerkOrgId: string;        // Reference to organization
  role: OrgRole;
  email: string;             // Cached for display
  username?: string;         // Cached for display
  imageUrl?: string;         // Cached for display
  joinedAt: Date;
  invitedBy?: string;        // clerkUserId of inviter
}

const orgMemberSchema = new Schema<IOrgMember>({
  clerkUserId: {
    type: String,
    required: true,
    index: true,
  },
  clerkOrgId: {
    type: String,
    required: true,
    index: true,
  },
  role: {
    type: String,
    required: true,
    enum: ['owner', 'admin', 'member'],
    default: 'member',
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  username: {
    type: String,
    required: false,
    trim: true,
  },
  imageUrl: {
    type: String,
    required: false,
  },
  joinedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  invitedBy: {
    type: String,
    required: false,
  },
}, {
  timestamps: true,
});

// Compound unique index - user can only be member once per org
orgMemberSchema.index({ clerkOrgId: 1, clerkUserId: 1 }, { unique: true });

// For listing members of an org with role filtering
orgMemberSchema.index({ clerkOrgId: 1, role: 1 });

// For finding all orgs a user belongs to
orgMemberSchema.index({ clerkUserId: 1, joinedAt: -1 });

export const OrgMember = mongoose.models.OrgMember || 
  mongoose.model<IOrgMember>("OrgMember", orgMemberSchema);
