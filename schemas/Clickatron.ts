import mongoose, { Document, Schema, Types } from 'mongoose';

const CurvePointSchema = new Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
}, { _id: false });

const FineTuningSchema = new Schema({
  brightness: { type: Number, default: 100 },
  contrast: { type: Number, default: 100 },
  saturation: { type: Number, default: 100 },
  curves: {
    master: { type: [CurvePointSchema], default: [] },
    red: { type: [CurvePointSchema], default: [] },
    green: { type: [CurvePointSchema], default: [] },
    blue: { type: [CurvePointSchema], default: [] },
  },
}, { _id: false });

const VariationSchema = new Schema({
  id: { type: String, required: true },
  prompt: { type: String, default: '' },
  imageRef: { type: String, default: '' },
  thumbnailRef: { type: String, default: '' },
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
  metadata: { type: Schema.Types.Mixed },
  error: { type: String },
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
  orgId?: string;  // null = personal, set = org-owned
  createdByName?: string;  // Creator's display name for org context
  brandId?: string;
  projectId?: string;
  universalId?: string;
  sourceService?: string;
  sourceSessionId?: string;
  sourceScriptId?: string;
  metadata?: Record<string, unknown>;
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
    orgId: { type: String, index: true },  // Index for org-level queries
    createdByName: { type: String },  // Creator's name for display
    brandId: { type: String, index: true },
    projectId: { type: String, index: true },
    universalId: { type: String, index: true },
    sourceService: { type: String, index: true },
    sourceSessionId: { type: String, index: true },
    sourceScriptId: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
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

// Compound index for org-level queries
ClickatronTaskSchema.index({ orgId: 1, createdAt: -1 });

// Compound indexes for cross-service and brand-aware retrieval
ClickatronTaskSchema.index({ clerkUserId: 1, brandId: 1, createdAt: -1 });
ClickatronTaskSchema.index({ clerkUserId: 1, universalId: 1, createdAt: -1 });
ClickatronTaskSchema.index({ clerkUserId: 1, sourceService: 1, sourceSessionId: 1 });

// Force model refresh by deleting cached model
if (mongoose.models.ClickatronTask) {
  delete mongoose.models.ClickatronTask;
}

export const ClickatronTask = mongoose.model<IClickatronTask>('ClickatronTask', ClickatronTaskSchema);
