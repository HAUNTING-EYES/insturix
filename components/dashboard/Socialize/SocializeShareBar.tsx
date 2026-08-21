"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import {
  Copy,
  Check,
  Share2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface SocializeShareBarProps {
  uniqueUsername: string;
  onShare?: (platform: string) => void;
  className?: string;
}

export function SocializeShareBar({
  uniqueUsername,
  onShare,
  className,

}: SocializeShareBarProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("link");

  const shareUrl = `https://insturix.com/profile/${uniqueUsername}`;

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (copied) {
      timeout = setTimeout(() => setCopied(false), 2000);
    }
    return () => clearTimeout(timeout);
  }, [copied]);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    onShare?.("copy");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "p-5 rounded-[12px] border-none shadow-none",
        "transition-all duration-300 ease-in-out",
        expanded ? "mb-4" : "mb-8",
        className
      )}
      style={{ backgroundColor: '#0F0F0E' }}
    >
      <div className="flex flex-col space-y-4">
        {/* Main bar with link and copy button */}
        <div className="flex items-center justify-between gap-4 flex-wrap md:flex-nowrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="p-1.5 rounded-full" style={{ backgroundColor: '#D4A652' }}>
              <Share2 className="w-4 h-4" style={{ color: '#0B0B0A' }} />
            </div>
            <span className="font-medium" style={{ color: '#EAE9E5' }}>Your link is live:</span>
            <div className="relative flex-1 min-w-0 group">
              <Link
                href={shareUrl}
                className="hover:text-[#D4A652] font-medium truncate block transition-colors"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#B5B2A8' }}
              >
                insturix.com/profile/{uniqueUsername}
              </Link>
              <div className="absolute bottom-0 left-0 w-full h-0.5 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" style={{ backgroundColor: '#D4A652' }}></div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="border-none transition-all duration-200 rounded-[7px] hover:opacity-90"
                    style={{ backgroundColor: '#D4A652', color: '#0B0B0A' }}
                    aria-label={
                      copied ? "Copied to clipboard" : "Copy to clipboard"
                    }
                  >
                    <AnimatePresence mode="wait">
                      {copied ? (
                        <motion.div
                          key="check"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          className="flex items-center"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          <span>Copied!</span>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="copy"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          className="flex items-center"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          <span>Copy URL</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{copied ? "Copied!" : "Copy to clipboard"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="hover:bg-transparent transition-colors rounded-[7px]"
              style={{ color: '#EAE9E5' }}
              aria-label={expanded ? "Show less options" : "Show more options"}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Expanded section with tabs */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList className="mb-4 rounded-[7px]" style={{ backgroundColor: '#1B1A18' }}>
                  <TabsTrigger
                    value="link"
                    className="data-[state=active]:bg-[#D4A652] data-[state=active]:text-[#0B0B0A] rounded-[4px]"
                  >
                    Link
                  </TabsTrigger>
                  {/* QR tab removed: it rendered a placeholder.svg posing as a
                      real QR code and its download button fired a scaffold
                      alert(). Reinstate only with real QR generation. */}
                </TabsList>

                <TabsContent value="link" className="mt-0">
                  <div className="flex gap-2">
                    <Input
                      value={shareUrl}
                      readOnly
                      className="border-transparent focus:border-[#D4A652] focus:ring-0 rounded-[7px]"
                      style={{ backgroundColor: '#1B1A18', color: '#EAE9E5' }}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopy}
                      className="border-none hover:opacity-90 transition-opacity rounded-[7px]"
                      style={{ backgroundColor: '#D4A652', color: '#0B0B0A' }}
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-none hover:opacity-90 transition-opacity rounded-[7px]"
                      style={{ backgroundColor: '#D4A652', color: '#0B0B0A' }}
                      asChild
                    >
                      <Link
                        href={shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
