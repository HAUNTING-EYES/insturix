"use client";

/**
 * Site Navbar — Insturix Design System v1.0
 *
 * Preserved animations from current navbar:
 *  1. Logo ↔ name toggle (AnimatePresence, 5s interval)
 *  2. Pill-on-scroll (full-width → floating pill at scroll > 200px)
 *  3. Mobile menu (height animation on open/close)
 *
 * Design system compliance:
 *  - Warm editorial dark palette (no zinc, no blue)
 *  - Plus Jakarta Sans 800 for brand, 400/500 for links
 *  - Gold accent for primary CTA only
 *  - No backdrop-blur, no drop shadows (pill uses solid bg with high opacity)
 *  - 44px height (design system topbar spec)
 *
 * Design philosophy:
 *  - RAMS: As little as possible. 5 links, not 6. No decorative elements.
 *  - JOBS: Start with experience. Every link goes somewhere useful.
 *  - VIGNELLI: System over one-offs. Uses design tokens exclusively.
 *  - MÜLLER-BROCKMANN: ONE focal point — the gold CTA.
 */

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown } from "lucide-react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMediaQuery } from "@/hooks/useMediaQuery";

// ─── Menu structure ─────────────────────────────────────────────
// Verb-based naming. No old product names.
const menuItems = [
  { title: "Products", href: "/products" },
  {
    title: "About",
    href: "/about",
    subItems: [
      { title: "About us", href: "/about" },
      { title: "Our team", href: "/about/team" },
      { title: "Careers", href: "/careers" },
    ],
  },
  {
    title: "Resources",
    href: "#",
    subItems: [
      { title: "Blog", href: "/resources/blogs" },
      { title: "Tutorials", href: "/resources/tutorials" },
      { title: "Support", href: "/resources/support" },
      { title: "FAQ", href: "/resources/faq" },
    ],
  },
  { title: "Pricing", href: "/upgrade" },
  { title: "Showcase", href: "/showcase" },
];

// ─── Animation config ───────────────────────────────────────────
const EASE = [0.16, 1, 0.3, 1] as const;

