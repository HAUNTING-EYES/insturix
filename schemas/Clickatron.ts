import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IClickatronTask extends Document {
  _id: Types.ObjectId;
  clerkUserId: string;
  title?: string;
  details: any; // Mixed type to handle both old and new data structures
  error_message?: string;
  createdAt: Date;
  updatedAt: Date;
  refunded?: boolean;
}

const ClickatronTaskSchema = new Schema<IClickatronTask>(
  {
    clerkUserId: { type: String, required: true, index: true },
    title: { type: String },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    error_message: { type: String },
  // Clickatron session lifecycle is represented in details.workflow.stage ('ideation' | 'canvas')
    refunded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound index for efficient querying by clerkUserId, status, and createdAt
ClickatronTaskSchema.index({ clerkUserId: 1, createdAt: -1 });

export const ClickatronTask =
  mongoose.models.ClickatronTask ||
  mongoose.model<IClickatronTask>('ClickatronTask', ClickatronTaskSchema, 'clickatron_tasks2');