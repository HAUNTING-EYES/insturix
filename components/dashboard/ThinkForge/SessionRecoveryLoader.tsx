import { Loader2 } from "lucide-react";

export default function SessionRecoveryLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <Loader2 className="h-8 w-8 animate-spin text-[#7A776E]" />
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-[#ECE9E1]">
          Restoring your session
        </h3>
        <p className="text-sm text-[#7A776E]">
          Loading your previous work...
        </p>
      </div>
    </div>
  );
} 