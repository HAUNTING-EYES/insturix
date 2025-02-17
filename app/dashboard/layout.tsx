"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    return (
        <>
            <DashboardSidebar />
            <main className="min-h-screen bg-zinc-950/95 backdrop-blur-xl lg:pl-[240px]">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={pathname}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="min-h-screen bg-transparent"
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </main>
        </>
    );
}