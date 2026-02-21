"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import {
  // Search,
  // MessageCircle,
  FileText,
  Zap,
  Mail,
  Phone,
  MessageSquare,
  FileQuestion,
  ArrowRight,
} from "lucide-react";
// import { Input } from "@/components/ui/input";
import Link from "next/link";

{ /* const supportCategories = [
  {
    title: "Quick Help",
    description: "Find instant answers to common questions",
    icon: Zap,
    items: [
      { title: "System Requirements", link: "#" },
      { title: "Installation Guide", link: "#" },
      { title: "Common Issues", link: "#" },
      { title: "API Documentation", link: "#" },
    ],
  },
  {
    title: "Support Channels",
    description: "Get help from our support team",
    icon: MessageCircle,
    items: [
      { title: "Live Chat", link: "#" },
      { title: "Email Support", link: "#" },
      { title: "Phone Support", link: "#" },
      { title: "Submit Ticket", link: "#" },
    ],
  },
  {
    title: "Resources",
    description: "Helpful documentation and guides",
    icon: FileText,
    items: [
      { title: "User Guide", link: "/resources/tutorials" },
      { title: "FAQs", link: "/resources/faq" },
      { title: "Video Tutorials", link: "/resources/tutorials" },
      { title: "Blog Articles", link: "/resources/blog" },
    ],
  },
];
 */}

const quickLinks = [
  {
    title: "FAQs",
    description: "Technical details and platform specifications",
    icon: FileQuestion,
    link: "/resources/faq",
  },
  {
    title: "Community",
    description: "Join our community forums (COMING SOON!)",
    icon: MessageSquare,
    link: "#",
  },
  {
    title: "Change Logs",
    description: "Latest updates and product improvements",
    icon: FileText,
    link: "/resources/blogs",
  },
];

export default function SupportContent() {
  return (
    <div className="min-h-screen bg-[#09090B] relative font-sans text-zinc-400">
      {/* Structural Background Pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full">
            <pattern id="support-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M0 40V0h40" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#support-grid)" />
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
            show: { opacity: 1, transition: { staggerChildren: 0.12 } }
          }}
          className="max-w-5xl mx-auto space-y-24"
        >
          {/* Header Section */}
          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } }
            }}
            className="text-center"
          >
            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter text-zinc-50 mb-6 font-heading">
              Support Center
            </h1>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
              Find technical documentation, community resources, and direct assistance for your creative workflow.
            </p>
          </motion.div>

          {/* Quick Links */}
          <div className="grid md:grid-cols-3 gap-6">
            {quickLinks.map((item, index) => (
              <motion.div
                key={item.title}
                variants={{
                  hidden: { opacity: 0, y: 30 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
                }}
              >
                <Link href={item.link}>
                  <div className="p-8 h-full bg-zinc-900/40 border border-zinc-900 rounded-2xl transition-all duration-300 hover:bg-zinc-900 hover:border-zinc-800 hover:scale-[1.02] group">
                    <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center mb-6 group-hover:bg-zinc-700 transition-colors">
                      <item.icon className="w-6 h-6 text-zinc-300 group-hover:text-zinc-50" />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-50 mb-3 tracking-tight font-heading group-hover:text-white transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-zinc-400 group-hover:text-zinc-300 transition-colors">
                      {item.description}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Contact Info */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 40 },
              show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
            }}
            className="p-12 border border-zinc-900 bg-zinc-900/40 rounded-3xl"
          >
            <div className="flex flex-col md:flex-row items-center justify-between gap-12">
              <div className="text-center md:text-left flex-1">
                <h2 className="text-3xl font-bold text-zinc-50 mb-4 tracking-tight font-heading">
                  Still need help?
                </h2>
                <p className="text-zinc-400 text-lg mb-8 max-w-md mx-auto md:mx-0">
                  Our team is available Monday to Friday, 9:00 AM - 6:00 PM for premium assistance.
                </p>
                <div className="flex flex-col sm:flex-row justify-center md:justify-start gap-6">
                  <div className="flex items-center gap-3 text-zinc-300">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Phone className="w-5 h-5" />
                    </div>
                    <span className="font-medium">+91 92201-21372</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-300">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Mail className="w-5 h-5" />
                    </div>
                    <span className="font-medium">support@insturix.com</span>
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0">
                <Link href="/contactus">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-10 py-5 bg-zinc-50 hover:bg-zinc-200 text-zinc-950 font-bold rounded-xl transition-all shadow-lg text-lg flex items-center gap-3"
                  >
                    Send Message
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>
                </Link>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
