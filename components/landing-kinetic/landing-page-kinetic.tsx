"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteFooter } from "@/components/shared/site-footer";
import { LogoBrand, AuthButtons, NavItem, menuItems } from "@/components/shared/site-navbar";

/**
 * Landing — Kinetic ("Your entire studio").
 *
 * Port of the founder-finalized + polished mock (insturix-kinetic-v5.html). Kinetic-typography
 * home: huge display hero with a faint STUDIO watermark, a cursor "invert lens" that swaps
 * gold/cream in a circle, a verb marquee, variable-weight scroll lines, a six-stage list,
 * trust strip, and a closing CTA.
 *
 * Scoped under `.ikin` so generic class names can't collide with global CSS. The invert lens is
 * a SECOND render of the content (`.kinv` overlay, absolute + cursor-masked + color-swapped) — no
 * DOM cloning — so React owns/cleans up both copies. Scroll/marquee/weight are driven by one
 * rAF loop that sets identical transforms on base + overlay so the lens stays aligned. The whole
 * thing degrades to static under prefers-reduced-motion. CTAs are hash anchors for now (wired to
 * real routes at swap time).
 */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@200..800&display=swap');

.ikin{--bg:#0B0B0A;--s1:#131312;--border:#1C1B19;--borderL:#282724;--text:#ECE9E1;--soft:#B5B2A8;--muted:#7A776E;--dim:#454340;--gold:#D4A652;--ease:cubic-bezier(0.16,1,0.3,1);
  position:relative;overflow-x:hidden;background:var(--bg);color:var(--text);font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased}
.ikin *,.ikin *::before,.ikin *::after{margin:0;padding:0;box-sizing:border-box}
.ikin .m{font-family:'JetBrains Mono',monospace}.ikin a{color:inherit;text-decoration:none}
.ikin ::selection{background:rgba(212,166,82,.18)}
.ikin .wrap{max-width:1280px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}
.ikin .kick{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);display:inline-flex;gap:11px;align-items:center}
.ikin .kick::before{content:'';width:22px;height:1px;background:var(--gold)}
.ikin nav{position:fixed;inset:0 0 auto 0;z-index:70;display:flex;justify-content:space-between;align-items:center;padding:18px clamp(16px,4vw,48px)}
.ikin nav .brandlink{display:inline-flex;align-items:center}
.ikin nav .navlinks{display:flex;align-items:center;gap:clamp(16px,2.4vw,30px)}
.ikin nav .navmid{display:flex;align-items:center;gap:clamp(16px,2.4vw,30px)}
.ikin nav .navlinks a{font-size:14px;color:var(--soft);transition:color .2s var(--ease)}
.ikin nav .navlinks a:hover{color:var(--text)}
.ikin nav .navlinks .navauth{display:inline-flex;align-items:center}
@media(max-width:720px){.ikin nav .navmid{display:none}}

