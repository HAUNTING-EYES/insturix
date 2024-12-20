"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Github,
  Linkedin,
  Instagram,
  Youtube,
  Twitter,
  Twitch,
  Music,
} from "lucide-react";

export default function Footer() {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle newsletter subscription
    console.log("Subscribed:", email);
    setEmail("");
  };

  return (
    <footer className="w-full bg-white border-t">
      <div className="container mx-auto px-4 py-12">
        {/* Newsletter Section */}
        <div className="max-w-xl mb-16">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Subscribe to our product newsletter
          </h2>
          <p className="text-gray-600 mb-4">
            Get tips, technical guides, and best practices. Twice a month. Right
            in your inbox.
          </p>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
              required
            />
            <Button type="submit" variant="default">
              Subscribe
            </Button>
          </form>
        </div>

        {/* Links Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 xl:gap-12 mb-16">
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Product</h3>
            <ul className="space-y-3">
              {[
                "Features",
                "Enterprise",
                "Copilot",
                "Security",
                "Pricing",
                "Team",
                "Resources",
                "Roadmap",
                "Compare",
              ].map((item) => (
                <li key={item}>
                  <Link
                    href="#"
                    className="text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Platform</h3>
            <ul className="space-y-3">
              {[
                "Developer API",
                "Partners",
                "Education",
                "GitHub CLI",
                "GitHub Desktop",
                "GitHub Mobile",
              ].map((item) => (
                <li key={item}>
                  <Link
                    href="#"
                    className="text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Support</h3>
            <ul className="space-y-3">
              {[
                "Docs",
                "Community Forum",
                "Professional Services",
                "Premium Support",
                "Skills",
                "Status",
                "Contact GitHub",
              ].map((item) => (
                <li key={item}>
                  <Link
                    href="#"
                    className="text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Company</h3>
            <ul className="space-y-3">
              {[
                "About",
                "Customer stories",
                "Blog",
                "The ReadME Project",
                "Careers",
                "Newsroom",
                "Inclusion",
                "Social Impact",
                "Shop",
              ].map((item) => (
                <li key={item}>
                  <Link
                    href="#"
                    className="text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <span>© 2024 GitHub, Inc.</span>
            <Link href="#" className="hover:text-gray-900 transition-colors">
              Terms
            </Link>
            <Link href="#" className="hover:text-gray-900 transition-colors">
              Privacy
            </Link>
            <Link href="#" className="hover:text-gray-900 transition-colors">
              Sitemap
            </Link>
            <Link href="#" className="hover:text-gray-900 transition-colors">
              What is Git?
            </Link>
          </div>

          <div className="flex items-center gap-4">
            {[
              { icon: Linkedin, label: "LinkedIn" },
              { icon: Instagram, label: "Instagram" },
              { icon: Youtube, label: "YouTube" },
              { icon: Twitter, label: "Twitter" },
              { icon: Music, label: "TikTok" },
              { icon: Twitch, label: "Twitch" },
              { icon: Github, label: "GitHub" },
            ].map(({ icon: Icon, label }) => (
              <Link
                key={label}
                href="#"
                className="text-gray-600 hover:text-gray-900 transition-colors p-2 rounded-full hover:bg-gray-100"
                aria-label={label}
              >
                <Icon className="w-5 h-5" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
