'use client';

/**
 * OrgSwitcher Component
 * 
 * Minimal dropdown for switching between personal account and organizations.
 * Follows existing design patterns from CreditsCard and NavItem.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrganizations, OrganizationListItem } from '@/hooks/useOrganization';
import { useOrganization as useClerkOrg } from '@clerk/nextjs';

interface OrgSwitcherProps {
  isExpanded: boolean;
  className?: string;
}

export function OrgSwitcher({ isExpanded, className }: OrgSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { data: organizations, isLoading } = useOrganizations();
  const { organization: activeOrg, setActive } = useClerkOrg();

  const handleSelectOrg = async (org: OrganizationListItem | null) => {
    if (org) {
      await setActive?.({ organization: org.clerkOrgId });
      router.push(`/dashboard/org/${org.clerkOrgId}`);
    } else {
      await setActive?.({ organization: null });
      router.push('/dashboard');
    }
    setIsOpen(false);
  };

  const handleCreateOrg = () => {
    setIsOpen(false);
    router.push('/dashboard/org/create');
  };

  // Current context
  const currentName = activeOrg?.name || 'Personal';
  const currentLabel = activeOrg ? 'Organization' : 'Account';

  // Collapsed: just show indicator dot if in org
  if (!isExpanded) {
    return (
      <button
        onClick={() => router.push(activeOrg ? `/dashboard/org/${activeOrg.id}` : '/dashboard')}
        className={cn(
          "w-full flex items-center justify-center p-2 rounded-md",
          "hover:bg-white/5 transition-colors",
          className
        )}
        title={currentName}
      >
        <div className={cn(
          "w-2 h-2 rounded-full",
          activeOrg ? "bg-white" : "bg-white/30"
        )} />
      </button>
    );
  }

  return (
    <div className={cn("relative w-full", className)}>
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-md",
          "bg-white/[0.03] hover:bg-white/[0.06] transition-colors",
          "border border-white/[0.06]",
          isOpen && "bg-white/[0.06]"
        )}
      >
        <div className={cn(
          "w-2 h-2 rounded-full flex-shrink-0",
          activeOrg ? "bg-white" : "bg-white/30"
        )} />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-white truncate">{currentName}</p>
          <p className="text-[11px] text-white/40">{currentLabel}</p>
        </div>
        <ChevronDown className={cn(
          "w-3.5 h-3.5 text-white/40 transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className={cn(
                "absolute left-0 right-0 top-full mt-1 z-50",
                "bg-zinc-900 border border-white/10 rounded-lg shadow-xl overflow-hidden"
              )}
            >
              {/* Header */}
              <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-xs text-white/50">Switch context</span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-0.5 rounded hover:bg-white/5"
                >
                  <X className="w-3 h-3 text-white/40" />
                </button>
              </div>

              {/* Personal */}
              <button
                onClick={() => handleSelectOrg(null)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5",
                  "hover:bg-white/[0.04] transition-colors",
                  !activeOrg && "bg-white/[0.04]"
                )}
              >
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  !activeOrg ? "bg-white" : "bg-white/20"
                )} />
                <span className="text-sm text-white/80">Personal</span>
                {!activeOrg && (
                  <span className="ml-auto text-[10px] text-white/30">active</span>
                )}
              </button>

              {/* Organizations */}
              {isLoading ? (
                <div className="px-3 py-2 text-xs text-white/30">Loading...</div>
              ) : (
                organizations?.map((org) => (
                  <button
                    key={org.clerkOrgId}
                    onClick={() => handleSelectOrg(org)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5",
                      "hover:bg-white/[0.04] transition-colors",
                      activeOrg?.id === org.clerkOrgId && "bg-white/[0.04]"
                    )}
                  >
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      activeOrg?.id === org.clerkOrgId ? "bg-white" : "bg-white/20"
                    )} />
                    <span className="text-sm text-white/80 truncate">{org.name}</span>
                    <span className="text-[10px] text-white/30 capitalize">{org.role}</span>
                    {activeOrg?.id === org.clerkOrgId && (
                      <span className="ml-auto text-[10px] text-white/30">active</span>
                    )}
                  </button>
                ))
              )}

              {/* Create */}
              <div className="border-t border-white/[0.06]">
                <button
                  onClick={handleCreateOrg}
                  className="w-full px-3 py-2.5 text-left text-xs text-white/50 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
                >
                  + Create organization
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
