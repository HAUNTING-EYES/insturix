    import { create } from 'zustand';

export type LogType = 'info' | 'token' | 'tool_start' | 'tool_end' | 'error' | 'client_action';

export interface DebugLog {
  id: string;
  timestamp: Date;
  type: LogType;
  message: string;
  data?: any;
}

interface AIDebugStore {
  logs: DebugLog[];
  addLog: (type: LogType, message: string, data?: any) => void;
  clearLogs: () => void;
}

export const useAIDebugStore = create<AIDebugStore>((set) => ({
  logs: [],
  addLog: (type, message, data) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          id: Math.random().toString(36).substring(7),
          timestamp: new Date(),
          type,
          message,
          data,
        },
      ],
    })),
  clearLogs: () => set({ logs: [] }),
}));
