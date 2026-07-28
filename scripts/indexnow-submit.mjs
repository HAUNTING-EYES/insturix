#!/usr/bin/env node
/**
 * IndexNow submitter — tells Bing and Yandex to crawl our pages now instead of
 * waiting for their own schedule. Google does NOT support IndexNow.
 *
 * This matters beyond Bing's own traffic: ChatGPT's web search is Bing-backed, so
 * Bing's index is an input to whether assistants can cite Insturix at all.
 *
 * Ownership is proved by a key file served from the site root. That file must be
 * LIVE before submitting — the script refuses to run otherwise, because IndexNow
 * rejects (and can throttle) submissions whose key it cannot fetch.
 *
 * Usage:
 *   node scripts/indexnow-submit.mjs --dry-run   # show what would be sent
 *   node scripts/indexnow-submit.mjs             # submit
 *   node scripts/indexnow-submit.mjs --url https://www.insturix.com/about   # single URL
 */

const KEY = "e81c87e72f661ce706de70a8c6e7539b";
const HOST = "www.insturix.com";
const ORIGIN = `https://${HOST}`;
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;
const SITEMAP = `${ORIGIN}/sitemap-0.xml`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const singleUrl = args[args.indexOf("--url") + 1];
const only = args.includes("--url") ? [singleUrl] : null;

const die = (msg) => { console.error(`\n❌ ${msg}\n`); process.exit(1); };

// The key file has to be reachable or IndexNow cannot verify ownership.
async function assertKeyIsLive() {
  const res = await fetch(KEY_LOCATION).catch((e) => die(`cannot reach ${KEY_LOCATION}: ${e.message}`));
  if (!res.ok) die(`${KEY_LOCATION} returned ${res.status}. Deploy the key file first, then re-run.`);
  const body = (await res.text()).trim();
  if (body !== KEY) die(`${KEY_LOCATION} served "${body}" but the key is "${KEY}".`);
  console.log(`✅ key verified at ${KEY_LOCATION}`);
}

async function urlsFromSitemap() {
  const res = await fetch(SITEMAP).catch((e) => die(`cannot reach ${SITEMAP}: ${e.message}`));
  if (!res.ok) die(`${SITEMAP} returned ${res.status}`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (urls.length === 0) die(`no <loc> entries found in ${SITEMAP} — refusing to submit an empty list`);
  return urls;
}

const STATUS = {
  200: "OK — URLs accepted",
  202: "Accepted — key pending validation (normal on a first submission)",
  400: "Bad request — malformed payload",
  403: "Forbidden — key not valid for this host",
  422: "Unprocessable — a URL does not belong to this host, or the key does not match",
  429: "Too many requests — slow down and retry later",
};

async function main() {
  await assertKeyIsLive();
  const urlList = only ?? (await urlsFromSitemap());

  const offHost = urlList.filter((u) => !u.startsWith(ORIGIN));
  if (offHost.length) die(`these URLs are not on ${ORIGIN}: ${offHost.join(", ")}`);

  console.log(`\n${urlList.length} URL(s) to submit:`);
  urlList.forEach((u) => console.log(`   ${u}`));

  if (DRY) { console.log("\n(dry run — nothing sent)\n"); return; }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });

  const note = STATUS[res.status] ?? "unexpected status";
  const body = await res.text().catch(() => "");
  console.log(`\nIndexNow responded ${res.status} — ${note}`);
  if (body) console.log(body.slice(0, 400));

  if (res.status !== 200 && res.status !== 202) process.exit(1);
  console.log("\n✅ submitted\n");
}

main();
