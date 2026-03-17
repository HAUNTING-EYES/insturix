/**
 * Pure utility — no React or external dependencies.
 * Safe to import in both browser and Node test environments.
 */

/**
 * Normalises the shape of the analyses API response into a plain array.
 *
 * Handles three shapes:
 *  - falsy (null / undefined)  → []
 *  - already an array          → returned as-is
 *  - paginated object { data } → data array extracted
 */
export function parseAnalysesResponse(input: any): any[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'object' && Array.isArray(input.data)) return input.data;
  return [];
}
