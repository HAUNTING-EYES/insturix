
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic import to prevent Edge runtime from trying to load node:dns
    const dns = await import('node:dns');
    
    // Classic fix for intermittent ECONNREFUSED on macOS/Node18+ 
    // Forces IPv4 resolution first, avoiding dead-end IPv6 attempts.
    if (dns.setDefaultResultOrder) {
      dns.setDefaultResultOrder('ipv4first');
      console.log('✅ [Instrumentation] DNS resolution order set to ipv4first');
    }
  }
}
