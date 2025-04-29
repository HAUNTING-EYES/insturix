import mongoose, { Document, Schema } from "mongoose";

interface IMusitronTrack {
  id: string;
  audio_url: string;
  source_audio_url: string;
  stream_audio_url?: string;
  source_stream_audio_url?: string;
  image_url: string;
  source_image_url: string;
  prompt: string;
  model_name: string;
  title: string;
  tags: string;
  createTime: string;
  duration: number;
}

interface IMusitron extends Document {
  userId: string;
  tracks: IMusitronTrack[];
}

const musitronTrackSchema = new Schema<IMusitronTrack>({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  audio_url: {
    type: String,
    required: true,
  },
  source_audio_url: {
    type: String,
    required: true,
  },
  stream_audio_url: {
    type: String,
    required: false,
  },
  source_stream_audio_url: {
    type: String,
    required: false,
  },
  image_url: {
    type: String,
    required: true,
  },
  source_image_url: {
    type: String,
    required: true,
  },
  prompt: {
    type: String,
  },
  model_name: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  tags: {
    type: String,
    required: true,
  },
  createTime: {
    type: String,
    required: true,
  },
  duration: {
    type: Number,
    required: true,
  },
});

const musitronSchema = new Schema<IMusitron>(
  {
    userId: {
      type: String,
      required: true,
    },
    tracks: [musitronTrackSchema],
  },
  {
    timestamps: true,
  }
);

// Create a compound index to ensure uniqueness of tracks within a user's collection
musitronSchema.index({ userId: 1, "tracks.id": 1 }, { unique: true });

const Musitron =
  (mongoose.models.Musitron as mongoose.Model<IMusitron>) ||
  mongoose.model<IMusitron>("Musitron", musitronSchema);
export default Musitron;
