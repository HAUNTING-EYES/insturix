"use client";

import { useUser, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";
import { Home, Settings, CreditCard, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogOverlay,
} from "@/components/ui/dialog";
import { UserProfile } from "@clerk/nextjs";
import Image from "next/image";

export default function DashboardSidebar() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const products = [
    { name: "Alyzitron", path: "/dashboard/alyzitron" },
    { name: "Editron", path: "/dashboard/editron" },
    { name: "Kundli", path: "/dashboard/kundli" },
    { name: "Meditron", path: "/dashboard/meditron" },
    { name: "Shield", path: "/dashboard/shield" },
    { name: "ThinkForge", path: "/dashboard/thinkforge" },
    { name: "Musitron", path: "/dashboard/musitron" },
  ];

  return (
    <>
      <div className="lg:hidden fixed top-4 left-4 z-[100]">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg bg-zinc-900 hover:bg-white/10 transition-colors translate-y-[-5px]"
          aria-label="Toggle sidebar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {isOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      <nav
        style={{ willChange: "transform" }}
        className={`
                fixed top-0 left-0 bottom-0 h-[100dvh] w-[85vw] sm:w-[280px] lg:w-[240px]
                bg-zinc-900 border-r border-white/10
                flex flex-col z-[95]
                transition-all duration-300 ease-in-out
                ${
                  isOpen
                    ? "translate-x-0 opacity-100"
                    : "-translate-x-full opacity-0 lg:translate-x-0 lg:opacity-100"
                }
            `}
      >
        {/* Logo section */}
        <div className="h-16 flex items-center px-4 border-b border-white/10">
          <Link
            href="/"
            className={`font-bold text-lg logotext flex items-center justify-center h-full`}
          >
            INSTURANCE
          </Link>
        </div>

        {/* Navigation section */}
        <div className="flex-1 overflow-y-auto py-4">
          <ul className="px-4 space-y-2">
            <li key="Dashboard">
              <Link
                href="/dashboard"
                prefetch={true}
                className={`flex items-center px-4 py-2.5 rounded-lg w-full transition-all duration-200 border border-white/10 text-white hover:bg-white/10`}
                onClick={() => setIsOpen(false)}
              >
                <Home className="h-5 w-5 mr-2" />
                <span className="text-sm font-medium tracking-wide text-white">
                  Overview
                </span>
              </Link>
            </li>
            <div className="h-px bg-white/10 my-2"></div>
            {products.map((product) => (
              <li key={product.name}>
                <Link
                  href={product.path}
                  prefetch={true}
                  className={`flex items-center px-4 py-2.5 rounded-lg w-full transition-all duration-200 text-white/80 hover:bg-white/10 hover:text-white hover:translate-x-1`}
                  onClick={() => setIsOpen(false)}
                >
                  <span className="text-sm font-medium tracking-wide text-white">
                    {product.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Profile section */}
        {user && (
          <div className="border-t border-white/10 p-4">
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger className="w-full focus-visible:outline-none">
                <div className="flex items-center gap-4 py-2 px-3 rounded-lg hover:bg-white/5 transition-colors">
                  {user.imageUrl && (
                    <Image
                      src={user.imageUrl}
                      alt={user.username || "Profile"}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate primtext text-left">
                      @{user.username}
                    </p>
                    <p className="text-xs text-muted-foreground truncate text-left">
                      {user.primaryEmailAddress?.emailAddress}
                    </p>
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 z-[100] mb-1"
                align="center"
                sideOffset={-190}
              >
                <DropdownMenuItem
                  onClick={() => {
                    setDropdownOpen(false);
                    setIsSettingsOpen(true);
                  }}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setDropdownOpen(false);
                    setIsUpgradeOpen(true);
                  }}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  <span>Upgrade Plan</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setDropdownOpen(false);
                    signOut();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4 text-red-400" />
                  <span className="text-red-400">Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </nav>
      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-[30] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setIsOpen(false)}
      />

      {/* Dialogs */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogOverlay className="!z-[150]" />
        <DialogContent className="max-w-5xl w-[90vw] h-[90vh] overflow-hidden !duration-200 !transform-none data-[state=open]:!animate-in data-[state=closed]:!animate-out data-[state=closed]:!fade-out-0 data-[state=open]:!fade-in-0 !z-[200]">
          <DialogHeader>
            <DialogTitle>User Settings</DialogTitle>
          </DialogHeader>
          <div className="flex overflow-hidden justify-center items-center">
            <UserProfile
              appearance={{
                elements: {
                  rootBox: "w-full h-full",
                  card: "w-full h-full border-0 shadow-none",
                },
              }}
              routing="hash"
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen}>
        <DialogOverlay className="!z-[150]" />
        <DialogContent className="!duration-200 !transform-none data-[state=open]:!animate-in data-[state=closed]:!animate-out data-[state=closed]:!fade-out-0 data-[state=open]:!fade-in-0 !z-[200]">
          <DialogHeader>
            <DialogTitle>Upgrade Plan</DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <p className="text-center text-muted-foreground">
              Upgrade options coming soon...
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
