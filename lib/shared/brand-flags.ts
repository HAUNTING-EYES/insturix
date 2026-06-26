export type BrandVaultSourceService = 'editron' | 'thinkforge' | 'clickatron';

type BrandVaultFlagEnvironment = Record<string, string | undefined>;

const BRAND_VAULT_SOURCE_ENV_BY_SERVICE: Record<BrandVaultSourceService, string> = {
  editron: 'BRAND_VAULT_SOURCE_EDITRON',
  thinkforge: 'BRAND_VAULT_SOURCE_THINKFORGE',
  clickatron: 'BRAND_VAULT_SOURCE_CLICKATRON',
};

// Default-on services use the brand vault as their source of truth in code.
// The env var is now a kill switch: BRAND_VAULT_SOURCE_<SERVICE>=false force-disables,
// =true force-enables, unset falls back to the default below.
const BRAND_VAULT_SOURCE_DEFAULT_ON: Record<BrandVaultSourceService, boolean> = {
  editron: true,
  thinkforge: true,
  clickatron: true,
};

export function brandVaultSourceEnabled(
  service: BrandVaultSourceService,
  env: BrandVaultFlagEnvironment = process.env,
): boolean {
  const raw = env[BRAND_VAULT_SOURCE_ENV_BY_SERVICE[service]];
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return BRAND_VAULT_SOURCE_DEFAULT_ON[service];
}

export function brandVaultSourceFlagName(service: BrandVaultSourceService): string {
  return BRAND_VAULT_SOURCE_ENV_BY_SERVICE[service];
}
