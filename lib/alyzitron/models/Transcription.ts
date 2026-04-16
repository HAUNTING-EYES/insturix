import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITranscription extends Document {
  videoId: string; // Reference to your video document
  audioUrl: string; // The audio/video URL that was transcribed
  transcriptionServiceId: string; // Deepgram request_id for reference/debugging
  status: "pending" | "processing" | "completed" | "error";
  text: string;
  detectedLanguage: string | null;
  confidence: number | null;
  speakerSegments: {
    speaker: string;
    text: string;
    start: number;
    end: number;
  }[];
  formattedTranscript: string;
  durationMs: number | null;
  wordCount: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SpeakerSegmentSchema = new Schema(
  {
    speaker: { type: String, required: true },
    text: { type: String, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
  },
  { _id: false }
);

const TranscriptionSchema = new Schema<ITranscription>(
  {
    videoId: { type: String, required: true, index: true },
    audioUrl: { type: String, required: true },
    transcriptionServiceId: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "error"],
      default: "pending",
    },
    text: { type: String, default: "" },
    detectedLanguage: { type: String, default: null },
    confidence: { type: Number, default: null },
    speakerSegments: { type: [SpeakerSegmentSchema], default: [] },
    formattedTranscript: { type: String, default: "" },
    durationMs: { type: Number, default: null },
    wordCount: { type: Number, default: 0 },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

// Ensure one transcription per video
TranscriptionSchema.index({ videoId: 1 }, { unique: true });

const Transcription: Model<ITranscription> =
  mongoose.models.Transcription ||
  mongoose.model<ITranscription>("Transcription", TranscriptionSchema);

export default Transcription;