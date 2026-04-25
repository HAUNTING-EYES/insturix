export interface LinkedInScopeOptions {
  includeProfile: boolean;
  includeEmail: boolean;
  includeOrganizationAdmin: boolean;
  includeOrganizationSocial: boolean;
}

function envFlag(name: string, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }

  return value === "true";
}

export function getLinkedInScopeOptions(): LinkedInScopeOptions {
  return {
    includeProfile: envFlag("LINKEDIN_REQUEST_PROFILE_SCOPE", true),
    includeEmail: envFlag("LINKEDIN_REQUEST_EMAIL_SCOPE", false),
    includeOrganizationAdmin: envFlag("LINKEDIN_REQUEST_ORG_SCOPE", false),
    includeOrganizationSocial: envFlag("LINKEDIN_REQUEST_ORG_SOCIAL_SCOPE", false),
  };
}

export function getLinkedInScopes() {
  const options = getLinkedInScopeOptions();
  const scopes = ["w_member_social"];

  if (options.includeProfile) {
    scopes.push("openid", "profile");
  }

  if (options.includeEmail) {
    scopes.push("email");
  }

  if (options.includeOrganizationAdmin) {
    scopes.push("rw_organization_admin");
  }

  if (options.includeOrganizationSocial) {
    scopes.push("w_organization_social");
  }

  return { scopes: Array.from(new Set(scopes)), options };
}
