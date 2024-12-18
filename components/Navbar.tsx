"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown } from "lucide-react";

const navItems = [
  {
    title: "Product",
    dropdown: [
      "Features",
      "Mobile",
      "Actions",
      "Packages",
      "Security",
      "Codespaces",
      "Copilot",
      "Code Review",
    ],
  },
  {
    title: "Solutions",
    dropdown: ["Enterprise", "Teams", "Startups", "Education"],
  },
  {
    title: "Resources",
    dropdown: ["Documentation", "Learning", "Community", "Events", "Support"],
  },
  {
    title: "Open Source",
    dropdown: ["Topics", "Trending", "Collections", "Events"],
  },
  {
    title: "Enterprise",
  },
  { title: "Pricing" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <nav className="fixed w-full z-50">
      <div className="shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {isMobile ? (
              <>
                <div className="-ml-2 flex">
                  <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="inline-flex items-center justify-center p-2 rounded-md text-white hover:text-gray-600 focus:outline-none"
                  >
                    {isOpen ? (
                      <X className="h-6 w-6" />
                    ) : (
                      <Menu className="h-6 w-6" />
                    )}
                  </button>
                </div>
                <div className="flex-1 flex justify-center">
                  <Link href="/" className="text-2xl font-bold text-white">
                    Logo
                  </Link>
                </div>
                <div className="flex-shrink-0">
                  <Link
                    href="/signin"
                    className="text-white hover:text-gray-600"
                  >
                    Sign In
                  </Link>
                </div>
              </>
            ) : (
              <div className="hidden md:flex flex-1 items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Link href="/" className="text-white text-2xl font-bold">
                      Logo
                    </Link>
                  </div>
                  <div className="ml-10 flex items-baseline space-x-4">
                    {navItems.map((item) => (
                      <NavItem key={item.title} item={item} />
                    ))}
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="relative mr-4">
                    <input
                      type="text"
                      placeholder="Search or jump to..."
                      className="w-64 px-4 py-1 text-sm text-gray-200 bg-gray-900 rounded-md border border-gray-700 focus:outline-none focus:border-gray-500"
                    />
                    <kbd className="absolute right-2 top-1/2 transform -translate-y-1/2 px-2 py-0.5 text-xs text-gray-400 bg-gray-800 rounded-md border border-gray-700">
                      /
                    </kbd>
                  </div>
                  <Link
                    href="/signin"
                    className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/signup"
                    className="bg-gray-800 text-white hover:bg-gray-700 px-3 py-2 rounded-md text-sm font-medium ml-2"
                  >
                    Sign Up
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && isMobile && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-[#0d1117]"
          >
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              {navItems.map((item) => (
                <MobileNavItem key={item.title} item={item} />
              ))}
            </div>
            <div className="pt-4 pb-3 border-t border-gray-700">
              <div className="flex items-center px-5">
                <Link
                  href="/signin"
                  className="text-gray-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

function NavItem({ item }: { item: { title: string; dropdown?: string[] } }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button className="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium inline-flex items-center">
        {item.title}
        {item.dropdown && <ChevronDown className="ml-1 h-4 w-4" />}
      </button>
      {item.dropdown && isOpen && (
        <div className="absolute left-0 mt-2 w-48 rounded-md shadow-lg bg-[#161b22] ring-1 ring-black ring-opacity-5">
          <div
            className="py-1"
            role="menu"
            aria-orientation="vertical"
            aria-labelledby="options-menu"
          >
            {item.dropdown.map((subItem) => (
              <Link
                key={subItem}
                href="#"
                className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
                role="menuitem"
              >
                {subItem}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileNavItem({
  item,
}: {
  item: { title: string; dropdown?: string[] };
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-white hover:text-gray-600 block px-3 py-2 rounded-md text-base font-medium w-full text-left"
      >
        {item.title}
        {item.dropdown && <ChevronDown className="inline-block ml-1 h-4 w-4" />}
      </button>
      <AnimatePresence>
        {isOpen && item.dropdown && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="pl-4"
          >
            {item.dropdown.map((subItem) => (
              <Link
                key={subItem}
                href="#"
                className="text-black hover:text-gray-600 block px-3 py-2 rounded-md text-sm font-medium"
              >
                {subItem}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
