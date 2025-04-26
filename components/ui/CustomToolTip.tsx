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
import { ThemeToggle } from "@/components/ThemeForToolTip";
import NotSignedIn from "../NotSignedup";
import { PaymentHistoryDialog } from "@/components/PaymentDialog";
import { PlanHistoryDialog } from "@/components/PlanHistoryDialog";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

// User type interface from MongoDB
interface Payment {
  date: Date;
  time: string;
  amount: number;
  payment_id: string;
  phone_number: string;
  status?: string;
}

// Plan type interface
interface Plan {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date | null;
  price: number;
  status: "active" | "expired" | "canceled";
  features?: string[];
}

interface UserData {
  id: string;
  clerkUserId: string;
  email: string;
  userType: string;
  payments: Payment[];
  plans?: Plan[];
  notifications?: number;
}

// API function to fetch user data
const fetchUserData = async (): Promise<UserData> => {
  const response = await fetch("/api/user");
  if (!response.ok) {
    throw new Error("Failed to fetch user data");
  }
  return response.json();
};

export default function UserDropdown({
  onSettingsClick,
  onUpgradeClick,
}: {
  onSettingsClick: () => void;
  onUpgradeClick: () => void;
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // State for dialogs
  const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false);
  const [planHistoryOpen, setPlanHistoryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "preferences">(
    "account"
  );

  // Use React Query to fetch user data with better error handling and loading states
  const {
    data: userData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["userData", user?.id],
    queryFn: fetchUserData,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    refetchOnWindowFocus: false,
  });

  // Handle click outside to close dropdown
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

  // Handle escape key to close dropdown
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

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

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

  // Sample data for demonstration
  const samplePayments: Payment[] = userData?.payments || [
    {
      date: new Date("2023-12-15"),
      time: "14:30:22",
      amount: 29.99,
      payment_id: "PAY-123456789",
      phone_number: "+1 (555) 123-4567",
      status: "Completed",
    },
    {
      date: new Date("2023-11-15"),
      time: "10:15:45",
      amount: 29.99,
      payment_id: "PAY-987654321",
      phone_number: "+1 (555) 123-4567",
      status: "Completed",
    },
    {
      date: new Date("2023-10-15"),
      time: "09:22:10",
      amount: 29.99,
      payment_id: "PAY-456789123",
      phone_number: "+1 (555) 123-4567",
      status: "Completed",
    },
  ];

  const samplePlans: Plan[] = userData?.plans || [
    {
      id: "plan-1",
      name: "Pro Plan",
      startDate: new Date("2023-12-15"),
      endDate: null,
      price: 29.99,
      status: "active",
      features: ["Feature 1", "Feature 2", "Feature 3"],
    },
    {
      id: "plan-2",
      name: "Basic Plan",
      startDate: new Date("2023-06-15"),
      endDate: new Date("2023-12-14"),
      price: 9.99,
      status: "expired",
      features: ["Feature 1", "Feature 2"],
    },
  ];

  if (!user) return <NotSignedIn />;

  const userType = userData?.userType || "User";
  const isPremium = userType.toLowerCase().includes("premium");
  const notifications = userData?.notifications || 0;

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Dropdown Trigger Button */}
      <motion.button
        whileHover={{ backgroundColor: "rgba(113, 113, 122, 0.2)" }}
        whileTap={{ scale: 0.98 }}
        onClick={toggleDropdown}
        className={`flex items-center justify-between w-full overflow-hidden p-2 rounded-lg ${
          isOpen ? "bg-zinc-700" : "bg-zinc-800"
        } transition-all duration-200 text-white`}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Avatar className="h-8 w-8 border border-white/10">
              <AvatarImage
                src={user.imageUrl || undefined}
                alt={user.fullName || "User"}
              />
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
                {user.firstName?.charAt(0) || user.username?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            {notifications > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-zinc-800">
                {notifications > 9 ? "9+" : notifications}
              </span>
            )}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium truncate max-w-[140px]">
              {user.username}
            </p>
            <div className="flex items-center gap-1">
              <p className="text-xs text-zinc-400 truncate max-w-[140px]">
                {isLoading
                  ? "Loading..."
                  : isError
                    ? "Error loading data"
                    : userType}
              </p>
              {isPremium && (
                <Badge
                  variant="outline"
                  className="h-4 border-purple-500/50 bg-purple-500/10 px-1 text-[10px] font-medium text-purple-400"
                >
                  PRO
                </Badge>
              )}
            </div>
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-zinc-400"
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </motion.button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-2 w-full bg-zinc-900 border border-white/10 rounded-lg overflow-hidden shadow-lg z-10"
          >
            <div className="p-3 text-white">
              {/* User info header */}
              <div className="flex items-center gap-3 px-3 py-2 mb-3">
                <Avatar className="h-10 w-10 border border-white/10">
                  <AvatarImage
                    src={user.imageUrl || undefined}
                    alt={user.fullName || "User"}
                  />
                  <AvatarFallback className="bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
                    {user.firstName?.charAt(0) ||
                      user.username?.charAt(0) ||
                      "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {user.fullName || user.username}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {user.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex mb-3 border-b border-white/10">
                <button
                  onClick={() => setActiveTab("account")}
                  className={`flex-1 py-2 text-sm font-medium ${
                    activeTab === "account"
                      ? "text-white border-b-2 border-purple-500"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Account
                </button>
                <button
                  onClick={() => setActiveTab("preferences")}
                  className={`flex-1 py-2 text-sm font-medium ${
                    activeTab === "preferences"
                      ? "text-white border-b-2 border-purple-500"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Preferences
                </button>
              </div>

              {/* Tab content */}
              {activeTab === "account" ? (
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
                          className="w-full flex items-center gap-2 p-2 rounded-md text-left text-white transition-colors"
                          type="button"
                        >
                          <Settings className="w-4 h-4 text-purple-400" />
                          <span className="text-sm">Settings</span>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
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
                          className="w-full flex items-center gap-2 p-2 rounded-md text-left text-white transition-colors"
                          type="button"
                        >
                          <CreditCard className="w-4 h-4 text-green-400" />
                          <span className="text-sm">Payment History</span>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
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
                          className="w-full flex items-center gap-2 p-2 rounded-md text-left text-white transition-colors"
                          type="button"
                        >
                          <UserCog className="w-4 h-4 text-blue-400" />
                          <span className="text-sm">Plan History</span>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p className="text-xs">
                          View your subscription plan history
                        </p>
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
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-2 p-2 rounded-md text-left text-red-500 transition-colors"
                          type="button"
                        >
                          <LogOut className="w-4 h-4" />
                          <span className="text-sm">Sign Out</span>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p className="text-xs">Sign out of your account</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Theme</label>
                      <ThemeToggle />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Select>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="English" />
                      </SelectTrigger>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-zinc-900 border-t border-white/10">
              <motion.button
                whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.9)" }}
                whileTap={{ scale: 0.98 }}
                onClick={handleUpgradeClick}
                className="w-full py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 rounded-md text-white font-medium text-sm transition-all"
                type="button"
                disabled
              >
                Comming Soon
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Payment History Dialog */}
      <PaymentHistoryDialog
        open={paymentHistoryOpen}
        onOpenChange={setPaymentHistoryOpen}
        payments={samplePayments}
      />
      {/* Plan History Dialog */}
      <PlanHistoryDialog
        open={planHistoryOpen}
        onOpenChange={setPlanHistoryOpen}
        plans={samplePlans}
      />
    </div>
  );
}
