"use client";

import { useEffect } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type FaqItem = { id: string; q: string; a: string };
type FaqSection = { title: string; items: FaqItem[] };

const sections: FaqSection[] = [
  {
    title: "Registration & Eligibility",
    items: [
      {
        id: "register-how",
        q: "How do we register for GameOn?",
        a: "Go to the ICS’25 register flow (/ics25/register) and choose Valorant (5v5) or BGMI (4v4). Fill team details and complete payment to confirm.",
      },
      {
        id: "who-can-join",
        q: "Who can participate?",
        a: "Open to all skill levels. Mixed‑city teams are allowed.",
      },
      {
        id: "subs",
        q: "Can we add substitutes?",
        a: "Yes. Each team may list 1 substitute. Substitutes should be added at the team's discretion and must be registered during team registration. Substitutes follow the same payment process; they may request a refund before qualifiers begin. No refunds will be issued after qualifiers begin.",
      },
    ],
  },
  {
    title: "Format & Schedule",
    items: [
      {
        id: "dates",
        q: "What are the key dates?",
        a: "Online qualifiers: Nov 8. Online finals: Nov 15. Winners announced at ICS'25 awards ceremony on Nov 23 @ IIIT Delhi. Detailed match slots are shared after registration.",
      },
      {
        id: "format",
        q: "What's the tournament format?",
        a: "Fully online tournament. Qualifiers on Nov 8, finals on Nov 15. Winners announced at the ICS'25 awards ceremony on Nov 23.",
      },
      {
        id: "brackets",
        q: "How are brackets and seeding decided?",
        a: "Based on number of entries and past results (if available). Final brackets are published before each round.",
      },
    ],
  },
  {
    title: "Fees & Refunds",
    items: [
      {
        id: "fees",
        q: "What’s the entry fee?",
        a: "₹500 per team. Cashback or discounts may be available through creator tasks announced in the portal.",
      },
      {
        id: "refunds",
        q: "What’s the refund policy?",
        a: "Refunds are available up to Oct 25, 2025 with a 10% processing fee. No refunds after qualifiers begin.",
      },
    ],
  },
  {
    title: "Online Setup",
    items: [
      {
        id: "valorant-setup",
        q: "Valorant setup requirements?",
        a: "Play from your own PC with a stable internet connection. Standard anti-cheat required. Discord mandatory for team communication.",
      },
      {
        id: "bgmi-setup",
        q: "BGMI device policy?",
        a: "Mobile-only. Play from your own device with stable internet. Use of game-allowed controllers follows tournament rules.",
      },
      {
        id: "net",
        q: "Internet requirements?",
        a: "Stable high-speed internet is required for all online matches (qualifiers and finals on Nov 8 & 15).",
      },
    ],
  },
  {
    title: "Conduct & Anti‑Cheat",
    items: [
      {
        id: "fairplay",
        q: "What about fair play and disputes?",
        a: "Zero tolerance for toxicity and cheating. Disputes are raised via Discord tickets and reviewed by admins.",
      },
      {
        id: "cheat",
        q: "Is anti‑cheat enforced?",
        a: "Yes. Standard anti‑cheat checks apply. Non‑compliance or suspicious behavior may lead to disqualification.",
      },
    ],
  },
  {
    title: "Awards & ICS'25",
    items: [
      {
        id: "awards",
        q: "When are winners announced?",
        a: "GameOn winners will be announced at the ICS'25 awards ceremony on Nov 23 @ IIIT Delhi.",
      },
      {
        id: "attendance",
        q: "Do we need to attend ICS'25?",
        a: "No. The tournament is fully online. However, winners are encouraged to attend the awards ceremony on Nov 23 if possible.",
      },
      {
        id: "ics-access",
        q: "Can we attend ICS'25 events?",
        a: "Yes! Purchase an attendee pass separately to attend talks, workshops, and networking on Nov 22 @ IIIT Delhi.",
      },
    ],
  },
];

export default function GameOnFaq() {
  // If URL has #hash of a question, scroll to it and open the accordion by triggering a click
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash?.replace('#', '');
    if (!hash) return;
    const el = document.querySelector<HTMLElement>(`[data-faq-id="${hash}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Trigger click to open corresponding item
      setTimeout(() => el.click(), 120);
    }
  }, []);

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <div key={section.title} className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur p-4 sm:p-6">
          <div className="mb-3 text-sm font-semibold text-white/80">{section.title}</div>
          <Accordion type="single" collapsible>
            {section.items.map((item, i) => (
              <AccordionItem key={item.id} value={`${section.title}-${i}`}>
                <AccordionTrigger
                  data-faq-id={item.id}
                  id={item.id}
                  className="text-left [&[data-state=open]]:text-white hover:bg-white/5 rounded-lg px-2"
                >
                  {item.q}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-zinc-300 text-sm leading-relaxed">{item.a}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </div>
  );
}
