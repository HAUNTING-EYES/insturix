import mongoose, { Schema, Document, Model } from "mongoose";

export type MessageRole = "user" | "assistant" | "system";

export interface IChatMessage {
  role: MessageRole;
  content: string;
  timestamp: Date;
  tokenCount?: number; // Estimated tokens for context window management
}

export interface IChatSession extends Document {
  videoId: string;
  userId?: string; // Optional: if you have auth
  messages: IChatMessage[];
  // Summarization state
  summary: string | null; // Rolling summary of older messages
  summarizedUpToIndex: number; // How many messages have been summarized
  totalMessagesEver: number; // Counter for stats
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    tokenCount: { type: Number },
  },
  { _id: false }
);

const ChatSessionSchema = new Schema<IChatSession>(
  {
    videoId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    messages: { type: [ChatMessageSchema], default: [] },
    summary: { type: String, default: null },
    summarizedUpToIndex: { type: Number, default: 0 },
    totalMessagesEver: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ChatSessionSchema.index({ videoId: 1, userId: 1 });

const ChatSession: Model<IChatSession> =
  mongoose.models.ChatSession ||
  mongoose.model<IChatSession>("ChatSession", ChatSessionSchema);

export default ChatSession;