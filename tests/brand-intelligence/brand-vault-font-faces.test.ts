import { describe, expect, it } from 'vitest';
import { load } from 'cheerio';
import { extractFontFaces } from '../../lib/shared/brand-website-refinery-utils';

const BASE = new URL('https://brand.example/');
const find = (faces: ReturnType<typeof extractFontFaces>, family: string) =>
  faces.find((face) => face.family.toLowerCase() === family.toLowerCase());

describe('Brand Vault font-face extraction', () => {
  it('extracts self-hosted @font-face file URLs and weights', () => {
    const css =
      '@font-face { font-family: "Acme Grotesk"; ' +
      'src: url(/fonts/acme.woff2) format("woff2"), url(/fonts/acme.woff) format("woff"); ' +
      'font-weight: 600; font-style: normal; }';
    const acme = find(extractFontFaces(load('<html></html>'), [css], BASE), 'Acme Grotesk');
    expect(acme).toBeDefined();
    expect(acme?.files).toEqual(
      expect.arrayContaining(['https://brand.example/fonts/acme.woff2', 'https://brand.example/fonts/acme.woff']),
    );
    expect(acme?.weights).toContain(600);
  });

  it('reads weights from a Google Fonts css2 link (incl. ital,wght)', () => {
    const html =
      '<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
      'family=Plus+Jakarta+Sans:wght@400;600;800&family=Inter:ital,wght@0,400;1,700&display=swap"></head></html>';
    const faces = extractFontFaces(load(html), [], BASE);
    expect(find(faces, 'Plus Jakarta Sans')?.weights).toEqual([400, 600, 800]);
    const inter = find(faces, 'Inter');
    expect(inter?.weights).toEqual(expect.arrayContaining([400, 700]));
  });

  it('reads weights from a Google Fonts v1 link', () => {
    const html = '<html><head><link href="https://fonts.googleapis.com/css?family=Roboto:400,700"></head></html>';
    expect(find(extractFontFaces(load(html), [], BASE), 'Roboto')?.weights).toEqual([400, 700]);
  });

  it('resolves gstatic font files when the Google Fonts CSS was fetched into stylesheetCss', () => {
    const gstaticCss =
      "@font-face { font-family: 'Inter'; font-weight: 400; font-style: normal; " +
      "src: url(https://fonts.gstatic.com/s/inter/v13/abc.woff2) format('woff2'); }";
    const inter = find(extractFontFaces(load('<html></html>'), [gstaticCss], BASE), 'Inter');
    expect(inter?.files).toContain('https://fonts.gstatic.com/s/inter/v13/abc.woff2');
    expect(inter?.weights).toContain(400);
  });

  it('ignores non-font url() and non-font CSS (no false positives)', () => {
    const css = 'body { background: url(/img/hero.jpg); color: #fff } .x { font-family: Arial }';
    expect(extractFontFaces(load('<html><body>hi</body></html>'), [css], BASE)).toEqual([]);
  });
});
