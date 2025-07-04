"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { getPlatformIcon } from "./SocializeIcons";

import type { SocializeLink } from "@/schemas/Socialize";

interface SocializeLinksCardProps {
  links: SocializeLink[];
  selectedLinkIndex: number | null;
  onSelectLink: (index: number) => void;
  onRemoveLink: (index: number) => void;
}

export function SocializeLinksCard({
  links,
  selectedLinkIndex,
  onSelectLink,
  onRemoveLink,
}: SocializeLinksCardProps) {
  return (
    <Card className="bg-black/30 border-[#0e6b9c]/20 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl text-white">Your Links</CardTitle>
        <CardDescription>
          {links?.length
            ? `You have ${links.length} link${links.length > 1 ? "s" : ""}`
            : "Add your first link to get started"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {links?.length ? (
          <div className="grid gap-4">
            {links.map((link, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className={`w-full bg-black/40 py-3 rounded-lg flex items-center justify-between gap-2 hover:bg-black/60 transition border ${selectedLinkIndex === index ? "border-[#0e6b9c]" : "border-[#0e6b9c]/30"} px-5 cursor-pointer`}
                onClick={() => onSelectLink(index)}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0 overflow-hidden">
                  {getPlatformIcon(link.platform)}
                  <span className="text-white truncate overflow-hidden text-ellipsis whitespace-nowrap block w-0 flex-grow">
                    {link.url}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                  >
                    <Link
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-white"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-gray-400 hover:text-white"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      onRemoveLink(index);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-[#0e6b9c]/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✨</span>
            </div>
            <p className="mb-2 text-lg font-medium text-white">
              Show the world who you are.
            </p>
            <p className="text-gray-400">Add a link to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}