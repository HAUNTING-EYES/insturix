import { UniversalLoader } from "@/components/Loader/UniversalLoader";

export default function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <UniversalLoader />
    </div>
  );
}
