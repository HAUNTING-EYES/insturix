/**
 * Shared plain MusitronTask type for backend, API, and frontend.
 * Do NOT include Mongoose Document or methods.
 */
export type MusitronTaskStatus = 'listed' | 'processing' | 'completed' | 'failed';

export interface MusitronTask {
  _id: string; // Always string for frontend/API
  clerkUserId: string;
  title: string;
  style: string;
  instrumental_only: boolean;
  lyrics: string;
  status: MusitronTaskStatus;
  gcs_url?: string;
  error?: {
    code: string;
    message: string;
    action?: string;
  };
  unread: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  refunded?: boolean;
}