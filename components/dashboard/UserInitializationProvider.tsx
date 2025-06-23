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
      if (!isLoaded || !user || isInitialized) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/user');
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

    if (!initialData) {
      initializeUser();
    }

    return () => {
      isMounted = false;
    };
  }, [isLoaded, user, isInitialized, initialData]);

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