import { execSync } from 'node:child_process';

import { Sandbox } from '@vercel/sandbox';

const CANARY_ROOT = '/vercel/sandbox/.editron-generated-composition-image-canary';
const CANARY_FILES = [
  {
    path: `${CANARY_ROOT}/index.ts`,
    content: Buffer.from("import {registerRoot} from 'remotion';import {Root} from './Root';registerRoot(Root);", 'utf8'),
  },
  {
    path: `${CANARY_ROOT}/Root.tsx`,
    content: Buffer.from("import React from 'react';import {AbsoluteFill,Composition} from 'remotion';const Scene=()=> <AbsoluteFill style={{backgroundColor:'#d4af37'}}/>;export const Root=()=> <Composition id='RuntimeCanary' component={Scene} durationInFrames={4} fps={30} width={64} height={64}/>;", 'utf8'),
  },
  {
    path: `${CANARY_ROOT}/run.ts`,
    content: Buffer.from(`import {promises as fs} from 'node:fs';
import {bundle} from '@remotion/bundler';
import {renderMedia,selectComposition} from '@remotion/renderer';

async function main(): Promise<void> {
  const mediabunny = await import('mediabunny');
  if (typeof mediabunny.Logging !== 'function') throw new Error('MEDIABUNNY_LOGGING_EXPORT_MISSING');
  const serveUrl = await bundle({entryPoint:'${CANARY_ROOT}/index.ts',outDir:'${CANARY_ROOT}/bundle',enableCaching:false});
  const composition = await selectComposition({serveUrl,id:'RuntimeCanary',inputProps:{}});
  const output = '${CANARY_ROOT}/canary.mp4';
  await renderMedia({serveUrl,composition,outputLocation:output,codec:'h264',x264Preset:'ultrafast',pixelFormat:'yuv420p',colorSpace:'bt709',muted:true,enforceAudioTrack:false,concurrency:1,overwrite:true,logLevel:'error'});
  const stat = await fs.stat(output);
  if (!stat.isFile() || stat.size <= 0) throw new Error('GENERATED_COMPOSITION_VIDEO_CANARY_EMPTY');
  console.log('GENERATED_COMPOSITION_VIDEO_ENCODE_OK:' + stat.size);
}

main().catch((error) => { console.error(error); process.exit(1); });
`, 'utf8'),
  },
] as const;

const image = process.argv[2]?.trim();
if (!image || !/^[A-Za-z0-9][A-Za-z0-9._/-]*:[A-Za-z0-9._-]+$/.test(image)) {
  throw new Error('Usage: tsx scripts/editron-build-generated-composition-sandbox-snapshot.ts <vcr-image:tag> [commit]');
}
const commit = (process.argv[3]?.trim() || execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()).toLowerCase();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Generated composition snapshot requires a full 40-character commit');

const sandbox = await Sandbox.create({
  image,
  timeout: 10 * 60 * 1_000,
  resources: { vcpus: 1 },
  networkPolicy: 'deny-all',
  env: {},
  tags: { app: 'editron', workload: 'gcp-image-verify', commit: commit.slice(0, 12) },
  persistent: false,
});
try {
  await step('runtime versions', 'node', ['-e', "const sharp=require('sharp'); const versions={remotion:require('remotion/package.json').version,renderer:require('@remotion/renderer/package.json').version,bundler:require('@remotion/bundler/package.json').version,sharp:sharp.versions.sharp}; if(versions.remotion!=='4.0.509'||versions.renderer!=='4.0.509'||versions.bundler!=='4.0.509'||versions.sharp!=='0.35.3') { console.error(versions); process.exit(1); } console.log(JSON.stringify(versions))"]);
  await step('glibc compatibility', 'bash', ['-lc', "version=$(getconf GNU_LIBC_VERSION | awk '{print $2}'); test \"$(printf '%s\n' 2.35 \"$version\" | sort -V | head -1)\" = 2.35 && echo GLIBC_OK:$version"]);
  await step('compositor linkage', 'bash', ['-lc', "binary=$(find node_modules -type f -path '*/@remotion/compositor-linux-x64-gnu/remotion' -print -quit); test -n \"$binary\" && ! ldd \"$binary\" | grep -q 'not found' && echo COMPOSITOR_OK"]);
  await step('browser already baked', 'node', ['-e', "require('@remotion/renderer').openBrowser('chrome').then(async (browser) => { console.log('BROWSER_OK'); await browser.close({silent: true}); }).catch((error) => { console.error(error); process.exit(1); })"]);
  await step('sharp loads', 'node', ['-e', "require('sharp'); console.log('SHARP_OK')"]);
  await step('tsx is executable', 'bash', ['-lc', 'test -x node_modules/.bin/tsx && echo TSX_OK']);
  await sandbox.writeFiles(CANARY_FILES.map((file) => ({ ...file, mode: 0o600 })));
  await step('real generated-composition video encode', './node_modules/.bin/tsx', [`${CANARY_ROOT}/run.ts`]);
  const snapshot = await sandbox.snapshot({ expiration: 0 });
  console.log(JSON.stringify({ snapshotId: snapshot.snapshotId, appCommit: commit, image }, null, 2));
} finally {
  await sandbox.delete();
}

async function step(label: string, cmd: string, args: string[]): Promise<void> {
  const command = await sandbox.runCommand({ cmd, args, cwd: '/vercel/sandbox', env: {}, timeoutMs: 120_000 });
  const stdout = (await command.stdout()).trim();
  const stderr = (await command.stderr()).trim();
  if (command.exitCode !== 0) throw new Error(`${label} failed (${command.exitCode}): ${stderr || stdout || 'no output'}`);
  console.log(`${label}: ${stdout}`);
}
