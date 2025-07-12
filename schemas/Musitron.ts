import mongoose, { Schema, Document } from 'mongoose';

export interface IMusitronTask extends Document {
  userId: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  gcsAudioLink?: string;
  createdAt: Date;
  updatedAt: Date; // Add updatedAt to the interface
  options: {
    customMode: boolean;
    title: string;
    instrumental: boolean;
    songDescription?: string;
    style?: string;
    lyrics?: string;
  };
  error?: {
    code: string;
    message: string;
  };
  refunded?: boolean;
}

const MusitronTaskSchema: Schema = new Schema({
  userId: { type: String, required: true },
  status: { type: String, required: true },
  gcsAudioLink: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }, // Add updatedAt to the schema
  options: {
    customMode: { type: Boolean, required: true },
    title: { type: String, required: true },
    instrumental: { type: Boolean, required: true },
    songDescription: { type: String },
    style: { type: String },
    lyrics: { type: String },
  },
  error: {
    code: { type: String },
    message: { type: String },
  },
  refunded: { type: Boolean, default: false },
});

export const MusitronTask = mongoose.models.MusitronTask || mongoose.model<IMusitronTask>('MusitronTask', MusitronTaskSchema, 'musitron-tasks');
