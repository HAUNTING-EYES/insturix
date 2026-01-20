'use client';

/**
 * Create Organization Page
 * 
 * Uses Clerk's CreateOrganization component for actual creation.
 */

import { useRouter } from 'next/navigation';
import { CreateOrganization } from '@clerk/nextjs';
import { cn } from '@/lib/utils';

export default function CreateOrgPage() {
  const router = useRouter();

  return (
    <div className="p-6 md:p-8 max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="text-sm text-white/40 hover:text-white/60 transition-colors mb-4"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-semibold text-white">Create Organization</h1>
        <p className="text-sm text-white/40 mt-1">
          Set up a team workspace to collaborate on projects
        </p>
      </div>

      {/* Clerk Component */}
      <div className={cn(
        "rounded-lg border border-white/[0.06] bg-white/[0.02] p-6",
        // Override Clerk's default styles
        "[&_.cl-card]:bg-transparent [&_.cl-card]:border-0 [&_.cl-card]:shadow-none",
        "[&_.cl-headerTitle]:text-white [&_.cl-headerSubtitle]:text-white/50",
        "[&_.cl-formFieldLabel]:text-white/70 [&_.cl-formFieldInput]:bg-white/5",
        "[&_.cl-formFieldInput]:border-white/10 [&_.cl-formFieldInput]:text-white",
        "[&_.cl-formButtonPrimary]:bg-white [&_.cl-formButtonPrimary]:text-black",
        "[&_.cl-formButtonPrimary]:hover:bg-white/90"
      )}>
        <CreateOrganization
          afterCreateOrganizationUrl="/dashboard/org/:id"
          skipInvitationScreen={false}
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'bg-transparent shadow-none border-0 w-full',
            }
          }}
        />
      </div>
    </div>
  );
}
