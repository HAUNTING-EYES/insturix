"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X, ChevronRight, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
import Image from "next/image";
// import { useAuth } from "@clerk/nextjs";
import Logo from "@/public/Logo.jpeg";
import Toggle from "./Toggler";

const menuItems = [
  {
    title: "Product",
    href: "/product",
    subItems: [
      { title: "Techie Tiwari", href: "/product/features" },
      { title: "Kund-li", href: "/product/integrations" },
      { title: "Editron", href: "/product/pricing" },
      { title: "Shield", href: "/product/shield" },
      { title: "BrainYeed", href: "/product/brainyeed" },
    ],
  },
  {
    title: "About",
    href: "/about",
    subItems: [
      { title: "Our Story", href: "/solutions/startups" },
      { title: "About Logo", href: "/solutions/enterprise" },
      { title: "Team", href: "/solutions/developers" },
      { title: "Developers", href: "/solutions/developers" },
    ],
  },
  {
    title: "Resources",
    href: "/resources",
    subItems: [
      { title: "Tutorials", href: "/resources/docs" },
      { title: "Blog", href: "/resources/blog" },
      { title: "Resource Hub", href: "/resources/support" },
      { title: "Support", href: "/resources/support" },
      { title: "FAQ", href: "/resources/faq" },
      {title : "Community", href: "/resources/community"}
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

  const toggleDropdown = (title: string) => {
    setOpenDropdowns((prev) =>
      prev.includes(title)
        ? prev.filter((item) => item !== title)
        : [...prev, title]
    );
  };
  // const { isSignedIn } = useAuth();

  return (
    <>
      <nav className="flex items-center justify-between w-full sticky top-0 z-50 p-4 backdrop-blur-lg bg-opacity-80 bg-gray-800/10">
        {/* Mobile Layout */}
        <AnimatePresence>
          <div className="flex items-center w-full md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
              className="z-50 absolute left-4"
            >
              {isOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
              <span className="sr-only">
                {isOpen ? "Close menu" : "Open menu"}
              </span>
            </Button>

            <Link
              href="/"
              className="flex items-center justify-center flex-1 mx-auto"
            >
              <Image src={Logo} alt="Logo" className="h-8 w-8" />
            </Link>

            <Button variant="ghost" size="sm" className="absolute right-4">
              Sign In
            </Button>
          </div>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background z-40 overflow-y-auto"
            >
              <div className="flex flex-col min-h-screen">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                  <br />
                </div>

                {/* Menu Items */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex-1"
                >
                  <div className="p-6 space-y-4">
                    {menuItems.map((item, index) => (
                      <motion.div
                        key={item.title}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 20, opacity: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <div
                          className="flex items-center justify-between py-2 text-xl font-semibold"
                          onClick={() =>
                            item.subItems && toggleDropdown(item.title)
                          }
                        >
                          <span>{item.title}</span>
                          {item.subItems ? (
                            <ChevronDown
                              className={`h-5 w-5 text-muted-foreground transition-transform ${
                                openDropdowns.includes(item.title)
                                  ? "transform rotate-180"
                                  : ""
                              }`}
                            />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <AnimatePresence>
                          {item.subItems &&
                            openDropdowns.includes(item.title) && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="ml-4 mt-2 space-y-2"
                              >
                                {item.subItems.map((subItem) => (
                                  <Link
                                    key={subItem.title}
                                    href={subItem.href}
                                    onClick={() => setIsOpen(false)}
                                    className="block py-2 text-lg hover:opacity-70 transition-opacity"
                                  >
                                    {subItem.title}
                                  </Link>
                                ))}
                              </motion.div>
                            )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop Layout */}
        <div className="hidden md:flex md:items-center md:justify-between md:w-full">
          <Link href="/" className="mr-4">
            <Image src={Logo} alt="Logo" className="h-8 w-8" />
          </Link>
          <NavigationMenu>
            <NavigationMenuList className="hidden md:flex md:space-x-4">
              {menuItems.map((item) => (
                <NavigationMenuItem key={item.title}>
                  {item.subItems ? (
                    <NavigationMenuTrigger className="relative z-10 hover:bg-transparent">
                      {item.title}
                    </NavigationMenuTrigger>
                  ) : (
                    <Link href={item.href} legacyBehavior passHref>
                      <NavigationMenuLink
                        className={`${navigationMenuTriggerStyle()} hover:bg-transparent`}
                      >
                        {item.title}
                      </NavigationMenuLink>
                    </Link>
                  )}
                  {item.subItems && (
                    <NavigationMenuContent className="relative z-0">
                      <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-[.75fr_1fr]">
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

          <div className="flex space-x-2">
            <Button
              variant="ghost"
              className="hidden md:inline-flex hover:bg-transparent focus:bg-transparent"
            >
              <Link href="/signin">Sign In</Link>
            </Button>
            <Button
              variant="default"
              className="hidden md:inline-flex hover:bg-primary focus:bg-primary"
            >
              <Link href="/signup">Sign Up</Link>
            </Button>
          </div>
          <Toggle />
        </div>
      </nav>
    </>
  );
}
