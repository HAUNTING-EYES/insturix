import { Space_Grotesk } from "next/font/google";
import { Heading, Paragraph, Price, PricingWrapper } from "./Price";
import { Currency } from "../Currency";

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
            {" "}
            <Currency
              priceUSD={0}
              priceINR={0}
              priceEUR={0}
              priceGBP={0}
              perMonth={true}
            /> 
          </Price>
          <Paragraph className="text-left">
            1. Socialize
            <br />
            2. thinkforge Basic
            <br />
            3. Meditron Basic
            <br />
            4. Socialize
            <br />
          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
