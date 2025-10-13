"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useUser } from '@clerk/nextjs';
import { computeServiceUsageFromUser } from '@/lib/utils/computeServiceUsage';

export type ServiceUsageData = Record<string, Record<string, ServiceUsageInfo>>;

interface UserInitializationContextType {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  userExists: boolean;
  user: User | null;
  featureUsage: ServiceUsageData;
  refreshFeatureUsage: () => Promise<void>;
}

const UserInitializationContext = createContext<UserInitializationContextType>({
  isInitialized: false,
  isLoading: false,
  error: null,
  userExists: false,
  user: null,
  featureUsage: {},
  refreshFeatureUsage: async () => {},
});

export const useUserInitialization = () => useContext(UserInitializationContext);

import { User } from "@/types/userTypes";
import type { ServiceUsageInfo } from "@/lib/services/serviceUsageService";

interface UserInitializationProviderProps {
  children: ReactNode;
  initialData: User | null;
}

export function UserInitializationProvider({ children, initialData }: UserInitializationProviderProps) {
  const { user, isLoaded } = useUser();
  
  // Initialize state directly from server-provided props
  const [userData, setUserData] = useState<User | null>(initialData);
  const [featureUsage, setFeatureUsage] = useState<ServiceUsageData>(() =>
    initialData ? computeServiceUsageFromUser(initialData) : {}
  );
  
  const [isInitialized, setIsInitialized] = useState(!!initialData);
  const [isLoading, setIsLoading] = useState(!initialData); // Only loading if no initial data
  const [error, setError] = useState<string | null>(null);
  const [userExists, setUserExists] = useState(!!initialData);

  const refreshFeatureUsage = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/user/feature-usage', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch feature usage');
      }
      const result = await response.json();
      setFeatureUsage(result.data || {});
    } catch (err) {
      console.error('Error refreshing feature usage:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh feature usage');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

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
          if (data.user) {
            const computedUsage = computeServiceUsageFromUser(data.user);
            setFeatureUsage(computedUsage);
          }
          setIsInitialized(true);
          // Also refresh from server to ensure consistency
          refreshFeatureUsage();
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
  }, [isLoaded, user, initialData]);

  const contextValue: UserInitializationContextType = {
    isInitialized,
    isLoading,
    error,
    userExists,
    user: userData,
    featureUsage,
    refreshFeatureUsage,
  };

  return (
    <UserInitializationContext.Provider value={contextValue}>
      {children}
    </UserInitializationContext.Provider>
  );
}