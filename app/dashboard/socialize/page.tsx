import SocializeClientWrapper from "@/components/dashboard/Socialize/SocializeClientWrapper";
import { SocializePageHeader } from "@/components/dashboard/Socialize/SocializePageHeader";

export default function SocializePage() {
  return (
    <div className="container mx-auto p-8">
      {/* Page Header */}
      <div className="mb-8">
        <SocializePageHeader />
      </div>

      {/* Dashboard Content */}
      <SocializeClientWrapper />
    </div>
  );
}
