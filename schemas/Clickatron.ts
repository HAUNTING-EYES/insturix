import mongoose, { Document, Schema, Types } from 'mongoose';

const FineTuningSchema = new Schema({
  brightness: { type: Number, default: 100 },
  contrast: { type: Number, default: 100 },
  saturation: { type: Number, default: 100 },
}, { _id: false });

const VariationSchema = new Schema({
  id: { type: String, required: true },
  prompt: { type: String, default: '' },
  imageRef: { type: String, default: '' },
  status: { type: String, enum: ['generating', 'completed', 'failed', 'blank'], required: true },
  aspectRatio: { type: String, required: true },
  fineTuning: { type: FineTuningSchema, required: true, default: () => ({}) },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  parentVariationId: { type: String },
  referenceImageRefs: { type: [String], default: [] }, // GCS URIs of reference images
  // AI generation metadata
  modelId: { type: String, required: true }, // Renamed from modelUsed and now required
  seed: { type: Number },
  generationParams: { type: Schema.Types.Mixed },
});

const ChatMessageSchema = new Schema({
  id: { type: String, required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  variationId: { type: String }, // Link to variation if this message generated one
}, { _id: false });

const CanvasSchema = new Schema({
  variations: { type: [VariationSchema], default: [] },
  chatHistory: { type: [ChatMessageSchema], default: [] },
}, { _id: false });

export interface IClickatronTask extends Document {
  _id: Types.ObjectId;
  clerkUserId: string;
  title?: string;
  details: {
    videoIdea: string;
    aspectRatio: string;
    referenceImage?: string;
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
      referenceImage: { type: String },
      canvas: { type: CanvasSchema },
    },
    error_message: { type: String },
    refunded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound index for efficient querying by clerkUserId, status, and createdAt
ClickatronTaskSchema.index({ clerkUserId: 1, createdAt: -1 });

// Force model refresh by deleting cached model
if (mongoose.models.ClickatronTask) {
  delete mongoose.models.ClickatronTask;
}

export const ClickatronTask = mongoose.model<IClickatronTask>('ClickatronTask', ClickatronTaskSchema);