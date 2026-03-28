/**
 * AWS Credentials Manager — STS AssumeRole
 *
 * Phase D W5: Replace hardcoded AWS credentials with short-lived
 * STS tokens via AssumeRole. Tokens cached for 50 minutes (session
 * lasts 1 hour). Eliminates permanent access keys in env vars.
 *
 * The IAM Role `editron-remotion-render` has minimal permissions:
 * - lambda:InvokeFunction on remotion-render-* functions
 * - s3:GetObject/PutObject/ListBucket on remotionlambda-* buckets
 */

import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';

interface CachedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: number; // Unix ms
}

let cached: CachedCredentials | null = null;

const ROLE_ARN = 'arn:aws:iam::699773898862:role/editron-remotion-render';
const SESSION_NAME = 'editron-render-session';
const CACHE_DURATION_MS = 50 * 60 * 1000; // 50 minutes (session lasts 60)

/**
 * Get temporary AWS credentials via STS AssumeRole.
 * Cached for 50 minutes to avoid repeated STS calls.
 *
 * Falls back to env var credentials if STS fails (backward compat).
 */
export async function getAWSCredentials(): Promise<{
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}> {
  // Check cache
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  // Try STS AssumeRole
  const baseAccessKey = process.env.REMOTION_AWS_ACCESS_KEY_ID;
  const baseSecretKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;

  if (!baseAccessKey || !baseSecretKey) {
    // SECURITY NOTE: REMOTION_AWS_ACCESS_KEY_ID should belong to an IAM user
    // with ONLY sts:AssumeRole permission on the editron-remotion-render role.
    // All actual Lambda/S3 permissions come from the assumed role's session token.
    // This ensures that even if env vars leak, the credentials can't access resources directly.
    throw new Error('REMOTION_AWS_ACCESS_KEY_ID and REMOTION_AWS_SECRET_ACCESS_KEY must be set');
  }

  try {
    const stsClient = new STSClient({
      region: process.env.REMOTION_AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: baseAccessKey,
        secretAccessKey: baseSecretKey,
      },
    });

    const command = new AssumeRoleCommand({
      RoleArn: ROLE_ARN,
      RoleSessionName: SESSION_NAME,
      DurationSeconds: 3600, // 1 hour
    });

    const response = await stsClient.send(command);

    if (!response.Credentials) {
      throw new Error('STS AssumeRole returned no credentials');
    }

    cached = {
      accessKeyId: response.Credentials.AccessKeyId!,
      secretAccessKey: response.Credentials.SecretAccessKey!,
      sessionToken: response.Credentials.SessionToken!,
      expiresAt: Date.now() + CACHE_DURATION_MS,
    };

    console.log('[AWS] STS AssumeRole succeeded, credentials cached for 50 minutes');
    return cached;
  } catch (err: any) {
    console.warn(`[AWS] STS AssumeRole failed: ${err.message}. Falling back to env var credentials.`);
    // Fallback to direct credentials (backward compat during migration)
    return {
      accessKeyId: baseAccessKey,
      secretAccessKey: baseSecretKey,
    };
  }
}

/**
 * Set AWS credentials on process.env for Remotion Lambda client.
 * Remotion reads credentials from process.env — no way to pass directly.
 *
 * Uses STS temporary credentials when available.
 */
export async function setAWSCredentials(): Promise<void> {
  const creds = await getAWSCredentials();
  process.env.AWS_ACCESS_KEY_ID = creds.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = creds.secretAccessKey;
  if (creds.sessionToken) {
    process.env.AWS_SESSION_TOKEN = creds.sessionToken;
  }
}
