export interface ThinkForgeBrowserUserFixture {
  email: string;
  externalId: string;
  firstName: string;
  lastName: string;
  username: string;
}

export interface ThinkForgeBrowserBrandFixture {
  brandId: string;
  name: string;
  scope: 'personal' | 'organization';
  voice: {
    voiceLock: string;
    nicheMap: string;
    killList: string[];
    hookArchetypes: string[];
    structuralHabits: string[];
  };
  visual: {
    industry: string;
    colors: string[];
    visualStyle: string;
    typography: string;
  };
}

export interface ThinkForgeBrowserTenantFixture {
  runId: string;
  admin: ThinkForgeBrowserUserFixture;
  restrictedMember: ThinkForgeBrowserUserFixture;
  organization: {
    name: string;
    slug: string;
  };
  personalBrand: ThinkForgeBrowserBrandFixture;
  organizationBrand: ThinkForgeBrowserBrandFixture;
}

function requireRunId(value: string): string {
  const runId = value.trim();
  if (!/^[a-z0-9]{1,12}$/i.test(runId)) {
    throw new Error('ThinkForge E2E requires a 1-12 character alphanumeric run ID.');
  }
  return runId.toLowerCase();
}

function requireEmail(value: string): string {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) {
    throw new Error('ThinkForge E2E requires a valid admin email address.');
  }
  return email;
}

function requireBrandId(value: string): string {
  const brandId = value.trim();
  if (!brandId || /\s/.test(brandId)) {
    throw new Error('ThinkForge E2E requires a non-empty brand ID without whitespace.');
  }
  return brandId;
}

function taggedEmail(email: string, tag: string): string {
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at).split('+')[0];
  return `${local}+${tag}@${email.slice(at + 1)}`;
}

export function resolveThinkForgeBrowserTenantFixture(input: {
  runId: string;
  adminEmail: string;
  personalBrandId: string;
}): ThinkForgeBrowserTenantFixture {
  const runId = requireRunId(input.runId);
  const adminEmail = requireEmail(input.adminEmail);
  const personalBrandId = requireBrandId(input.personalBrandId);
  const fixturePrefix = `thinkforge-e2e-${runId}`;

  return {
    runId,
    admin: {
      email: adminEmail,
      // Preserve the original browser-gate identity so an existing disposable admin can be reused safely.
      externalId: fixturePrefix,
      firstName: 'ThinkForge',
      lastName: 'QA Admin',
      username: `tf_e2e_${runId}_admin`,
    },
    restrictedMember: {
      email: taggedEmail(adminEmail, `tf-restricted-${runId}`),
      externalId: `${fixturePrefix}-restricted`,
      firstName: 'ThinkForge',
      lastName: 'QA Restricted',
      username: `tf_e2e_${runId}_restricted`,
    },
    organization: {
      name: `ThinkForge QA Agency ${runId.toUpperCase()}`,
      slug: `thinkforge-qa-${runId}`,
    },
    personalBrand: {
      brandId: personalBrandId,
      name: 'ThinkForge QA Precision',
      scope: 'personal',
      voice: {
        voiceLock: 'Formal, direct, technical, serious, and evidence-first. Use explicit calls to action.',
        nicheMap: 'Enterprise content operations leaders who require measurable proof',
        killList: ['playful', 'whimsical', 'maybe'],
        hookArchetypes: ['Open with a quantified operational risk'],
        structuralHabits: ['State the evidence before the recommendation'],
      },
      visual: {
        industry: 'Enterprise workflow software',
        colors: ['#0F172A', '#0F766E', '#F8FAFC'],
        visualStyle: 'restrained technical editorial photography',
        typography: 'Inter, sans-serif',
      },
    },
    organizationBrand: {
      brandId: `brand_tf_e2e_${runId}_org`,
      name: 'ThinkForge QA Spark',
      scope: 'organization',
      voice: {
        voiceLock: 'Warm, casual, playful, plain-spoken, and gently invitational. Never use a hard sell.',
        nicheMap: 'Community creators looking for approachable and optimistic guidance',
        killList: ['enterprise-grade', 'urgent', 'guaranteed'],
        hookArchetypes: ['Open with a relatable human moment'],
        structuralHabits: ['Invite participation with a soft question'],
      },
      visual: {
        industry: 'Creator community education',
        colors: ['#EC4899', '#FACC15', '#FFFBEB'],
        visualStyle: 'bright candid community photography',
        typography: 'Atkinson Hyperlegible, sans-serif',
      },
    },
  };
}
