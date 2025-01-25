import { Space_Grotesk } from "next/font/google";
import { Heading, Paragraph, Price, PricingWrapper } from "./Price";

const grotesk = Space_Grotesk({ subsets: ["latin"] });

export default function Red() {
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
          type={"hourglass"} className={"bg-red-700"}>
          <Heading>Premium</Heading>
          <Price>
            ₹1000 /mo
          </Price>
          <Paragraph className="text-left">
            1. All features of Pro
            <br />
            2. Editron Pro+
            <br />
            3. Meditron Pro+
            <br />
            4. Priority Support

          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
