---
name: Never delete env vars without explicit permission
description: RULE — never run vercel env rm or delete any env var without explicit user permission and understanding full scope
type: feedback
---

NEVER run `vercel env rm` or delete/modify any environment variable without:
1. Explicitly telling the user EXACTLY what will be deleted
2. Getting explicit "yes" confirmation
3. Understanding the full blast radius (which environments, which branches)

**Why:** Accidentally deleted `NEXT_PUBLIC_AUTHORIZED_PARTIES` for all Preview branches which broke Clerk auth on all preview deployments. The `vercel env rm` command with scope `preview` removed the value for ALL preview branches, not just the current one.

**How to apply:** When modifying env vars, ALWAYS use `vercel env add` to create new entries. Never `vercel env rm` unless absolutely necessary and user explicitly approves. If a value needs updating, add the new value for the specific branch/environment rather than removing the old one.
