import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  extractBrandVaultUploadEvidenceFromBuffer,
  isSupportedBrandVaultUpload,
} from '../../lib/shared/brand-vault-upload-parser';

describe('Brand Vault server upload parser', () => {
  it('extracts text and colors from plain-text brand books', async () => {
    const result = await extractBrandVaultUploadEvidenceFromBuffer({
      name: 'brand-book.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Tone: precise and practical.\nPalette: #abc #102033'),
    });

    expect(result.source).toMatchObject({
      kind: 'uploaded_guideline',
      assetRole: 'brand_book',
      text: 'Tone: precise and practical.\nPalette: #abc #102033',
      dominantColors: ['#aabbcc', '#102033'],
    });
    expect(result.warnings).toEqual([]);
  });

  it('extracts DOCX text and theme colors from Office Open XML packages', async () => {
    const docx = makeZip([
      {
        name: 'word/document.xml',
        content:
          '<w:document><w:body><w:p><w:r><w:t>Voice: confident, plainspoken.</w:t></w:r></w:p><w:color w:val="12AB34"/></w:body></w:document>',
      },
    ]);

    const result = await extractBrandVaultUploadEvidenceFromBuffer({
      name: 'approved-guidelines.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docx,
    });

    expect(result.source.kind).toBe('uploaded_guideline');
    expect(result.source.assetRole).toBe('brand_book');
    expect(result.source.text).toContain('Voice: confident, plainspoken.');
    expect(result.source.dominantColors).toEqual(['#12ab34']);
    expect(result.source.note).toBe('Uploaded brand guideline; text extracted; 1 color observed.');
  });

  it('extracts PPTX slide language and colors', async () => {
    const pptx = makeZip([
      {
        name: 'ppt/slides/slide1.xml',
        content:
          '<p:sld><p:cSld><a:t>Messaging: move fast, show proof.</a:t><a:srgbClr val="C0FFEE"/></p:cSld></p:sld>',
      },
    ]);

    const result = await extractBrandVaultUploadEvidenceFromBuffer({
      name: 'sales-deck.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: pptx,
    });

    expect(result.source.text).toContain('Messaging: move fast, show proof.');
    expect(result.source.dominantColors).toEqual(['#c0ffee']);
  });

  it('extracts simple PDF text operators without claiming unsupported PDFs worked', async () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<</Length 56>>\nstream\nBT (Tone: crisp. Palette #123abc) Tj ET\nendstream\nendobj\n%%EOF',
      'latin1',
    );

    const result = await extractBrandVaultUploadEvidenceFromBuffer({
      name: 'brand-book.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    });

    expect(result.source.text).toContain('Tone: crisp. Palette #123abc');
    expect(result.source.dominantColors).toEqual(['#123abc']);
    expect(result.warnings).toEqual([]);
  });
});

describe('Brand Vault upload allowlist (isSupportedBrandVaultUpload)', () => {
  it('accepts every document/image type the UI (BRAND_VAULT_UPLOAD_ACCEPT) offers', () => {
    const accepted: Array<[string, string | undefined]> = [
      ['brand-book.pdf', 'application/pdf'],
      ['guidelines.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      ['legacy.doc', 'application/msword'],
      ['legacy.ppt', 'application/vnd.ms-powerpoint'],
      ['tone.txt', 'text/plain'],
      ['voice.md', 'text/markdown'],
      ['palette.csv', 'text/csv'],
      ['tokens.json', 'application/json'],
      ['page.html', 'text/html'],
      ['styles.css', 'text/css'],
      ['logo.svg', 'image/svg+xml'],
      ['logo.png', 'image/png'],
      ['hero.jpg', 'image/jpeg'],
      ['mark.webp', 'image/webp'],
      ['icon.gif', 'image/gif'],
      // Real intake edge: a pasted/blob image with an image mime but no extension.
      ['pasted-image', 'image/png'],
      // Real intake edge: correct extension but a generic/wrong mime from the OS.
      ['brand-book.pdf', 'application/octet-stream'],
    ];
    for (const [name, mime] of accepted) {
      expect(isSupportedBrandVaultUpload(name, mime), `${name} (${mime})`).toBe(true);
    }
  });

  it('rejects video, audio, archives, executables, and fonts (never offered by the UI)', () => {
    const rejected: Array<[string, string | undefined]> = [
      ['clip.mp4', 'video/mp4'],
      ['song.mp3', 'audio/mpeg'],
      ['bundle.zip', 'application/zip'],
      ['bundle.rar', 'application/vnd.rar'],
      ['setup.exe', 'application/x-msdownload'],
      ['payload.bin', 'application/octet-stream'],
      ['brand.ttf', 'font/ttf'],
      ['brand.otf', 'font/otf'],
      ['no-extension-no-mime', undefined],
    ];
    for (const [name, mime] of rejected) {
      expect(isSupportedBrandVaultUpload(name, mime), `${name} (${mime})`).toBe(false);
    }
  });
});

function makeZip(entries: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const raw = Buffer.from(entry.content);
    const compressed = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}
