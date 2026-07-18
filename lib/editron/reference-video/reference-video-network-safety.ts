import { isIP } from 'node:net';

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
  const ipKind = isIP(clean);
  if (ipKind === 4) return isUnsafeIpv4(clean);
  if (ipKind === 6) return true;
  return false;
}

function isUnsafeIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return a >= 224;
}

function cleanHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}
