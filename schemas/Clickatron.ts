import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IClickatronTask extends Document {
  _id: Types.ObjectId;
  userId: string;
  title?: string;
  details: any; // Mixed type to handle both old and new data structures
  status: 'listed' | 'queued' | 'processing' | 'completed' | 'failed';
  results?: {
    thumbnail: {
      prompt: string;
      gcs_url: string;
    };
    details?: string; // JSON string of original user input
  };
  error_message?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  refunded?: boolean;
}

const ClickatronTaskSchema = new Schema<IClickatronTask>(
  {
    userId: { type: String, required: true, index: true },
    title: { type: String },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['listed', 'queued', 'processing', 'completed', 'failed'],
      default: 'listed',
      required: true,
    },
    results: {
      thumbnail: {
        prompt: { type: String },
        gcs_url: { type: String },
      },
      details: { type: String }, // JSON string of original user input
    },
    error_message: { type: String },
    completedAt: { type: Date },
    refunded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound index for efficient querying by userId, status, and createdAt
ClickatronTaskSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const ClickatronTask =
  mongoose.models.ClickatronTask ||
  mongoose.model<IClickatronTask>('ClickatronTask', ClickatronTaskSchema, 'clickatron_tasks');