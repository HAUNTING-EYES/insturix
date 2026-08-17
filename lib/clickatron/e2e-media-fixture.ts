export const CLICKATRON_E2E_MEDIA_FIXTURE_MODE = 'completed' as const;

const RUN_ID_PATTERN = /^[a-z0-9]{1,12}$/i;

// A valid opaque PNG keeps browser image loading deterministic without R2 or a media provider.
const CLICKATRON_E2E_IMAGE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZV3sAAAAASUVORK5CYII=';

export interface ClickatronE2EMediaFixture {
  mode: typeof CLICKATRON_E2E_MEDIA_FIXTURE_MODE;
  runId: string;
  imageRef: string;
}

export function resolveClickatronE2EMediaFixture(
  environment: NodeJS.ProcessEnv = process.env,
): ClickatronE2EMediaFixture | null {
  const requestedMode = environment.CLICKATRON_E2E_MEDIA_FIXTURE?.trim();
  if (!requestedMode) return null;

  if (requestedMode !== CLICKATRON_E2E_MEDIA_FIXTURE_MODE) {
    throw new Error(`Unsupported CLICKATRON_E2E_MEDIA_FIXTURE mode: ${requestedMode}`);
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error('CLICKATRON_E2E_MEDIA_FIXTURE is forbidden in production.');
  }
  if (environment.THINKFORGE_E2E_MODE !== '1') {
    throw new Error('CLICKATRON_E2E_MEDIA_FIXTURE requires THINKFORGE_E2E_MODE=1.');
  }

  const runId = environment.THINKFORGE_E2E_RUN_ID?.trim() ?? '';
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error('CLICKATRON_E2E_MEDIA_FIXTURE requires a valid ThinkForge E2E run ID.');
  }

  return {
    mode: CLICKATRON_E2E_MEDIA_FIXTURE_MODE,
    runId: runId.toLowerCase(),
    imageRef: CLICKATRON_E2E_IMAGE_DATA_URI,
  };
}
