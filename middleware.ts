import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/api/user(.*)',
  '/api/services(.*)',
]);

// Resolve authorized parties from env or dynamic Vercel URLs
const getAuthorizedParties = () => {
  const envParties = process.env.NEXT_PUBLIC_AUTHORIZED_PARTIES?.split(',') || [];
  
  // In Vercel preview environments, add the VERCEL_URL to the list
  if (process.env.VERCEL_URL) {
    envParties.push(`https://${process.env.VERCEL_URL}`);
  }
  
  return envParties.length > 0 ? envParties : undefined;
};

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
  // Public routes like /ics25, /, /products etc. skip auth checks entirely
}, {
  authorizedParties: getAuthorizedParties(),
  afterSignInUrl: "/dashboard",
  afterSignUpUrl: "/dashboard",
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
