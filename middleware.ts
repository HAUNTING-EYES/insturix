import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/api/user(.*)',
  '/api/services(.*)',
]);

// QStash background workers live under /api/services/* (so isProtectedRoute matches them),
// but Upstash QStash calls them server-to-server with NO Clerk session. They authenticate
// via their own QStash signature check (verifySignatureAppRouter). Clerk's auth.protect()
// returns a 404 for these session-less requests, which silently kills Alyzitron analysis
// and Musitron generation (the QStash worker never runs). Exclude them from Clerk; the
// route's own QStash signature verification stays the auth boundary.
const isQStashWorkerRoute = createRouteMatcher([
  '/api/services/alyzitron/processor',
  '/api/services/musitron/processor',
  '/api/services/editron/auto-edit/from-batch',
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
  // QStash workers self-authenticate via their QStash signature; never gate them behind
  // Clerk login, or auth.protect() 404s the queue's session-less call (kills async jobs).
  if (isQStashWorkerRoute(req)) return;
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
