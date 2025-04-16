import { Space_Grotesk } from "next/font/google";
import {
  Heading,
  PricingWrapper,
  Price,
  Paragraph,
} from "@/components/pricing/Price";
import { Currency } from "@/components/Currency";

const grotesk = Space_Grotesk({ subsets: ["latin"] });

export default function Purple() {
  return (
    <>
      <div
        className={
          grotesk.className +
          " h-[600px] w-full flex gap-12 items-center justify-center"
        }
      >
        <PricingWrapper
          type={"waves"}
          contactHref="/signup"
          className={"bg-purple-600/95 dark:bg-purple-700/95"} // Adjusted opacity and dark theme color
        >
          <Heading>Pro</Heading>
          <Price>
            {" "}
            <Currency
              priceUSD={59}
              priceINR={599}
              priceEUR={49}
              priceGBP={39}
              perMonth={true}
            />{" "}
          </Price>
          <Paragraph className="text-left">
            Everything in Plus
            <br />
            1.Alyzitron Pro
            <br />
            2. Editron Pro
            <br />
            3. Socialize Pro
            <br />
            4. Musitron Pro
            <br />
            5. ThinkForge Pro
            <br />
          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
