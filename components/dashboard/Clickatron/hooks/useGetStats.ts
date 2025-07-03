import { useQuery } from "@tanstack/react-query";

interface ClickatronStats {
  monthlyTasks: number;
  pendingTasks: number;
  totalTasks: number;
  usage?: {
    hasAccess: boolean;
    maxUsage: number;
    currentUsage: number;
    remaining: number;
    resetPeriod: string;
    lastReset?: Date;
    isUnlimited: boolean;
    timeUntilReset?: { days: number; hours: number; minutes: number; totalMs: number } | null;
  };
}

const getStats = async (): Promise<ClickatronStats> => {
  const response = await fetch("/api/services/clickatron/stats");
  if (!response.ok) {
    throw new Error("Failed to fetch stats");
  }
  const data = await response.json();
  return data;
};

export function useGetStats() {
  const { data: stats, isLoading, error } = useQuery<ClickatronStats>({
    queryKey: ["clickatronStats"],
    queryFn: getStats,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  return { stats, isLoading, error, usage: stats?.usage };
}