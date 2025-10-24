import React from "react";

export type TournamentKey = "valorant" | "bgmi";

export function getTournamentDetail(key: TournamentKey): React.ReactNode {
  if (key === "valorant") {
    return (
      <div className="space-y-4">
        <section>
          <h4 className="text-white font-semibold mb-1">Format</h4>
          <ul className="list-disc list-inside text-zinc-300 text-sm space-y-1">
            <li>Online qualifiers: Single-elimination (Best-of-1).</li>
            <li>Finals at ICS’25: Double-elimination (Best-of-3).</li>
            <li>Team size: 5 players; 1 substitute allowed. Substitutes should be added at the team's discretion and registered in advance. Substitutes follow the same payment process; refund may be requested by the substitute only before qualifiers begin. No refunds after qualifiers begin.</li>
          </ul>
        </section>
        <section>
          <h4 className="text-white font-semibold mb-1">Prize Pool (Valorant share: ₹12,500)</h4>
          <ul className="list-disc list-inside text-zinc-300 text-sm space-y-1">
            <li>1st: ₹7,000</li>
            <li>2nd: ₹4,000</li>
            <li>3rd: ₹1,500</li>
          </ul>
        </section>
        <section>
          <h4 className="text-white font-semibold mb-1">Competitive Rules</h4>
          <ul className="list-disc list-inside text-zinc-300 text-sm space-y-1">
            <li>Map pool: Ascent, Bind, Haven, Icebox, Lotus, Sunset.</li>
            <li>Standard competitive rules; no custom agent bans beyond official patches.</li>
            <li>Voice comms allowed within team only; no external coaching.</li>
            <li>Overtime: Standard Valorant OT (6-round, alternating pistol eco).</li>
          </ul>
        </section>
        <section>
          <h4 className="text-white font-semibold mb-1">Admin & Fair Play</h4>
          <ul className="list-disc list-inside text-zinc-300 text-sm space-y-1">
            <li>Match seeding based on qualifiers and random draw.</li>
            <li>Disconnects: Pause up to 5 minutes; technical loss after 2 disconnects per match.</li>
            <li>Disputes: Raise via Discord tickets; reviewed by admins with video evidence.</li>
          </ul>
        </section>
        <section>
          <h4 className="text-white font-semibold mb-1">Finals Setup</h4>
          <ul className="list-disc list-inside text-zinc-300 text-sm space-y-1">
            <li>Fully online finals on Nov 8.</li>
            <li>Own PC with stable internet required; Discord voice mandatory.</li>
          </ul>
        </section>
      </div>
    );
  }

  // BGMI
  return (
    <div className="space-y-4">
      <section>
        <h4 className="text-white font-semibold mb-1">Format</h4>
        <ul className="list-disc list-inside text-zinc-300 text-sm space-y-1">
          <li>Online qualifiers: Round-robin on Nov 1.</li>
          <li>Online finals: Knockout finals on Nov 8.</li>
          <li>Team size: 4 players; 1 substitute allowed. Substitutes should be added at the team's discretion and registered in advance. Substitutes follow the same payment process; refund may be requested by the substitute only before qualifiers begin. No refunds after qualifiers begin.</li>
        </ul>
      </section>
      <section>
        <h4 className="text-white font-semibold mb-1">Prize Pool (BGMI share: ₹12,500)</h4>
        <ul className="list-disc list-inside text-zinc-300 text-sm space-y-1">
          <li>1st: ₹7,000</li>
          <li>2nd: ₹4,000</li>
          <li>3rd: ₹1,500</li>
        </ul>
      </section>
      <section>
        <h4 className="text-white font-semibold mb-1">Rules & Devices</h4>
        <ul className="list-disc list-inside text-zinc-300 text-sm space-y-1">
          <li>Mobile-only; emulators not allowed.</li>
          <li>Maps: Erangel, Miramar, Sanhok, Vikendi (classic squad matches).</li>
          <li>Mode: TPP only.</li>
          <li>Rooms & codes shared 30 minutes prior via Discord and email.</li>
        </ul>
      </section>
      <section>
        <h4 className="text-white font-semibold mb-1">Anti‑Cheat & Points</h4>
        <ul className="list-disc list-inside text-zinc-300 text-sm space-y-1">
          <li>BGMI built-in anti‑cheat + admin monitoring via spectator mode.</li>
          <li>Disconnects: 5-minute grace period to reconnect.</li>
          <li>Points: 10 for 1st, 8 for 2nd, down to 1 for 10th; survival and kills bonus.</li>
        </ul>
      </section>
      <section>
        <h4 className="text-white font-semibold mb-1">Finals Setup</h4>
        <ul className="list-disc list-inside text-zinc-300 text-sm space-y-1">
          <li>Fully online tournament (Nov 1 qualifiers, Nov 8 finals).</li>
          <li>Stable internet connection and own device required.</li>
          <li>Winners announced at ICS'25 awards ceremony on Nov 23 @ IIIT Delhi.</li>
        </ul>
      </section>
    </div>
  );
}
