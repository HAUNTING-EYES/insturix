import { describe, expect, it } from 'vitest';
import { extractSocialProfileLinks, parseWebsiteHtml } from '@/lib/shared/brand-website-refinery-utils';

describe('extractSocialProfileLinks', () => {
  it('harvests the brand\'s own social profiles from footer links', () => {
    const html = `<html><body><footer>
      <a href="https://www.instagram.com/insturix">Instagram</a>
      <a href="https://linkedin.com/company/insturix/">LinkedIn</a>
      <a href="https://www.youtube.com/@insturix">YouTube</a>
      <a href="/about">About</a>
    </footer></body></html>`;
    const links = extractSocialProfileLinks(html, 'https://insturix.com');
    expect(links).toContain('https://www.instagram.com/insturix');
    expect(links).toContain('https://linkedin.com/company/insturix');
    expect(links).toContain('https://www.youtube.com/@insturix');
    // The internal /about link is not a social host.
    expect(links.some((link) => link.includes('/about'))).toBe(false);
  });

  it('skips share/intent links and bare-domain (non-profile) links', () => {
    const html = `<html><body>
      <a href="https://twitter.com/intent/tweet?url=x">Share on X</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share on FB</a>
      <a href="https://facebook.com/">Facebook home</a>
    </body></html>`;
    expect(extractSocialProfileLinks(html, 'https://insturix.com')).toEqual([]);
  });

  it('reads the twitter:site meta handle as an x.com profile', () => {
    const html = `<html><head><meta name="twitter:site" content="@insturix"></head><body></body></html>`;
    expect(extractSocialProfileLinks(html, 'https://insturix.com')).toContain('https://x.com/insturix');
  });

  it('caps the number of discovered links', () => {
    const anchors = Array.from({ length: 20 }, (_, i) => `<a href="https://instagram.com/brand${i}">x</a>`).join('');
    expect(extractSocialProfileLinks(`<body>${anchors}</body>`, 'https://insturix.com', 5)).toHaveLength(5);
  });
});

describe('product image third-party badge exclusion', () => {
  it('excludes a Product Hunt badge widget but keeps a real product image', () => {
    const html = `<html><body>
      <a href="https://www.producthunt.com/posts/insturix"><img alt="Product Hunt" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1184782&theme=light"></a>
      <img alt="Insturix product dashboard" src="https://insturix.com/assets/product-dashboard.png">
    </body></html>`;
    const parsed = parseWebsiteHtml({ websiteUrl: 'https://insturix.com', html });
    expect(parsed.productImages.some((url) => url.includes('producthunt.com'))).toBe(false);
    expect(parsed.productImages.some((url) => url.includes('product-dashboard.png'))).toBe(true);
  });
});
