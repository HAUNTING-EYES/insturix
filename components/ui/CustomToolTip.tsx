"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  LogOut,
  Settings,
  UserCog,
} from "lucide-react";
import { useUser, useClerk } from "@clerk/nextjs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import NotSignedIn from "../NotSignedup";
import { PlanCancellationDialog } from "@/components/PlanCancellationDialog";
import { cn } from "@/lib/utils";
import { getPlanDisplayName } from "@/lib/planUtils";

import { useUserInitialization } from "../dashboard/UserInitializationProvider";
import ManagePlanDialog from "@/components/upgrade-plan/ManagePlanDialog";

export default function UserDropdown({
  onSettingsClick,
  onUpgradeClick,
  isCollapsed = false,
  onDialogStateChange,
}: {
  onSettingsClick: () => void;
  onUpgradeClick: () => void;
  isCollapsed?: boolean;
  onDialogStateChange?: (isOpen: boolean) => void;
}) {
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [planCancellationOpen, setPlanCancellationOpen] = useState(false);
  const [managePlanOpen, setManagePlanOpen] = useState(false);

  const { user: userData, isLoading } = useUserInitialization();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscapeKey);
    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, []);

  // Close dropdown when sidebar collapses
  useEffect(() => {
    if (isCollapsed && isOpen) {
      setIsOpen(false);
    }
  }, [isCollapsed, isOpen]);

  // Notify parent when dialogs are opened/closed
  useEffect(() => {
    const isAnyDialogOpen = planCancellationOpen;
    onDialogStateChange?.(isAnyDialogOpen);
  }, [planCancellationOpen, onDialogStateChange]);

  const handleSignOut = () => {
    signOut();
    setIsOpen(false);
  };

  const handleSettingsClick = () => {
    onSettingsClick();
    setIsOpen(false);
  };

  const handleUpgradeClick = () => {
    onUpgradeClick();
    setIsOpen(false);
  };

  const handleManagePlanClick = () => {
    setManagePlanOpen(true);
    setIsOpen(false);
  };

  if (!clerkUser) return <NotSignedIn />;
  if (isLoading || !userData) return null; // Return null if still loading or userData is null

  const planName = getPlanDisplayName(userData.currentPlan?.name) || "Free";
  const isPremium = planName.toLowerCase().includes("premium");

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <motion.button
        whileHover={{
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          scale: 1.02
        }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center w-full overflow-hidden rounded-lg transition-all duration-300 text-white",
          isCollapsed ? "justify-center p-2" : "justify-between p-2 gap-2",
          isOpen ? "bg-white/10" : "bg-transparent"
        )}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
        layout
      >
        <motion.div
          className={cn("flex items-center", isCollapsed ? "justify-center" : "gap-2")}
          layout
        >
          <motion.div
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.2 }}
          >
            <Avatar className="border border-white/20 h-8 w-8">
              <AvatarImage
                src={clerkUser.imageUrl || undefined}
                alt={clerkUser.fullName || "User"}
              />
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-indigo-600 text-white text-sm">
                {clerkUser.firstName?.charAt(0) || clerkUser.username?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          
          <AnimatePresence>
            {!isCollapsed && (
              <motion.div
                className="text-left min-w-0 flex-1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                layout
              >
                <motion.p
                  className="text-sm font-medium truncate"
                  layout
                >
                  {clerkUser.username}
                </motion.p>
                <motion.div
                  className="flex items-center gap-1"
                  layout
                >
                  <motion.p
                    className="text-[11px] text-white/70 truncate"
                    layout
                  >
                    {isLoading ? "Loading..." : planName}
                  </motion.p>
                  <AnimatePresence>
                    {isPremium && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Badge
                          variant="outline"
                          className="h-4 border-purple-500/50 bg-purple-500/20 px-1 text-[10px] font-medium text-purple-300"
                        >
                          PRO
                        </Badge>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: 1,
                scale: 1,
                rotate: isOpen ? 180 : 0
              }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              className="text-white/70"
            >
              <ChevronDown className="w-4 h-4" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1],
              layout: { duration: 0.2 }
            }}
            className="absolute bottom-full left-0 mb-2 w-full bg-[#131312] border border-[#282724] rounded-lg overflow-hidden shadow-xl z-50 backdrop-blur-sm"
            style={{
              minWidth: isCollapsed ? "240px" : "100%",
              transformOrigin: "bottom center"
            }}
            layout
          >
            <motion.div
              className="p-3 text-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.15 }}
            >
              <div className="flex items-center gap-3 px-3 py-2 mb-3">
                <Avatar className="h-10 w-10 border border-white/10">
                  <AvatarImage
                    src={clerkUser.imageUrl || undefined}
                    alt={clerkUser.fullName || "User"}
                  />
                  <AvatarFallback className="bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
                    {clerkUser.firstName?.charAt(0) ||
                      clerkUser.username?.charAt(0) ||
                      "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {clerkUser.fullName || clerkUser.username}
                  </p>
                  <p className="text-[11px] text-[#7A776E]">
                    {clerkUser.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          whileHover={{
                            backgroundColor: "rgba(255, 255, 255, 0.1)",
                          }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleSettingsClick}
                          className="w-full flex items-center gap-3 p-2 rounded-lg text-left text-white transition-all duration-200 hover:bg-white/10"
                          type="button"
                        >
                          <Settings className="w-4 h-4 text-white/80" />
                          <span className="text-sm font-medium">Settings</span>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-[#131312] border-[#282724] text-[#ECE9E1]">
                        <p className="text-[11px]">Manage your account settings</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleManagePlanClick}
                          className="w-full flex items-center gap-3 p-2 rounded-lg text-left text-white transition-all duration-200 hover:bg-white/10"
                          type="button"
                        >
                          <UserCog className="w-4 h-4 text-white/80" />
                          <span className="text-sm font-medium">Manage Plan</span>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-[#131312] border-[#282724] text-[#ECE9E1]">
                        <p className="text-[11px]">View and manage your subscription plan</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          whileHover={{
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                          }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-3 p-2 rounded-lg text-left text-red-400 transition-all duration-200 hover:bg-red-500/10"
                          type="button"
                        >
                          <LogOut className="w-4 h-4" />
                          <span className="text-sm font-medium">Sign Out</span>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-[#131312] border-[#282724] text-[#ECE9E1]">
                        <p className="text-[11px]">Sign out of your account</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
            </motion.div>

            <div className="p-3 bg-[#131312] border-t border-[#282724]">
              <motion.button
                whileHover={{ scale: 1.07 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleUpgradeClick}
                className="w-full py-2.5 bg-gold hover:bg-gold-hover border border-gold text-gold-contrast font-medium text-sm rounded-lg shadow-lg overflow-hidden relative group transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gold/70"
                type="button"
              >
                <span className="relative z-10 text-gold-contrast font-extrabold text-[14px] select-none">
                  Upgrade Plan
                </span>
                {/* Always-on shine */}
                <span className="absolute left-[-75%] top-0 h-full w-3/4 bg-gradient-to-r from-white/90 via-yellow-200 to-transparent blur-sm opacity-40 animate-shine pointer-events-none" />
                {/* Faster shine on hover */}
                <span className="absolute left-[-75%] top-0 h-full w-3/4 bg-gradient-to-r from-white/90 via-yellow-200 to-transparent blur opacity-90 opacity-0 group-hover:opacity-100 group-hover:animate-shine-fast pointer-events-none transition-opacity duration-200" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PlanCancellationDialog
        open={planCancellationOpen}
        onOpenChange={setPlanCancellationOpen}
        currentPlan={userData?.currentPlan?.name || "free"}
        currentPlanPrice={userData?.currentPlan?.price || 0}
      />

      <ManagePlanDialog
        open={managePlanOpen}
        onOpenChange={setManagePlanOpen}
        plans={userData?.planHistory || []}
        currentPlan={userData?.currentPlan || undefined}
      />
    </div>
  );
}
