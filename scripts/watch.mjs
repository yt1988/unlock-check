// Hourly probe check, run on 1ms.dog's Tokyo server (1ms-unlock-watch, see watch/README.md): asks every service
// the way the page does, with the same readers and judge() (src/lib.mjs), and records whether each check still works.
// It doesn't measure unlocking for visitors (a datacenter address is not a visitor's), only that each endpoint still
// answers in the shape the page reads, and whether the answer from Japan matches the service's published list.
//
//   node scripts/watch.mjs <out dir>      writes <out dir>/status.json (atomically; the previous one carries the history)
//
// Per service:
//   s       "ok"     the check works: its answer reads, and it agrees with the published list where there is one
//           "drift"  it reads, but says the opposite of the list for Japan (a changed endpoint, or a datacenter refusal)
//           "bad"    it doesn't read: no answer, an answer the reader doesn't know, a redirect test that can't count
//   streak  runs in a row in this state; since: when it began; ok_at: the last run it was "ok"
//   how, v, cc, n, hops, err   what judge() made of it, the HTTP status, the redirects counted, the error
// The page treats a check as broken when s isn't "ok" for 2 runs in a row (src/app.js, watchBad).
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { SERVICES } from "../src/services.mjs";
import { READERS, judge, offered } from "../src/lib.mjs";

const OUT = process.argv[2] || "out", HERE = process.env.WATCH_CC || "JP", TIMEOUT = 10000, MAX_HOPS = 6, PARALLEL = 6;
// a browser's request: some services answer scripts differently
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const H = { "user-agent": UA, "accept-language": "en-US,en;q=0.9", origin: "https://unlock.1ms.dog" };

const tk2 = () => Buffer.from(`did=${randomUUID()}|pno=1030|ver=0.3.0301|clit=${Math.floor(Date.now() / 1000)}`).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").split("").reverse().join("");

async function get(url, init = {}, redirect = "follow") {
  try {
    const r = await fetch(url, { ...init, headers: { ...H, ...(init.headers || {}) }, redirect, signal: AbortSignal.timeout(TIMEOUT) });
    const text = redirect === "manual" ? (await r.body?.cancel(), "") : await r.text().catch(() => "");
    return { st: r.status, text, loc: r.headers.get("location") };
  } catch (e) { return { why: e && e.name === "TimeoutError" ? "timeout" : "net" }; }
}
// redirects a URL adds before it answers; null when it can't be followed to an answer
async function hops(url) {
  for (let k = 0, u = url; k <= MAX_HOPS; k++) {
    const a = await get(u, {}, "manual");
    if (a.why) return null;
    if (a.st < 300 || a.st >= 400 || !a.loc) return k;
    u = new URL(a.loc, u).href;
  }
  return null;
}
// a JSONP answer's argument, as the page's frame posts it (JSON.stringify of the callback's argument)
const unwrap = (text, cb) => {
  const i = text.indexOf(cb + "("), j = text.lastIndexOf(")");
  if (i < 0 || j < i) return null;
  try { return JSON.stringify(JSON.parse(text.slice(i + cb.length + 1, j))); } catch (e) { return null; }
};

