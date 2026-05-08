"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import useClickatronStore from "@/stores/useCanvasStore";
import { Button } from "@/components/ui/button";
import { CreditCostBadge } from "@/components/shared/CreditCostBadge";

export function CanvasIdeaInput() {
  const router = useRouter();
  const { toast } = useToast();
  const createSession = useClickatronStore((state) => state.createSession);

  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    setIsLoading(true);

    try {
      const formData = new FormData();
      // Send empty data to create a blank project
      const result = await createSession(formData);

      if (result && result.sessionId) {
        router.push(`/dashboard/clickatron/lab/${result.sessionId}`);
      } else {
        throw new Error("Session ID not returned");
      }
    } catch (error) {
      console.error("Failed to create session:", error);
      toast({
        title: "Failed to start session",
        description:
          "Could not create a new Thumbnail session. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <Card className="relative bg-zinc-950/40 border-zinc-800/80 backdrop-blur-xl overflow-hidden group">
      <CardContent className="relative p-12 flex flex-col items-center justify-center text-center overflow-hidden min-h-[300px]">
        {/* Animated background effects */}
        <div className="absolute inset-0 bg-linear-to-br from-purple-500/10 via-transparent to-blue-500/10 opacity-30 group-hover:opacity-50 transition-opacity duration-500" />
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-purple-600/10 blur-[100px] rounded-full animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full animate-pulse" />

        <motion.div
          className="relative z-10 space-y-8 max-w-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-linear-to-br from-purple-500/20 to-blue-500/20 ring-1 ring-white/10 mb-2 transform group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500">
              <Sparkles className="h-10 w-10 text-purple-400" />
            </div>

            <h2 className="text-3xl font-bold text-zinc-100 tracking-tight">
              Ready to create something amazing?
            </h2>

            <p className="text-zinc-400 text-base">
              Start a new project and use our AI-powered canvas to design
              stunning thumbnails in minutes.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <Button
              onClick={handleSubmit}
              disabled={isLoading}
              className="relative h-16 px-10 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-lg font-bold rounded-2xl transition-all duration-300 shadow-[0_0_40px_-10px_rgba(147,51,234,0.5)] hover:shadow-[0_0_50px_-5px_rgba(147,51,234,0.6)] hover:scale-105 active:scale-95 disabled:opacity-70 group/btn overflow-hidden"
            >
              <div className="absolute inset-0 bg-linear-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite] pointer-events-none" />
              {isLoading ? (
                <>
                  <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                  Initializing Lab...
                </>
              ) : (
                <>
                  <Plus className="mr-3 h-6 w-6" />
                  Create New Project
                </>
              )}
            </Button>

            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <CreditCostBadge
                service="clickatron"
                action="variation"
                variant="tooltip"
              />
              <span>•</span>
              <span>Unlimited variations per project</span>
            </div>
          </div>
        </motion.div>
      </CardContent>

      <style jsx global>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </Card>
  );
}
