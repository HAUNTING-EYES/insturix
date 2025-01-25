"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, Sparkles, Shield, Coffee } from "lucide-react";
import DonationDialog from "./DonationDialog";
import { useToast } from "@/hooks/use-toast";

const donationOptions = [
    {
        amount: 399,
        icon: Coffee,
        title: "Buy us a coffee",
        description: "Support our daily grind with a cup of motivation",
        color: "bg-amber-500/10 dark:bg-amber-500/5",
        iconColor: "text-amber-500",
        popularTag: false,
    },
    {
        amount: 799,
        icon: Heart,
        title: "Show Some Love",
        description: "Help us maintain and improve our platform",
        color: "bg-red-500/10 dark:bg-red-500/5",
        iconColor: "text-red-500",
        popularTag: true,
    },
    {
        amount: 1999,
        icon: Shield,
        title: "Become a Guardian",
        description: "Ensure our platform's stability and security",
        color: "bg-blue-500/10 dark:bg-blue-500/5",
        iconColor: "text-blue-500",
        popularTag: false,
    },
    {
        amount: 3999,
        icon: Sparkles,
        title: "Power Innovation",
        description: "Fuel new features and exciting developments",
        color: "bg-purple-500/10 dark:bg-purple-500/5",
        iconColor: "text-purple-500",
        popularTag: false,
    },
];

export default function DonationPage() {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const { toast } = useToast();

    const handleDonate = (amount: number) => {
        console.log(amount);

        toast({
            title: "Work in Progress",
            description: "Payment integration coming soon! Thank you for your interest.",
            duration: 5000,
        });
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative flex items-center">
            {/* Background pattern */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 opacity-[0.03]">
                    <svg className="w-full h-full">
                        <pattern
                            id="grid"
                            width="32"
                            height="32"
                            patternUnits="userSpaceOnUse"
                        >
                            <path
                                d="M0 .5H32M.5 0V32"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1"
                            />
                        </pattern>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                </div>
            </div>

            <div className="container mx-auto px-4 py-8 md:py-16 relative">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="max-w-5xl mx-auto"
                >
                    <h1 className="text-2xl md:text-3xl font-semibold mb-2 relative">
                        Support Our Mission
                        <div className="absolute -top-1.5 -left-3 w-12 h-12 bg-blue-500/10 rounded-full blur-xl" />
                    </h1>
                    <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 mb-8 md:mb-12">
                        Your support helps us create better tools and experiences for everyone.
                        Choose a contribution that feels right for you.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                        {donationOptions.map((option, index) => (
                            <motion.div
                                key={option.title}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 + 0.2 }}
                            >
                                <motion.div
                                    whileHover={{ scale: 1.02, y: -4 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="h-full relative"
                                >
                                    <Card className="p-4 md:p-6 h-full bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs border-zinc-200/40 dark:border-[rgb(var(--border-light))]/20 transition-all duration-300 group">
                                        {option.popularTag && (
                                            <div className="absolute -top-3 -right-2 bg-blue-500 text-white text-xs py-1 px-3 rounded-full shadow-lg">
                                                Popular
                                            </div>
                                        )}
                                        <div
                                            className={`w-12 h-12 rounded-lg ${option.color} flex items-center justify-center mb-4`}
                                        >
                                            <option.icon className={`w-6 h-6 ${option.iconColor}`} />
                                        </div>
                                        <h3 className="text-lg font-medium mb-2 group-hover:text-blue-500 transition-colors">
                                            {option.title}
                                        </h3>
                                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                                            {option.description}
                                        </p>
                                        <Button
                                            className="w-full bg-zinc-900 hover:bg-zinc-800 dark:bg-blue-600 dark:hover:bg-blue-500 transition-colors duration-300"
                                            onClick={() => handleDonate(option.amount)}
                                        >
                                            Donate ₹{option.amount}
                                        </Button>
                                    </Card>
                                </motion.div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Custom amount section */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="mt-8 text-center"
                    >
                        <Button
                            variant="ghost"
                            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
                            onClick={() => setIsDialogOpen(true)}
                        >
                            Enter custom amount
                        </Button>
                    </motion.div>
                </motion.div>
            </div>

            {/* Custom amount dialog */}
            <DonationDialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onDonate={handleDonate}
            />

            {/* Decorative gradient orbs */}
            <div className="fixed top-1/4 -left-48 w-96 h-96 bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-3xl" />
            <div className="fixed bottom-1/4 -right-48 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl" />
        </div>
    );
}