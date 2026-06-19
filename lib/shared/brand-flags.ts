export type BrandVaultSourceService = 'editron' | 'thinkforge' | 'clickatron';

type BrandVaultFlagEnvironment = Record<string, string | undefined>;

const BRAND_VAULT_SOURCE_ENV_BY_SERVICE: Record<BrandVaultSourceService, string> = {
  editron: 'BRAND_VAULT_SOURCE_EDITRON',
  thinkforge: 'BRAND_VAULT_SOURCE_THINKFORGE',
  clickatron: 'BRAND_VAULT_SOURCE_CLICKATRON',
};

export function brandVaultSourceEnabled(
  service: BrandVaultSourceService,
  env: BrandVaultFlagEnvironment = process.env,
): boolean {
  return env[BRAND_VAULT_SOURCE_ENV_BY_SERVICE[service]] === 'true';
}

export function brandVaultSourceFlagName(service: BrandVaultSourceService): string {
  return BRAND_VAULT_SOURCE_ENV_BY_SERVICE[service];
}
