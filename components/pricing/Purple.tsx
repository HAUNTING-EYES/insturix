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
              priceUSD={50}
              priceINR={500}
              priceEUR={40}
              priceGBP={30}
              perMonth={true}
            /> {" "}
          </Price>
          <Paragraph className="text-left">
            1. All features of Plus
            <br />
            2. Editron Pro
            <br />
            3. TechieTiwari Pro
          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