/* mobile nav — burger (≤720px) + full-screen drawer. lens/cursor-none is off on touch (pointer:fine gate). */
.ikin nav .burger{display:none;flex-direction:column;justify-content:center;gap:5px;width:42px;height:42px;border:1px solid var(--borderL);border-radius:9px;background:transparent;cursor:pointer;transition:border-color .2s var(--ease)}
.ikin nav .burger:hover{border-color:rgba(212,166,82,.4)}
.ikin nav .burger span{display:block;width:18px;height:1.5px;margin:0 auto;background:var(--text)}
@media(max-width:720px){.ikin nav .navlinks .navauth{display:none}.ikin nav .burger{display:flex}}
.ikin .mobilemenu{position:fixed;inset:0;z-index:90;background:rgba(11,11,10,.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);display:flex;flex-direction:column;padding:88px clamp(20px,7vw,40px) 40px;opacity:0;visibility:hidden;transition:opacity .32s var(--ease),visibility .32s var(--ease)}
.ikin .mobilemenu.open{opacity:1;visibility:visible}
.ikin .mobilemenu a{font-weight:800;font-size:clamp(26px,7vw,40px);letter-spacing:-.03em;color:var(--text);padding:15px 0;border-bottom:1px solid var(--border);transition:color .2s var(--ease)}
.ikin .mobilemenu a:hover,.ikin .mobilemenu a:active{color:var(--gold)}
.ikin .mobilemenu .mm-close{position:absolute;top:22px;right:clamp(16px,4vw,48px);width:42px;height:42px;border:1px solid var(--borderL);border-radius:9px;background:transparent;color:var(--text);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.ikin .mobilemenu .mm-foot{margin-top:auto;display:flex;flex-direction:column;gap:12px;padding-top:34px}
.ikin .mobilemenu .mm-foot a{font-size:16px;text-align:center;border:none;padding:15px}
.ikin .mobilemenu .mm-foot .mm-signin{color:var(--soft);border:1px solid var(--borderL);border-radius:9px}
.ikin .mobilemenu .mm-foot .mm-start{background:var(--gold);color:var(--bg);border-radius:9px;font-weight:800}
.ikin nav .burger:focus-visible,.ikin .mobilemenu a:focus-visible,.ikin .mobilemenu .mm-close:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
@media(prefers-reduced-motion:reduce){.ikin .mobilemenu{transition:none}}
@media(min-width:721px){.ikin .mobilemenu{display:none}}

.ikin .hero{min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:120px 0 70px;position:relative;overflow:hidden}
.ikin .markwrap{position:absolute;right:-2vw;bottom:-4vh;z-index:0;pointer-events:none;will-change:transform}
.ikin .mark{font-weight:800;font-size:30vw;line-height:.7;letter-spacing:-.05em;white-space:nowrap}
.ikin .mark.base{color:rgba(236,233,225,.04)}
.ikin .mark.gold{position:absolute;inset:0;color:rgba(212,166,82,.42);
  -webkit-mask-image:radial-gradient(circle 200px at var(--mx,-999px) var(--my,-999px),#000 0 42%,transparent 100%);
  mask-image:radial-gradient(circle 200px at var(--mx,-999px) var(--my,-999px),#000 0 42%,transparent 100%)}
.ikin .hero .inner{position:relative;z-index:1}
.ikin .hero .kick{margin-bottom:30px}
.ikin .ktitle{margin:0;font-size:inherit;font-weight:inherit;line-height:inherit}
.ikin .kline{display:block;font-weight:800;letter-spacing:-.05em;line-height:.86;white-space:nowrap;transform-origin:left center;will-change:transform}
.ikin .kline.l1{font-size:clamp(52px,16vw,210px);color:var(--text)}
.ikin .kline.l2{font-size:clamp(52px,16vw,210px);color:var(--gold)}
.ikin .hero .sub{margin-top:38px;max-width:46ch;color:var(--soft);font-size:clamp(15px,1.7vw,18px);line-height:1.6}
.ikin .hero .sub b{color:var(--text);font-weight:600}
.ikin .acts{display:flex;gap:13px;margin-top:34px;flex-wrap:wrap}
.ikin .sb-badges{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px}
.ikin .sb-badges a{display:inline-flex;line-height:0;cursor:pointer}
.ikin .sb-badges img{display:block;height:55px;width:auto;max-width:min(44vw,240px)}
.ikin .btn{font-weight:800;font-size:14px;padding:14px 26px;border-radius:8px;cursor:pointer;border:1px solid transparent;display:inline-flex;gap:9px;align-items:center;transition:.22s var(--ease)}
.ikin .go{background:var(--gold);color:var(--bg)}.ikin .go:hover{background:#E0B868}
.ikin .ghost{color:var(--soft);border-color:var(--borderL)}.ikin .ghost:hover{color:var(--text);border-color:rgba(212,166,82,.4)}
@keyframes ikRise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes ikFade{from{opacity:0}to{opacity:1}}
.ikin .hero .kick{animation:ikRise .7s var(--ease) both}
.ikin .kline.l1{animation:ikFade .9s var(--ease) .08s both}
.ikin .kline.l2{animation:ikFade .9s var(--ease) .18s both}
.ikin .hero .sub{animation:ikRise .8s var(--ease) .30s both}
.ikin .hero .acts{animation:ikRise .8s var(--ease) .42s both}
.ikin .hero .sb-badges{animation:ikRise .8s var(--ease) .54s both}
.ikin .btn:focus-visible,.ikin nav a:focus-visible,.ikin .sb-badges a:focus-visible{outline:2px solid var(--gold);outline-offset:3px}

.ikin .verbs{border-block:1px solid var(--border);padding:28px 0;overflow:hidden;white-space:nowrap}
.ikin .verbs .track{display:inline-flex;align-items:baseline;will-change:transform}
.ikin .verbs .v{font-weight:800;font-size:clamp(40px,8vw,110px);letter-spacing:-.04em;padding-inline:34px;color:var(--text)}
.ikin .verbs .v.g{color:var(--gold)}
.ikin .verbs .v .num{font-family:'JetBrains Mono',monospace;font-size:.18em;color:var(--dim);font-weight:400;vertical-align:super;margin-right:.2em}

.ikin .weigh{padding:130px 0}
.ikin .weigh .kick{margin-bottom:40px}
/* The scroll loop animates "wght" 200->800 on these lines. Bolder glyphs are WIDER, so the
   wrap point must never sit between those two weights or the line re-wraps mid-scroll and the
   page jumps. Measured with the real Plus Jakarta Sans: 15ch put "Six stages, one prompt."
   right on the boundary (it flipped 1->2 lines at wght 610, at every viewport 320-1920).
   16ch + a 26px floor is stable across the whole weight range at 320/360/375/430/768/1024/
   1440/1920. Re-measure before changing either number or the copy of these lines. */
.ikin .wl{font-weight:300;font-size:clamp(26px,6.4vw,90px);letter-spacing:-.03em;line-height:1.04;color:var(--soft);will-change:font-variation-settings,color;max-width:16ch}
.ikin .wl + .wl{margin-top:8px}
.ikin .wl b{color:var(--gold);font-weight:inherit}

.ikin .stages{padding:30px 0 120px}
.ikin .stages .kick{margin-bottom:34px}
.ikin .plist{border-top:1px solid var(--border)}
.ikin .ph{display:grid;grid-template-columns:54px 160px 1fr;gap:24px;align-items:baseline;padding:26px 0;border-bottom:1px solid var(--border);position:relative}
.ikin .ph .no{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--dim)}
.ikin .ph .nm{font-weight:800;font-size:clamp(22px,3vw,30px);letter-spacing:-.025em;transition:color .25s var(--ease)}
.ikin .ph .ds{color:var(--soft);font-size:15px;line-height:1.55;max-width:56ch}
.ikin .ph::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:1px;background:var(--gold);transform:scaleX(0);transform-origin:left;transition:transform .45s var(--ease)}
.ikin .ph:hover::after{transform:scaleX(1)}.ikin .ph:hover .nm{color:var(--gold)}
@media(max-width:620px){.ikin .ph{grid-template-columns:42px 1fr}.ikin .ph .ds{grid-column:1/-1;margin-top:6px}}

.ikin .trust{border-top:1px solid var(--border);padding:46px 0}
.ikin .trust .wrap{display:flex;flex-direction:column;align-items:center;gap:22px;text-align:center}
.ikin .trust .tl{font-family:'JetBrains Mono',monospace;font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim)}
.ikin .trust .names{display:flex;flex-wrap:wrap;gap:14px 44px;justify-content:center}
.ikin .trust .names span{font-weight:800;font-size:clamp(15px,2.2vw,20px);color:var(--soft);letter-spacing:-.02em}

.ikin .cta{padding:140px 0 130px;text-align:center;position:relative;overflow:hidden}
.ikin .cta .mark{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);font-weight:800;font-size:16vw;color:rgba(212,166,82,.04);line-height:.7;letter-spacing:-.05em;pointer-events:none;white-space:nowrap}
.ikin .cta .inner{position:relative;z-index:1}
.ikin .cta h2{font-weight:800;font-size:clamp(40px,9vw,100px);letter-spacing:-.05em;line-height:.9}
.ikin .cta h2 span{color:var(--gold)}
.ikin .cta p{color:var(--soft);max-width:38ch;margin:24px auto 36px;font-size:17px;line-height:1.6}
.ikin .cta .acts{justify-content:center}
.ikin .cta .sb-badges{justify-content:center}
.ikin footer{border-top:1px solid var(--border);padding:30px 0;text-align:center}.ikin footer .m{font-size:11px;color:var(--dim);letter-spacing:.06em}

/* cursor/lens: keep the OS cursor visible; JS reveals the lens only over text targets. */
.ikin.haslens{cursor:auto}
.ikin.haslens nav,.ikin.haslens nav *,.ikin.haslens .mobilemenu,.ikin.haslens .mobilemenu *{cursor:auto}
.ikin.haslens nav a,.ikin.haslens nav button,.ikin.haslens .mobilemenu a,.ikin.haslens .mobilemenu button,.ikin.haslens .btn{cursor:pointer}
/* invert lens — second copy of content, masked to cursor, colors swapped */
.ikin .kinv{position:absolute;top:0;left:0;width:100%;z-index:60;pointer-events:none;
  -webkit-mask-image:radial-gradient(circle var(--r,50px) at var(--mx,-999px) var(--my,-999px),#000 0 96%,transparent 100%);
  mask-image:radial-gradient(circle var(--r,50px) at var(--mx,-999px) var(--my,-999px),#000 0 96%,transparent 100%);opacity:0;transition:opacity .12s var(--ease)}
.ikin.textlens .kinv{opacity:1}
.ikin .kinv *{color:var(--gold)!important;animation:none!important}
.ikin .kinv .l2,.ikin .kinv .v.g,.ikin .kinv .wl b,.ikin .kinv .cta h2 span{color:var(--text)!important}
.ikin .kinv .markwrap,.ikin .kinv .cta .mark{display:none!important}
.ikin .kinv .acts,.ikin .kinv .sb-badges{visibility:hidden!important}
@media(prefers-reduced-motion:reduce){.ikin .kline,.ikin .markwrap{transform:none!important}.ikin .kinv{display:none}.ikin .hero .kick,.ikin .hero .sub,.ikin .hero .acts,.ikin .kline{animation:none!important;opacity:1!important}}
`;

const TEXT_LENS_TARGET_SELECTOR = [
  ".hero .kick",
  ".hero .kline",
  ".hero .sub",
  ".verbs .v",
  ".weigh .kick",
  ".weigh .wl",
  ".stages .kick",
  ".ph .no",
  ".ph .nm",
  ".ph .ds",
  ".trust .tl",
  ".trust .names span",
  ".cta h2",
  ".cta p",
].join(",");

function StartupBaseBadges() {
  return (
    <div className="sb-badges" aria-label="StartupBase badges">
      <a
        href="https://startupbase.io/products/insturix?utm_source=startupbase&utm_medium=badge&utm_campaign=featured-badge-dark"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Insturix featured on StartupBase"
      >
        <img
          src="https://statics.startupbase.io/site/badges/featured-on-sb-dark.svg"
          alt="Featured on StartupBase"
          height={55}
          loading="lazy"
          fetchPriority="low"
        />
      </a>
    </div>
  );
}

// The hero headline. <Content /> is rendered TWICE — once normally and once inside
// the aria-hidden `.kinv` cursor-masked overlay — so only the primary copy may be an
// <h1>. aria-hidden keeps the duplicate away from screen readers but NOT from
// crawlers, which parse both copies out of the HTML and would report two h1 tags.
// The overlay copy renders the same markup as a div: identical `.ktitle` styling,
// just not a heading.
const Headline: React.FC<{ primary?: boolean }> = ({ primary }) => {
  const Tag = primary ? "h1" : "div";
  return (
    <Tag className="ktitle">
      <span className="kline l1">YOUR ENTIRE</span>
      <span className="kline l2">STUDIO.</span>
    </Tag>
  );
};

const Content: React.FC<{ ids?: boolean }> = ({ ids }) => (
  <>
    <header className="hero">
      <div className="markwrap">
        <div className="mark base">STUDIO</div>
        <div className="mark gold">STUDIO</div>
      </div>
      <div className="wrap inner">
        <span className="kick">One platform · entire production</span>
        <Headline primary={ids} />
        <p className="sub">Hand it a brief. Every cut comes back <b>shaped for its channel — and on brand.</b> The whole studio runs in one browser tab. Nothing to install.</p>
        <div className="acts"><Link className="btn go" href="/signup">Start free →</Link><Link className="btn ghost" href="/contactus">Talk to sales</Link></div>
        <StartupBaseBadges />
      </div>
    </header>

    <section className="verbs" aria-hidden="true">
      <div className="track">
        <span className="v"><span className="num">01</span>Script</span><span className="v g"><span className="num">02</span>Edit</span><span className="v"><span className="num">03</span>Analyze</span><span className="v"><span className="num">04</span>Design</span><span className="v g"><span className="num">05</span>Music</span><span className="v"><span className="num">06</span>Publish</span>
        <span className="v"><span className="num">01</span>Script</span><span className="v g"><span className="num">02</span>Edit</span><span className="v"><span className="num">03</span>Analyze</span><span className="v"><span className="num">04</span>Design</span><span className="v g"><span className="num">05</span>Music</span><span className="v"><span className="num">06</span>Publish</span>
      </div>
    </section>

    <section className="weigh wrap" id={ids ? "changes" : undefined}>
      <span className="kick">What changes</span>
      <div className="wl">Twelve tools, <b>one tab.</b></div>
      <div className="wl">Six stages, one prompt.</div>
      <div className="wl">One master, <b>every channel.</b></div>
      <div className="wl">All of it, on brand.</div>
    </section>

    <section className="stages wrap" id={ids ? "how" : undefined}>
      <span className="kick">Six stages · one prompt</span>
      <div className="plist">
        <div className="ph"><span className="no">01</span><span className="nm">Script</span><span className="ds">The brief becomes a structured treatment — hook, body, CTA.</span></div>
        <div className="ph"><span className="no">02</span><span className="nm">Edit</span><span className="ds">Cut to the script — captions sync, color and audio settle.</span></div>
        <div className="ph"><span className="no">03</span><span className="nm">Analyze</span><span className="ds">Read back for pacing, retention and brand fit.</span></div>
        <div className="ph"><span className="no">04</span><span className="nm">Design</span><span className="ds">Frame options generated and ranked for the click.</span></div>
        <div className="ph"><span className="no">05</span><span className="nm">Music</span><span className="ds">A licensed track matched to the edit and cleared.</span></div>
        <div className="ph"><span className="no">06</span><span className="nm">Publish</span><span className="ds">One master, re-cut to every channel — ready to post.</span></div>
      </div>
    </section>

    <div className="trust" id={ids ? "backed" : undefined}>
      <div className="wrap"><span className="tl">Recognised &amp; backed by</span>
        <div className="names"><span>Google for Startups</span><span>Microsoft for Startups</span><span>DPIIT recognised</span><span>UP StartinUP</span></div>
      </div>
    </div>

    <section className="cta" id={ids ? "cta" : undefined}>
      <div className="mark">EVERYTHING</div>
      <div className="wrap inner">
        <h2>One tab. <span>Everything in it.</span></h2>
        <p>Start with a brief. Leave with the whole slate, ready to post — all in one tab.</p>
        <div className="acts"><Link className="btn go" href="/signup">Start free →</Link><Link className="btn ghost" href="/contactus">Talk to sales</Link></div>
      </div>
    </section>
  </>
);

export const LandingKinetic: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer:fine)").matches;
    const kinv = root.querySelector<HTMLElement>(".kinv");
    const tracks = Array.from(root.querySelectorAll<HTMLElement>(".verbs .track"));
    const klines = Array.from(root.querySelectorAll<HTMLElement>(".kline"));
    const mws = Array.from(root.querySelectorAll<HTMLElement>(".markwrap"));
    const wls = Array.from(root.querySelectorAll<HTMLElement>(".wl"));

    let onMove: ((e: MouseEvent) => void) | null = null;
    if (fine && !reduce && kinv) {
      onMove = (e: MouseEvent) => {
        let target: Element | null = null;
        if (e.target instanceof Element) {
          target = e.target;
        } else if (e.target instanceof Node) {
          target = e.target.parentElement;
        }

        const showLens = Boolean(
          target &&
          root.contains(target) &&
          target.closest(TEXT_LENS_TARGET_SELECTOR)
        );
        root.classList.toggle("textlens", showLens);
        if (!showLens) {
          kinv.style.setProperty("--mx", "-999px");
          kinv.style.setProperty("--my", "-999px");
          return;
        }

        kinv.style.setProperty("--mx", e.clientX + "px");
        kinv.style.setProperty("--my", e.clientY + window.scrollY + "px");
      };
      document.addEventListener("mousemove", onMove, { passive: true });
      // Lens is available, but the native cursor remains visible.
      root.classList.add("haslens");
    } else if (kinv) {
      kinv.style.display = "none";
    }

    let raf = 0;
    const loop = (ts: number) => {
      const perc = ((ts / 30000) * 50) % 50;
      const tf = "translateX(-" + perc + "%)";
      tracks.forEach((t) => { t.style.transform = tf; });
      if (!reduce) {
        const vh = window.innerHeight;
        const cy = vh / 2;
        const p = Math.min(1, Math.max(0, window.scrollY / (vh * 0.8)));
        klines.forEach((el) => {
          const i = el.classList.contains("l2") ? 1 : 0;
          el.style.transform = "scaleX(" + (1 - p * (0.05 + i * 0.03)) + ")";
        });
        mws.forEach((el) => { el.style.transform = "translateX(" + p * -70 + "px) scaleX(" + (1 - p * 0.1) + ")"; });
        wls.forEach((el) => {
          const r = el.getBoundingClientRect();
          const mid = r.top + r.height / 2;
          const t = Math.min(1, Math.max(0, 1 - Math.abs(mid - cy) / (vh * 0.5)));
          el.style.fontVariationSettings = '"wght" ' + Math.round(200 + t * 600);
          el.style.color = t > 0.55 ? "var(--text)" : "var(--soft)";
        });
      }
      raf = requestAnimationFrame(loop);
    };
    if (reduce) { tracks.forEach((t) => { t.style.transform = "none"; }); }
    else { raf = requestAnimationFrame(loop); }

    return () => {
      cancelAnimationFrame(raf);
      root.classList.remove("haslens", "textlens");
      if (onMove) document.removeEventListener("mousemove", onMove);
    };
  }, []);

  // Mobile drawer: lock body scroll + close on Escape while open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // Close the drawer when the viewport grows back to desktop (drawer is display:none there,
  // so without this the scroll-lock above would strand on a hidden menu).
  useEffect(() => {
    const mq = window.matchMedia("(min-width:721px)");
    const onChange = () => { if (mq.matches) setMenuOpen(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <>
    <div className="ikin" ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <nav>
        <Link href="/" className="brandlink" aria-label="Insturix home"><LogoBrand /></Link>
        <div className="navlinks">
          <span className="navmid">
            {menuItems.map((item) => (
              <NavItem
                key={item.title}
                item={item}
                activeDropdown={activeDropdown}
                setActiveDropdown={setActiveDropdown}
                pathname={pathname}
              />
            ))}
          </span>
          <span className="navauth"><AuthButtons /></span>
          <button
            type="button"
            className="burger"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="ik-mobile-menu"
            onClick={() => setMenuOpen(true)}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>

      <div
        className={menuOpen ? "mobilemenu open" : "mobilemenu"}
        id="ik-mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!menuOpen}
      >
        <button type="button" className="mm-close" aria-label="Close menu" onClick={() => setMenuOpen(false)}>✕</button>
        {menuItems.map((item) => (
          <Link
            key={item.title}
            href={item.href === "#" ? (item.subItems?.[0]?.href ?? "#") : item.href}
            onClick={() => setMenuOpen(false)}
          >
            {item.title}
          </Link>
        ))}
        <div className="mm-foot">
          <AuthButtons />
        </div>
      </div>
      <Content ids />
      <div className="kinv" aria-hidden="true"><Content /></div>
    </div>
      <SiteFooter />
    </>
  );
};

export default LandingKinetic;
