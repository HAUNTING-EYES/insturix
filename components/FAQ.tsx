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
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-blue-500/10 dark:bg-blue-400/5 rounded-full"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.1, 0.3, 0.1],
              }}
              transition={{
                duration: Math.random() * 5 + 5,
                repeat: Infinity,
                repeatType: "reverse",
                delay: Math.random() * 2,
              }}
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="container mx-auto px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto"
        >
          <h1 className="text-3xl font-semibold mb-2 relative">
            Frequently Asked Questions
            <div className="absolute -top-1.5 -left-3 w-12 h-12 bg-blue-500/10 rounded-full blur-xl" />
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-12 text-lg">
            Find answers to common questions about our products and services
          </p>

          <Card className="p-6 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <AccordionItem value={`item-${index}`}>
                    <AccordionTrigger className="text-left hover:no-underline">
                      <span className="text-base font-medium">
                        {faq.question}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-zinc-600 dark:text-zinc-400">
                        {faq.answer}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </motion.div>
              ))}
            </Accordion>
          </Card>

          {/* Support CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-12 text-center"
          >
            <Card className="inline-block p-8 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs">
              <h3 className="text-xl font-semibold mb-2">
                Still have questions?
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                Our support team is here to help you
              </p>
              <Link href="/resources/support">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center justify-center px-6 py-3 font-medium text-white bg-linear-to-r from-blue-500 to-blue-600 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Contact Support
                  <ArrowRight className="w-4 h-4 ml-2" />
                </motion.button>
              </Link>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
