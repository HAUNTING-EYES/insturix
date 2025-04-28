"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface SocializeAddLinkButtonProps {
  onClick: () => void;
}

export function SocializeAddLinkButton({ onClick }: SocializeAddLinkButtonProps) {
  return (
    <Button
      variant="custom"
      className="w-full bg-gradient-to-r from-[#0e6b9c]/80 to-[#0e6b9c]/40 hover:from-[#0e6b9c] hover:to-[#0e6b9c]/60 text-white border border-[#0e6b9c]/50 shadow-lg shadow-[#0e6b9c]/20"
      onClick={onClick}
    >
      <Plus className="w-5 h-5 mr-2" />
      Add New Link
    </Button>
  );
}