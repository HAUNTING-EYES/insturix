export enum UserType {
  Free = "free",
  Plus = "plus",
  Pro = "pro",
  Premium = "premium",
}

export interface User {
  id: string;
  clerkUserId: string;
  email: string;
  payments: any[];
  currentPlan: any;
  planUpdated: boolean;
}
