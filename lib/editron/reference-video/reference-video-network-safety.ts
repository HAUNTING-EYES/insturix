import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export type ReferenceVideoDnsLookup = (
  hostname: string,
) => Promise<readonly { address: string; family: number }[]>;

export function isUnsafeReferenceHostname(hostname: string): boolean {
  const clean = cleanHostname(hostname);
  if (!clean) return true;
  if (clean === 'localhost' || clean.endsWith('.localhost')) return true;
  if (clean.endsWith('.local') || clean.endsWith('.internal') || clean.endsWith('.lan')) return true;
  const ipKind = isIP(clean);
  return ipKind !== 0 ? isUnsafeIpAddress(clean) : false;
}

export async function assertPublicReferenceDnsResolution(
  hostname: string,
  dnsLookup?: ReferenceVideoDnsLookup,
): Promise<{ ok: true } | { ok: false; diagnostics: string[] }> {
  if (isIP(cleanHostname(hostname)) !== 0) {
    return isUnsafeIpAddress(hostname)
      ? { ok: false, diagnostics: [`Reference video host ${hostname} is not public.`] }
      : { ok: true };
  }

  try {
    const addresses = await (dnsLookup ?? defaultDnsLookup)(hostname);
    if (addresses.length === 0) {
      return { ok: false, diagnostics: [`Reference video host ${hostname} did not resolve.`] };
    }
    const unsafe = addresses.filter((entry) => isUnsafeIpAddress(entry.address));
    if (unsafe.length > 0) {
      return {
        ok: false,
        diagnostics: [`Reference video host ${hostname} resolves to a private or reserved address.`],
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [`Could not verify public DNS for reference video host ${hostname}: ${error instanceof Error ? error.message : String(error)}.`],
    };
  }
}

async function defaultDnsLookup(hostname: string): Promise<readonly { address: string; family: number }[]> {
  const { lookup } = await import('node:dns/promises');
  return lookup(hostname, { all: true, verbatim: true });
}

function isUnsafeIpAddress(address: string): boolean {
  const clean = cleanHostname(address);
  if (!ipaddr.isValid(clean)) return true;

  const parsed = ipaddr.parse(clean);
  if (parsed.kind() === 'ipv4') return parsed.range() !== 'unicast';
  const ipv6 = parsed as ipaddr.IPv6;
  if (ipv6.isIPv4MappedAddress()) return ipv6.toIPv4Address().range() !== 'unicast';
  return ipv6.range() !== 'unicast';
}

function cleanHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}
