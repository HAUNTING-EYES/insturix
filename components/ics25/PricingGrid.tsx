"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Tier = {
  name: string;
  price: string;
  features: string[];
  cta: string;
  blurb?: string;
  highlight?: boolean;
  reddish?: boolean;
  subtitle?: string;
};

const tiers: Tier[] = [
  { name: "Bronze", price: "Free", features: ["Access to panel talks", "Access to speaker sessions", "Audience Access to Creator Awards"], cta: "Register" },
  { name: "Silver", price: "₹2500", features: ["Everything in Bronze Pass", "Participate in Reel making showdown", "Speed Edits", "Access to quite rooms and Gaming Zones", "Talent Showdown"], cta: "Get Pass" },
  { name: "Gold", price: "₹5000", features: ["Everything in Silver Pass", "Networking lounge", "Lunch both days", "Exclusive merch", "1 yr Insturix Pro Subscription"], cta: "Get Pass", highlight: true },
  { name: "Creators", price: "₹3000", features: ["Everything in Gold Pass", "Priority Access", "Brand Shoutout", "Featuring on Banner"], cta: "Get Creators Pass", reddish: true, subtitle: "Validity: 10k+ followers Instagram/YouTube/LinkedIn" },
];

export default function PricingGrid() {
  return (
    <div className="relative">
      {/* Ambient frame glow */}
      <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-[32px] bg-gradient-to-br from-[#3A9EFF]/12 via-transparent to-[#FF2EE6]/12 blur-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {tiers.map((t, i) => (
          <motion.article
            key={t.name}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: i * 0.06 }}
            className={`group relative rounded-3xl overflow-hidden p-[1px] ${
              t.name.toLowerCase().includes('gold')
                ? "bg-gradient-to-br from-yellow-400/35 via-white/20 to-yellow-600/35"
                : t.name.toLowerCase().includes('bronze')
                ? "bg-gradient-to-br from-amber-600/35 via-white/20 to-amber-800/35"
                : t.name.toLowerCase().includes('silver')
                ? "bg-gradient-to-br from-white/65 via-white/20 to-gray-200/85"
                : t.reddish
                ? "bg-gradient-to-br from-red-500/35 via-white/20 to-red-700/35"
                : "bg-gradient-to-br from-white/15 via-white/10 to-white/15"
            }`}
          >
            {/* Inner glass panel */}
            <div className="relative h-full rounded-[22px] border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-6 flex flex-col">
              {/* Subtle ribbon for highlighted tier */}
              {t.highlight ? (
                <div className="pointer-events-none absolute -top-0.5 left-5 rounded-b-md border border-white/10 bg-white/10 px-2 py-1 text-[11px] uppercase tracking-wide text-white/80">
                  Recommended
                </div>
              ) : null}
              {/* Sheen */}
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[22px] [mask-image:radial-gradient(200px_120px_at_0%_0%,rgba(255,255,255,0.15),transparent)]" />
              {/* Title & price */}  
              <div className="flex flex-col gap-1 h-16 flex-shrink-0">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">{t.name}</h3>
                  <div className={`font-bold text-zinc-900 dark:text-zinc-100 text-right ${
                    t.name.toLowerCase().includes('silver') ? 'text-lg' : 'text-xl'
                  }`}>{t.price}</div>
                </div>
                {t.subtitle && (
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">{t.subtitle}</div>
                )}
              </div>
              {/* Features */}
              <ul className="mt-4 space-y-2 text-zinc-700 dark:text-zinc-300 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className={`inline-block size-1.5 rounded-full flex-shrink-0 mt-0.5 ${
                      t.name.toLowerCase().includes('gold') ? 'bg-yellow-500' :
                      t.name.toLowerCase().includes('bronze') ? 'bg-amber-600' :
                      t.name.toLowerCase().includes('silver') ? 'bg-white' :
                      t.reddish ? 'bg-red-500' : 'bg-[#3A9EFF]'
                    }`} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {/* CTA */}
              <div className="mt-auto pt-6">
                {(() => {
                  const slug = t.name.toLowerCase().includes('creators') ? 'creators' : t.name.toLowerCase().replace(/\s+/g, "-");
                  const href = `/checkout?tier=${encodeURIComponent(slug)}`;
                  // If user is already registered, we'll still navigate to checkout where server will short-circuit to /checkout/success
                  return (
                    <Link href={href} aria-label={`Get ${t.name} pass`} className="inline-flex w-full">
                      <Button className={`w-full font-semibold rounded-xl transition-colors ${
                        t.name.toLowerCase().includes('gold')
                          ? "bg-yellow-500 hover:bg-yellow-600 text-white shadow-[0_0_30px_rgba(245,158,11,0.35)]"
                          : t.name.toLowerCase().includes('bronze')
                          ? "bg-amber-600 hover:bg-amber-700 text-white shadow-[0_0_30px_rgba(245,158,11,0.35)]"
                          : t.name.toLowerCase().includes('silver')
                          ? "bg-white hover:bg-gray-100 text-gray-800 shadow-[0_0_30px_rgba(255,255,255,0.35)]"
                          : t.reddish
                          ? "bg-red-500 hover:bg-red-600 text-white shadow-[0_0_30px_rgba(239,68,68,0.35)]"
                          : "bg-zinc-900/90 hover:bg-zinc-900 text-white border border-white/10"
                      }`}>{t.cta}</Button>
                    </Link>
                  );
                })()}
              </div>
            </div>
          </motion.article>
        ))}
      </div>
      {/* Footer footnote */}
      <p className="mt-5 text-center text-xs text-white/60">Read all terms before proceeding to payment.</p>
    </div>
  );
}
