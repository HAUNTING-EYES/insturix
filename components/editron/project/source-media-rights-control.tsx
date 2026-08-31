'use client';

import { ShieldCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { SOURCE_MEDIA_RIGHTS_ATTESTATION_TEXT_V1 }
  from '@/lib/editron/services/native-video-audio-rights';

interface SourceMediaRightsControlProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SourceMediaRightsControl({
  checked,
  onCheckedChange,
  disabled = false,
}: SourceMediaRightsControlProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[#282724] bg-[#1B1A18] p-3">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5 border-[#5F5E5A] data-[state=checked]:border-[#D4A652] data-[state=checked]:bg-[#D4A652] data-[state=checked]:text-[#0B0B0A]"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#ECE9E1]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#D4A652]" />
          Rights confirmed
        </span>
        <span className="mt-1 block text-[11px] leading-4 text-[#7A776E]">
          {SOURCE_MEDIA_RIGHTS_ATTESTATION_TEXT_V1}
        </span>
      </span>
    </label>
  );
}
