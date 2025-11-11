"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

/**
 * Client-side redirect handler for ICS25 page
 * Checks attendee and player registration status and redirects accordingly
 * This runs in parallel with page render for better performance
 */
export default function ClientRedirectHandler() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    // Only check if user is loaded and signed in
    if (!isLoaded || !isSignedIn) return;

    const checkRegistrationStatus = async () => {
      try {
        // Check attendee status
        const attendeeRes = await fetch('/api/ics25/attendees', {
          headers: { 'accept': 'application/json' }
        });
        
        if (attendeeRes.ok) {
          const data = await attendeeRes.json();
          const attendee = data?.attendee;

          if (attendee?.attendeePassTier === 'bronze' && attendee?.payment?.status === 'pending') {
            router.push('/checkout/bronze/review');
            return;
          }

          // NOTE: Don't redirect users away from the ICS25 page when they have a confirmed ticket.
          // Users should be able to view the ICS25 landing page content after confirming their registration.
          // Removing the redirect that was causing the continuous loop issue (redirecting to /checkout/success).
          // The confirmation page is accessible from navigation/portal if needed.
        }

        // Check player status
        const playerRes = await fetch('/api/ics25/players/me', {
          headers: { 'accept': 'application/json' }
        });
        
        if (playerRes.ok) {
          const data = await playerRes.json();
          if (data?.player) {
            router.push('/ics25/my');
            return;
          }
        }
      } catch (error) {
        // Silently fail - user stays on landing page
        console.debug('Registration check failed:', error);
      }
    };

    checkRegistrationStatus();
  }, [isLoaded, isSignedIn, router]);

  // This component doesn't render anything
  return null;
}
