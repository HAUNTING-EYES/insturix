/**
 * ICS'25 Structured Data / JSON-LD Schema
 * For maximum SEO and rich search results
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://insturix.com";

// Main Event Schema for ICS'25
export const ics25EventSchema = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: "Insturix Creators Summit 2025 (ICS'25)",
  description:
    "Join 800+ creators at India's largest student-led creator-tech summit. Two days of AI-powered demos, live reel-making competitions, workshops, GameOn esports (Valorant & BGMI), panels, networking, and awards.",
  image: `${SITE_URL}/ics25/ics25banner.png`,
  startDate: "2025-11-22T10:00:00+05:30",
  endDate: "2025-11-23T20:00:00+05:30",
  eventStatus: "https://schema.org/EventScheduled",
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  location: {
    "@type": "Place",
    name: "Indraprastha Institute of Information Technology Delhi (IIIT Delhi)",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Okhla Industrial Estate Phase III",
      addressLocality: "New Delhi",
      addressRegion: "Delhi",
      postalCode: "110020",
      addressCountry: "IN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 28.5460,
      longitude: 77.2730,
    },
  },
  organizer: {
    "@type": "Organization",
    name: "Insturix",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/logo.png`,
    sameAs: [
      "https://twitter.com/insturix",
      "https://www.linkedin.com/company/insturix",
      "https://www.instagram.com/insturix",
    ],
  },
  offers: [
    {
      "@type": "Offer",
      name: "Bronze Pass (Free - Task Completion Required)",
      price: "0",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/ics25/register`,
      validFrom: "2025-10-01T00:00:00+05:30",
      category: "Basic access to talks, zones, and streams",
    },
    {
      "@type": "Offer",
      name: "Silver Pass",
      price: "2000",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/ics25/register`,
      validFrom: "2025-10-01T00:00:00+05:30",
      category: "Full sessions, 1 workshop, networking grounds",
    },
    {
      "@type": "Offer",
      name: "Gold Pass",
      price: "3000",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/ics25/register`,
      validFrom: "2025-10-01T00:00:00+05:30",
      category: "Priority seating, 2 workshops, swag bag",
    },
    {
      "@type": "Offer",
      name: "Platinum Pass",
      price: "7000",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: `${SITE_URL}/ics25/register`,
      validFrom: "2025-10-01T00:00:00+05:30",
      category: "VIP perks, meet creators, backstage access, 1-year Insturix Pro",
    },
  ],
  performer: [
    {
      "@type": "Organization",
      name: "Featured Creators and Panels",
    },
  ],
  url: `${SITE_URL}/ics25`,
  isAccessibleForFree: false,
  audience: {
    "@type": "Audience",
    audienceType: "Content creators, gamers, entrepreneurs, students, brands",
  },
  video: {
    "@type": "VideoObject",
    name: "Insturix Creators Summit 2025 (ICS'25) - Teaser & Highlights",
    description:
      "Discover what awaits at ICS'25 — India's largest student-led creator-tech summit featuring AI-powered tool demos, live competitions, workshops, GameOn esports, and networking opportunities.",
    thumbnailUrl: `${SITE_URL}/ics25/ics25banner.png`,
    uploadDate: "2025-10-30T00:00:00+05:30",
    duration: "PT9S",
    contentUrl: `${SITE_URL}/ics25/ics25.mp4`,
    embedUrl: `${SITE_URL}/ics25`,
  },
};

// GameOn Esports Sub-Event Schema
export const gameOnEventSchema = {
  "@context": "https://schema.org",
  "@type": "SportsEvent",
  name: "GameOn Esports Tournament at ICS'25",
  description:
    "Compete in Valorant (5v5) and BGMI (4v4) tournaments with a combined prize pool of ₹25,000. Online qualifiers + live finals at IIIT Delhi.",
  image: `${SITE_URL}/ics25/gameon3.png`,
  startDate: "2025-11-15T10:00:00+05:30",
  endDate: "2025-11-15T20:00:00+05:30",
  eventStatus: "https://schema.org/EventScheduled",
  eventAttendanceMode: "https://schema.org/MixedEventAttendanceMode",
  location: {
    "@type": "Place",
    name: "IIIT Delhi - Gaming/Esports Zone",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Okhla Industrial Estate Phase III",
      addressLocality: "New Delhi",
      addressRegion: "Delhi",
      postalCode: "110020",
      addressCountry: "IN",
    },
  },
  organizer: {
    "@type": "Organization",
    name: "Insturix",
    url: SITE_URL,
  },
  offers: {
    "@type": "Offer",
    name: "Team Registration",
    price: "500",
    priceCurrency: "INR",
    availability: "https://schema.org/LimitedAvailability",
    url: `${SITE_URL}/ics25/gameon`,
    validFrom: "2025-10-01T00:00:00+05:30",
  },
  competitor: [
    {
      "@type": "SportsTeam",
      name: "Valorant 5v5 Teams",
    },
    {
      "@type": "SportsTeam",
      name: "BGMI 4v4 Teams",
    },
  ],
  url: `${SITE_URL}/ics25/gameon`,
  sport: "Esports",
  superEvent: {
    "@type": "Event",
    name: "Insturix Creators Summit 2025 (ICS'25)",
    url: `${SITE_URL}/ics25`,
  },
};

// FAQ Schema for ICS'25 Landing Page
export const ics25FAQSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is ICS'25?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ICS'25 (Insturix Creators Summit 2025) is India's largest student-led creator-tech summit held on November 22-23, 2025, at IIIT Delhi. It brings together 800+ creators, gamers, entrepreneurs, and brands for two days of AI tool demos, live competitions, workshops, panels, networking, and the GameOn esports tournament.",
      },
    },
    {
      "@type": "Question",
      name: "How do I register for ICS'25?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Visit insturix.com/ics25 and click 'Register Now' to choose your Creator Pass tier (Bronze, Silver, Gold, or Platinum). You can also register for the GameOn esports tournament separately. Payment is via secure Razorpay gateway with UPI, cards, and net banking.",
      },
    },
    {
      "@type": "Question",
      name: "What are the ticket prices for ICS'25?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Bronze Pass: Free (upon task completion), Silver: ₹2,000 (students) / ₹2,500, Gold: ₹3,000, Platinum: ₹7,000. Group discounts of 20% are available for teams of 5+. All passes include access to talks, zones, workshops, and networking areas with varying levels of perks.",
      },
    },
    {
      "@type": "Question",
      name: "What is GameOn at ICS'25?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GameOn is the esports sub-event featuring Valorant (5v5) and BGMI (4v4) tournaments with a combined prize pool of ₹25,000. Online qualifiers happen on November 8, with live finals on November 15 at IIIT Delhi. Team entry fee is ₹500 with cashback opportunities.",
      },
    },
    {
      "@type": "Question",
      name: "Where is ICS'25 being held?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ICS'25 is held at Indraprastha Institute of Information Technology Delhi (IIIT Delhi), Okhla Industrial Estate Phase III, New Delhi. The venue is easily accessible via Okhla NSIC Metro station and has parking, food stalls, and full accessibility features.",
      },
    },
  ],
};

// GameOn FAQ Schema
export const gameOnFAQSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I register for GameOn esports tournament?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Visit insturix.com/ics25/gameon and register your full team (5 players for Valorant, 4 for BGMI). Entry fee is ₹500 per team. Complete 3 creator tasks to earn ₹350 cashback, making the net fee ₹150.",
      },
    },
    {
      "@type": "Question",
      name: "What is the prize pool for GameOn?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Total prize pool is ₹25,000. Valorant: 1st ₹10,000, 2nd ₹5,000, 3rd ₹3,000. BGMI: 1st ₹7,000, 2nd ₹4,000, 3rd ₹2,000.",
      },
    },
    {
      "@type": "Question",
      name: "When are the GameOn qualifiers and finals?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Online qualifiers are on November 8, 2025. Live finals will be held on November 15, 2025, at the Gaming/Esports Zone at IIIT Delhi during ICS'25.",
      },
    },
    {
      "@type": "Question",
      name: "Are emulators allowed for BGMI?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No, only mobile devices are allowed for BGMI to ensure fair play. Valorant will be played on provided high-spec gaming PCs at the venue.",
      },
    },
  ],
};

// BreadcrumbList Schema for ICS'25 pages
export const ics25BreadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: SITE_URL,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "ICS'25",
      item: `${SITE_URL}/ics25`,
    },
  ],
};

export const gameOnBreadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: SITE_URL,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "ICS'25",
      item: `${SITE_URL}/ics25`,
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "GameOn",
      item: `${SITE_URL}/ics25/gameon`,
    },
  ],
};

export const registerBreadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: SITE_URL,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "ICS'25",
      item: `${SITE_URL}/ics25`,
    },
    {
      "@type": "ListItem",
      position: 3,
      name: "Register",
      item: `${SITE_URL}/ics25/register`,
    },
  ],
};
