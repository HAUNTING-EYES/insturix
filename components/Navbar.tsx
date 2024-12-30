"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown, Sun, Moon } from "lucide-react";
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
import Logo from "@/public/Logo.jpeg";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

const menuItems = [
  {
    title: "Product",
    href: "/products",
    subItems: [
      { title: "Techie Tiwari", href: "/products/techietiwari" },
      { title: "Kund-li", href: "/products/kundli" },
      { title: "Editron", href: "/products/editron" },
      { title: "Shield", href: "/products/shield" },
      { title: "BrainYeed", href: "/products/brainyeed" },
    ],
  },
  {
    title: "About",
    href: "/about",
    subItems: [
      { title: "Our Story", href: "/about/ourstory" },
      { title: "About Logo", href: "/about/logo" },
      { title: "Team", href: "/about/team" },
      { title: "Developers", href: "/about/developers" },
    ],
  },
  {
    title: "Resources",
    href: "/resources",
    subItems: [
      { title: "Tutorials", href: "/resources/tutorials" },
      { title: "Blog", href: "/resources/blog" },
      { title: "Support", href: "/resources/support" },
      { title: "FAQ", href: "/resources/faq" },
      { title: "Community", href: "/resources/community" },
    ],
  },
  {
    title: "Pricing",
    href: "/pricing",
  },
  {
    title: "Contact Us",
    href: "/contactus",
  },
  {
    title: "Contribute",
    href: "/contribute",
  },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [openDropdowns, setOpenDropdowns] = React.useState<string[]>([]);
  const isMobile = useMediaQuery("(max-width: 768px)");

  const toggleDropdown = (title: string) => {
    setOpenDropdowns((prev) =>
      prev.includes(title)
        ? prev.filter((item) => item !== title)
        : [...prev, title]
    );
  };

  const closeMenu = () => {
    setIsOpen(false);
    setOpenDropdowns([]);
  };

  React.useEffect(() => {
    if (!isMobile && isOpen) {
      closeMenu();
    }
  }, [isMobile, isOpen]);

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 w-full",
        "bg-background/80 backdrop-blur-lg",
        "transition-colors duration-300"
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <Image
                src={Logo}
                alt="Logo"
                width={32}
                height={32}
                className="rounded-full"
              />
            </Link>
          </div>
          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? "Close menu" : "Open menu"}
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:space-x-4">
            <NavigationMenu>
              <NavigationMenuList>
                {menuItems.map((item) => (
                  <NavigationMenuItem key={item.title}>
                    {item.subItems ? (
                      <NavigationMenuTrigger>
                        {item.title}
                      </NavigationMenuTrigger>
                    ) : (
                      <Link href={item.href} legacyBehavior passHref>
                        <NavigationMenuLink
                          className={navigationMenuTriggerStyle()}
                        >
                          {item.title}
                        </NavigationMenuLink>
                      </Link>
                    )}
                    {item.subItems && (
                      <NavigationMenuContent>
                        <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                          {item.subItems.map((subItem) => (
                            <li key={subItem.title}>
                              <NavigationMenuLink asChild>
                                <Link
                                  href={subItem.href}
                                  className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
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
          {/* User menu and theme toggle */}
          <div className="hidden md:flex md:items-center md:space-x-2">
            <UserMenu />
            <ThemeToggle />
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
            transition={{ duration: 0.3 }}
            className="md:hidden"
          >
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              {menuItems.map((item) => (
                <div key={item.title}>
                  {item.subItems ? (
                    <button
                      className="w-full text-left px-3 py-2 rounded-md text-base font-medium hover:bg-accent hover:text-accent-foreground focus:outline-none focus:bg-accent focus:text-accent-foreground transition duration-150 ease-in-out"
                      onClick={() => toggleDropdown(item.title)}
                    >
                      <div className="flex items-center justify-between">
                        <span>{item.title}</span>
                        <ChevronDown
                          className={cn(
                            "h-5 w-5 transition-transform duration-200",
                            openDropdowns.includes(item.title) && "rotate-180"
                          )}
                        />
                      </div>
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      className="block px-3 py-2 rounded-md text-base font-medium hover:bg-accent hover:text-accent-foreground focus:outline-none focus:bg-accent focus:text-accent-foreground transition duration-150 ease-in-out"
                      onClick={closeMenu}
                    >
                      {item.title}
                    </Link>
                  )}
                  {item.subItems && openDropdowns.includes(item.title) && (
                    <div className="pl-4">
                      {item.subItems.map((subItem) => (
                        <Link
                          key={subItem.title}
                          href={subItem.href}
                          className="block px-3 py-2 rounded-md text-base font-medium hover:bg-accent hover:text-accent-foreground focus:outline-none focus:bg-accent focus:text-accent-foreground transition duration-150 ease-in-out"
                          onClick={closeMenu}
                        >
                          {subItem.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="pt-4 pb-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center px-5">
                  <UserMenu />
                  <div className="ml-auto">
                    <ThemeToggle />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

function UserMenu() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  return (
    <>
      {isSignedIn ? (
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            className="group inline-flex h-9 w-max items-center justify-center rounded-md px-4 py-2 text-sm "
            onClick={() => {
              router.push("/dashboard");
            }}
          >
            Dashboard
          </Button>
        </div>
      ) : (
        <>
          <Link href="/signin" className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              className="group inline-flex h-9 w-max items-center justify-center rounded-md px-4 py-2 text-sm "
            >
              Sign In
            </Button>
          </Link>
          <Link href="/signup" className="flex items-center space-x-2">
            <Button
              variant="default"
              size="icon"
              className="group inline-flex h-9 w-max items-center justify-center rounded-md px-4 py-2 text-sm "
            >
              Sign Up
            </Button>
          </Link>
        </>
      )}
    </>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label="Toggle theme"
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
