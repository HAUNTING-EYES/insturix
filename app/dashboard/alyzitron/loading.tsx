import { Loader } from "lucide-react";

export default function Loading() {
  return (
    <div className="h-[80vh] w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-muted-foreground animate-pulse">
          Analyzing your video...
        </p>
      </div>
    </div>
  );
}
