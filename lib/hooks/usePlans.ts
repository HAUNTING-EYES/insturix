import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { UserType } from "@/types/userTypes";

export interface Plan {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
  price: number;
  status: "active" | "expired" | "canceled";
  features?: string[];
}

interface PlansResponse {
  currentPlan: Plan | null;
  plans: Plan[];
  userType: string;
  signUpDate: Date;
}

export function usePlans() {
  const queryClient = useQueryClient();

  const plansQuery = useQuery<PlansResponse>({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data } = await axios.get("/api/user/plans");
      
      // Convert date strings to Date objects
      const plans = data.plans.map((plan: any) => ({
        ...plan,
        startDate: new Date(plan.startDate),
        endDate: plan.endDate ? new Date(plan.endDate) : null,
      }));
      
      const currentPlan = data.currentPlan ? {
        ...data.currentPlan,
        startDate: new Date(data.currentPlan.startDate),
        endDate: data.currentPlan.endDate ? new Date(data.currentPlan.endDate) : null,
      } : null;
      
      const signUpDate = new Date(data.signUpDate);
      
      return {
        currentPlan,
        plans,
        userType: data.userType,
        signUpDate,
      };
    },
  });

  // Mutation for upgrading a plan
  const upgradePlanMutation = useMutation({
    mutationFn: async ({
      planType,
      paymentId,
      phoneNumber,
    }: {
      planType: UserType;
      paymentId: string;
      phoneNumber: string;
    }) => {
      const { data } = await axios.post("/api/user/plans/upgrade", {
        planType,
        paymentId,
        phoneNumber,
      });
      return data;
    },
    onSuccess: () => {
      // Invalidate the plans query to refetch updated data
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  // Mutation for canceling a plan
  const cancelPlanMutation = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post("/api/user/plans/cancel");
      return data;
    },
    onSuccess: () => {
      // Invalidate the plans query to refetch updated data
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
  });

  return {
    ...plansQuery,
    upgradePlan: upgradePlanMutation.mutate,
    isUpgrading: upgradePlanMutation.isPending,
    upgradeError: upgradePlanMutation.error,
    cancelPlan: cancelPlanMutation.mutate,
    isCanceling: cancelPlanMutation.isPending,
    cancelError: cancelPlanMutation.error,
  };
} 