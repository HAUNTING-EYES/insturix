"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useUser } from '@clerk/nextjs';

interface UserInitializationContextType {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  userExists: boolean;
}

const UserInitializationContext = createContext<UserInitializationContextType>({
  isInitialized: false,
  isLoading: false,
  error: null,
  userExists: false,
});

export const useUserInitialization = () => useContext(UserInitializationContext);

interface UserInitializationProviderProps {
  children: ReactNode;
}

export function UserInitializationProvider({ children }: UserInitializationProviderProps) {
  const { user, isLoaded } = useUser();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userExists, setUserExists] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const initializeUser = async () => {
      // Only run if we haven't tried initialization yet
      if (!isLoaded || !user || isInitialized || isLoading) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log('Initializing user for dashboard...');
        
        // Single API call to ensure user exists in database
        const response = await fetch('/api/user', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Failed to initialize user: ${response.status} - ${errorData}`);
        }

        const userData = await response.json();
        
        if (isMounted) {
          setUserExists(true);
          setIsInitialized(true);
          console.log('User successfully initialized for dashboard');
        }
      } catch (err) {
        console.error('Error initializing user:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize user');
          setIsInitialized(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Only run initialization once when user is loaded
    if (isLoaded && user && !isInitialized && !isLoading && !error) {
      initializeUser();
    }

    return () => {
      isMounted = false;
    };
  }, [isLoaded, user]); // Remove isInitialized and isLoading from dependencies to prevent loops

  // Show loading state while user is being initialized
  if (!isLoaded || (user && !isInitialized && isLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing your account...</p>
        </div>
      </div>
    );
  }

  // Show error state if initialization failed
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.966-.833-2.732 0L4.082 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Initialization Failed</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setIsInitialized(false);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const contextValue: UserInitializationContextType = {
    isInitialized,
    isLoading,
    error,
    userExists,
  };

  return (
    <UserInitializationContext.Provider value={contextValue}>
      {children}
    </UserInitializationContext.Provider>
  );
}