// what the page's ask() gets (src/app.js), from here
async function ask(s) {
  const p = s.probe, r = { err: null, reach: null };
  if (p.jsonp) {
    const a = await get(p.jsonp);
    if (a.why) { r.err = a.why; return r; }
    const x = READERS[p.read](200, unwrap(a.text, p.cb) || "");
    if (x) Object.assign(r, x); else { r.err = "http"; r.n = a.st; }
    return r;
  }
  if (p.api) {
    const [a, e] = await Promise.all([get(p.api.replace("{tk2}", tk2()), p.init), p.edge ? get(p.edge) : null]);
    if (a.why) r.err = a.why;
    else { const x = READERS[p.read](a.st, a.text); if (x) Object.assign(r, x); else { r.err = "http"; r.n = a.st; } }
    if (e && !e.why) { const x = READERS.trace(e.st, e.text); if (x) r.edge = x; }
    return r;
  }
  if (p.trace) {
    const a = await get(p.trace);
    if (a.why) r.err = a.why;
    else { const x = READERS.trace(a.st, a.text); if (x) Object.assign(r, x); else { r.err = "http"; r.n = a.st; } }
    return r;
  }
  if (p.netflix) {
    // the root answers directly in the US; elsewhere the country's own path does
    const root = await hops("https://www.netflix.com/");
    if (root == null) { r.reach = false; return r; }
    r.reach = true; r.hops = root;
    if (root === 0) r.cc = "US";
    else if (await hops(`https://www.netflix.com/${HERE.toLowerCase()}/`) === 0) { r.cc = HERE; r.hops = 0; }
    return r;
  }
  if (p.hops) {
    r.hops = await hops(p.hops);
    r.reach = r.hops != null;
    return r;
  }
  const a = await get(p.reach, {}, "manual");
  r.reach = !a.why; if (!a.why) r.n = a.st;
  return r;
}

function health(s, r, v) {
  const p = s.probe;
  if (v.v === "fail") return "bad";
  if ((p.api || p.jsonp || p.trace) && r.err) return "bad";
  if ((p.hops || p.netflix) && r.hops == null) return "bad";
  if (p.trace && !r.cc) return "bad";
  // the check reads: does it agree with the published list for the country it sees (the one it names, or this server's)?
  const want = offered(s, (r.edge && r.edge.cc) || r.cc || HERE);
  if (want != null && (v.how === "api" || v.how === "edge" || v.how === "hops") && (v.v === "ok" || v.v === "no") && (v.v === "ok") !== want) return "drift";
  return "ok";
}

async function check(s) {
  const t0 = Date.now();
  let r = await ask(s), v = judge(s, r, HERE), st = health(s, r, v);
  // one retry, as the page does: a first connection is sometimes dropped
  if (st !== "ok") { r = await ask(s); v = judge(s, r, HERE); st = health(s, r, v); }
  return { s: st, how: v.how, v: v.v, cc: v.cc || r.cc || null, n: r.n ?? null, hops: r.hops ?? null, err: r.err || (v.v === "fail" ? v.why : null), ms: Date.now() - t0 };
}

async function main() {
  const t0 = Date.now(), at = new Date().toISOString();
  let prev = {};
  try { prev = JSON.parse(await readFile(`${OUT}/status.json`, "utf8")).services || {}; } catch (e) {}
  const out = {}, queue = [...SERVICES];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    for (let s; (s = queue.shift());) {
      const c = await check(s).catch(e => ({ s: "bad", how: null, v: "fail", cc: null, n: null, hops: null, err: "crash", ms: 0 }));
      const p = prev[s.id] || {}, same = p.s === c.s;
      out[s.id] = { ...c, streak: same ? (p.streak || 0) + 1 : 1, since: same && p.since ? p.since : at, ok_at: c.s === "ok" ? at : p.ok_at || null };
    }
  }));
  const services = Object.fromEntries(SERVICES.map(s => [s.id, out[s.id]]));
  const status = { v: 1, at, from: HERE, took_ms: Date.now() - t0, count: SERVICES.length,
    bad: SERVICES.filter(s => services[s.id].s !== "ok").map(s => s.id), services };
  await mkdir(OUT, { recursive: true });
  const tmp = `${OUT}/.status.json.${process.pid}`;
  await writeFile(tmp, JSON.stringify(status));
  await rename(tmp, `${OUT}/status.json`);
  console.log(`${SERVICES.length} checks in ${status.took_ms} ms; not ok: ${status.bad.map(id => `${id} (${services[id].s}${services[id].err ? " " + services[id].err : ""})`).join(", ") || "none"}`);
}
main().catch(e => { console.error(e); process.exit(1); });
