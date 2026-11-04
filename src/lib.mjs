// Pure logic, shared by the browser code (the build inlines this file into src/app.js) and the tests:
// reading each probe's answer, judging a service from it, the share link format.

// Country names are the system's (Intl.DisplayNames) in the page's language, flags /flags/<code>.svg; Taiwan (TW) is
// the one exception, with its own name and the cn flag (1ms-shell docs/tool-contract.md §5)
export const TW = { "zh-CN": "中国台湾", "zh-TW": "中國台灣", en: "Taiwan, China", ja: "中国台湾", ko: "중국 대만", es: "Taiwán, China", fr: "Taïwan, Chine", de: "Taiwan, China", pt: "Taiwan, China", ru: "Тайвань, Китай" };
export const regionName = (cc, lang) => cc === "TW" ? (TW[lang] || TW.en) : new Intl.DisplayNames([lang], { type: "region" }).of(cc);
export const flagCode = cc => cc === "TW" ? "cn" : cc.toLowerCase();   // /flags/${flagCode(cc)}.svg

// Cloudflare's /cdn-cgi/trace: "key=value" lines
export function parseTrace(text) {
  const o = {};
  for (const line of String(text).split("\n")) { const i = line.indexOf("="); if (i > 0) o[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return o;
}
const CC = s => (typeof s === "string" && /^[a-z]{2}$/i.test(s.trim()) ? s.trim().toUpperCase() : null);
const json = text => { try { return JSON.parse(text); } catch (e) { return null; } };

// Each reader takes the answer's status and text and returns { ok, cc, ip } (ok: the service says it is available
// here; cc: the country it sees), or null when the answer isn't one it understands.
export const READERS = {
  trace(st, text) { const t = parseTrace(text); return CC(t.loc) ? { cc: CC(t.loc), ip: t.ip || "", colo: t.colo || "" } : null; },
  // OpenAI's compliance endpoint names the unsupported country in an error; any other answer means supported
  openai(st, text) {
    const j = json(text);
    if (!j) return null;
    const code = (j.error && (j.error.code || j.error.type)) || "";
    return { ok: !/unsupported_country/i.test(code) && !/unsupported_country/i.test(text) };
  },
  // DAZN: isAllowed with the country it sees; a 403 "Security policy has been breached" is its refusal of an address it
  // takes for a proxy or a datacenter (not available here either)
  dazn(st, text) {
    const a = /"isAllowed"\s*:\s*(true|false)/.exec(text), c = /"GeolocatedCountry"\s*:\s*"([a-z]{2})"/i.exec(text);
    return a ? { ok: a[1] === "true", cc: c ? CC(c[1]) : null } : st === 403 && /Security policy has been breached/i.test(text) ? { ok: false } : null;
  },
  kktv(st, text) { const d = (json(text) || {}).data; return d && typeof d.is_allowed === "boolean" ? { ok: d.is_allowed, cc: CC(d.country), ip: d.ip || "" } : null; },
  philo(st, text) { const j = json(text); return j && j.status ? { ok: j.status === "SUCCESS", cc: CC(j.country) } : null; },
  tvb(st, text) { const j = json(text); return j && typeof j.allow_in_this_country === "boolean" ? { ok: j.allow_in_this_country, cc: CC(j.country), ip: j.ip || "" } : null; },
  sbs(st, text) { const r = ((json(text) || {}).get || {}).response; const cc = r && CC(r.country_code); return cc ? { ok: cc === "AU", cc } : null; },
  nbc(st, text) { const j = json(text); return j && typeof j.restricted === "boolean" ? { ok: !j.restricted, cc: CC((j.requestInfo || {}).countryCode) } : null; },
  // DMM TV names a foreign visitor; a Japanese one gets past the region check to "not signed in"
  dmm(st, text) { return /FOREIGN/.test(text) ? { ok: false } : /UNAUTHORIZED/.test(text) ? { ok: true, cc: "JP" } : null; },
  shudder(st, text) { return /not (yet )?available/i.test(text) ? { ok: false } : /movies/i.test(text) ? { ok: true } : null; },
  // beIN: 451 (unavailable for legal reasons) outside its region, 500 from its offers endpoint inside it
  bein(st) { return st === 451 ? { ok: false } : st === 500 ? { ok: true } : null; },
  // ZDF: 403 outside Germany, 404 inside
  zdf(st) { return st === 403 ? { ok: false } : st === 404 ? { ok: true, cc: "DE" } : null; },
  fod(st, text) { const m = /<FLAG\s+TYPE="(true|false)"/i.exec(text); return m ? { ok: m[1] === "true", cc: m[1] === "true" ? "JP" : null } : null; },
  // Mango TV's player: code 200 with the title's data where it plays; a refusal naming the region or copyright
  // where it doesn't (any other code, a title gone offline say, isn't an answer)
  mgtv(st, text) { const j = json(text); return !j ? null : j.code === 200 && j.data ? { ok: true, cc: "CN" } : /地区|区域|海外|版权|region|country/i.test(j.msg || "") ? { ok: false } : null; },
  // Tencent Video's getinfo (JSONP): em 0 plays, with the address it sees; 80 is its region refusal
  qq(st, text) { const j = json(text); return !j || typeof j.em !== "number" ? null : j.em === 0 ? { ok: true, cc: "CN", ip: j.ip || "" } : j.em === 80 ? { ok: false, ip: j.ip || "" } : null; },
  // 10 Play (Australia): its geo endpoint says allow, with the state
  ten(st, text) { const j = json(text); return j && typeof j.allow === "boolean" ? { ok: j.allow, cc: j.allow ? "AU" : null } : null; },
  // Molotov: is_france
  molotov(st, text) { const j = json(text); return j && typeof j.is_france === "boolean" ? { ok: j.is_france, cc: j.is_france ? "FR" : null } : null; },
  // NHK ONE: its geo lookup names the country in Japan, and says "other" anywhere else
  nhk(st, text) { const j = json(text), c = j && j.country_code; return typeof c !== "string" ? null : c === "JP" ? { ok: true, cc: "JP" } : { ok: false, cc: CC(c) }; },
  // Sling TV: playback allowed or not, and why (it names a proxy or a data center when it takes you for one)
  sling(st, text) {
    const j = json(text);
    if (!j || (j.playback_allowed == null && j.playback_disallowed == null)) return null;
    const ok = j.playback_allowed === true || j.playback_disallowed === false, why = String(j.playback_disallowed_reason || "");
    return { ok, cc: String(j.country || "").toLowerCase() === "usa" ? "US" : null, ...(!ok && /proxy|hosting|vpn|cloud/i.test(why) ? { proxy: true } : {}) };
  },
  // ITVX: 403 "geoblock" outside the UK, 404 inside it; anything else: not an answer either way
  itv(st, text) { return st === 403 && /geoblock/i.test(text) ? { ok: false } : st === 404 ? { ok: true, cc: "GB" } : { ok: null }; },
  // TELASA: IPLocationNotAllowed outside Japan, OK inside it (an error now and then under load: not an answer)
  telasa(st, text) { return /IPLocationNotAllowed/.test(text) ? { ok: false } : /"type"s*:s*"OK"/.test(text) ? { ok: true, cc: "JP" } : { ok: null }; },
  // A&E (thePlatform, NBCUniversal's video platform): GeoLocationBlocked outside the US; any other answer isn't one
  // either way (the title's own rules), so the country decides
  aetv(st, text) { return /GeoLocationBlocked/.test(text) ? { ok: false } : { ok: null }; },
  // BBC iPlayer's media selector (JSONP): "geolocation" outside the UK, the streams inside it
  bbc(st, text) { return /"result"\s*:\s*"geolocation"/.test(text) ? { ok: false } : /"media"\s*:\s*\[/.test(text) ? { ok: true, cc: "GB" } : null; },
};

const has = (list, cc) => !!cc && (" " + list + " ").includes(" " + cc + " ");
// Whether a service is offered in a country by its published rules; null when it has no rules or the country is unknown
export function offered(s, cc) {
  if (!cc) return null;
  if (s.only) return cc === s.only;
  if (s.allow) return has(s.allow, cc);
  if (s.deny) return !has(s.deny, cc);
  return null;
}

// The country to assume for a service whose own answer can't be read: the one most services see. Edge traces and
// region APIs each count once; ties go to the earliest.
export function guessCountry(ccs) {
  const n = new Map();
  for (const cc of ccs) if (cc) n.set(cc, (n.get(cc) || 0) + 1);
  let best = null, max = 0;
  for (const [cc, k] of n) if (k > max) { best = cc; max = k; }
  return best;
}

// The verdict for one service from what its probe got.
//   r: { err: "net"|"timeout"|"http"|"parse"|null, n (status), reach: true|false|null,
//        ok (from a region API), cc, ip, colo, edge: { cc, ip } (ChatGPT's own trace), hops (redirects added; null: not measured) }
//   guess: the country most services see (guessCountry)
// Returns { v, cc, ip, how, why }:
//   v    "ok" available · "no" not available here · "reach" reachable, availability unknown · "fail" couldn't connect
//   how  "api" | "edge" | "hops" | "guess" (see src/services.mjs)
//   why  for "fail": the probe's error; for "reach": "unknown" (no rules) or "nocc" (no country)
export function judge(s, r, guess) {
  const p = s.probe;
  const fail = () => ({ v: "fail", cc: null, ip: "", how: null, why: r.err || "net", n: r.n });
  const byList = (cc, how, ip = "") => { const o = offered(s, cc); return { v: o == null ? "reach" : o ? "ok" : "no", cc, ip, how, why: o == null ? (cc ? "unknown" : "nocc") : null }; };
  if (p.api || p.jsonp) {
    if (r.err) return fail();
    // an answer that only reads one way (the refusal): any other one leaves it to the country
    if (r.ok == null) return byList(guess, "guess");
    const cc = (r.edge && r.edge.cc) || r.cc || null;
    return { v: r.ok ? "ok" : "no", cc, ip: (r.edge && r.edge.ip) || r.ip || "", how: "api", why: null };
  }
  // a trace that can't be read while the site itself opens: the browser (an ad blocker, tracking protection) stopped
  // the check, not the service, so the country is the one most services see
  if (p.trace) return !r.err ? byList(r.cc, "edge", r.ip) : r.reach ? byList(guess, "guess") : fail();
  if (p.netflix) {
    if (r.reach === false) return fail();
    if (r.cc) return byList(r.cc, "hops");
    return guess && offered(s, guess) === false ? byList(guess, "guess") : { v: "reach", cc: null, ip: "", how: r.hops == null ? "guess" : "hops", why: "nocc" };
  }
  if (p.hops) {
    if (r.reach === false) return fail();
    if (r.hops == null) return s.only ? byList(guess, "guess") : { v: "reach", cc: null, ip: "", how: "guess", why: "unknown" };
    const ok = p.zero ? r.hops === 0 : r.hops > 0;
    return { v: ok ? "ok" : "no", cc: ok && s.only ? s.only : null, ip: "", how: "hops", why: null };
  }
  // reachability only: the published list against the country the other services see
  if (r.reach === false) return fail();
  return byList(guess, "guess");
}

// Summary counts for the headline: available, not available, reachable but unknown, failed
export function tally(verdicts) {
  const o = { ok: 0, no: 0, reach: 0, fail: 0 };
  for (const v of verdicts) if (v && o[v.v] != null) o[v.v]++;
  return o;
}

// Countries the services see, most common first: [{ cc, ids }]. More than one means traffic leaves by different routes.
export function exitsByCountry(verdicts) {
  const m = new Map();
  for (const [id, v] of Object.entries(verdicts)) if (v && v.cc && (v.how === "api" || v.how === "edge" || v.how === "hops")) {
    if (!m.has(v.cc)) m.set(v.cc, []);
    m.get(v.cc).push(id);
  }
  return [...m].map(([cc, ids]) => ({ cc, ids })).sort((a, b) => b.ids.length - a.ids.length);
}

// Where this connection's DNS lookups come from, against where its traffic leaves (the country most services see):
// the resolvers 1ms.dog's own name server saw for a name only this page looked up (the dns tool's API,
// api.l.1ms.dog), each { cc, org, ecs: { net, cc } | null } (ecs: the visitor's subnet a resolver passed on, EDNS Client
// Subnet). Returns the note's key and its values, or null with nothing to say:
//   dns_cn     the lookups go through a mainland China resolver while traffic leaves elsewhere (split routing that
//              leaks DNS: foreign names may get polluted or mainland answers)
//   dns_split  the resolver is in another country than the exit (the "DNS in Hong Kong, exit in Japan" case: a service
//              that places you by your resolver, or a DNS unlock, gives a different answer than this page measured)
//   dns_same   the resolver is where the traffic leaves
// plus ecs: the visitor's subnet a resolver passed on to the sites' name servers ({ net }), when one did
export function dnsNote(resolvers, exit) {
  const rs = (resolvers || []).filter(r => r && r.cc);
  if (!rs.length || !exit) return null;
  const cn = exit !== "CN" ? rs.find(x => x.cc === "CN") : null, other = rs.find(x => x.cc !== exit);
  const k = cn ? "dns_cn" : other ? "dns_split" : "dns_same", r = cn || other || rs[0];
  const x = rs.find(y => y.ecs && y.ecs.net);
  return { k, r: r.cc, e: exit, org: r.org || "", ecs: x ? { net: x.ecs.net } : null };
}

// An IP with its middle hidden: 203.0.•.• / 2001:db8:•
export function maskIp(ip) {
  if (!ip) return "";
  if (ip.includes(":")) return ip.split(":").slice(0, 2).join(":") + ":•";
  const p = ip.split("."); return p.length === 4 ? `${p[0]}.${p[1]}.•.•` : "•";
}

// Share links carry the result in the hash, which never reaches a server:
//   #r=1.<time, base 36>.<tz country or ->.<id>~<v><how><cc>_<id>~…
// v: o ok, n no, r reach, f fail · how: a api, e edge, h hops, g guess, - none · cc: two letters or -.
// Version 1; a later format gets a new number and this parser keeps reading version 1.
const V = { ok: "o", no: "n", reach: "r", fail: "f" }, H = { api: "a", edge: "e", hops: "h", guess: "g" };
const unV = Object.fromEntries(Object.entries(V).map(([k, v]) => [v, k])), unH = Object.fromEntries(Object.entries(H).map(([k, v]) => [v, k]));
export function encodeShare({ ts, tz, verdicts }) {
  const rows = Object.entries(verdicts).filter(([, v]) => v).map(([id, v]) => `${id}~${V[v.v]}${H[v.how] || "-"}${v.cc || "-"}`);
  return `#r=1.${Math.round(ts / 1000).toString(36)}.${tz || "-"}.${rows.join("_")}`;
}
export function parseShare(hash, ids) {
  const m = /^#r=1\.([0-9a-z]+)\.([A-Z]{2}|-)\.(.*)$/.exec(hash || "");
  if (!m) return null;
  const verdicts = {};
  for (const row of m[3].split("_")) {
    const x = /^([a-z0-9]+)~([onrf])([aehg-])([A-Z]{2}|-)$/.exec(row);
    if (!x || !ids.includes(x[1])) continue;
    verdicts[x[1]] = { v: unV[x[2]], how: unH[x[3]] || null, cc: x[4] === "-" ? null : x[4], ip: "" };
  }
  if (!Object.keys(verdicts).length) return null;
  return { ts: parseInt(m[1], 36) * 1000, tz: m[2] === "-" ? "" : m[2], verdicts };
}

// The report card: per category, the share of services that work among those with an answer either way (an unclear
// one doesn't count), as a grade; regional services instead count the places whose own services work (they are each
// for one country, so a share would only say how many countries there are). total: the three others together.
export const grade = r => r >= 0.95 ? "S" : r >= 0.8 ? "A" : r >= 0.6 ? "B" : r >= 0.4 ? "C" : "D";
export function scoreCard(verdicts, services) {
  const c = {};
  for (const s of services) {
    const v = verdicts[s.id]; if (!v) continue;
    const b = c[s.cat] || (c[s.cat] = { ok: 0, n: 0, places: [] });
    if (s.cat === "local") { const cc = v.cc || s.only; if (v.v === "ok" && cc && !b.places.includes(cc)) b.places.push(cc); continue; }
    if (v.v === "reach") continue;
    b.n++; if (v.v === "ok") b.ok++;
  }
  for (const b of Object.values(c)) if (b.n) b.g = grade(b.ok / b.n);
  const all = Object.entries(c).filter(([k]) => k !== "local").map(([, b]) => b), ok = all.reduce((a, b) => a + b.ok, 0), n = all.reduce((a, b) => a + b.n, 0);
  return { cats: c, total: n ? grade(ok / n) : null };
}

// Route advice: for a service that isn't available over the route it took, another of this connection's exits where
// its published list offers it (route the service's domain there), or none of them (it needs another country), or for
// one that doesn't open at all, a route that doesn't reach it. Regional services only when another exit fixes them
// (each is for one country: "use a node in that country" for all of them says nothing). At most `max`, AI first.
//   exits: exitsByCountry()  →  [{ id, k: "to" | "need" | "fail", at: where it was tried (its own country, else the main exit), to: cc, via: id }]
export function routeAdvice(verdicts, services, exits, max = 6) {
  const out = [];
  for (const s of services) {
    const v = verdicts[s.id]; if (!v || (v.v !== "no" && v.v !== "fail")) continue;
    if (v.v === "fail") { if (s.cat !== "local") out.push({ id: s.id, k: "fail" }); continue; }
    const at = v.cc || (exits[0] && exits[0].cc), e = exits.find(e => e.cc !== at && offered(s, e.cc) === true);
    if (e) out.push({ id: s.id, k: "to", at, to: e.cc, via: e.ids.find(id => id !== s.id) || e.ids[0] });
    else if (s.cat !== "local" && at) out.push({ id: s.id, k: "need", at });
  }
  const rank = a => (a.k === "to" ? 0 : a.k === "need" ? 1 : 2) * 10 + ["ai", "video", "social", "local"].indexOf(services.find(s => s.id === a.id).cat);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, max);
}

// Runs kept on this device to compare with (localStorage, src/app.js): { ts, v: { id: "<v><cc>" } }, v as in share links
export const packRun = (ts, verdicts) => ({ ts, v: Object.fromEntries(Object.entries(verdicts).filter(([, v]) => v).map(([id, v]) => [id, V[v.v] + (v.cc || "")])) });
// what changed between two runs: [{ id, a: { v, cc }, b: { v, cc } }] for services in both whose verdict or country changed
export function diffRuns(prev, cur) {
  const un = x => ({ v: unV[x[0]], cc: x.slice(1) || null }), out = [];
  for (const [id, b] of Object.entries(cur.v)) { const a = prev.v[id]; if (a && a !== b) out.push({ id, a: un(a), b: un(b) }); }
  return out;
}

// Whether Wikipedia blocks this address from editing (the RegionRestrictionCheck fork's "Wikipedia editable" check):
// its API answers any site (origin=*) with the block on the address it sees, and open proxies and hosting ranges are
// blocked with a reason that says so, often naming the host in a comment. Returns { blocked, proxy, host } or null.
export function wikiBlock(text) {
  let j; try { j = JSON.parse(text); } catch (e) { return null; }
  const u = j && j.query && j.query.userinfo; if (!u) return null;
  if (!u.blockid) return { blocked: false, proxy: false, host: "" };
  const why = String(u.blockreason || ""), host = (/<!--\s*([^<>]{2,60}?)\s*-->/.exec(why) || [])[1] || "";
  return { blocked: true, proxy: /proxy|webhost|colocation|hosting|vpn/i.test(why), host };
}
