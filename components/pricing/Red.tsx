import { Space_Grotesk } from "next/font/google";
import { Heading, Paragraph, Price, PricingWrapper } from "./Price";
import { Currency } from "../Currency";

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
          type={"hourglass"}
          className={"bg-red-700"}
        >
          <Heading>Premium</Heading>
          <Price>
            <Currency
              priceUSD={89}
              priceINR={1299}
              priceEUR={79}
              priceGBP={59}
              perMonth={true}
            />
          </Price>
          <Paragraph className="text-left">
            Everything in Pro
            <br />
            1.Alyzitron Prem 
            <br />
            2. Editron Prem 
            <br />
            3. Socialize Prem 
            <br />
            4. Musitron Prem 
            <br />
            5. ThinkForge Prem 
            <br />
          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
