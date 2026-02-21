"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const faqs = [
  {
    question: "What is Insturix?",
    answer:
      "Insturix is a suite of AI-powered digital solutions designed to help businesses and individuals enhance their digital experiences with cutting-edge technology.",
  },
  {
    question: "How do I get started?",
    answer:
      "Getting started is easy! Simply sign up for an account and choose the product that best suits your needs. Our onboarding process will guide you through the setup.",
  },
  {
    question: "What products do you offer?",
    answer:
      "We offer various products including Alyzitron for content moderation, Kund-li for data analysis, Editron for content editing, Shield for security, and more.",
  },
  {
    question: "How secure is my data?",
    answer:
      "We take security seriously. All data is encrypted end-to-end, and we follow industry-best practices for data protection and privacy compliance.",
  },
  {
    question: "Do you offer customer support?",
    answer:
      "Yes! We provide 24/7 customer support through various channels including email, chat, and phone. Our team is always ready to help.",
  },
  {
    question: "What are your pricing plans?",
    answer:
      "We offer flexible pricing plans tailored to different needs and scales. Visit the Upgrade page to find the perfect plan for you.",
  },
  {
    question: "Can I integrate with existing systems?",
    answer:
      "Yes, our products are designed with integration in mind. We provide comprehensive APIs and documentation for seamless integration.",
  },
  {
    question: "What makes Insturix different?",
    answer:
      "Our unique combination of AI technology, user-focused design, and commitment to innovation sets us apart. We're constantly evolving to meet our users' needs.",
  },
  {
    question: "How do I delete all my data?",
    answer:
      "To delete all your data, navigate to the dashboard, go to the sidebar, hover over your profile icon/username, and click on Settings > Profile > Delete Account. Confirm the deletion. This will permanently remove all your data, including uploads and account information.",
  },
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-[#09090B] relative font-sans text-zinc-400">
      {/* Structural Background Pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full">
            <pattern id="faq-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M0 40V0h40" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#faq-grid)" />
          </svg>
        </div>
      </div>

      <div className="container mx-auto px-4 py-32 relative">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { staggerChildren: 0.1 } }
          }}
          className="max-w-3xl mx-auto"
        >
          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
            }}
            className="mb-16"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-6 text-zinc-50 tracking-tighter font-heading">
              Frequently Asked Questions
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed max-w-2xl">
              Technical details and platform specifications for creators and teams.
            </p>
          </motion.div>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
            }}
            className="border-t border-zinc-900"
          >
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem 
                  key={index} 
                  value={`item-${index}`}
                  className="border-b border-zinc-900 px-0"
                >
                  <AccordionTrigger className="text-left hover:no-underline py-6 group transition-all">
                    <span className="text-lg font-medium text-zinc-300 group-hover:text-zinc-50 transition-colors">
                      {faq.question}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pb-6 pr-12">
                      <p className="text-zinc-400 leading-relaxed text-base">
                        {faq.answer}
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>

          {/* Support CTA */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
            }}
            className="mt-24 p-12 border border-zinc-900 bg-zinc-900/40 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-8"
          >
            <div className="text-center md:text-left">
              <h3 className="text-2xl font-bold text-zinc-50 mb-2 font-heading tracking-tight">
                Can't find what you're looking for?
              </h3>
              <p className="text-zinc-400">
                Our support team is available for deep technical queries.
              </p>
            </div>
            <Link href="/resources/support">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-bold rounded-lg transition-colors flex items-center gap-2"
              >
                Contact Support
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
