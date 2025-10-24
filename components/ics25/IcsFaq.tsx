"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type Faq = { q: string; a: string };

const coreFaqs: Faq[] = [
  { q: "How can I register as a creator or gamer?", a: "Go to insturix.com/ics25. For GameOn, use the Register section inside ICS’25 and choose Valorant or BGMI." },
  { q: "What’s the refund policy?", a: "Refunds are available up to Oct 25, 2025 (10% processing fee). No refunds after qualifiers begin." },
  { q: "Are there accommodation options nearby?", a: "Yes, budget hotels and hostels within 2km of IIIT Delhi; details on the site." },
  { q: "What are the conduct rules for GameOn?", a: "Standard fair play: no toxicity, no cheating, team-only comms. Disputes via Discord ticket; anti-cheat and admin review in place." },
  { q: "Is there on-site Wi‑Fi and food?", a: "Yes. Venue Wi‑Fi and multiple food stalls; outside food allowed in designated zones." },
];

export default function IcsFaq() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur p-4 sm:p-6">
      <Accordion type="single" collapsible className="w-full">
        {coreFaqs.map((f, i) => (
          <AccordionItem key={f.q} value={`faq-${i}`} className="border-white/10">
            <AccordionTrigger className="group text-left rounded-lg px-3 sm:px-4 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 data-[state=open]:bg-white/5">
              <span className="pr-4 text-base sm:text-[15px] text-zinc-100">{f.q}</span>
            </AccordionTrigger>
            <AccordionContent className="px-3 sm:px-4">
              <p className="text-zinc-300 text-sm leading-relaxed">{f.a}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
