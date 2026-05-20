
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

    // Brand Intelligence: ensure indexes on brand_events collection
    import('@/lib/shared/brand-events').then(({ ensureBrandEventsIndexes }) =>
      ensureBrandEventsIndexes()
        .then(() => console.log('✅ [Instrumentation] Brand events indexes ensured'))
        .catch((err) => console.error('[Instrumentation] Brand events indexes failed:', err))
    );
  }
}
