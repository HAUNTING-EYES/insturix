import { findLinkBySessionId, type ProjectLink } from '@/lib/shared/project-links';
import {
  resolveProjectMetaBrandId,
  resolveThinkForgeSessionBrandBinding,
} from '@/lib/thinkforge/state/types';
import * as db from '../services/db';
import type { PostMortemInput } from './post-mortem-agent';

export interface ResolvedPostMortemScope {
  input: PostMortemInput;
  projectLink: ProjectLink | null;
  session: db.Session;
}

export class PostMortemScopeError extends Error {
  constructor(
    message: string,
    readonly code: 'session_scope_mismatch' | 'brand_scope_conflict',
    readonly status: 403 | 409,
  ) {
    super(message);
    this.name = 'PostMortemScopeError';
  }
}

export async function resolvePostMortemScope(input: {
  userId: string;
  orgId?: string | null;
  sessionId: string;
  projectTitle?: string;
  session?: db.Session | null;
}): Promise<ResolvedPostMortemScope | null> {
  const requestedOrgId = firstNonEmpty(input.orgId) ?? null;
  const session = input.session ?? await db.getSession(input.sessionId, input.userId, requestedOrgId);
  if (!session) {
    return null;
  }

  const canonicalSessionId = firstNonEmpty(session._id);
  const sessionOrgId = firstNonEmpty(session.orgId) ?? null;
  if (
    canonicalSessionId !== input.sessionId
    || session.userId !== input.userId
    || sessionOrgId !== requestedOrgId
  ) {
    throw new PostMortemScopeError(
      'Post-mortem session authority does not match the requesting actor.',
      'session_scope_mismatch',
      403,
    );
  }

  const projectLink = await findLinkBySessionId(input.userId, canonicalSessionId);
  const projectMeta = session.projectMeta;
  const binding = resolveThinkForgeSessionBrandBinding(projectMeta);
  const directBrandId = firstNonEmpty(projectMeta?.brandId);
  if (binding && directBrandId && binding.brandId !== directBrandId) {
    throw new PostMortemScopeError(
      'Post-mortem session contains conflicting brand authority.',
      'brand_scope_conflict',
      409,
    );
  }
  const sessionBrandId = resolveProjectMetaBrandId(projectMeta);
  const linkedBrandId = firstNonEmpty(projectLink?.brandId);
  if (sessionBrandId && linkedBrandId && sessionBrandId !== linkedBrandId) {
    throw new PostMortemScopeError(
      'Post-mortem project link conflicts with the session brand authority.',
      'brand_scope_conflict',
      409,
    );
  }

  return {
    input: {
      userId: input.userId,
      orgId: sessionOrgId,
      sessionId: canonicalSessionId,
      projectId: firstNonEmpty(projectLink?.projectIds?.[0]),
      brandId: sessionBrandId,
      projectTitle: firstNonEmpty(
        input.projectTitle,
        projectMeta?.sessionName,
        projectMeta?.idea,
        projectMeta?.purpose,
      ),
    },
    projectLink,
    session,
  };
}

function firstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}
