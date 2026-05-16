import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IEditronPreferences extends Document {
  userId: string;
  projectId?: string;
  captionStyle: 'word_by_word' | 'sentence' | 'key_phrases' | 'none';
  transitionPreference: 'minimal' | 'subtle' | 'dynamic' | 'energetic';
  zoomBehavior: 'none' | 'subtle' | 'moderate' | 'aggressive';
  motionGraphics: 'none' | 'stats_only' | 'full';
  pacingFeel: 'calm' | 'balanced' | 'energetic' | 'fast';
  musicPreference: 'none' | 'subtle_bed' | 'energetic' | 'match_video';
  brandId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EditronPreferencesSchema = new Schema<IEditronPreferences>(
  {
    userId: { type: String, required: true, index: true },
    projectId: { type: String, default: null, index: true },
    captionStyle: {
      type: String,
      enum: ['word_by_word', 'sentence', 'key_phrases', 'none'],
      default: 'word_by_word',
    },
    transitionPreference: {
      type: String,
      enum: ['minimal', 'subtle', 'dynamic', 'energetic'],
      default: 'subtle',
    },
    zoomBehavior: {
      type: String,
      enum: ['none', 'subtle', 'moderate', 'aggressive'],
      default: 'moderate',
    },
    motionGraphics: {
      type: String,
      enum: ['none', 'stats_only', 'full'],
      default: 'stats_only',
    },
    pacingFeel: {
      type: String,
      enum: ['calm', 'balanced', 'energetic', 'fast'],
      default: 'balanced',
    },
    musicPreference: {
      type: String,
      enum: ['none', 'subtle_bed', 'energetic', 'match_video'],
      default: 'subtle_bed',
    },
    brandId: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: 'editron_preferences',
  }
);

EditronPreferencesSchema.index({ userId: 1, projectId: 1 }, { unique: true });

export const EditronPreferences =
  mongoose.models.EditronPreferences ||
  mongoose.model<IEditronPreferences>('EditronPreferences', EditronPreferencesSchema);
