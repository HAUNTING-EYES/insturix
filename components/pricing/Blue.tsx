import { Space_Grotesk } from "next/font/google";
import { Heading, Paragraph, Price, PricingWrapper } from "./Price";
import { Currency } from "../Currency";

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
            <Currency
              priceUSD={29}
              priceINR={299}
              priceEUR={19}
              priceGBP={19}
              perMonth={true}
            />
          </Price>
          <Paragraph className="text-left">
            Everything in Free.
            <br />
            1. Alyzitron Pro
            <br />
            2. Editron Pro
            <br />
            3. Socialize Pro
            <br />
            4. ThinkForge Pro
            <br />
            5. Musitron Pro
            <br />
          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
