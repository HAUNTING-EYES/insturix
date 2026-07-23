import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('chat dubbing FFmpeg runtime', () => {
  it('installs a real executable for the current server platform', () => {
    const require = createRequire(import.meta.url);
    const installer = require('@ffmpeg-installer/ffmpeg') as { path?: unknown };
    expect(typeof installer.path).toBe('string');
    expect(existsSync(String(installer.path))).toBe(true);
  });

  it('keeps the Linux binary external and explicitly traced into the dubbing worker', () => {
    const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
    const resolver = readFileSync(join(
      process.cwd(),
      'lib/editron/services/media/analysis-service.ts',
    ), 'utf8');
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      optionalDependencies?: Record<string, string>;
    };

    expect(config).toContain("'@ffmpeg-installer/ffmpeg'");
    expect(config).toContain("'/api/internal/workers/chat-dubbing'");
    expect(config).toContain("'./node_modules/@ffmpeg-installer/linux-x64/ffmpeg'");
    expect(resolver).toContain('require.resolve("@ffmpeg-installer/linux-x64/package.json")');
    expect(packageJson.optionalDependencies?.['@ffmpeg-installer/linux-x64']).toBe('4.1.0');
  });
});
