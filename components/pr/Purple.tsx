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
          <Heading>component</Heading>
          <Price>
            $2000
            <br />
            /mo
          </Price>
          <Paragraph>
            Special UI component for your website made with React.js,
            TailwindCSS and FramerMotion.
          </Paragraph>
        </PricingWrapper>
      </div>
    </>
  );
}
