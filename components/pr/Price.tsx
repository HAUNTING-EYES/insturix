import Link from "next/link";
import { cn } from "@/lib/utils";

const Wave = () => (
  <svg
    width="129"
    height="2000"
    viewBox="0 0 129 2000"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="text-white/30"
  >
    <path
      d={`M11.2131 11L106.283 106.07M106.283 106.07L117.279 117.066M106.283 106.07L22.2962 190.003M106.283 106.07L116.688 95.6708M11.2962 200.997L22.2962 190.003M22.2962 190.003L11.2529 178.96M22.2962 190.003L106.323 274.03M106.323 274.03L117.319 285.026M106.323 274.03L22.4537 357.846M106.323 274.03L116.728 263.631M11.3361 368.957L22.4537 357.846M22.4537 357.846L11.5493 346.901M22.4537 357.846L106.44 442.149M106.44 442.149L117.416 453.166M106.44 442.149L22.2962 525.925M106.44 442.149L116.865 431.769M11.2756 536.897L22.2962 525.925M22.2962 525.925L11.2737 514.861M22.2962 525.925L106.165 610.109M106.165 610.109L117.14 621.126M106.165 610.109L11 704.857M106.165 610.109L116.59 599.729`}
      stroke="currentColor"
      strokeWidth="31"
    />
  </svg>
);

const Cross = () => (
  <svg
    width="130"
    height="130"
    viewBox="0 0 130 130"
    fill="none"
    className="scale-125 text-white/50"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M11 11L118.899 119M11.101 119L119 11"
      stroke="currentColor"
      strokeWidth="31"
    />
  </svg>
);

const Star = () => (
  <svg
    width="200"
    height="200"
    viewBox="0 0 200 200"
    fill="none"
    className="scale-110 text-white/50"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M100 10L123.51 59.27L177.55 68.36L138.78 106.73L149.02 160.64L100 135.27L50.98 160.64L61.22 106.73L22.45 68.36L76.49 59.27L100 10Z"
      stroke="currentColor"
      strokeWidth="15"
      strokeLinejoin="round"
    />
  </svg>
);

const HourGlass = () => (
  <svg
    width="130"
    height="130"
    viewBox="0 0 130 130"
    fill="none"
    className="scale-125 text-white/50"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M30 10L100 10L100 40L65 65L100 90L100 120L30 120L30 90L65 65L30 40L30 10Z"
      stroke="currentColor"
      strokeWidth="20"
      strokeLinejoin="round"
    />
  </svg>
);

export const PricingWrapper: React.FC<{
  children: React.ReactNode;
  type?: "waves" | "crosses" | "star" | "hourglass";
  contactHref: string;
  className?: string;
}> = ({ children, contactHref, className, type = "waves" }) => (
  <article
    className={cn(
      "min-h-[300px] h-[600px] max-h-[500px] max-w-sm w-full bg-purple-500 relative overflow-hidden rounded-2xl text-white",
      "bg-opacity-90 dark:bg-opacity-95",
      "before:absolute before:inset-0 before:z-0",
      "before:mix-blend-soft-light",
      "before:bg-[linear-gradient(130deg,rgba(0,0,0,0.1)_0%,rgba(0,0,0,0.15)_40%,rgba(0,0,0,0.2)_80%)]",
      "dark:before:bg-[linear-gradient(130deg,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.25)_40%,rgba(0,0,0,0.3)_80%)]",
      "backdrop-brightness-105 dark:backdrop-brightness-95",
      "after:absolute after:inset-0 after:z-0 after:rounded-2xl",
      "after:shadow-[inset_0_0_30px_rgba(0,0,0,0.2)]",
      "dark:after:shadow-[inset_0_0_50px_rgba(0,0,0,0.4)]",
      className
    )}
  >
    <span
      className={
        "w-full h-full absolute top-0 left-0 z-2 p-4 flex flex-col items-start justify-start sm:gap-10 gap-7"
      }
    >
      {children}
      <div className={"w-full h-full flex items-end justify-end text-base"}>
        <Link href={contactHref} className={"w-full h-fit"}>
          <button
            className={
              "h-12 w-full bg-white rounded-lg text-neutral-900 font-bold cursor-pointer"
            }
          >
            Get Started
          </button>
        </Link>
      </div>
    </span>
    {type === "waves" && (
      <>
        <div
          className={
            "w-fit h-fit absolute sm:left-4 -left-0 waves z-0"
          }
        >
          <Wave />
        </div>
        <div
          className={
            "w-fit h-fit absolute sm:right-4 -right-0 waves z-0"
          }
        >
          <Wave />
        </div>
      </>
    )}
    {type === "crosses" && (
      <>
        <div
          className={
            "w-fit h-fit absolute top-0 -left-10 z-0 animate-[spin_5s_linear_infinite]"
          }
        >
          <Cross />
        </div>
        <div
          className={
            "w-fit h-fit absolute top-1/2 -right-12 z-0 animate-[spin_5s_linear_infinite]"
          }
        >
          <Cross />
        </div>
        <div
          className={
            "w-fit h-fit absolute top-[85%] -left-5 z-0 animate-[spin_5s_linear_infinite]"
          }
        >
          <Cross />
        </div>
      </>
    )}
    {type === "hourglass" && (
      <>
        <div
          className={
            "w-fit h-fit absolute top-0 -left-10 z-0 animate-[spin_5s_linear_infinite]"
          }
        >
          <HourGlass />
        </div>
        <div
          className={
            "w-fit h-fit absolute top-1/2 -right-12 z-0 animate-[spin_5s_linear_infinite]"
          }
        >
          <HourGlass />
        </div>
        <div
          className={
            "w-fit h-fit absolute top-[85%] -left-5 z-0 animate-[spin_5s_linear_infinite]"
          }
        >
          <HourGlass />
        </div>
      </>
    )}
    {type === "star" && (
      <>
        <div
          className={
            "w-fit h-fit absolute top-0 -left-10 z-0 animate-[spin_5s_linear_infinite]"
          }
        >
          <Star />
        </div>
        <div
          className={
            "w-fit h-fit absolute top-1/2 -right-12 z-0 animate-[spin_5s_linear_infinite]"
          }
        >
          <Star />
        </div>
        <div
          className={
            "w-fit h-fit absolute top-[85%] -left-5 z-0 animate-[spin_5s_linear_infinite]"
          }
        >
          <Star />
        </div>
      </>
    )}
  </article>
);

export const Heading: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <h1
    className={cn(
      "sm:text-5xl leading-1 text-[clamp(1.7rem,10vw,3rem)] font-bold [text-shadow:_0_1px_2px_rgba(0,0,0,0.6)]",
      className
    )}
  >
    {children}
  </h1>
);

export const Price: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    style={{ lineHeight: "1" }}
    className={cn(
      "sm:text-5xl text-[clamp(1.7rem,10vw,3rem)] font-bold [text-shadow:_0_1px_2px_rgba(0,0,0,0.6)]",
      className
    )}
  >
    {children}
  </div>
);

export const Paragraph: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <p
    className={cn(
      "sm:text-2xl text-[clamp(0.1rem,20vw,1.25rem)] font-bold [text-shadow:_0_1px_2px_rgba(0,0,0,0.6)]",
      className
    )}
  >
    {children}
  </p>
);
