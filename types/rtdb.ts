export type TaskStatus = 'listed' | 'queued' | 'processing' | 'completed' | 'failed';

export interface TaskUpdate {
  _id: string;
  // serviceName is available from the RTDB path /userID/serviceName/taskID
  status: TaskStatus;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  title?: string;
  description?: string;
  // progress, results, and detailed error are not stored in RTDB for lightness.
  // They will be fetched from MongoDB when the user opens the task details.
}

export interface RTDBTaskData {
  [serviceName: string]: {
    [taskId: string]: TaskUpdate;
  };
}

export interface TaskNotification {
  id: string;
  taskUpdate: TaskUpdate;
  serviceName: ServiceName; // Added separately since it's not in TaskUpdate
  timestamp: string;
  isRead: boolean;
}

export type ServiceName = 'alyzitron' | 'editron' | 'musitron' | 'shield' | 'thinkforge' | 'socialize' | 'clickatron';