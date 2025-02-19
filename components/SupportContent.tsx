"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import {
  // Search,
  MessageCircle,
  FileText,
  Zap,
  Mail,
  Phone,
  MessageSquare,
  FileQuestion,
} from "lucide-react";
// import { Input } from "@/components/ui/input";
import Link from "next/link";

const supportCategories = [
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

const quickLinks = [
  {
    title: "FAQs",
    description: "Browse frequently asked questions",
    icon: FileQuestion,
    link: "/resources/faq",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    title: "Community",
    description: "Join our community forums (COMING SOON!)",
    icon: MessageSquare,
    link: "#",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    title: "Contact",
    description: "Get in touch with our team",
    icon: Mail,
    link: "/contactus",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    title: "Blogs",
    description: "Look at our latest blogs for changes",
    icon: FileText,
    link: "/resources/blogs",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
];

export default function SupportContent() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative">
      {/* Animated lines background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05]">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-[1px] w-full bg-linear-to-r from-transparent via-blue-500/50 to-transparent"
              animate={{
                y: ["0%", "100%"],
              }}
              transition={{
                duration: Math.random() * 10 + 10,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "linear",
                delay: i * 2,
              }}
              style={{
                top: `${i * 20}%`,
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
          className="max-w-6xl mx-auto space-y-16"
        >
          {/* Search Section */}
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-semibold relative inline-block">
              How can we help?
              <div className="absolute -top-1.5 -left-3 w-12 h-12 bg-blue-500/10 rounded-full blur-xl" />
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
              Browse the categories below
            </p>
           {/* <div className="max-w-xl mx-auto mt-6">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-zinc-400" />
                <Input placeholder="Search for help..." className="pl-10" />
              </div> 
            </div>*/}
          </div>

          {/* Quick Links */}
          <div className="grid md:grid-cols-3 gap-6">
            {quickLinks.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link href={item.link}>
                  <Card className="p-6 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs transition-all duration-300 hover:scale-[1.02] hover:shadow-lg group">
                    <div
                      className={`w-12 h-12 rounded-lg ${item.bgColor} flex items-center justify-center mb-4`}
                    >
                      <item.icon className={`w-6 h-6 ${item.color}`} />
                    </div>
                    <h3 className="text-lg font-medium mb-2">{item.title}</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {item.description}
                    </p>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Support Categories */}
          {/* {supportCategories.map((category, index) => (
            <motion.section
              key={category.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="space-y-6"
            >
              <div className="flex items-center space-x-3">
                <category.icon className="w-6 h-6 text-blue-500" />
                <h2 className="text-2xl font-semibold">{category.title}</h2>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400">
                {category.description}
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {category.items.map((item) => (
                  <Link key={item.title} href={item.link}>
                    <Card className="p-4 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors">
                      <span className="text-sm font-medium">{item.title}</span>
                    </Card>
                  </Link>
                ))}
              </div>
            </motion.section>
          ))} */}

          {/* Contact Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-center space-y-4 pt-8 border-t border-zinc-200 dark:border-zinc-800"
          >
            <h2 className="text-xl font-semibold">Still need help?</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Our support team is available Monday to Friday, 9:00 AM - 6:00 PM
            </p>
            <div className="flex justify-center space-x-8">
              <div className="flex items-center space-x-2 text-blue-500">
                <Phone className="w-5 h-5" />
                <span>+91 92201-21372</span>
              </div>
              <div className="flex items-center space-x-2 text-blue-500">
                <Mail className="w-5 h-5" />
                <span>support@insturance.com</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
