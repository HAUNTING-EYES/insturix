import Link from "next/link";

export type HighlightKey =
  | "Reel-Making Battles"
  | "Speed Editing Showdown"
  | "Stand Up Comedy"
  | "ThinkForge Ideation"
  | "Creator Panels"
  | "GameOn Esports"
  | "Creator Awards"
  | "Networking Zones";

export function getHighlightDetail(title: HighlightKey) {
  switch (title) {
    case "Reel-Making Battles":
      return (
        <div className="space-y-5">
          <p className="text-white/90">Real‑time face‑offs to craft the most compelling, Viral Reel—built live on the floor.</p>
          <ul className="space-y-3 text-sm text-zinc-300">
            <li>
              <div className="text-white font-medium">Tooling</div>
              <div className="mt-1">Editron (auto‑captions, cuts, effects) + Musitron (instant soundtrack)</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Judging</div>
              <div className="mt-1">Creativity, hook strength, completion, audience appeal</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Rewards</div>
              <div className="mt-1">Insturix Pro + Featured Creator Shoutout</div>
            </li>
          </ul>
        </div>
      );
    case "Speed Editing Showdown":
      return (
        <div className="space-y-5">
          <p className="text-white/90">Blitz‑format edit races—compress your story into a tight, high‑impact 30–60s short.</p>
          <ul className="space-y-3 text-sm text-zinc-300">
            <li>
              <div className="text-white font-medium">Tooling</div>
              <div className="mt-1">Editron + Alyzitron (quick performance checks)</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Format</div>
              <div className="mt-1">Timed prompts → submit final cut for judging</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Wins</div>
              <div className="mt-1">Creativity + speed + clarity</div>
            </li>
          </ul>
        </div>
      );
    case "Stand Up Comedy":
      return (
        <div className="space-y-5">
          <p className="text-white/90">Hilarious stand-up performances and comedy battles featuring top comedians and emerging talent.</p>
          <ul className="space-y-3 text-sm text-zinc-300">
            <li>
              <div className="text-white font-medium">Performances</div>
              <div className="mt-1">Live sets from professional comedians and creator showcases</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Battles</div>
              <div className="mt-1">Comedy showdowns with audience voting and prizes</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Workshops</div>
              <div className="mt-1">Learn stand-up techniques and storytelling from experts</div>
            </li>
          </ul>
        </div>
      );
    case "ThinkForge Ideation":
      return (
        <div className="space-y-5">
          <p className="text-white/90">ForgeAI for hooks, scripts, and structures that actually convert.</p>
          <ul className="space-y-3 text-sm text-zinc-300">
            <li>
              <div className="text-white font-medium">Live sprints</div>
              <div className="mt-1">Turn a seed idea into a filmed outline in minutes</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Outputs</div>
              <div className="mt-1">Shorts scripts, captions, callouts and more</div>
            </li>
          </ul>
        </div>
      );
    case "Creator Panels":
      return (
        <div className="space-y-5">
          <p className="text-white/90">Conversations on growth, formats, and AI—with rapid audience Q&A.</p>
          <ul className="space-y-3 text-sm text-zinc-300">
            <li>
              <div className="text-white font-medium">Topics</div>
              <div className="mt-1">Rise of the creator economy • AI: threat or boon?</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Format</div>
              <div className="mt-1">Panels + rapid questions; meet & greet after</div>
            </li>
          </ul>
        </div>
      );
    case "GameOn Esports":
      return (
        <div className="space-y-5">
          <p className="text-white/90">Fully online Valorant & BGMI tournament. Winners announced at ICS'25 awards ceremony on Nov 23.</p>
          <ul className="space-y-3 text-sm text-zinc-300">
            <li>
              <div className="text-white font-medium">Format</div>
                <div className="mt-1">Online qualifiers (Nov 8) → Finals (Nov 15)</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Entry</div>
              <div className="mt-1">₹500/team • Cashback via creator tasks • 120 team cap</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Watch</div>
              <div className="mt-1">Instagram/YouTube live streams • Awards on Nov 23 @ IIIT Delhi</div>
            </li>
          </ul>
          <div className="pt-2">
            <Link href="/ics25/gameon" className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.07] transition-colors">View rules & register →</Link>
          </div>
        </div>
      );
    case "Creator Awards":
      return (
        <div className="space-y-5">
          <p className="text-white/90">Celebrating creators across categories—from education to comedy and gaming.</p>
          <ul className="space-y-3 text-sm text-zinc-300">
            <li>
              <div className="text-white font-medium">Categories</div>
              <div className="mt-1">Education, AI Innovator, Rising Comedy, Gaming, Underrated, Lifestyle</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Timeline</div>
              <div className="mt-1">Nominate your favorite creators • Awards during closing ceremony (Nov 23)</div>
            </li>
          </ul>
          
        </div>
      );
    case "Networking Zones":
      return (
        <div className="space-y-5">
          <p className="text-white/90">Meet brands, collaborators and fans—curated spaces to spark real collabs.</p>
          <ul className="space-y-3 text-sm text-zinc-300">
            <li>
              <div className="text-white font-medium">Lounges</div>
              <div className="mt-1">Speed networking + themed hubs (fashion, edutainment, chill)</div>
            </li>
            <li className="divider-gradient" />
            <li>
              <div className="text-white font-medium">Brand booths</div>
              <div className="mt-1">Hands‑on with tools and opportunities</div>
            </li>
          </ul>
        </div>
      );
    default:
      return (
        <div className="space-y-3">
          <p className="text-white/90">More details coming soon.</p>
        </div>
      );
  }
}
