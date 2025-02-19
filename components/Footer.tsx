"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Github, Linkedin, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { BsTwitterX } from "react-icons/bs";

const companyLinks = [
  { label: "About", link: "/about" },
  { label: "Terms", link: "/legal/terms" },
  { label: "Privacy", link: "/legal/privacy" },
  { label: "Contact", link: "/contact" },
];

const supportLinks = [
  {
    label: "Help Center",
    heading: "Support",
    links: [
      { label: "Documentation", link: "/resources/documentation" },
      { label: "FAQs", link: "/resources/faqs" },
      { label: "Contact Support", link: "/resources/support" },
    ],
  },
  {
    label: "Company",
    heading: "Company",
    links: [
      { label: "About Us", link: "/about" },
      { label: "Careers", link: "/careers" },
      { label: "Press", link: "/newsroom" },
    ],
  },
];

const companySocials = [
  { icon: BsTwitterX, label: "Twitter", link: "https://x.com/insturance_co" },
  {
    icon: Linkedin,
    label: "LinkedIn",
    link: "https://linkedin.com/company/insturance",
  },
  { icon: Github, label: "GitHub", link: "https://github.com/insturance" },
];

function NewsletterSection() {
  const [email, setEmail] = useState("");
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Subscribed:", email);
    setEmail("");
  };

  return (
    <div className="relative py-10 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid-neutral-100/20 dark:bg-grid-neutral-900/20 bg-[size:20px_20px] opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/30 to-background" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="relative max-w-2xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6"
      >
        <div className="flex-1 text-center md:text-left space-y-2">
          <h2 className="text-2xl font-bold tracking-tight primtext">
            Join Our Newsletter
          </h2>
          <p className="text-muted-foreground text-sm">
            Get the latest updates straight to your inbox
          </p>
        </div>

        <motion.form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          <div className="relative w-full sm:w-64">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pr-12 bg-background/80 backdrop-blur-xs"
              required
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              ✉
            </div>
          </div>
          <Button type="submit" className="w-full sm:w-auto">
            Subscribe
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </motion.form>
      </motion.div>
    </div>
  );
}

export default function Footer() {
  return (
    <>
      <div className="w-full bg-[rgb(var(--surface-0))] border-t border-b border-neutral-200 dark:border-neutral-800">
        <div className="container mx-auto">
          <NewsletterSection />
        </div>
      </div>
      <footer className="relative w-full bg-[rgb(var(--surface-0))]">
        <div className="absolute inset-0 bg-linear-to-b from-[rgb(var(--surface-0))] via-[rgb(var(--surface-0))] to-[rgb(var(--surface-1))] pointer-events-none" />
        <div className="container relative mx-auto px-6 py-12">

        {/* Support Links */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {supportLinks.map((section) => (
            <motion.div
              key={section.label}
              className="space-y-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h3 className="text-lg font-semibold">{section.heading}</h3>
              <ul className="space-y-3 text-muted-foreground">
                {section.links.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.link}
                      className="hover:text-foreground transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-neutral-200/50 dark:border-neutral-800/50 mt-12 pt-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-wrap justify-center md:justify-start items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span>© 2025 Insturance. All rights reserved.</span>
              <div className="h-1 w-1 rounded-full bg-muted-foreground/30 hidden md:block" />
              {companyLinks.map((item) => (
                <Link
                  key={item.label}
                  href={item.link}
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {companySocials.map(({ icon: Icon, label, link }) => (
                <Link
                  key={label}
                  href={link}
                  className="text-muted-foreground hover:text-foreground transition-colors p-2.5 rounded-full hover:bg-muted"
                  aria-label={label}
                >
                  <Icon className="w-5 h-5" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
    </>
  );
}
