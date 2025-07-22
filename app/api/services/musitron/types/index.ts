// Status workflow: listed -> processing -> completed/failed
export type MusitronTaskStatus = 'listed' | 'processing' | 'completed' | 'failed';

export interface MusitronTask {
  _id: string;
  clerkUserId: string;
  title: string;
  style: string;
  instrumental_only: boolean;
  lyrics: string;
  status: MusitronTaskStatus;
  gcs_url?: string; // Present when completed
  error?: {
    code: string;
    message: string;
    action?: string;
  };
  unread: boolean;
  createdAt: Date;
  updatedAt: Date;
  refunded?: boolean;
}