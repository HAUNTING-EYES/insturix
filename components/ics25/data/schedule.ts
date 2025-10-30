export type AgendaItem = { title: string; desc: string };
export type Milestone = {
	date: string; // human readable date or label
	title: string;
	detail: string;
	icon?: "trophy" | "game" | "calendar";
	href?: string;
	ctaLabel?: string;
};

// Derived from ics25details.txt highlights. Keep copy high-signal and non-speculative.
export const AGENDA_HIGHLIGHTS: AgendaItem[] = [
	{ title: "Talks & Panels", desc: "Rise of the creator economy • AI: threat or boon?" },
	{ title: "AI Demos & Battles", desc: "Editron, Alyzitron, Musitron, Thinkforge." },
	{ title: "Live Competitions", desc: "Reel-making showdowns and speed editing battles." },
	{ title: "Networking & Lounges", desc: "Structured mixers for creator–brand collabs." },
	{ title: "Creator Awards", desc: "Honoring standout creators across categories." },
	{ title: "Panel talks", desc: "Industry expert discussions and insights." },
	{ title: "Speaker sessions", desc: "Keynote presentations from leading creators." },
	{ title: "Speed Edits", desc: "Fast-paced editing competitions." },
	{ title: "Talent Showdown", desc: "A platform for small and medium creators and non-creators to showcase their talent and launch themselves in front of the broader creator community." },
	{ title: "Lunch both days", desc: "Catered meals and networking opportunities." },
	{ title: "Exclusive merch", desc: "Exclusive ICS'25 branded merchandise and goodies." },
];

// DTV summary (no speculative exact hours; hours string kept general per brief)
export const DTV = {
	dates: "Nov 22–23, 2025",
	hours: "10:00 AM – 08:00 PM", // Full schedule drops Nov 15
	venueShort: "IIIT Delhi, New Delhi"};

// Timed milestones based strictly on provided text files.
export const MILESTONES: Milestone[] = [
	{
		date: "Nov 15",
		title: "Full schedule goes live",
		detail: "Timeslots and rooms published on this page.",
		icon: "calendar",
	},
	{
		date: "Nov 8",
		title: "GameOn Qualifiers – Round 1",
		detail: "Online qualifiers kick off (Valorant/BGMI).",
		icon: "game",
		href: "/ics25/gameon",
		ctaLabel: "Esports details",
	},
	{
		date: "Nov 8",
		title: "GameOn Qualifiers – Round 2",
		detail: "Second online qualifier round.",
		icon: "game",
		href: "/ics25/gameon",
	},
	{
		date: "Nov 15",
		title: "GameOn Finals",
		detail: "Esports finals (select titles) — times and live-stream info to follow.",
		icon: "trophy",
		href: "/ics25/gameon",
	},
	{
		date: "Nov 23",
		title: "ICS'25 Day 2 + Awards & Closing",
		detail: "Creator awards and closing ceremony during the day.",
		icon: "trophy",
	},
];

// Note: Avoid including any unverified exact timings; update after Nov 15 when precise schedule is published.
