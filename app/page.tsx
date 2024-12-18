import OverlayLayout from "@/components/OverLayout";

export default function Home() {
  return (
    <>
     <OverlayLayout>
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold text-center text-white mb-12">Choose Your Plan</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        </div>
      </div>
    </OverlayLayout>
    </>
  );
}
