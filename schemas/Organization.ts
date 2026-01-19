import mongoose, { Document, Schema } from "mongoose";

/**
 * Organization Schema
 * 
 * Represents a B2B organization/team synced from Clerk.
 * Organizations group users together for collaborative project access.
 */

export interface IOrgSettings {
  allowMemberProjects: boolean;  // Can members create org projects?
  defaultRole: 'admin' | 'member';  // Default role for new members
}

export interface IOrganization extends Document {
  clerkOrgId: string;        // Primary identifier from Clerk
  name: string;
  slug: string;
  imageUrl?: string;
  createdBy: string;         // clerkUserId of creator
  memberCount: number;       // Cached count for performance
  settings: IOrgSettings;
  createdAt: Date;
  updatedAt: Date;
}

const orgSettingsSchema = new Schema<IOrgSettings>({
  allowMemberProjects: {
    type: Boolean,
    default: true,
  },
  defaultRole: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member',
  },
}, { _id: false });

const organizationSchema = new Schema<IOrganization>({
  clerkOrgId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  imageUrl: {
    type: String,
    required: false,
  },
  createdBy: {
    type: String,
    required: true,
    index: true,
  },
  memberCount: {
    type: Number,
    default: 1,
    min: 0,
  },
  settings: {
    type: orgSettingsSchema,
    default: () => ({
      allowMemberProjects: true,
      defaultRole: 'member',
    }),
  },
}, {
  timestamps: true,
});

// Compound index for efficient queries
organizationSchema.index({ createdBy: 1, createdAt: -1 });

export const Organization = mongoose.models.Organization || 
  mongoose.model<IOrganization>("Organization", organizationSchema);
