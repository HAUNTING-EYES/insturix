"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ReactNode } from "react";

/**
 * Wraps ClerkProvider so the app can build even when the publishable key
 * is missing or set to a placeholder value (e.g. in CI).
 *
 * Clerk validates the key eagerly – including during static page generation
 * of /_not-found – so we need to skip it when the key is obviously invalid.
 */
function isValidClerkKey(key: string | undefined): key is string {
  if (!key) return false;
  // Clerk keys always start with pk_test_ or pk_live_ followed by a
  // base-64-ish payload.  Anything shorter than 20 chars or containing
  // the word "placeholder" is not real.
  if (key.toLowerCase().includes("placeholder")) return false;
  if (key.length < 20) return false;
  if (!key.startsWith("pk_test_") && !key.startsWith("pk_live_")) return false;
  return true;
}

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function ClerkClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  if (!isValidClerkKey(publishableKey)) {
    // Render the app without Clerk so the build (and /_not-found
    // prerender) can succeed.
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      {children}
    </ClerkProvider>
  );
}
