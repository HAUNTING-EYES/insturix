import { SignIn } from "@clerk/nextjs";

export default function signin() {
  return (
    <>
      <div className="flex justify-center items-center h-screen">
        <SignIn />
      </div>
    </>
  );
}
