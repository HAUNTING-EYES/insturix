"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Copy, Check } from "lucide-react";

interface SocializeShareBarProps {
  uniqueUsername: string;
  copied: boolean;
  onCopy: () => void;
}

export function SocializeShareBar({ uniqueUsername, copied, onCopy }: SocializeShareBarProps) {
  return (
    <div className="bg-black/20 p-4 rounded-lg mb-8 backdrop-blur-sm border border-[#0e6b9c]/30">
      <div className="flex items-center justify-between gap-4 flex-wrap md:flex-nowrap">
        <div className="flex items-center gap-2">
          <span className="text-orange-400">🔥</span>
          <span className="text-white">Your link is live:</span>
          <Link
            href={`https://insturix.com/socialize/${uniqueUsername}`}
            className="text-blue-400 hover:underline truncate max-w-[200px] md:max-w-none"
            target="_blank"
            rel="noopener noreferrer"
          >
            insturix.com/socialize/{uniqueUsername}
          </Link>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="bg-white text-white hover:bg-gray-200 hover:text-black"
          onClick={onCopy}
        >
          {copied ? (
            <Check className="w-4 h-4 mr-2" />
          ) : (
            <Copy className="w-4 h-4 mr-2" />
          )}
          {copied ? "Copied!" : "Copy URL"}
        </Button>
      </div>
    </div>
  );
}