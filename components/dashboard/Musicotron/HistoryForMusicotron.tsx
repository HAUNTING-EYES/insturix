"use client";
import Image from "next/image";
import React, { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useOutsideClick } from "@/hooks/use-outside-click";

export default function History() {
  const [active, setActive] = useState<(typeof cards)[number] | boolean | null>(
    null
  );
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActive(false);
      }
    }

    if (active && typeof active === "object") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  useOutsideClick(ref as React.RefObject<HTMLDivElement>, () =>
    setActive(null)
  );

  return (
    <>
      <AnimatePresence>
        {active && typeof active === "object" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 h-full w-full z-10"
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {active && typeof active === "object" ? (
          <div className="fixed inset-0  grid place-items-center z-[100]">
            <motion.button
              key={`button-${active.title}-${id}`}
              layout
              initial={{
                opacity: 0,
              }}
              animate={{
                opacity: 1,
              }}
              exit={{
                opacity: 0,
                transition: {
                  duration: 0.05,
                },
              }}
              className="flex absolute top-2 right-2 lg:hidden items-center justify-center bg-white rounded-full h-6 w-6"
              onClick={() => setActive(null)}
            >
              <CloseIcon />
            </motion.button>
            <motion.div
              layoutId={`card-${active.title}-${id}`}
              ref={ref}
              className="w-full max-w-[500px]  h-full md:h-fit md:max-h-[90%] flex flex-col bg-white dark:bg-neutral-900 sm:rounded-3xl overflow-hidden"
            >
              <motion.div layoutId={`image-${active.title}-${id}`}>
                <Image
                  priority
                  width={200}
                  height={200}
                  src={active.src}
                  alt={active.title}
                  className="w-full h-80 lg:h-80 sm:rounded-tr-lg sm:rounded-tl-lg object-cover object-top"
                />
              </motion.div>

              <div>
                <div className="flex justify-between items-start p-4">
                  <div className="">
                    <motion.h3
                      layoutId={`title-${active.title}-${id}`}
                      className="font-bold text-neutral-700 dark:text-neutral-200"
                    >
                      {active.title}
                    </motion.h3>
                    <motion.p
                      layoutId={`description-${active.description}-${id}`}
                      className="text-neutral-600 dark:text-neutral-400"
                    >
                      {active.description}
                    </motion.p>
                  </div>
                </div>
                <div className="pt-4 relative px-4">
                  <motion.div
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-neutral-600 text-xs md:text-sm lg:text-base h-40 md:h-fit pb-10 flex flex-col items-start gap-4 overflow-auto dark:text-neutral-400 [mask:linear-gradient(to_bottom,white,white,transparent)] [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch]"
                  >
                    {typeof active.content === "function"
                      ? active.content()
                      : active.content}
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
      <ul className="max-w-2xl mx-auto w-full gap-4">
        {cards.map((card) => (
          <motion.div
            layoutId={`card-${card.title}-${id}`}
            key={`card-${card.title}-${id}`}
            onClick={() => setActive(card)}
            className="p-4 flex flex-col md:flex-row justify-between items-center hover:bg-neutral-50 dark:hover:bg-neutral-800 rounded-xl cursor-pointer"
          >
            <div className="flex gap-4 flex-col md:flex-row">
              <motion.div layoutId={`image-${card.title}-${id}`}>
                <Image
                  width={100}
                  height={100}
                  src={card.src}
                  alt={card.title}
                  className="h-40 w-40 md:h-14 md:w-14 rounded-lg object-cover object-top"
                />
              </motion.div>
              <div className="">
                <motion.h3
                  layoutId={`title-${card.title}-${id}`}
                  className="font-medium text-neutral-800 dark:text-neutral-200 text-center md:text-left"
                >
                  {card.title}
                </motion.h3>
                <motion.p
                  layoutId={`description-${card.description}-${id}`}
                  className="text-neutral-600 dark:text-neutral-400 text-center md:text-left"
                >
                  {card.description}
                </motion.p>
              </div>
            </div>
          </motion.div>
        ))}
      </ul>
    </>
  );
}

export const CloseIcon = () => {
  return (
    <motion.svg
      initial={{
        opacity: 0,
      }}
      animate={{
        opacity: 1,
      }}
      exit={{
        opacity: 0,
        transition: {
          duration: 0.05,
        },
      }}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 text-black"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </motion.svg>
  );
};

const cards = [
  {
    description: "Hans Zimmer",
    title: "Time",
    src: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
    content: () => {
      return (
        <p>
          Hans Zimmer, the legendary German film score composer, has
          revolutionized movie soundtracks with his innovative approach to
          orchestral and electronic music. Known for his work on films like
          Inception, Interstellar, and The Lion King, his compositions transcend
          traditional scoring. <br /> <br />
          His ability to blend classical elements with modern technology has
          created some of the most memorable soundtracks in cinema history.
          Zimmer work has earned him numerous accolades, including Academy
          Awards and Grammy Awards, cementing his place as one of the most
          influential composers of our time.
        </p>
      );
    },
  },
  {
    description: "Ludovico Einaudi",
    title: "Experience",
    src: "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
    content: () => {
      return (
        <p>
          Ludovico Einaudi, the renowned Italian pianist and composer, creates
          minimalist compositions that bridge classical and contemporary music.
          His pieces often feature repetitive patterns and simple melodies that
          build into complex emotional landscapes. <br /> <br />
          Known for works like &quot;Nuvole Bianche&quot; and
          &quot;Experience,&quot; Einaudi&apos;s music has touched millions
          worldwide, appearing in films, TV shows, and advertisements. His
          unique style combines classical training with modern minimalism,
          creating a sound that&apos;s both accessible and profound.
        </p>
      );
    },
  },
  {
    description: "Max Richter",
    title: "On The Nature Of Daylight",
    src: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
    content: () => {
      return (
        <p>
          Max Richter, the German-born British composer, has redefined
          contemporary classical music with his innovative approach to
          composition. His work seamlessly blends classical, electronic, and
          ambient elements, creating deeply emotional soundscapes. <br /> <br />
          Famous for works like &quot;Sleep&quot; (an 8-hour composition) and
          &quot;On The Nature Of Daylight,&quot; Richter&apos;s music explores
          themes of memory, time, and consciousness. His compositions have been
          featured in numerous films and TV shows, bringing contemporary
          classical music to new audiences.
        </p>
      );
    },
  },
  {
    description: "Ólafur Arnalds",
    title: "Near Light",
    src: "https://images.unsplash.com/photo-1528922087877-3f44f53a8f7d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
    content: () => {
      return (
        <p>
          Ólafur Arnalds, the Icelandic multi-instrumentalist and composer,
          creates music that reflects the stark beauty of his homeland. His work
          combines classical strings, piano, and subtle electronic elements to
          create atmospheric and emotionally resonant pieces. <br /> <br />
          Known for his innovative use of technology in classical music,
          including his self-playing Stratus pianos, Arnalds has pushed the
          boundaries of contemporary classical music. His compositions often
          explore themes of nature, human connection, and the passage of time.
        </p>
      );
    },
  },
  {
    description: "Joep Beving",
    title: "Ab Ovo",
    src: "https://images.unsplash.com/photo-1593697821094-53ed19153f21?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2340&q=80",
    content: () => {
      return (
        <p>
          Joep Beving, the Dutch composer and pianist, has emerged as one of the
          most streamed classical artists worldwide. His minimalist approach to
          piano composition creates intimate, contemplative pieces that resonate
          with listeners seeking solace in music. <br /> <br />
          Standing at 6&apos;10&quot; with his signature beard, Beving&apos;s
          physical presence matches the grandeur of his music. His works,
          including &quot;Solipsism&quot; and &quot;Henosis,&quot; explore
          philosophical themes while remaining deeply personal and accessible to
          all listeners.
        </p>
      );
    },
  },
];
