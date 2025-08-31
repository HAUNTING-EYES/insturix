import mongoose, { Document, Schema, Types } from 'mongoose';

const FineTuningSchema = new Schema({
  brightness: { type: Number, default: 100 },
  contrast: { type: Number, default: 100 },
  saturation: { type: Number, default: 100 },
}, { _id: false });

const VariationSchema = new Schema({
  id: { type: String, required: true },
  prompt: { type: String, required: true },
  imageRef: { type: String, required: true },
  status: { type: String, enum: ['generating', 'completed', 'failed'], required: true },
  fineTuning: { type: FineTuningSchema, required: true, default: () => ({}) },
});

const CanvasSchema = new Schema({
  variations: { type: [VariationSchema], default: [] },
}, { _id: false });

export interface IClickatronTask extends Document {
  _id: Types.ObjectId;
  clerkUserId: string;
  title?: string;
  details: {
    videoIdea: string;
    aspectRatio: string;
    ideas?: any[];
    selectedIdea?: any;
    canvas?: any;
  };
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
      videoIdea: { type: String, required: true },
      aspectRatio: { type: String, required: true },
      ideas: { type: Array },
      selectedIdea: { type: Object },
      canvas: { type: CanvasSchema },
    },
    error_message: { type: String },
    refunded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound index for efficient querying by clerkUserId, status, and createdAt
ClickatronTaskSchema.index({ clerkUserId: 1, createdAt: -1 });

export const ClickatronTask =
  mongoose.models.ClickatronTask ||
  mongoose.model<IClickatronTask>('ClickatronTask', ClickatronTaskSchema);