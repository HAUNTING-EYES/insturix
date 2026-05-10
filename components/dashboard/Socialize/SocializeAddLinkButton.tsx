"use client";

import { Plus } from "lucide-react";

interface SocializeAddLinkButtonProps {
  onClick: () => void;
}

export function SocializeAddLinkButton({ onClick }: SocializeAddLinkButtonProps) {
  return (
    <button
      type="button"
      className="w-full flex items-center justify-center px-4 py-2 transition-colors uppercase tracking-[0.08em] hover:bg-[#D4A652]/10"
      style={{
        backgroundColor: 'transparent',
        borderColor: '#D4A652',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderRadius: '7px',
        color: '#D4A652',
        fontFamily: 'JetBrains Mono',
        fontSize: '10px'
      }}
      onClick={onClick}
    >
      <Plus className="w-4 h-4 mr-2" />
      Add New Link
    </button>
  );
}