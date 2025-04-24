"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface SocializeAddLinkButtonProps {
  onClick: () => void;
}

export function SocializeAddLinkButton({ onClick }: SocializeAddLinkButtonProps) {
  return (
    <Button
      className="w-full bg-gradient-to-r from-[#0ea5e9]/80 to-[#0ea5e9]/40 hover:from-[#0ea5e9] hover:to-[#0ea5e9]/60 text-white border border-[#0ea5e9]/50 shadow-lg shadow-[#0ea5e9]/20"
      onClick={onClick}
    >
      <Plus className="w-5 h-5 mr-2" />
      Add New Link
    </Button>
  );
}