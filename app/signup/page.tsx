import Navbar from "@/components/Navbar";
import { SignUp } from "@clerk/nextjs";

export default function SignupPage() {
  return (
    <>
      <Navbar />
      <div className="flex justify-center items-center h-screen">
        <SignUp routing="hash" forceRedirectUrl={"/dashboard"} />
      </div>
    </>
  );
}
