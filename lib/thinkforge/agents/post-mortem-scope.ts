import { findLinkBySessionId, type ProjectLink } from '@/lib/shared/project-links';
import * as db from '../services/db';
import type { PostMortemInput } from './post-mortem-agent';

export interface ResolvedPostMortemScope {
  input: PostMortemInput;
  projectLink: ProjectLink | null;
  session: db.Session;
}

export async function resolvePostMortemScope(input: {
  userId: string;
  sessionId: string;
  projectTitle?: string;
  session?: db.Session | null;
}): Promise<ResolvedPostMortemScope | null> {
  const session = input.session ?? await db.getSession(input.sessionId, input.userId);
  if (!session) {
    return null;
  }

  const projectLink = await findLinkBySessionId(input.userId, input.sessionId);
  const projectMeta = session.projectMeta;

  return {
    input: {
      userId: input.userId,
      sessionId: input.sessionId,
      projectId: firstNonEmpty(projectLink?.projectIds?.[0]),
      brandId: firstNonEmpty(projectLink?.brandId, projectMeta?.brandId),
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
