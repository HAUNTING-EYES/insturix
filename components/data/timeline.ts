interface TimelineEvent {
  date: string;
  description: string;
}

interface TimeLineItem {
  year: string;
  title: string;
  description: string;
  events: TimelineEvent[];
}

export const timelineData:TimeLineItem[] = [
  {
    year: "2024",
    title: "The Beginning",
    description: "Founded with a vision to transform digital experiences",
    events: [
      {
        date: "August 15",
        description:
          "Initial idea conceptualized for a protection policy targeting influencers",
      },
      {
        date: "August 20",
        description: "Began brainstorming additional features for Insturance",
      },
      { date: "September 19", description: "Official launch of Insturance" },
      {
        date: "November 15",
        description: "Finalized three key subscription-based products/services",
      },
      {
        date: "November 18",
        description: "Submitted application for website SSL certification",
      },
      {
        date: "November 19",
        description:
          "Website went live with SSL certification and first version",
      },
      { date: "November 21", description: "Officially registered as an MSME" },
      { date: "November 22", description: "Upgraded website design and theme" },
      {
        date: "November 23",
        description:
          "Pitched Insturance at Jaypee Business School during RideHack competition",
      },
      {
        date: "December 12",
        description:
          "Strategic decision to prioritize investors in India, USA, and London",
      },
      {
        date: "December 18",
        description:
          "Visualized feature for creators to connect with businesses",
      },
      {
        date: "December 19",
        description: "Officially updated the new logo across all platforms",
      },
      {
        date: "December 21",
        description:
          "Launched and deployed Editron (Production House) V1 on the website",
      },
    ],
  },
  {
    year: "2025",
    title: "Rapid Growth",
    description: "Expanded our team and launched major products",
    events: [
      {
        date: "January 17",
        description: "Secured funding from Google under their startup program",
      },
      {
        date: "January 20",
        description: "Began development of a central LLM for the website",
      },
      {
        date: "January 21",
        description:
          "Proposed creation of a social media platform integrated into Insturance",
      },
      {
        date: "January 24",
        description:
          "Launched the 4th version of the website, built on Next.js",
      },
      {
        date: "January 25",
        description:
          "Introduced Meditron and ThinkForge, renamed Techie Tiwari to Alyzitron",
      },
      {
        date: "February 18",
        description:"Secured Funding from Microsoft for Startup Founder Program",
      }
    ],
  },
];
