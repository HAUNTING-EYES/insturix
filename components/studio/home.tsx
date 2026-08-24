"use client";

/**
 * Vibe Home — where the vibe begins. The starting prompt IS the empty state;
 * producing-now carries live statuses; deliverables group by brand.
 * Phase 1: navigation routes into the mock session; Phase 6 wires real data.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MOCK_BRANDS, MOCK_DELIVERABLE, MOCK_DELIVERABLE_EMAIL, MOCK_WALLET } from "@/lib/studio/mock/data";
import { studioRealTurnsEnabled } from "@/lib/studio/client/turnClient";
import type { StudioDeliverable } from "@/lib/studio/contracts/objects";

const STATUS_COLOR: Record<string, string> = {
  done: "var(--green)",
  running: "var(--gold)",
  queued: "var(--faint)",
};

export function StudioHome() {
  const router = useRouter();
  const REAL = studioRealTurnsEnabled;
  const [brand, setBrand] = useState<string>(MOCK_BRANDS[0].id);
  const [prompt, setPrompt] = useState("");
  const [realDeliverables, setRealDeliverables] = useState<StudioDeliverable[] | null>(null);
  const [realBrands, setRealBrands] = useState<Record<string, string>>({});
  const [realError, setRealError] = useState<string | null>(null);

  useEffect(() => {
    if (!REAL) return;
    fetch("/api/studio/deliverables")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { deliverables: StudioDeliverable[]; brands?: Record<string, string> }) => {
        setRealDeliverables(d.deliverables ?? []);
        setRealBrands(d.brands ?? {});
      })
      .catch((e: Error) => setRealError(e.message));
  }, [REAL]);

  const deliverables = REAL ? (realDeliverables ?? []) : [MOCK_DELIVERABLE, MOCK_DELIVERABLE_EMAIL];
  const producing = deliverables.filter((d) => d.artifacts.some((a) => a.status === "running"));
  const nike = deliverables.filter((d) => d.brandId === "br_nike");
  const alo = deliverables.filter((d) => d.brandId === "br_alo");
  const rest = deliverables.filter((d) => d.brandId !== "br_nike" && d.brandId !== "br_alo");

  const go = (id: string) => router.push(`/studio/d/${id}`);

  return (
    <div className="stu">
      <header className="stu-top">
        <div className="stu-brand">
          <span className="stu-mark" />
          <span className="stu-word">Instu<b>rix</b></span>
        </div>
        <div className="stu-topright">
          <span className="stu-credits">{MOCK_WALLET.main} cr</span>
          <div className="stu-credits" style={{ borderRadius: 99, width: 32, height: 32, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>NJ</div>
        </div>
      </header>
      <div className="stu-homebody">
        <div className="stu-herowrap">
          <div className="stu-hi">What do you want to make?</div>
          <form
            className="stu-bigprompt"
            onSubmit={(e) => {
              e.preventDefault();
              go(MOCK_DELIVERABLE.id);
            }}
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="One line is enough — the agent plans the rest"
              aria-label="What do you want to make?"
            />
            <span className="stu-credits">⌘K</span>
          </form>
          <div className="stu-sugg">
            <button onClick={() => go(MOCK_DELIVERABLE.id)}>a 30s launch reel</button>
            <button onClick={() => go(MOCK_DELIVERABLE_EMAIL.id)}>a launch email to the waitlist</button>
            <button onClick={() => go(MOCK_DELIVERABLE.id)}>teardown a competitor&apos;s ad</button>
          </div>
        </div>

        <div className="stu-homesections">
          <section className="stu-hsec">
            <div className="st"><span className="t">Producing now</span><span className="n">{REAL ? `${producing.length} live` : "1 deliverable · live"}</span></div>
            <button className="stu-pnow" onClick={() => go(MOCK_DELIVERABLE.id)}>
              <span className="live" />
              <div>
                <div className="nm">{MOCK_DELIVERABLE.title}</div>
                <div className="ev">cut_section · 2m ago</div>
              </div>
              <div className="pips-mini">
                {MOCK_DELIVERABLE.artifacts.map((a) => (
                  <span className="stu-pm" key={a.id}>
                    <i style={{ background: STATUS_COLOR[a.status] ?? "var(--faint)" }} />
                    {a.title.toLowerCase()}
                  </span>
                ))}
              </div>
              <span className="ch">→</span>
            </button>
          </section>

          <section className="stu-hsec">
            <div className="st"><span className="t">Your work</span><span className="n">{MOCK_BRANDS.length} brands · {deliverables.length} deliverables</span></div>
            {[
              { id: MOCK_BRANDS[0].id, name: MOCK_BRANDS[0].name, list: nike },
              { id: MOCK_BRANDS[1].id, name: MOCK_BRANDS[1].name, list: alo },
              ...(REAL
                ? Object.entries(
                    deliverables.reduce<Record<string, StudioDeliverable[]>>((acc, d) => {
                      const key = realBrands[d.brandId] ?? d.brandId;
                      (acc[key] ??= []).push(d);
                      return acc;
                    }, {}),
                  ).map(([name, list]) => ({ id: name, name, list }))
                : [{ id: "rest", name: "Other brands", list: rest }]),
            ]
              .filter((g) => g.list.length > 0)
              .map((g) => (
              <div className="stu-bgroup" key={g.id}>
                <div className="stu-bhead">
                  <span className={`bd ${brand === g.id ? "on" : ""}`} />
                  <button className="bn" style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }} onClick={() => setBrand(g.id)}>{g.name}</button>
                </div>
                {g.list.map((d) => {
                  const producing = d.artifacts.some((a) => a.status === "running");
                  return (
                    <div className="stu-drow" key={d.id} onClick={() => go(d.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && go(d.id)}>
                      <div>
                        <div className="nm">{d.title}</div>
                        <div className="sub">{d.artifacts.map((a) => a.title.toLowerCase()).join(" · ")}</div>
                      </div>
                      <div className="arts">
                        {d.artifacts.map((a) => (
                          <i key={a.id} style={{ background: STATUS_COLOR[a.status] ?? "var(--faint)" }} />
                        ))}
                      </div>
                      <div className={`state ${producing ? "stu-s-producing" : "stu-s-shipped"}`}>
                        <i style={{ background: producing ? "var(--gold)" : "var(--green)" }} />
                        {producing ? "producing" : "shipped"}
                      </div>
                      <div className="upd">{producing ? "2m ago" : "Tue"}</div>
                      <span className="ch">→</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
