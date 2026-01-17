"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useUser } from '@clerk/nextjs';

// Credits balance type (simplified for frontend)
export interface CreditsBalance {
  subscriptionCredits: number;
  topupCredits: number;
  total: number;
}

export type ServiceUsageData = Record<string, Record<string, any>>;

interface UserInitializationContextType {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  userExists: boolean;
  user: User | null;
  featureUsage: ServiceUsageData;
  creditsBalance: CreditsBalance | null;
  refreshFeatureUsage: () => Promise<void>;
  refreshCredits: () => Promise<void>;
}

const UserInitializationContext = createContext<UserInitializationContextType>({
  isInitialized: false,
  isLoading: false,
  error: null,
  userExists: false,
  user: null,
  featureUsage: {},
  creditsBalance: null,
  refreshFeatureUsage: async () => {},
  refreshCredits: async () => {},
});

export const useUserInitialization = () => useContext(UserInitializationContext);

import { User } from "@/types/userTypes";

interface UserInitializationProviderProps {
  children: ReactNode;
  initialData: User | null;
}

export function UserInitializationProvider({ children, initialData }: UserInitializationProviderProps) {
  const { user, isLoaded } = useUser();
  
  // Initialize state directly from server-provided props
  const [userData, setUserData] = useState<User | null>(initialData);
  const [featureUsage, setFeatureUsage] = useState<ServiceUsageData>({});
  const [creditsBalance, setCreditsBalance] = useState<CreditsBalance | null>(null);
  
  const [isInitialized, setIsInitialized] = useState(!!initialData);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [userExists, setUserExists] = useState(!!initialData);

  const refreshCredits = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/user/credits', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.balance) {
          setCreditsBalance({
            subscriptionCredits: data.balance.subscriptionCredits,
            topupCredits: data.balance.topupCredits,
            total: data.balance.subscriptionCredits + data.balance.topupCredits,
          });
        }
      }
    } catch (err) {
      console.error('Error refreshing credits:', err);
    }
  }, [user]);

  const refreshFeatureUsage = useCallback(async () => {
    // Now just refresh credits (legacy feature usage is deprecated)
    await refreshCredits();
  }, [refreshCredits]);

  // Effect to refresh data from server in the background after initial render
  useEffect(() => {
    if (initialData) {
      refreshFeatureUsage();
    }
  }, [initialData]); // Runs once when initialData is first received

  // Effect for client-side initialization (fallback if server render fails)
  useEffect(() => {
    let isMounted = true;

    const initializeUser = async () => {
      if (!isLoaded || !user) return;
  
      setIsLoading(true);
      setError(null);
  
      try {
        const response = await fetch('/api/user/initialize');
        if (!response.ok) throw new Error('Failed to initialize user');
        
        const data = await response.json();
        if (isMounted) {
          setUserData(data.user);
          setUserExists(true);
          setIsInitialized(true);
          // Refresh credits after initialization
          refreshCredits();
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Only run if we didn't get data from the server and we are not already loading
    if (!initialData && isLoaded && user) {
      initializeUser();
    }

    return () => {
      isMounted = false;
    };
  }, [isLoaded, user, initialData, refreshCredits]);

  const contextValue: UserInitializationContextType = {
    isInitialized,
    isLoading,
    error,
    userExists,
    user: userData,
    featureUsage,
    creditsBalance,
    refreshFeatureUsage,
    refreshCredits,
  };

  return (
    <UserInitializationContext.Provider value={contextValue}>
      {children}
    </UserInitializationContext.Provider>
  );
}