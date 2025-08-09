import { NextResponse } from 'next/server';

type AdminApiHandler = (req: Request) => Promise<NextResponse>;

export const withAdmin = (handler: AdminApiHandler) => {
  return async (req: Request) => {
    const authHeader = req.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[withAdmin] Unauthorized: Malformed or missing Authorization header.');
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    // The secret should be stored in an environment variable
    const secret = process.env.ADMIN_SECRET_KEY;

    if (!secret) {
      console.error('[withAdmin] Server error: ADMIN_SECRET_KEY is not configured.');
      // Don't leak the fact that the secret is missing
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (token !== secret) {
      console.log(`[withAdmin] Forbidden: Invalid token provided.`);
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // If we get here, the secret is valid.
    // We don't need to fetch a user object since we're not using Clerk auth.
    return handler(req);
  };
};