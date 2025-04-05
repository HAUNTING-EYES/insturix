import mongoose, { Document, Schema } from "mongoose";

interface IApiUsage extends Document {
  clerkUserId: string;
  service: string;
  usageCount: number;
  lastUsed: Date;
  resetDate: Date;
}

const apiUsageSchema = new Schema<IApiUsage>(
  {
    clerkUserId: {
      type: String,
      required: true,
      index: true,
    },
    service: {
      type: String,
      required: true,
      enum: ["musitron", "editron", "thinkforge", "alyzitron", "kundli"],
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    lastUsed: {
      type: Date,
      default: Date.now,
    },
    resetDate: {
      type: Date,
      default: () => {
        // Set reset date to the first day of next month
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 1);
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for clerkUserId and service
apiUsageSchema.index({ clerkUserId: 1, service: 1 }, { unique: true });

const ApiUsage = mongoose.models.ApiUsage || mongoose.model<IApiUsage>("ApiUsage", apiUsageSchema);

export default ApiUsage; 