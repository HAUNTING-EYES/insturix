"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  LogOut,
  Settings,
  UserCog,
  CreditCard,
} from "lucide-react";
import { useUser, useClerk } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import NotSignedIn from "../NotSignedup";
import { PaymentHistoryDialog } from "@/components/PaymentDialog";
import { PlanHistoryDialog } from "@/components/PlanHistoryDialog";
import { PlanCancellationDialog } from "@/components/PlanCancellationDialog";
import { cn } from "@/lib/utils";
import { getPlanDisplayName } from "@/lib/planUtils";

interface Payment {
  date: Date;
  time: string;
  amount: number;
  payment_id: string;
  phone_number: string;
  status?: string;
}

interface Plan {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
  price: number;
  status: "active" | "expired" | "canceled";
  features: string[];
}

interface UserData {
  id: string;
  clerkUserId: string;
  email: string;
  payments: Payment[];
  currentPlan: Plan;
}

import { useUserInitialization } from "../dashboard/UserInitializationProvider";

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
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [planHistoryOpen, setPlanHistoryOpen] = useState(false);
  const [planCancellationOpen, setPlanCancellationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "preferences">("account");

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
    const isAnyDialogOpen = paymentHistoryOpen || planHistoryOpen || planCancellationOpen;
    onDialogStateChange?.(isAnyDialogOpen);
  }, [paymentHistoryOpen, planHistoryOpen, planCancellationOpen, onDialogStateChange]);

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

  const handlePaymentHistoryClick = () => {
    setPaymentHistoryOpen(true);
    setIsOpen(false);
  };

  const handlePlanHistoryClick = () => {
    setPlanHistoryOpen(true);
    setIsOpen(false);
  };

  const handleCancelPlanClick = () => {
    setPlanCancellationOpen(true);
    setIsOpen(false);
  };

  if (!clerkUser) return <NotSignedIn />;

  const planName = getPlanDisplayName(userData?.currentPlan?.name) || "Free";
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
                    className="text-xs text-white/70 truncate"
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
            className="absolute bottom-full left-0 mb-2 w-full bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-xl z-50 backdrop-blur-sm"
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
                  <p className="text-xs text-zinc-400">
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
                      <TooltipContent side="right" className="bg-zinc-800 border-white/10">
                        <p className="text-xs">Manage your account settings</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          whileHover={{
                            backgroundColor: "rgba(255, 255, 255, 0.1)",
                          }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handlePaymentHistoryClick}
                          className="w-full flex items-center gap-3 p-2 rounded-lg text-left text-white transition-all duration-200 hover:bg-white/10"
                          type="button"
                        >
                          <CreditCard className="w-4 h-4 text-white/80" />
                          <span className="text-sm font-medium">Payment History</span>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-zinc-800 border-white/10">
                        <p className="text-xs">View your payment history</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          whileHover={{
                            backgroundColor: "rgba(255, 255, 255, 0.1)",
                          }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handlePlanHistoryClick}
                          className="w-full flex items-center gap-3 p-2 rounded-lg text-left text-white transition-all duration-200 hover:bg-white/10"
                          type="button"
                        >
                          <UserCog className="w-4 h-4 text-white/80" />
                          <span className="text-sm font-medium">Plan History</span>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-zinc-800 border-white/10">
                        <p className="text-xs">
                          View your subscription plan history
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Cancel Plan Button - Only show for paid plans */}
                  {planName !== "Free" && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.button
                            whileHover={{
                              backgroundColor: "rgba(239, 68, 68, 0.1)",
                            }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleCancelPlanClick}
                            className="w-full flex items-center gap-3 p-2 rounded-lg text-left text-red-400 transition-all duration-200 hover:bg-red-500/10"
                            type="button"
                          >
                            <UserCog className="w-4 h-4" />
                            <span className="text-sm font-medium">Cancel Plan</span>
                          </motion.button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-zinc-800 border-white/10">
                          <p className="text-xs">
                            Cancel your current subscription
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

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
                      <TooltipContent side="right" className="bg-zinc-800 border-white/10">
                        <p className="text-xs">Sign out of your account</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
            </motion.div>

            <div className="p-3 bg-zinc-900 border-t border-white/10">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleUpgradeClick}
                className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 rounded-lg text-white font-medium text-sm transition-all duration-200 shadow-lg hover:shadow-xl"
                type="button"
              >
                Upgrade Plan
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PaymentHistoryDialog
        open={paymentHistoryOpen}
        onOpenChange={setPaymentHistoryOpen}
        payments={userData?.payments || []}
      />

      <PlanHistoryDialog
        open={planHistoryOpen}
        onOpenChange={setPlanHistoryOpen}
        plans={userData ? [{ ...userData.currentPlan, id: "current" }] : []}
      />

      <PlanCancellationDialog
        open={planCancellationOpen}
        onOpenChange={setPlanCancellationOpen}
        currentPlan={userData?.currentPlan?.name || "free"}
        currentPlanPrice={userData?.currentPlan?.price || 0}
      />
    </div>
  );
}
