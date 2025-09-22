"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useUser } from '@clerk/nextjs';

interface UserInitializationContextType {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
 userExists: boolean;
 user: User | null;
}

const UserInitializationContext = createContext<UserInitializationContextType>({
 isInitialized: false,
 isLoading: false,
 error: null,
 userExists: false,
 user: null,
});

export const useUserInitialization = () => useContext(UserInitializationContext);

import { User } from "@/types/userTypes";

interface UserInitializationProviderProps {
  children: ReactNode;
  initialData: User | null;
}

export function UserInitializationProvider({ children, initialData }: UserInitializationProviderProps) {
  const { user, isLoaded } = useUser();
  const [isInitialized, setIsInitialized] = useState(!!initialData);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [userExists, setUserExists] = useState(!!initialData);
  const [userData, setUserData] = useState<User | null>(initialData);

  useEffect(() => {
    let isMounted = true;

    const initializeUser = async () => {
      if (!isLoaded || !user) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/user/initialize');
        if (!response.ok) {
          throw new Error('Failed to initialize user');
        }
        const data = await response.json();
        
        if (isMounted) {
          setUserData(data.user);
          setUserExists(true);
          setIsInitialized(true);
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

    // If we have initialData, use it immediately
    if (initialData && !isInitialized) {
      setUserData(initialData);
      setUserExists(true);
      setIsInitialized(true);
      setIsLoading(false);
      return;
    }

    // Only trigger initialization if no initialData and user is loaded
    if (!initialData && !isInitialized && !isLoading && isLoaded && user) {
      // Small delay to not block critical rendering
      const timer = setTimeout(() => {
        if (isMounted) {
          initializeUser();
        }
      }, 50);
      
      return () => {
        clearTimeout(timer);
        isMounted = false;
      };
    }

    return () => {
      isMounted = false;
    };
  }, [isLoaded, user, isInitialized, initialData, isLoading]);

  const contextValue: UserInitializationContextType = {
    isInitialized,
    isLoading,
    error,
    userExists,
    user: userData,
  };

  return (
    <UserInitializationContext.Provider value={contextValue}>
      {children}
    </UserInitializationContext.Provider>
  );
}