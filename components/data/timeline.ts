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

export const timelineData: TimeLineItem[] = [
  {
    year: "2024",
    title: "The Beginning",
    description: "Founded with a vision to make content production more reliable for teams",
    events: [
      {
        date: "August 15",
        description:
          "Initial vision formed around safer, more scalable production workflows for modern content teams",
      },
      {
        date: "August 20",
        description: "Began mapping automated workflows across planning, production, analysis, and publishing",
      },
      { date: "September 19", description: "Official launch of Insturix" },
      {
        date: "November 15",
        description: "Finalized the first set of platform modules for content production teams",
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
          "Pitched Insturix at Jaypee Business School during RideHack competition",
      },
      {
        date: "December 12",
        description:
          "Strategic decision to prioritize investors in India, USA, and London",
      },
      {
        date: "December 18",
        description:
          "Explored collaboration workflows between creators, businesses, and production teams",
      },
      {
        date: "December 19",
        description: "Officially updated the new logo across all platforms",
      },
      {
        date: "December 21",
        description:
          "Released the first production workspace prototype on the website",
      },
    ],
  },
  {
    year: "2025",
    title: "Platform Expansion",
    description: "Expanded toward an automated content production platform for teams and enterprises",
    events: [
      {
        date: "January 17",
        description: "Secured monetary support from Google under their startup program",
      },
      {
        date: "January 20",
        description: "Began development of a central AI orchestration layer for the website",
      },
      {
        date: "January 21",
        description:
          "Explored public profile and audience-facing publishing workflows inside Insturix",
      },
      {
        date: "January 24",
        description:
          "Launched the 4th version of the website, built on Next.js",
      },
      {
        date: "January 25",
        description:
          "Expanded the platform roadmap across planning, production, intelligence, and asset generation workflows",
      },
      {
        date: "February 18",
        description:
          "Secured monetary support from Microsoft for the Startup Founder Program",
      },
      {
        date:"February 28",
        description:
          "Completed LLP incorporation",
      }
    ],
  },
];
