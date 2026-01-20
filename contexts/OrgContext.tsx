'use client';

/**
 * OrgContext - Global Organization Context Provider
 * 
 * Wraps Clerk's organization state for easier access across the app.
 * When a user switches org context using OrgSwitcher, this context automatically updates.
 * 
 * Usage:
 *   const { activeOrgId, isOrgContext } = useOrgContext();
 */

import { createContext, useContext, ReactNode } from 'react';
import { useOrganization } from '@clerk/nextjs';

interface OrgContextValue {
  /** The active organization's Clerk ID, or null if in personal context */
  activeOrgId: string | null;
  /** The active organization's name, or null if in personal context */
  activeOrgName: string | null;
  /** True if currently in an organization context */
  isOrgContext: boolean;
  /** The organization's slug for URL-friendly references */
  activeOrgSlug: string | null;
  /** Loading state from Clerk */
  isLoaded: boolean;
}

const OrgContext = createContext<OrgContextValue>({
  activeOrgId: null,
  activeOrgName: null,
  isOrgContext: false,
  activeOrgSlug: null,
  isLoaded: false,
});

export function OrgContextProvider({ children }: { children: ReactNode }) {
  const { organization, isLoaded } = useOrganization();
  
  return (
    <OrgContext.Provider value={{
      activeOrgId: organization?.id || null,
      activeOrgName: organization?.name || null,
      activeOrgSlug: organization?.slug || null,
      isOrgContext: !!organization,
      isLoaded,
    }}>
      {children}
    </OrgContext.Provider>
  );
}

/**
 * Hook to access the current organization context.
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { activeOrgId, isOrgContext } = useOrgContext();
 *   
 *   return (
 *     <div>
 *       {isOrgContext ? `Working in org: ${activeOrgId}` : 'Personal workspace'}
 *     </div>
 *   );
 * }
 * ```
 */
export const useOrgContext = () => useContext(OrgContext);
