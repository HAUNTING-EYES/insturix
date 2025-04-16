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
            1.Alyzitron Basic
            <br />
            2. Editron Basic
            <br />
            3. Socialize Basic
            <br />
            4. Musitron Basic
            <br />
            5. ThinkForge Basic
            <br />
          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
