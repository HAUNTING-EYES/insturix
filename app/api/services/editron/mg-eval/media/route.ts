import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';
import sharp from 'sharp';

import { evalCorpusDir } from '@/lib/editron/eval/eval-review-store';

const CT: Record<string, string> = {
  '.mp4': 'video/mp4', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

/** Serve eval-corpus media. `asset=file&path=` streams a file; `asset=composite&dir=&phase=` composites an
 *  mg-vlog-eval overlay (transparent webp) over its sibling footage frame for review. Allowlist-guarded. */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const asset = sp.get('asset');
  const corpusDir = evalCorpusDir();

  if (asset === 'composite') {
    const dir = path.basename(sp.get('dir') ?? '');
    const phase = sp.get('phase') ?? '2';
    const overlay = path.join(corpusDir, 'mg-vlog-eval', dir, `0000${phase}.webp`);
    const footage = path.join(corpusDir, 'mg-vlog-eval', 'f0.png');
    if (!dir || !existsSync(overlay) || !existsSync(footage)) {
      return NextResponse.json({ error: 'composite asset missing' }, { status: 404 });
    }
    try {
      const overlayBuf = await sharp(overlay).webp().toBuffer();
      const png = await sharp(footage).composite([{ input: overlayBuf }]).png().toBuffer();
      return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'composite failed' }, { status: 500 });
    }
  }

  if (asset === 'file') {
    const pathArg = sp.get('path') ?? '';
    const resolved = path.resolve(corpusDir, pathArg);
    if (!resolved.startsWith(path.resolve(corpusDir)) || !existsSync(resolved)) {
      return NextResponse.json({ error: 'file not allowed or missing' }, { status: 404 });
    }
    const buf = readFileSync(resolved);
    return new Response(buf, { headers: { 'content-type': CT[path.extname(resolved).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' } });
  }

  return NextResponse.json({ error: 'unsupported asset' }, { status: 400 });
}