export function SiteNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const pathname = usePathname();

  useEffect(() => {
    const checkScrolled = () => {
      // Check window scroll (normal pages) OR data attribute (landing page with fixed scroll container)
      const windowScrolled = window.scrollY > 200;
      const dataScrolled = document.documentElement.dataset.scrolled === "true";
      setScrolled(windowScrolled || dataScrolled);
    };
    window.addEventListener("scroll", checkScrolled, { passive: true });
    // Also observe the data attribute for landing page scroll bridge
    const observer = new MutationObserver(checkScrolled);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scrolled"] });
    return () => {
      window.removeEventListener("scroll", checkScrolled);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isMobile && isOpen) {
      setIsOpen(false);
      setActiveDropdown(null);
    }
  }, [isMobile, isOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsOpen(false);
    setActiveDropdown(null);
  }, [pathname]);

  // Pill-on-scroll: navbar morphs from full-width to floating pill
  const isPill = scrolled && !isMobile && !isOpen;

  return (
    <>
      <motion.nav
        initial={false}
        animate={{
          top: isPill ? 12 : 0,
          left: isPill ? "3%" : "0%",
          right: isPill ? "3%" : "0%",
          borderRadius: isPill ? 9999 : 0,
          backgroundColor: isOpen
            ? "rgba(19, 19, 18, 1)"
            : isPill
            ? "rgba(27, 26, 24, 0.97)"
            : scrolled
            ? "rgba(15, 15, 14, 0.95)"
            : "rgba(11, 11, 10, 0)",
          borderColor: isPill
            ? "rgba(40, 39, 36, 0.8)"
            : scrolled || isOpen
            ? "rgba(28, 27, 25, 0.5)"
            : "rgba(28, 27, 25, 0)",
        }}
        transition={{ duration: 0.45, ease: EASE }}
        className="fixed z-50 border"
      >
        <div className="px-6">
          <div className="flex h-12 items-center justify-between">
            {/* ─── Logo ─── */}
            <div className="flex-none">
              <Link href="/" className="flex items-center">
                <LogoBrand />
              </Link>
            </div>

            {/* ─── Desktop nav links — absolutely centered in the navbar ─── */}
            <div className="hidden md:flex items-center gap-6" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
              {menuItems.map((item) => (
                <NavItem
                  key={item.title}
                  item={item}
                  activeDropdown={activeDropdown}
                  setActiveDropdown={setActiveDropdown}
                  pathname={pathname}
                />
              ))}
            </div>

            {/* ─── Right section ─── */}
            <div className="flex-none flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2">
                <AuthButtons />
              </div>
              {/* Mobile hamburger */}
              <button
                className="md:hidden p-2"
                onClick={() => setIsOpen(!isOpen)}
                aria-label={isOpen ? "Close menu" : "Open menu"}
              >
                {isOpen ? (
                  <X size={20} style={{ color: "var(--text-primary)" }} />
                ) : (
                  <Menu size={20} style={{ color: "var(--text-primary)" }} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ─── Mobile menu ─── */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="md:hidden overflow-hidden"
              style={{
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <div className="px-6 py-4 space-y-1">
                {menuItems.map((item) => (
                  <MobileNavItem
                    key={item.title}
                    item={item}
                    activeDropdown={activeDropdown}
                    onToggle={() =>
                      setActiveDropdown((prev) =>
                        prev === item.title ? null : item.title
                      )
                    }
                    onClose={() => {
                      setIsOpen(false);
                      setActiveDropdown(null);
                    }}
                  />
                ))}
                <div
                  className="pt-4 mt-4"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <AuthButtons />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* Spacer — prevents content from hiding behind fixed nav */}
      <div className="h-12" aria-hidden />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOGO — image ↔ text toggle (preserved from current navbar)
// ═══════════════════════════════════════════════════════════════

function LogoBrand() {
  const [showLogo, setShowLogo] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => setShowLogo((v) => !v), 5000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) {
    return (
      <div className="relative w-36 h-10 flex items-center">
        <div className="w-10 h-10 bg-transparent rounded" />
      </div>
    );
  }

  return (
    <div className="relative w-36 h-10 flex items-center">
      <AnimatePresence mode="wait">
        {showLogo ? (
          <motion.div
            key="logo-img"
            initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, filter: "blur(3px)" }}
            transition={{ duration: 0.45, ease: EASE }}
            className="absolute inset-0 flex items-center"
          >
            <Image
              src="/brand/insturix_white.png"
              alt="Insturix"
              width={40}
              height={40}
              className="rounded"
            />
          </motion.div>
        ) : (
          <motion.div
            key="logo-text"
            initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, filter: "blur(3px)" }}
            transition={{ duration: 0.45, ease: EASE }}
            className="absolute inset-0 flex items-center"
          >
            <span
              style={{
                fontWeight: 800,
                fontSize: 24,
                letterSpacing: "-0.02em",
                color: "var(--text-primary)",
              }}
            >
              Insturix
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DESKTOP NAV ITEM — with dropdown support
// ═══════════════════════════════════════════════════════════════

type MenuItem = {
  title: string;
  href: string;
  subItems?: { title: string; href: string }[];
};

function NavItem({
  item,
  activeDropdown,
  setActiveDropdown,
  pathname,
}: {
  item: MenuItem;
  activeDropdown: string | null;
  setActiveDropdown: (v: string | null) => void;
  pathname: string;
}) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  const isDropdownOpen = activeDropdown === item.title;
  const ref = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isDropdownOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [isDropdownOpen, setActiveDropdown]);

  if (item.subItems) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setActiveDropdown(isDropdownOpen ? null : item.title)}
          className="flex items-center gap-1 px-3 py-2 rounded-button"
          style={{
            fontSize: 14,
            fontWeight: 400,
            color: isActive ? "var(--text-primary)" : "var(--text-muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            transition: "color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            if (!isActive) e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          {item.title}
          <ChevronDown
            size={13}
            style={{
              transform: isDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              opacity: 0.5,
            }}
          />
        </button>
        <AnimatePresence>
          {isDropdownOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.2, ease: EASE }}
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                left: 0,
                minWidth: 180,
                background: "var(--bg-raised)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 12,
                padding: 4,
                zIndex: 60,
              }}
            >
              {item.subItems.map((sub) => (
                <Link
                  key={sub.title}
                  href={sub.href}
                  onClick={() => setActiveDropdown(null)}
                  style={{
                    display: "block",
                    padding: "8px 12px",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    textDecoration: "none",
                    borderRadius: 8,
                    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-deeper)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  {sub.title}
                </Link>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className="px-3 py-2"
      style={{
        fontSize: 14,
        fontWeight: isActive ? 500 : 400,
        color: isActive ? "var(--text-primary)" : "var(--text-muted)",
        textDecoration: "none",
        transition: "color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      {item.title}
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════
// MOBILE NAV ITEM
// ═══════════════════════════════════════════════════════════════

function MobileNavItem({
  item,
  activeDropdown,
  onToggle,
  onClose,
}: {
  item: MenuItem;
  activeDropdown: string | null;
  onToggle: () => void;
  onClose: () => void;
}) {
  const isOpen = activeDropdown === item.title;

  if (item.subItems) {
    return (
      <div>
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between py-3 px-3 rounded-button"
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          {item.title}
          <ChevronDown
            size={14}
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              opacity: 0.5,
            }}
          />
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="overflow-hidden"
            >
              <div
                className="ml-4 pl-3 space-y-1"
                style={{ borderLeft: "1px solid var(--border-subtle)" }}
              >
                {item.subItems.map((sub) => (
                  <Link
                    key={sub.title}
                    href={sub.href}
                    onClick={onClose}
                    className="block py-2 px-2"
                    style={{
                      fontSize: 13,
                      color: "var(--text-muted)",
                      textDecoration: "none",
                    }}
                  >
                    {sub.title}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onClose}
      className="block py-3 px-3"
      style={{
        fontSize: 14,
        color: "var(--text-secondary)",
        textDecoration: "none",
      }}
    >
      {item.title}
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUTH BUTTONS
// ═══════════════════════════════════════════════════════════════

function AuthButtons() {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-20 bg-transparent" />;
  }

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--bg-canvas)",
            background: "var(--accent-gold)",
            padding: "6px 14px",
            borderRadius: 7,
            textDecoration: "none",
            transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          Dashboard
        </Link>
        <button
          onClick={() => signOut({ redirectUrl: "/" })}
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: "var(--text-muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            padding: "6px 8px",
            transition: "color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/signin"
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-secondary)",
          textDecoration: "none",
          padding: "6px 12px",
          transition: "color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
      >
        Sign in
      </Link>
      <Link
        href="/signup"
        style={{
          fontSize: 13,
          fontWeight: 800,
          color: "var(--bg-canvas)",
          background: "var(--accent-gold)",
          textDecoration: "none",
          padding: "6px 16px",
          borderRadius: 7,
          transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
      >
        Sign up
      </Link>
    </div>
  );
}
