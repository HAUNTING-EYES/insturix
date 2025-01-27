import Navbar from "@/components/Navbar";
import { SignIn } from "@clerk/nextjs";

export default function signin() {
  return (
    <>
      <Navbar />
      <div className="flex justify-center items-center h-screen">
        <SignIn routing="hash" forceRedirectUrl={"/dashboard"} />
      </div>
    </>
  );
}
