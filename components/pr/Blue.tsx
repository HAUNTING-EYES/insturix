import { Space_Grotesk } from "next/font/google";
import { Heading, Paragraph, Price, PricingWrapper } from "./Price";

const grotesk = Space_Grotesk({ subsets: ["latin"] });

export default function Blue() {
  return (
    <>
      <div
        className={
          grotesk.className +
          " h-[600px] w-full flex gap-12 items-center justify-center"
        }
      >
        <PricingWrapper
          contactHref="/signup"
          type={"crosses"}
          className={"bg-indigo-500"}
        >
          <Heading>Plus</Heading>
          <Price>
            ₹200 /mo
          </Price>
          <Paragraph className="text-left">
            1. All features of Free
            <br />
            2. Brainyeet Pro
            <br />
            3. Meditron Pro
            <br />
            4. Editron Basic
            <br />
            5. TechieTiwari Basic
          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
