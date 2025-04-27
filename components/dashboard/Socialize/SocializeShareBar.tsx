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
  QrCode,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

interface SocializeShareBarProps {
  uniqueUsername: string;
  onShare?: (platform: string) => void;
  className?: string;
  showQRCode?: boolean;
  showAnalytics?: boolean;
  shareCount?: number;
}

export function SocializeShareBar({
  uniqueUsername,
  onShare,
  className,
  showQRCode = true,
}: SocializeShareBarProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("link");

  const shareUrl = `https://insturix.com/socialize/${uniqueUsername}`;

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
  const generateQRCode = () => {
    // In a real implementation, this would generate a QR code
    // For now, we'll just return a placeholder
    return `/placeholder.svg?height=200&width=200`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "bg-gradient-to-r from-blue-950/80 to-blue-900/80 p-5 rounded-xl backdrop-blur-lg border border-blue-500/30 shadow-lg",
        "transition-all duration-300 ease-in-out",
        expanded ? "mb-4" : "mb-8",
        className
      )}
    >
      <div className="flex flex-col space-y-4">
        {/* Main bar with link and copy button */}
        <div className="flex items-center justify-between gap-4 flex-wrap md:flex-nowrap">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="bg-orange-500 p-1.5 rounded-full">
              <Share2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-medium">Your link is live:</span>
            <div className="relative flex-1 min-w-0 group">
              <Link
                href={shareUrl}
                className="text-blue-300 hover:text-blue-200 font-medium truncate block"
                target="_blank"
                rel="noopener noreferrer"
              >
                insturix.com/socialize/{uniqueUsername}
              </Link>
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400/30 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></div>
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
                    className="bg-blue-600 hover:bg-blue-700 text-white border-blue-500 hover:border-blue-400 transition-all duration-200"
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
              className="text-white hover:bg-blue-800/50 hover:text-blue-200"
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
                <TabsList className="bg-blue-800/50 mb-4">
                  <TabsTrigger
                    value="link"
                    className="data-[state=active]:bg-blue-700"
                  >
                    Link
                  </TabsTrigger>
                  {showQRCode && (
                    <TabsTrigger
                      value="qrcode"
                      className="data-[state=active]:bg-blue-700"
                    >
                      QR Code
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="link" className="mt-0">
                  <div className="flex gap-2">
                    <Input
                      value={shareUrl}
                      readOnly
                      className="bg-blue-950/50 border-blue-700/50 text-white"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopy}
                      className="bg-blue-800 hover:bg-blue-700 text-white border-blue-700"
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
                      className="bg-blue-800 hover:bg-blue-700 text-white border-blue-700"
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
                {showQRCode && (
                  <TabsContent value="qrcode" className="mt-0">
                    <div className="flex flex-col items-center">
                      <div className="bg-white p-3 rounded-lg mb-3">
                        <Image
                          width={200}
                          height={200}
                          src={generateQRCode() || "/placeholder.svg"}
                          alt="QR Code for your share link"
                          className="w-40 h-40"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-blue-800 hover:bg-blue-700 text-white border-blue-700"
                        onClick={() => {
                          // In a real implementation, this would download the QR code
                          alert(
                            "QR Code download functionality would be implemented here"
                          );
                        }}
                      >
                        <QrCode className="mr-2 h-4 w-4" />
                        Download QR Code
                      </Button>
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
