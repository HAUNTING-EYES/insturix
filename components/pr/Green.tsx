import { Space_Grotesk } from "next/font/google";
import { Heading, Paragraph, Price, PricingWrapper } from "./Price";

const grotesk = Space_Grotesk({ subsets: ["latin"] });

export default function Green() {
  return (
    <>
      <div
        className={
          grotesk.className +
          " h-[600px] w-full flex gap-12 items-center justify-center"
        }
      >
        <PricingWrapper
          type={"star"}
          contactHref="/signup"
          className={"bg-green-600"}
        >
          <Heading>Free</Heading>
          <Price>
            ₹0 /mo
          </Price>
          <Paragraph className="text-left">
            1. Kund-li<br />
            2. Brainyeet Basic<br />
            3. Meditron Basic<br />
            4. Socialize<br />
          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
