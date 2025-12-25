"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown, LogOut, Shield } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import DarkLogo from "@/public/brand/insturix_black.png";
import LightLogo from "@/public/brand/insturix_white.png";
import { useAuth, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

const LogoAnimation = () => {
  const [showLogo, setShowLogo] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    const interval = setInterval(() => {
      setShowLogo((prev) => !prev);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-36 h-16 flex items-center">
      <AnimatePresence mode="wait">
        {showLogo ? (
          <motion.div
            key="logo"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex items-center"
          >
            {theme === "light" ? (
              <Image
                src={DarkLogo}
                alt="Insturix Logo"
                width={48}
                height={48}
                className="rounded-full"
              />
            ) : (
              <Image
                src={LightLogo}
                alt="Insturix Logo"
                width={48}
                height={48}
                className="rounded-full"
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="text"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex items-center"
          >
            <span className="logotext flex items-center h-full transform">
              INSTURIX
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const menuItems = [
  {
    title: "Product",
    href: "/products",
    subItems: [
      { title: "Alyzitron", href: "/products/alyzitron" },
      { title: "Clickatron", href: "/products/clickatron" },
      { title: "Musitron", href: "/products/musitron" },
      { title: "Socialize", href: "/products/socialize" },
      { title: "Editron", href: "/products/editron" },
      { title: "ThinkForge", href: "/products/thinkforge" },
      { title: "Meditron", href: "/products/meditron" },
    ],
  },
  {
    title: "About",
    href: "/about",
    subItems: [
      { title: "About Us", href: "/about" },
      { title: "Our Team", href: "/about/team" },
    ],
  },
  {
    title: "Resources",
    href: "/resources",
    subItems: [
      { title: "Blogs", href: "/resources/blogs" },
      { title: "Support", href: "/resources/support" },
      { title: "FAQ", href: "/resources/faq" },
    ],
  },
  {
    title: "Pricing",
    href: "/upgrade",
  },
  {
    title: "Contact Us",
    href: "/contactus",
  },
  {
    title: "Insturix Creatives Agency",
    href: "/insturix-creatives-agency",
  },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeDropdown, setActiveDropdown] = React.useState<string | null>(
    null
  );
  const [scrolled, setScrolled] = React.useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const pathname = usePathname();

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleDropdown = (title: string) => {
    setActiveDropdown((prev) => (prev === title ? null : title));
  };

  const closeMenu = () => {
    setIsOpen(false);
    setActiveDropdown(null);
  };

  React.useEffect(() => {
    if (!isMobile && isOpen) {
      closeMenu();
    }
  }, [isMobile, isOpen]);

  // Keep navbar above transient banners (like ICS25Banner) and popovers.
  // The banner uses z-40; set navbar to z-50 so dropdowns and mobile menu render above it.
  const navClasses = `fixed top-0 left-0 right-0 z-50 transition-all border-transparent ${
    isMobile ? "duration-150" : "duration-500"
  }`;
  const mobileOpenScrolledClasses =
    "bg-zinc-50 dark:bg-[rgb(var(--surface-0))] border-b border-zinc-200/40 dark:border-[rgb(var(--border-light))]/20";
  const scrolledClasses =
    "bg-zinc-50/80 dark:bg-[rgb(var(--surface-0))]/80 border-b border-zinc-200/40 dark:border-[rgb(var(--border-light))]/20 backdrop-blur-xl";
  const transparentClasses =
    "bg-transparent dark:bg-transparent border-transparent";

  const getNavClasses = () => {
    if (pathname === "/") {
      if (isMobile && (isOpen || scrolled)) return mobileOpenScrolledClasses;
      return scrolled ? scrolledClasses : transparentClasses;
    }
    return isMobile ? mobileOpenScrolledClasses : scrolledClasses;
  };

  return (
    <>
    <nav className={`${navClasses} ${getNavClasses()}`}>
      <div className="w-full max-w-none px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo Section */}
          <div className="flex-none">
            <Link href="/" className="flex items-center">
              <LogoAnimation />
            </Link>
          </div>

          {/* Navigation Section - Center */}
          <div className="hidden md:flex flex-grow justify-center items-center">
            <NavigationMenu className="flex justify-center w-full">
              <NavigationMenuList className="flex-nowrap items-center">
                {menuItems.map((item) => (
                  <NavigationMenuItem key={item.title}>
                    {item.subItems ? (
                      <NavigationMenuTrigger
                        className="select-none focus:bg-transparent focus-visible:ring-0"
                        onClick={(e) => {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }}
                      >
                        {item.title}
                      </NavigationMenuTrigger>
                    ) : (
                      <NavigationMenuLink asChild>
                        <Link
                          href={item.href}
                          className={navigationMenuTriggerStyle()}
                        >
                          {item.title}
                        </Link>
                      </NavigationMenuLink>
                    )}
                    {item.subItems && (
                      <NavigationMenuContent>
                        <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                          {item.subItems.map((subItem) => (
                            <li key={subItem.title}>
                              <NavigationMenuLink asChild>
                                <Link
                                  href={subItem.href}
                                  className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-hidden transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:bg-zinc-100 dark:focus:bg-zinc-800"
                                >
                                  <div className="text-sm font-medium leading-none">
                                    {subItem.title}
                                  </div>
                                </Link>
                              </NavigationMenuLink>
                            </li>
                          ))}
                        </ul>
                      </NavigationMenuContent>
                    )}
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          {/* Actions Section - Right */}
          <div className="flex-none flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <UserMenu />
            </div>
            {/* <ThemeToggle /> */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden focus:bg-transparent focus-visible:ring-0"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{
              duration: 0.15, // Slightly faster for better performance
              ease: "easeOut",
            }}
            className="fixed inset-x-0 top-16 z-50 bg-zinc-50 dark:bg-[rgb(var(--surface-0))] border-b border-zinc-200/40 dark:border-[rgb(var(--border-light))]/20 shadow-xs md:hidden"
          >
            <div className="px-6 py-4">
              <div className="space-y-2">
                {menuItems.map((item) => (
                  <div key={item.title}>
                    {item.subItems ? (
                      <MobileNavItem
                        item={item}
                        isActive={activeDropdown === item.title}
                        onClick={() => toggleDropdown(item.title)}
                      />
                    ) : (
                      <Link
                        href={item.href}
                        onClick={closeMenu}
                        className="mobile-nav-item block hover:bg-zinc-100 dark:hover:bg-[rgb(var(--surface-1))]"
                      >
                        {item.title}
                      </Link>
                    )}

                    <AnimatePresence initial={false}>
                      {item.subItems && activeDropdown === item.title && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="pl-4 ml-2 border-l border-zinc-200 dark:border-[rgb(var(--border-light))]/50 overflow-hidden"
                        >
                          {item.subItems.map((subItem) => (
                            <Link
                              key={subItem.title}
                              href={subItem.href}
                              onClick={closeMenu}
                              className="mobile-nav-item block"
                            >
                              {subItem.title}
                            </Link>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-[rgb(var(--border-light))]/20">
                <div className="flex items-center justify-between">
                  <UserMenu />
                  {/* <ThemeToggle /> */}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
    {/* Spacer to offset fixed navbar height so page content isn't hidden */}
    <div className="h-16" aria-hidden />
    </>
  );
}

function UserMenu() {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [isAdmin, setIsAdmin] = React.useState(false);

  // Check if user is admin
  React.useEffect(() => {
    if (user) {
      const userEmail = user.emailAddresses[0]?.emailAddress?.toLowerCase();
      const adminEmailsEnv = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
      
      if (userEmail && adminEmailsEnv) {
        const adminEmails = adminEmailsEnv.split(",").map((e) => e.trim().toLowerCase());
        setIsAdmin(adminEmails.includes(userEmail));
      }
    }
  }, [user]);

  const handleSignOut = async () => {
    try {
      await signOut({ redirectUrl: '/' });
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <>
      {isSignedIn ? (
        <div className="flex items-center space-x-2">
          {isAdmin && (
            <Link href="/admin/dashboard">
              <Button
                variant="ghost"
                className="touch-feedback bg-transparent focus:bg-transparent focus-visible:ring-0 flex items-center gap-1.5"
                onClick={(e) => {
                  e.currentTarget.blur();
                }}
              >
                <Shield className="h-4 w-4" />
                <span className="hidden lg:inline">Admin</span>
              </Button>
            </Link>
          )}
          <Link href="/dashboard">
            <Button
              variant="ghost"
              className="touch-feedback bg-transparent focus:bg-transparent focus-visible:ring-0"
              onClick={(e) => {
                e.currentTarget.blur();
              }}
            >
              Dashboard
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="touch-feedback bg-transparent focus:bg-transparent focus-visible:ring-0 h-9 w-9"
            onClick={handleSignOut}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Link href="/signin">
            <Button
              variant="ghost"
              className="button-reset h-9 px-4 py-2 text-sm focus:bg-transparent focus-visible:ring-0"
              onClick={(e) => e.currentTarget.blur()}
            >
              Sign In
            </Button>
          </Link>
          <Link href="/signup">
            <Button
              variant="default"
              className="button-reset h-9 px-4 py-2 text-sm focus:bg-transparent focus-visible:ring-0"
              onClick={(e) => e.currentTarget.blur()}
            >
              Sign Up
            </Button>
          </Link>
        </div>
      )}
    </>
  );
}

/*
function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // Always set theme to dark
  React.useEffect(() => {
    setTheme("dark");
  }, [setTheme]);

  return null;
}
*/

function MobileNavItem({
  item,
  isActive,
  onClick,
}: {
  item: {
    title: string;
    href: string;
    subItems?: { title: string; href: string }[];
  };
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
      className={cn(
        "mobile-nav-item flex items-center justify-between w-full focus:bg-transparent focus-visible:ring-0",
        isActive && "bg-zinc-100 dark:bg-[rgb(var(--surface-1))]"
      )}
    >
      <span>{item.title}</span>
      <ChevronDown
        className={cn(
          "h-5 w-5 transition-transform duration-200",
          isActive && "rotate-180"
        )}
      />
    </button>
  );
}
