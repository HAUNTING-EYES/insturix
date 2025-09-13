"use client";

import { useState, useEffect } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  });

  useEffect(() => {
    const updateStatus = () => {
      const newStatus = {
        isOnline: navigator.onLine,
      };
      console.log('Network status changed:', newStatus);
      setStatus(newStatus);
    };

    console.log('Initial network status:', status);
    
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  return status;
}