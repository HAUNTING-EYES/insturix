import { auth } from "@clerk/nextjs/server";
import { ClientWrapper } from "@/components/dashboard/Alyzitron/ClientWrapper";
import { CreditsBadge } from "@/components/shared/CreditsCard";


export const revalidate = 30;

export default async function AlyzitronDashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  return (
    <div className="min-h-screen bg-[#0B0B0A] text-[#ECE9E1]">
      <div className="mx-auto max-w-[1040px] px-4 sm:px-7">
        <div className="flex h-11 items-center justify-between border-b border-[#1C1B19]">
          <div className="flex items-center gap-3.5">
            <span className="text-[18px]  font-extrabold tracking-tight text-[#ECE9E1]">
              Insturix
            </span>
            <span className="font-mono text-[18px] text-[#D4A652]">
              Analyze
            </span>
          </div>
          <CreditsBadge className="border border-[#282724] bg-[#0F0F0E]/60 text-[#B5B2A8]" />
        </div>

        <main>
          <ClientWrapper />
        </main>
      </div>
    </div>
  );
}

