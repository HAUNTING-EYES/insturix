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
          contactHref={"/"}
          type={"hourglass"}
          className={"bg-red-700"}
        >
          <Heading>Premium</Heading>
          <Price>
            $100
            <br />
            /mo
          </Price>
          <Paragraph>
            1. 100GB Storage
            <br />
            2. 100 Emails
            <br />
            3. 100 Domains
          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
