import { describe, it, expect } from 'vitest';
import { sanitizeVisualPrompt } from '@/lib/clickatron/sanitize-visual-prompt';

describe('sanitizeVisualPrompt — strips writer metadata', () => {
  it('removes the exact prod pollution block (the fake-logo/baked-text cause)', () => {
    const polluted =
      "A dynamic split-screen image for Insturix showing a frustrated designer on the left and a clean modern interface on the right. " +
      "Overlay text: 'Unlock the Entire Insturix Production Floor'. " +
      "Brand: Insturix. Audience: Business owners and creators. Offer: Integrated production power. Product: Insturix system. " +
      "CTA: Discover the Insturix difference today!";
    const { clean, stripped } = sanitizeVisualPrompt(polluted);

    expect(clean).toContain('A dynamic split-screen image');
    expect(clean).not.toContain('Overlay text:');
    expect(clean).not.toContain('Brand:');
    expect(clean).not.toContain('CTA:');
    expect(clean).not.toContain('Offer:');
    expect(clean).not.toContain('Audience:');
    expect(clean).not.toContain("Unlock the Entire Insturix Production Floor");
    expect(stripped.length).toBeGreaterThanOrEqual(4);
  });

  it('strips a labeled segment even without a trailing period (end of string)', () => {
    const { clean } = sanitizeVisualPrompt('A serene mountain lake at dawn. Product: Insturix system');
    expect(clean).toBe('A serene mountain lake at dawn.');
  });
});

describe('sanitizeVisualPrompt — never harms a real visual scene (adversarial, Rule 29)', () => {
  it('keeps a scene that literally contains text-in-scene (billboard)', () => {
    const scene = "A billboard reading 'SALE' towers over a rainy street at night.";
    expect(sanitizeVisualPrompt(scene).clean).toBe(scene);
  });

  it('keeps the word "product" used as a noun (not the Product: label)', () => {
    const scene = 'The product sits on a walnut table under warm studio light.';
    expect(sanitizeVisualPrompt(scene).clean).toBe(scene);
  });

  it('keeps "a call to action button" as a described visual element', () => {
    const scene = 'A glowing call to action button floats in the lower third of the frame.';
    expect(sanitizeVisualPrompt(scene).clean).toBe(scene);
  });

  it('keeps a clean multi-sentence scene untouched', () => {
    const scene = 'A minimalist workspace. Soft morning light falls across a laptop and a coffee cup. Muted earth tones.';
    expect(sanitizeVisualPrompt(scene).clean).toBe(scene);
    expect(sanitizeVisualPrompt(scene).stripped).toHaveLength(0);
  });

  it('fail-safe: an all-metadata prompt returns the original, never empty', () => {
    const meta = 'Brand: Insturix. CTA: Buy now.';
    const { clean } = sanitizeVisualPrompt(meta);
    expect(clean).toBe(meta); // kept original rather than emit ""
  });

  it('handles empty / whitespace input', () => {
    expect(sanitizeVisualPrompt('').clean).toBe('');
    expect(sanitizeVisualPrompt('   ').clean).toBe('   ');
  });
});
