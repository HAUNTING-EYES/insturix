import { Space_Grotesk } from "next/font/google";
import { Heading, PricingWrapper, Price, Paragraph } from "@/components/pr/Price";

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
        <PricingWrapper contactHref={"/"} type={"waves"}>
          <Heading>Pro</Heading>
          <Price>
            $50
            <br />
            /mo
          </Price>
          <Paragraph>
            1. 50GB Storage
            <br />
            2. 50 Emails
            <br />
            3. 50 Domains
          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
