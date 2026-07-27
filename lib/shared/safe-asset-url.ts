/**
 * SSRF guard for server-side fetches of CALLER-SUPPLIED asset URLs (product screenshots, style references, etc.).
 *
 * Workers that download these run with privileged cloud service accounts, so an un-validated `fetch(url)` on a
 * caller-controlled URL is a Server-Side Request Forgery hole: a crafted URL like `http://169.254.169.254/…`
 * (the cloud metadata server) or `http://10.x.y.z/internal` would be fetched from inside the trust boundary.
 *
 * This module blocks that at the application layer:
 *   - `data:` URIs are allowed (inline bytes — no network request happens).
 *   - Only `http:` / `https:` are allowed; every other scheme (file:, gopher:, ftp:, …) is rejected.
 *   - The hostname is resolved via DNS and EVERY resolved address is checked against private / loopback /
 *     link-local / metadata ranges — so `evil.example.com` that resolves to `169.254.169.254` is still blocked.
 *   - Literal private IPs and metadata / *.internal hostnames are rejected outright.
 *
 * Deny ranges mirror the MG sandbox network policy
 * (lib/editron/motion-graphics/codegen/sandbox-render-worker.ts) so both layers agree on what "private" means.
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';

// IPv4 CIDRs that a public asset URL must never resolve to. Superset of the sandbox deny-list.
const DENY_V4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this host"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incl. cloud metadata 169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.');
  return ((Number(parts[0]) << 24) | (Number(parts[1]) << 16) | (Number(parts[2]) << 8) | Number(parts[3])) >>> 0;
}

function ipv4InCidr(ip: string, base: string, bits: number): boolean {
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

export function isPrivateIpv4(ip: string): boolean {
  return DENY_V4_CIDRS.some(([base, bits]) => ipv4InCidr(ip, base, bits));
}

export function isPrivateIpv6(ip: string): boolean {
  const l = ip.toLowerCase();
  if (l === '::1' || l === '::') return true; // loopback / unspecified
  if (l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd')) return true; // link-local / unique-local
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4 address.
  const mapped = l.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === 'metadata' ||
    h === 'metadata.google.internal' ||
    h.endsWith('.internal')
  );
}

/**
 * Throw if `raw` is not a safe public asset URL. `data:` URIs pass (inline). Resolves DNS and checks every
 * address, so it must be `await`ed. Call this immediately before fetching a caller-supplied URL.
 */
export async function assertSafeAssetUrl(raw: string): Promise<void> {
  if (typeof raw !== 'string' || raw.length === 0) throw new Error('asset url: empty');
  if (raw.startsWith('data:')) return; // inline bytes, no network request

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`asset url: unparseable (${raw.slice(0, 40)}…)`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error(`asset url: scheme "${u.protocol}" not allowed (only http/https/data)`);
  }
  const host = u.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (isBlockedHostname(host)) throw new Error(`asset url: blocked host "${host}"`);

  // Literal IP host → check directly.
  const literal = net.isIP(host);
  if (literal === 4 && isPrivateIpv4(host)) throw new Error(`asset url: private IPv4 literal ${host}`);
  if (literal === 6 && isPrivateIpv6(host)) throw new Error(`asset url: private IPv6 literal ${host}`);
  if (literal !== 0) return; // literal public IP — nothing to resolve

  // Hostname → resolve and reject if ANY address is private (defeats hostname→private-IP tricks).
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`asset url: DNS resolution failed for "${host}"`);
  }
  if (addrs.length === 0) throw new Error(`asset url: no DNS records for "${host}"`);
  for (const a of addrs) {
    const priv = a.family === 4 ? isPrivateIpv4(a.address) : isPrivateIpv6(a.address);
    if (priv) throw new Error(`asset url: "${host}" resolves to private ip ${a.address}`);
  }
}
