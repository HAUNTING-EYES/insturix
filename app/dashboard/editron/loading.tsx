import { Loader } from "lucide-react";

export default function Loading() {
  return (
    <div className="h-[80vh] w-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader className="h-8 w-8 animate-spin text-zinc0" />
        <p className="text-sm text-muted-foreground animate-pulse">
          Editron is loading...
        </p>
      </div>
    </div>
  );
}