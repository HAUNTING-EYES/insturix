import { UniversalLoader } from "@/components/Loader/UniversalLoader";

export default function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-white dark:bg-zinc-900">
      <UniversalLoader />
    </div>
  );
}
