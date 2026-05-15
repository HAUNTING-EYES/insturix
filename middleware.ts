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

  // Vercel sets multiple URL env vars — add all so Clerk accepts JWTs from any
  // VERCEL_URL = deployment-specific (e.g. front-abc123-xxx.vercel.app)
  // VERCEL_BRANCH_URL = branch-stable (e.g. front-end-git-brand-intelligence-xxx.vercel.app)
  // VERCEL_PROJECT_PRODUCTION_URL = production domain
  for (const key of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const val = process.env[key];
    if (val) envParties.push(`https://${val}`);
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
