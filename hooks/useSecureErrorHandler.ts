"use client";

import { useState, useCallback } from 'react';
import { handleSecureError, type SecureError, type ErrorLevel } from '../lib/utils/secureErrorHandler';

/**
 * React hook for secure error handling
 * Provides state management for errors with automatic cleanup
 */
export function useSecureErrorHandler() {
  const [errors, setErrors] = useState<SecureError[]>([]);

  const addError = useCallback((error: any, customLevel?: ErrorLevel) => {
    const secureError = handleSecureError(error, customLevel);
    setErrors(prev => [secureError, ...prev.slice(0, 9)]); // Keep last 10 errors
    
    // Auto-remove errors after a delay
    setTimeout(() => {
      setErrors(prev => prev.filter(e => e.id !== secureError.id));
    }, 10000); // 10 seconds
    
    return secureError;
  }, []);

  const removeError = useCallback((errorId: string) => {
    setErrors(prev => prev.filter(e => e.id !== errorId));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return {
    errors,
    addError,
    removeError,
    clearErrors
  };
} 