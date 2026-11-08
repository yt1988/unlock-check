// Unlock check: asks each service, from this browser and over this browser's route, whether it is available here
// and which country it sees. Everything runs in the browser; nothing is sent to this site. The build prepends
// `const SERVICES, CATS, NETFLIX_TRY` (src/services.mjs) and inlines src/lib.mjs at the @lib marker below.
(function () {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const D = JSON.parse($("#data").textContent);
  const L = window.LUNLOCK || {}, LANG = D.lang;              // strings: /assets/l.<lang>.<hash>.js, loaded first
  const t = (k, v) => { let s = L[k] ?? k; if (v) for (const x in v) s = s.split("{" + x + "}").join(v[x]); return s; };
  // a line with a count: <key>_one / _few / _many / _other by the language's plural rules, _other when there is no such form
  const PR = new Intl.PluralRules(LANG), tn = (k, n, v) => t(L[k + "_" + PR.select(n)] != null ? k + "_" + PR.select(n) : k + "_other", v);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const AUTO = document.querySelector("#auto");                 // the main page's "start by itself" option (only there)
  const K = { theme: "unlock:theme", lang: "unlock:lang", mask: "unlock:mask", hist: "unlock:hist", dex: "unlock:dex", auto: "unlock:auto" };
  const country = cc => { try { return regionName(cc, LANG); } catch (e) { return cc; } };
  const flag = cc => /^[A-Z]{2}$/.test(cc || "") && cc !== "XK" ? `<img class="flag" src="/flags/${flagCode(cc)}.svg" alt="" width="20" height="15">` : "";
  for (const s of ALL_SERVICES) if (s.names && s.names[LANG]) s.name = s.names[LANG];   // the name this language uses
  const SV = Object.fromEntries(ALL_SERVICES.map(s => [s.id, s]));
  // what this page tests (the build's D.scope): every service on the main page, a category on its page, one service
  // on a service's page (ONE). Nothing outside it is asked, listed or shared.
  const ONE = D.one || null, SERVICES = D.scope ? ALL_SERVICES.filter(s => D.scope.includes(s.id)) : ALL_SERVICES;
  const CATS = ALL_CATS.filter(c => SERVICES.some(s => s.cat === c));
  /* @lib */

  /* ---------- embedded in the connection checkup (check.1ms.dog, 1ms-shell docs/checkup.md) ---------- */
  // ?embed=checkup counts only inside a frame whose page is on the checkup's own origin, as the shell's
  // <meta name="check"> names it; otherwise this is the ordinary page (the shell's attribute is taken back).
  const EMBED = (() => {
    const c = (document.querySelector('meta[name="check"]') || {}).content;
    if (new URLSearchParams(location.search).get("embed") !== "checkup" || !c || window.parent === window) return "";
    try { const o = new URL(c).origin; return new URL(document.referrer).origin === o ? o : ""; } catch (e) { return ""; }
  })();
  if (EMBED) document.documentElement.setAttribute("data-ms-embed", "checkup");
  else document.documentElement.removeAttribute("data-ms-embed");
  const post = m => { if (EMBED) window.parent.postMessage(Object.assign({ ms: "checkup", v: 1, tool: "unlock" }, m), EMBED); };
  if (EMBED) {
    // the report page sizes the frame to the content; links open outside it
    let h = 0;
    new ResizeObserver(() => { const n = Math.ceil(document.querySelector(".app").getBoundingClientRect().height); if (n !== h) post({ type: "size", height: h = n }); }).observe(document.querySelector(".app"));
    for (const a of $$("a[href]")) { a.target = "_blank"; a.rel = "noopener"; }
  }

  /* ---------- theme and language ---------- */
  const thBtn = $("#theme"), TH = ["system", "light", "dark"];
  const applyTheme = th => {
    if (th === "light" || th === "dark") document.documentElement.setAttribute("data-theme", th); else document.documentElement.removeAttribute("data-theme");
    thBtn.dataset.th = th; thBtn.title = t("th_" + th); thBtn.setAttribute("aria-label", t("th_" + th));
  };
  applyTheme(TH.includes(store.get(K.theme)) ? store.get(K.theme) : "system");
  thBtn.onclick = () => { const n = TH[(TH.indexOf(thBtn.dataset.th) + 1) % 3]; store.set(K.theme, n); applyTheme(n); };
  $("#lang").onchange = e => { const l = e.target.value; store.set(K.lang, l); location.href = D.paths[l] + location.hash; };

  /* ---------- asking the services ---------- */
  const TIMEOUT = 8000;
  const bust = u => u + (u.includes("?") ? "&" : "?") + "_u=" + Math.random().toString(36).slice(2, 10);
  // a readable answer: { st, text } or a thrown { why: "timeout" | "net" }
  async function read(url, init) {
    let r;
    try { r = await fetch(init && init.method === "POST" ? url : bust(url), Object.assign({ cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(TIMEOUT) }, init)); }
    catch (e) { throw { why: e && e.name === "TimeoutError" ? "timeout" : "net" }; }
    return { st: r.status, text: await r.text().catch(() => "") };
  }
  // whether a URL loads at all (an opaque answer: any HTTP status counts). Fails on no connection, too many redirects,
  // or a resource policy that refuses other sites. The body is not downloaded.
  async function loads(url) {
    const c = new AbortController(), tm = setTimeout(() => c.abort(), TIMEOUT);
    try { await fetch(url, { mode: "no-cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: c.signal }); return true; }
    catch (e) { return false; }
    finally { clearTimeout(tm); c.abort(); }
  }

  // Mango TV's request token, as its own player makes it (yt-dlp, MGTVIE): the reversed URL-safe Base64 of a device
  // id, a client and the time
  const tk2 = () => btoa(`did=${crypto.randomUUID()}|pno=1030|ver=0.3.0301|clit=${Math.floor(Date.now() / 1000)}`)
    .replace(/\+/g, "-").replace(/\//g, "_").split("").reverse().join("");
  // An answer only given as a script (JSONP): run in /assets/jsonp.html, in a sandboxed frame with no origin of its own (no
  // access to this page or this site) whose policy lets only those services' scripts run. It posts back the
  // callback's argument as JSON: { text } or a thrown-like { why }.
  function jsonp(src, cb) {
    return new Promise(res => {
      const f = document.createElement("iframe"), id = Math.random().toString(36).slice(2);
      const done = v => { clearTimeout(tm); removeEventListener("message", on); f.remove(); res(v); };
      const on = e => { if (e.source === f.contentWindow && e.data && e.data.id === id) done(e.data.text != null ? { text: e.data.text } : { why: "net" }); };
      const tm = setTimeout(() => done({ why: "timeout" }), TIMEOUT);
      addEventListener("message", on);
      f.sandbox = "allow-scripts"; f.hidden = true; f.src = "/assets/jsonp.html";
      f.onload = () => f.contentWindow.postMessage({ id, src, cb }, "*");
      document.body.appendChild(f);
    });
  }

  // Redirect counting. /h/<n>/<host>/<path> on this site redirects n times, the last time to https://<host>/<path>
  // (public/_redirects). A browser follows at most MAX redirects (20 in Chrome and Firefox), so a request sent through
  // MAX - k of ours loads only when the service adds at most k of its own.
  const hop = (n, url) => { const u = new URL(url); return `/h/${n}/${u.host}${u.pathname}${u.search}`; };
  let maxP = null;
  const maxHops = () => maxP || (maxP = (async () => {
    const self = location.origin + "/hop.txt", at = n => loads(hop(n, self));
    const [a, b] = await Promise.all([at(20), at(21)]);
    if (a && !b) return 20;
    // another browser: the largest n that still loads
    let lo = 0, hi = 24;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (await at(mid)) lo = mid; else hi = mid - 1; }
    return lo >= 4 ? lo : 0;
  })());
  // how many redirects url adds, up to `upto`; null when it can't be measured
  async function addedHops(url, upto) {
    const max = await maxHops(); if (!max) return null;
    for (let k = 0; k <= upto; k++) if (await loads(hop(max - k, url))) return k;
    return null;
  }

  // Netflix answers its own country's path (/jp/) directly and redirects every other country's; the US is the root.
  async function netflixCountry(prefer) {
    const max = await maxHops(); if (!max) return { hops: null };
    if (await loads(hop(max, "https://www.netflix.com/"))) return { cc: "US", hops: 0 };
    const deny = SV.netflix.deny.split(" ");
    const list = [...new Set([...prefer, ...NETFLIX_TRY])].filter(cc => cc !== "US" && !deny.includes(cc));
    for (let i = 0; i < list.length; i += 6) {
      const batch = list.slice(i, i + 6), ok = await Promise.all(batch.map(cc => loads(hop(max - 1, `https://www.netflix.com/${cc.toLowerCase()}/`))));
      const at = ok.indexOf(true);
      if (at >= 0) return { cc: batch[at], hops: 0 };
    }
    return { hops: 1 };
  }

  // One service: what its probe got, as judge() (src/lib.mjs) takes it
  async function ask(s) {
    const p = s.probe, r = { err: null, reach: null };
    if (p.jsonp) {
      const a = await jsonp(p.jsonp, p.cb);
      if (a.why) r.err = a.why;
      else { const x = READERS[p.read](200, a.text); if (x) Object.assign(r, x); else r.err = "http"; }
      return r;
    }
    if (p.api) {
      const [a, e] = await Promise.all([read(p.api.replace("{tk2}", tk2), p.init).catch(x => x), p.edge ? read(p.edge).catch(() => null) : null]);
      if (a.why) r.err = a.why;
      else { const x = READERS[p.read](a.st, a.text); if (x) Object.assign(r, x); else { r.err = "http"; r.n = a.st; } }
      if (e) { const x = READERS.trace(e.st, e.text); if (x) r.edge = x; }
      return r;
    }
    if (p.trace) {
      try { const a = await read(p.trace), x = READERS.trace(a.st, a.text); if (x) Object.assign(r, x); else { r.err = "http"; r.n = a.st; } }
      catch (e) { r.err = e.why || "net"; }
      // whether the service answers at all when its answer isn't read (no CORS): a proxy or blocker that breaks the
      // readable request often lets this through. Its home page last: most refuse other sites (Cross-Origin-Resource-Policy)
      if (r.err) r.reach = await loads(p.trace) || await loads(p.trace) || await loads(s.site);
      return r;
    }
    // one retry: a proxy sometimes drops the first connection to a host
    r.reach = await loads(p.reach || p.hops) || await loads(p.reach || p.hops);
    return r;
  }
  // The hourly check from 1ms.dog's Tokyo server (scripts/watch.mjs, watch/README.md): whether each check's endpoint
  // still answers the way it's read here. A check found not working for two runs in a row is judged as a guess (the
  // country the others see, against the published list) instead of trusting an answer that may have changed meaning.
  // Only on 1ms.dog itself and localhost (a copy hosted elsewhere doesn't ask our server); no status, or one over 3 hours
  // old: no change.
  const WATCH = /(^|\.)1ms\.dog$|^localhost$/.test(location.hostname) ? "https://data.1ms.dog:2083/unlock/status.json" : "";
  let watchP = null;
  const watch = () => watchP || (watchP = !WATCH ? Promise.resolve(null) : fetch(WATCH, { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(4000) })
    .then(r => r.ok ? r.json() : null).then(j => j && j.v === 1 && j.services && Date.now() - Date.parse(j.at) < 3 * 3600e3 ? j : null).catch(() => null));
  watch();                                                     // asked at once: the first answers don't wait for it
  const watchBad = id => { const w = S.w && S.w.services[id]; return !!w && w.s !== "ok" && w.streak >= 2; };
  const RTF = new Intl.RelativeTimeFormat(LANG, { numeric: "auto" });
  const ago = iso => { const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60e3)); return m < 60 ? RTF.format(-m, "minute") : RTF.format(-Math.round(m / 60), "hour"); };
  // Which resolver this connection's DNS lookups go through: the browser looks up a name nobody else has
  // (<token>-u.l.1ms.dog), and the dns tool's name server (api.l.1ms.dog, github.com/yt1988/dns-test) answers it on
  // port 2053 with the resolvers it saw for that token. The resolver addresses stay on this page: share links and the
  // checkup's facts carry the country only. Same hosts as the hourly check; nothing when it can't be reached.
  const dnsAsk = () => {
    if (!WATCH) return Promise.resolve(null);
    const tok = [...crypto.getRandomValues(new Uint8Array(20))].map(b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
    return fetch(`https://${tok}-u.l.1ms.dog:2053/`, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(6000) })
      .then(r => r.ok ? r.json() : null).then(j => {
        if (!j || !Array.isArray(j.hits)) return null;
        const seen = new Set(), rs = [];
        for (const h of j.hits) if (h && h.ip && !seen.has(h.ip)) { seen.add(h.ip); rs.push({ ip: h.ip, cc: h.cc || null, org: h.org || "", ecs: h.ecs ? { net: h.ecs } : null }); }
        return rs.length ? { rs, geo: j.geo || "" } : null;
      }).catch(() => null);
  };
  // Whether Wikipedia blocks the address it sees from editing, and why (an open proxy or a hosting range): its API lets
  // any site read the answer (origin=*). Shown under the totals with the services that refused you as a proxy (Sling TV);
  // the address itself isn't kept or shared.
  const wikiAsk = () => fetch("https://en.wikipedia.org/w/api.php?action=query&meta=userinfo&uiprop=blockinfo&format=json&origin=*",
    { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(6000) })
    .then(r => r.ok ? r.text() : "").then(wikiBlock).catch(() => null);
  // the services whose answer waits for the others: the country they see (guess) and Netflix's list to try
  const LATE = s => !!(s.probe.netflix || s.probe.hops || (!s.probe.api && !s.probe.trace && !s.probe.jsonp));
  // a mainland-China-only service that can't be read is in mainland China when one that can be (Mango TV, Tencent
  // Video) plays: those sites take the same route, which is often not the one the other services take
  const guessFor = s => s.only === "CN" && S.cnOk ? "CN" : S.guess;

  /* ---------- state and rendering ---------- */
  // shared: a result from a link being shown (no addresses; nothing is tested until the visitor asks)
  const S = { r: {}, v: {}, done: false, gen: 0, shared: null, broken: false, guess: null, cnOk: false, me: null, w: null, dns: null, prev: null, wiki: null };
  const masked = () => store.get(K.mask) === "1";
  const ipTxt = ip => masked() ? maskIp(ip) : ip;
  const IPQS = (document.querySelector('meta[name="ipqs"]') || {}).content || "";
  const EGRESS = (document.querySelector('meta[name="egress"]') || {}).content || "";
  // a link to another 1ms.dog tool ends in the external-link icon (the same on every tool, see the shell tool contract)
  const EXT = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 10v3.5H2.5V4H6"/></svg>`;
  const MARK = { ok: "✓", no: "✕", reach: "•", fail: "!" };
  // the connection checkup runs this and the other tools in one go: linked beside the totals when the host has it
  // (the shell's <meta name="check">), never inside it
  const CHECK = (document.querySelector('meta[name="check"]') || {}).content || "";
  if (CHECK && !EMBED) $("#progTxt").insertAdjacentHTML("afterend",
    `<a class="xl ck" href="${esc(CHECK.replace(/\/$/, "") + D.home[LANG])}" target="_blank" rel="noopener">${esc(t("ck_link"))}${EXT}</a>`);

  // A row keeps its size from the start: only the text inside changes.
  function renderRow(id) {
    const li = $("#s-" + id); if (!li) return;
    const v = S.v[id], vd = li.querySelector(".vd"), rg = li.querySelector(".rg");
    // a guessed country is drawn fainter; how the verdict was reached and the address are in the tooltip
    li.className = "sv" + (v ? " v-" + v.v + (v.how === "guess" ? " g" : "") : S.gen ? " wait" : "");
    // One icon per cell, the service's own. A service that works shows the country it sees, in plain text; any other
    // result says so in a word (and the cell is tinted). Screen readers get the verdict word either way.
    if (!v) { vd.textContent = S.gen ? t("v_wait") : ""; rg.textContent = S.gen ? "…" : ""; li.removeAttribute("title"); return; }
    vd.textContent = t("v_" + v.v);
    rg.textContent = v.v === "ok" ? (v.cc ? country(v.cc) : t("v_ok")) : t("v_" + v.v);   // no country: it says it works
    li.title = (v.how ? t("how_" + v.how) + " · " : "") + whyOf(id, v) + (v.ip && !S.shared ? "\nIP " + ipTxt(v.ip) : "");
  }
  // One plain sentence on what the verdict rests on (row tooltip, a service page's panel). Keys: why_<how>_<verdict>,
  // with "list" when the service publishes where it is offered and "block" when only where it is blocked; then notes.
  function whyOf(id, v) {
    const s = SV[id], n = s.name, c = v.cc ? country(v.cc) : "";
    if (v.v === "fail") return t("why_fail_" + (v.why === "timeout" ? "timeout" : v.why === "http" ? "http" : "net"), { name: n, n: v.n || "" });
    let k;
    if (id === "netflix") k = v.cc ? "nf_" + v.v : "nf_none";
    else if (s.probe.trace && v.how === "guess") k = "blocked_" + (v.cc ? v.v : "nocc");   // the browser stopped its trace
    else if ((S.r[id] || {}).cn && v.v === "ok") k = "cn_ok";                              // Mango TV or Tencent Video play here
    // no list to check the country against: the service's own country, or the one the others see (guess)
    else if (v.v === "reach") k = v.cc ? (v.how === "guess" ? "guess_nolist" : "reach_nolist") : "reach_nocc";
    else if (v.how === "api" || v.how === "hops") k = v.how + "_" + v.v;
    else k = v.how + "_" + (s.allow ? "list" : "block") + "_" + v.v;
    const out = [t(sk("why_" + k), { name: n, c })];
    if (id === "netflix" && v.v === "ok") out.push(t("note_netflix"));
    if (id === "gemini") out.push(t("note_google"));
    if ((S.r[id] || {}).proxy) out.push(t("note_proxy", { name: n }));
    // the hourly check: broken (this verdict is a guess because of it), or when it last found this check working
    const w = !S.shared && S.w && S.w.services[id];
    if (w && (S.r[id] || {}).watch) out.unshift(t("watch_bad", { t: ago(S.w.at) }));
    else if (w && w.s === "ok" && w.ok_at) out.push(t("watch_ok", { t: ago(w.ok_at) }));
    return out.join(" ");
  }
  function renderGroups() {
    for (const c of CATS) {
      const ids = SERVICES.filter(s => s.cat === c).map(s => s.id), d = ids.filter(id => S.v[id]).length, el = $(`[data-c="${c}"] .g-n`);
      if (el) el.textContent = S.gen && !S.done ? `${d} / ${ids.length}` : S.done ? `${ids.filter(id => (S.v[id] || {}).v === "ok").length} / ${ids.length}` : "";
    }
  }
  function renderSum() {
    const n = tally(Object.values(S.v));
    for (const k of ["ok", "no", "reach", "fail"]) $(`#sum .t-${k} b`).textContent = S.gen || S.shared ? n[k] : "–";
    // the result in one line, with the share button beside it
    const has = S.done && Object.keys(S.v).length > 0;
    $("#vh").textContent = has ? (ONE ? "" : headline()) : S.gen && !ONE ? t("v_wait") : !S.gen && !S.shared && !S.broken && AUTO ? t("idle", { n: SERVICES.length }) : "";   // one service: its panel says it
    $("#vline").classList.toggle("wait", !has);
  }
  // Notes under the totals, once everything is in: which countries the services see (several: split routing), and
  // whether the browser's time zone fits. While running, two placeholder lines hold their space.
  const TZ_CC = Object.fromEntries(("Asia/Shanghai:CN Asia/Chongqing:CN Asia/Harbin:CN Asia/Urumqi:CN Asia/Hong_Kong:HK Asia/Macau:MO Asia/Taipei:TW Asia/Tokyo:JP " +
    "Asia/Seoul:KR Asia/Singapore:SG Asia/Kuala_Lumpur:MY Asia/Bangkok:TH Asia/Jakarta:ID Asia/Manila:PH Asia/Ho_Chi_Minh:VN Asia/Saigon:VN " +
    "Asia/Kolkata:IN Asia/Calcutta:IN Asia/Dubai:AE Asia/Riyadh:SA Asia/Qatar:QA Asia/Jerusalem:IL Asia/Karachi:PK Asia/Tehran:IR " +
    "Europe/London:GB Europe/Dublin:IE Europe/Paris:FR Europe/Berlin:DE Europe/Amsterdam:NL Europe/Brussels:BE Europe/Zurich:CH Europe/Rome:IT " +
    "Europe/Madrid:ES Europe/Lisbon:PT Europe/Stockholm:SE Europe/Oslo:NO Europe/Helsinki:FI Europe/Copenhagen:DK Europe/Warsaw:PL Europe/Vienna:AT " +
    "Europe/Prague:CZ Europe/Moscow:RU Europe/Istanbul:TR Europe/Kiev:UA Europe/Kyiv:UA Europe/Athens:GR Europe/Bucharest:RO Europe/Budapest:HU " +
    "Australia/Sydney:AU Australia/Melbourne:AU Australia/Brisbane:AU Australia/Perth:AU Australia/Adelaide:AU Pacific/Auckland:NZ " +
    "America/New_York:US America/Chicago:US America/Denver:US America/Los_Angeles:US America/Phoenix:US America/Anchorage:US Pacific/Honolulu:US " +
    "America/Toronto:CA America/Vancouver:CA America/Montreal:CA America/Edmonton:CA America/Mexico_City:MX America/Sao_Paulo:BR America/Santiago:CL " +
    "America/Bogota:CO America/Lima:PE America/Argentina/Buenos_Aires:AR Africa/Johannesburg:ZA Africa/Cairo:EG Africa/Lagos:NG Africa/Nairobi:KE")
    .split(" ").map(p => p.split(":")));
  // a zone the table doesn't have counts for the connection's own country when the shell places it in that zone
  const tzCc = () => { try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; return TZ_CC[z] || (S.me && S.me.timezone === z && S.me.country) || ""; } catch (e) { return ""; } };
  // Who this connection is, from the shell (GET /_ms/me, 1ms-shell tool contract §4): Cloudflare's answer, no third
  // party, not cached. Self-hosted without the shell it is a 404, and the services' own answers are all there is.
  let meP = null;
  watch();
  const me = () => meP || (meP = fetch("/_ms/me", { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(TIMEOUT) })
    .then(r => r.ok ? r.json() : {}).catch(() => ({})).then(x => (S.me = x && typeof x === "object" ? x : {})));
  // the country the services agree on, or else the connection's own
  const mainCc = ex => (ex[0] && ex[0].cc) || (!S.shared && S.me && S.me.country) || "";
  // someone else's shared result speaks of the person who shared it, not "you" (keys with _s)
  const sk = k => S.shared && L[k + "_s"] != null ? k + "_s" : k;
  const place = cc => `${flag(cc)}<b>${esc(country(cc))}</b>`;
  function renderNotes() {
    const ul = $("#notes");
    // while running, each line says what it is waiting for, in the space its result will take
    if (!S.gen && !S.shared && AUTO) { ul.innerHTML = ""; return; }   // the main page before its first run: nothing yet
    if (!S.done) { ul.innerHTML = (ONE ? ["wait_ip", "wait_tz"] : ["wait_ex", "wait_ip", "wait_tz"]).map(k => `<li class="nt wait"><i></i><span>${esc(t(k))}</span></li>`).join(""); return; }
    // one line each: what it is about and the values, the explanation folded under it
    //   [kind ok|warn|info, label key, summary HTML, explanation HTML]
    const ex = exitsByCountry(S.v), tz = S.shared ? S.shared.tz : tzCc(), out = [];
    const names = ids => esc(ids.map(id => SV[id].name).join(t("join")));
    const egress = EGRESS ? ` <a class="xl" href="${esc(EGRESS + D.egressPath)}" target="_blank" rel="noopener">${esc(t("egress_link"))}${EXT}</a>` : "";
    if (ONE) {}                                                  // its country is in its own panel
    else if (!ex.length) out.push(["info", "ln_ex", "–", esc(t(sk("ex_none")))]);
    else if (ex.length === 1) out.push(["ok", "ln_ex", place(ex[0].cc), t(sk("ex_one"), { c: place(ex[0].cc) })]);
    // the most common country by count, the others with the services that see them
    else out.push(["warn", "ln_ex", ex.map(e => `${place(e.cc)} <span class="m">×${e.ids.length}</span>`).join(" · "),
      t(sk("ex_split"), { c: ex.map((e, i) => `${place(e.cc)} <span class="m">${i ? names(e.ids) : "×" + e.ids.length}</span>`).join(" · ") }) + egress]);
    // the addresses the services saw, most common first, each linked to the IP quality check when the host has one
    const ips = new Map();
    for (const v of Object.values(S.v)) if (v && v.ip) ips.set(v.ip, (ips.get(v.ip) || 0) + 1);
    const ipLink = ip => IPQS && !masked() ? `<a class="ipq" href="${esc(IPQS)}/?ip=${encodeURIComponent(ip)}" title="${esc(t("ipq_title"))}" target="_blank" rel="noopener">${esc(ip)}</a>` : `<span class="ipq">${esc(ipTxt(ip))}</span>`;
    const ipl = [...ips].sort((a, b) => b[1] - a[1]);
    if (S.shared) out.push(["info", "ln_ip", "–", esc(t("ip_shared"))]);
    else if (!ips.size) out.push(["info", "ln_ip", "–", esc(t("ip_none"))]);
    else out.push([ips.size > 1 ? "warn" : "info", "ln_ip", `<span class="ipq">${esc(ipTxt(ipl[0][0]))}</span> <span class="m">×${ipl[0][1]}${ips.size > 1 ? " · +" + (ips.size - 1) : ""}</span>`,
      t("ip_line", { list: ipl.map(([ip, n]) => `${ipLink(ip)} <span class="m">×${n}</span>`).join(" · ") })]);
    const main = mainCc(ex);
    if (!main || !tz) out.push(["info", "ln_tz", "–", esc(t("tz_none"))]);
    else if (tz === main) out.push(["ok", "ln_tz", place(tz), t(sk("tz_ok"), { a: place(tz) })]);
    else out.push(["warn", "ln_tz", `${place(tz)} ≠ ${place(main)}`, t(sk("tz_bad"), { a: place(tz), b: place(main) })]);
    // where the DNS lookups come from (not in a shared result: it never carries the resolvers)
    const dn = !S.shared && S.dns && dnsNote(S.dns.rs, main);
    if (dn) out.push([dn.k === "dns_same" ? "ok" : "warn", "ln_dns", `${place(dn.r)} <span class="m">${esc(dn.org || "")}</span>${dn.k === "dns_same" ? "" : " ≠ " + place(dn.e)}`,
      t(dn.k, { r: place(dn.r), e: place(dn.e), org: esc(dn.org || "?") }) +
      // the subnet is the visitor's own /24: shown to them only (never shared), hidden with the addresses
      (dn.ecs ? " " + t("dns_ecs", { net: esc(masked() ? maskIp(dn.ecs.net.split("/")[0]) : dn.ecs.net) }) : "") + (S.dns.geo ? ` <span class="m">${esc(S.dns.geo)}</span>` : "")]);
    // what the address looks like to services that check: a proxy or a data center (Wikipedia's block, Sling TV's refusal)
    const px = S.shared ? [] : SERVICES.filter(s => (S.r[s.id] || {}).proxy).map(s => s.name), wk = !S.shared && S.wiki;
    if (wk && wk.proxy) px.unshift(t("id_wiki"));
    if (px.length) out.push(["warn", "ln_id", `${esc(t("id_short"))}${wk && wk.host ? ` <span class="m">${esc(wk.host)}</span>` : ""}`,
      t("id_proxy", { list: esc(px.join(t("join"))) }) + (wk && wk.host ? " " + t("id_host", { h: esc(wk.host) }) : "")]);
    else if (wk && wk.blocked) out.push(["info", "ln_id", esc(t("id_short_b")), esc(t("id_block"))]);
    else if (wk) out.push(["ok", "ln_id", esc(t("id_short_ok")), esc(t("id_clean"))]);
    const open = new Set($$("#notes details[open]").map(d => d.dataset.k));   // a re-render (hiding addresses) keeps what was open
    ul.innerHTML = out.map(([k, l, sum, more]) => `<li class="nt n-${k}"><details data-k="${l}"${open.has(l) ? " open" : ""}><summary><i>${k === "ok" ? "✓" : k === "warn" ? "!" : "•"}</i>` +
      `<b class="nl">${esc(t(l))}</b><span class="ns">${sum}</span><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></summary><p class="nd">${more}</p></details></li>`).join("");
  }
  /* ---------- the main page's extras, once a run is in: report card, route advice, the last run, the collection ---------- */
  // Kept on this device only (localStorage): the last 10 runs of the main page (each service's verdict and country,
  // as a share link has them: no address), and the Netflix regions and exit countries seen so far. Nothing leaves it.
  const PLAY = $("#play");
  const jget = k => { try { return JSON.parse(store.get(k) || "null"); } catch (e) { return null; } };
  const CAT_K = { ai: "pl_ai", video: "pl_video", social: "pl_social", local: "pl_local" };
  // after a run of the main page: remember it, and what it adds to the collection; S.prev is the run before
  function remember() {
    if (!PLAY || D.scope || EMBED || S.shared) return;
    const h = (jget(K.hist) || []).filter(x => x && x.ts && x.v), cur = packRun(Date.now(), S.v);
    S.prev = h.length ? h[h.length - 1] : null;
    store.set(K.hist, JSON.stringify([...h, cur].slice(-10)));
    const dx = jget(K.dex) || {}, add = (k, cc) => { if (!cc) return; const l = dx[k] || (dx[k] = []); if (!l.includes(cc)) l.push(cc); };
    const nf = S.v.netflix; if (nf && nf.v === "ok") add("nf", nf.cc);
    add("ex", mainCc(exitsByCountry(S.v)));
    for (const s of SERVICES) if (s.cat === "local" && (S.v[s.id] || {}).v === "ok") add("lc", S.v[s.id].cc || s.only);
    store.set(K.dex, JSON.stringify(dx));
  }
  const hostOf = id => new URL(SV[id].site).hostname.replace(/^www\./, "");
  const vTxt = x => x.v === "ok" ? (x.cc ? country(x.cc) : t("v_ok")) : t("v_" + x.v);
  function renderPlay() {
    if (!PLAY) return;
    if (!S.done || !Object.keys(S.v).length) { PLAY.hidden = true; return; }
    PLAY.hidden = false;
    const sc = scoreCard(S.v, SERVICES), out = [];
    // the report card: a grade per category, regional TV as the places unlocked
    const badge = (lab, g, sub) => `<span class="pl-g g-${g || "n"}"><b>${g || "–"}</b><span>${esc(lab)}</span>${sub ? `<i>${sub}</i>` : ""}</span>`;
    const cells = CATS.filter(c => sc.cats[c]).map(c => c === "local"
      ? badge(t("pl_local"), sc.cats.local.places.length ? String(sc.cats.local.places.length) : "0", sc.cats.local.places.slice(0, 8).map(flag).join(""))
      : badge(t(CAT_K[c]), sc.cats[c].g, `${sc.cats[c].ok}/${sc.cats[c].n}`));
    out.push(`<div class="pl-b pl-w"><h3>${esc(t("pl_card"))}</h3><div class="pl-gs">${badge(t("pl_total"), sc.total, "")}${cells.join("")}</div></div>`);
    // route advice from the exits this run saw
    // route advice from the exits this run saw, one line per route: the services it would fix and their domains
    const ex = exitsByCountry(S.v), groups = new Map();
    for (const a of routeAdvice(S.v, SERVICES, ex, 60)) { const g = [a.k, a.at || "", a.to || ""].join("|"); if (!groups.has(g)) groups.set(g, { ...a, ids: [] }); groups.get(g).ids.push(a.id); }
    const few = (l, f) => l.slice(0, 5).map(f).join(t("join")) + (l.length > 5 ? ` <span class="m">+${l.length - 5}</span>` : "");
    const advLine = a => { const list = few(a.ids, id => esc(SV[id].name)), hosts = few(a.ids, id => `<code>${esc(hostOf(id))}</code>`);
      return a.k === "to" ? t("pl_adv_to", { list, c: place(a.at), d: place(a.to), via: esc(SV[a.via].name), hosts })
        : a.k === "need" ? t("pl_adv_need", { list, c: place(a.at) }) : t("pl_adv_fail", { list, hosts }); };
    const adv = [...groups.values()].slice(0, 5);
    if (!S.shared) out.push(`<div class="pl-b"><h3>${esc(t("pl_adv"))}</h3><ul>${adv.length ? adv.map(a => `<li>${advLine(a)}</li>`).join("") : `<li>${esc(t("pl_adv_none"))}</li>`}</ul></div>`);
    // the last run on this device
    if (!S.shared) {
      const p = S.prev, d = p ? diffRuns(p, packRun(0, S.v)) : [], when = p ? ago(new Date(p.ts).toISOString()) : "";
      const row = c => `<li>${esc(SV[c.id] ? SV[c.id].name : c.id)}: <span class="pl-a">${c.a.cc && c.a.v === "ok" ? flag(c.a.cc) : ""}${esc(vTxt(c.a))}</span> → <b class="pl-${c.b.v}">${c.b.cc && c.b.v === "ok" ? flag(c.b.cc) : ""}${esc(vTxt(c.b))}</b></li>`;
      // the collection (Netflix regions, exit countries and regional TV places seen on this device), then what changed
      // since the last run, when there was one
      const dx = jget(K.dex) || {}, set = (k, lab) => { const l = dx[k] || []; return `<p><span class="pl-k">${esc(lab)} <b>${l.length}</b></span>${l.map(cc => `<span class="pl-f" title="${esc(country(cc))}">${flag(cc) || esc(cc)}</span>`).join("")}</p>`; };
      out.push(`<div class="pl-b"><h3>${esc(t("pl_dex"))}</h3>${set("nf", t("pl_dex_nf"))}${set("ex", t("pl_dex_ex"))}${set("lc", t("pl_dex_lc"))}` +
        (p ? `<h3 class="pl-h2">${esc(t("pl_diff", { t: when }))}</h3>` + (d.length ? `<ul>${d.slice(0, 8).map(row).join("")}${d.length > 8 ? `<li class="m">+${d.length - 8}</li>` : ""}</ul>` : `<p class="m">${esc(t("pl_same"))}</p>`) : "") +
        `<p class="m pl-hint">${esc(t("pl_dex_hint"))}</p></div>`);
    }
    PLAY.querySelector(".pl").innerHTML = out.join("");
  }
  // A service page's lead panel: that service's verdict, big, and what it is based on
  const fo = $("#focus");
  function renderFocus() {
    if (!fo) return;
    const id = fo.dataset.s, v = S.v[id], h = fo.querySelector(".fo-t"), d = fo.querySelector(".fo-d"), st = fo.querySelector(".st");
    fo.className = "focus" + (v ? " v-" + v.v : " wait");
    if (!v) { h.textContent = S.gen ? t("v_wait") : SV[id].name; st.textContent = ""; d.innerHTML = `<span class="bar"></span>`; return; }
    st.textContent = MARK[v.v];
    h.innerHTML = esc(t(v.v === "no" ? sk("fo_no") : "fo_" + v.v, { name: SV[id].name })) + (v.cc ? ` <span class="fo-c">${place(v.cc)}</span>` : "");
    d.textContent = whyOf(id, v);
  }
  function setProg(d, n) { $("#prog").classList.toggle("end", S.done); $("#prog i").style.transform = `scaleX(${n ? d / n : 0})`; $("#progTxt").textContent = !S.gen ? "" : S.done ? (ONE ? "" : t("done", { n })) : t("progress", { d, n }); }
  function renderAll() { for (const s of SERVICES) renderRow(s.id); renderGroups(); renderSum(); renderNotes(); renderFocus(); renderPlay(); }

  const eye = $("#eye");
  const applyMask = () => { eye.textContent = t(masked() ? "show" : "hide"); eye.setAttribute("aria-pressed", masked()); for (const s of SERVICES) renderRow(s.id); if (S.done) renderNotes(); };
  eye.onclick = () => { store.set(K.mask, masked() ? "0" : "1"); applyMask(); };

  /* ---------- a run ---------- */
  async function run() {
    leaveShared();
    const gen = ++S.gen, N = SERVICES.length;
    Object.assign(S, { r: {}, v: {}, done: false, guess: null, cnOk: false, dns: null, wiki: null });
    const dnsP = Promise.all([dnsAsk().then(d => { if (gen === S.gen) S.dns = d; }), ONE ? null : wikiAsk().then(w => { if (gen === S.gen) S.wiki = w; })]);
    maxP = null; meP = null;
    $("#run").disabled = true; $("#run").classList.add("busy"); $("#run span").textContent = t("running"); $("#share").disabled = true;
    renderAll();
    // the bar counts verdicts, as the totals above it do; the last few still out are named (a slow or blocked one is
    // waited for up to its time limit)
    let d = 0, failed = 0, err = false; setProg(0, N);
    const left = new Set(SERVICES.map(s => s.id));
    const prog = () => { if (gen !== S.gen || S.done) return; setProg(Math.min(d, N - 1), N);
      if (left.size && left.size <= 5 && !ONE) $("#progTxt").textContent += " · " + t("pr_wait", { list: [...left].map(id => SV[id].name).join(t("join")) }); };
    const watched = Promise.race([watch(), new Promise(r => setTimeout(r, 3000, null))]).then(w => { S.w = w; });
    const settle = (s, r) => {
      if (gen !== S.gen) return;
      if (s.only === "CN" && LATE(s) && S.cnOk) r.cn = true;   // judged by Mango TV's or Tencent Video's route (whyOf)
      S.r[s.id] = r; S.v[s.id] = judge(s, r, guessFor(s));
      // a check the server found broken: the published list for the country the others see, marked as a guess
      if (watchBad(s.id) && S.v[s.id].how !== "guess" && S.v[s.id].v !== "fail") { r.watch = true; S.v[s.id] = judge({ ...s, probe: { reach: s.site } }, { reach: true }, guessFor(s)); }
      left.delete(s.id); renderRow(s.id); renderGroups(); renderSum(); renderFocus(); ++d; prog();
      if (err) return;
      // The first dozen services all failing to open is a blocker (an ad blocker drops the whole batch at once, a
      // missing connection times out): the checkup hears so now, and gets no result from this run.
      if (S.v[s.id].v === "fail") failed++;
      if (EMBED && d >= 12 && failed === d) { err = true; post({ type: "error", text: t("err_blocked") }); return; }
      post({ type: "progress", done: d, total: N, text: t("progress", { d, n: N }) });
    };
    me();                                                       // who this connection is, as the shell sees it
    maxHops();                                                  // measure the redirect limit while the first answers come in
    const early = SERVICES.filter(s => !LATE(s)), late = SERVICES.filter(LATE);
    // a redirect test counts once its redirects are counted, the others when they answer
    const reach = Object.fromEntries(late.map(s => [s.id, ask(s)]));
    // a page with a mainland-China-only service that can't be read but without Mango TV and Tencent Video (its own
    // page, say) asks those two as well, for the route that site takes: not shown, not shared, only that answer
    const cnHelp = SERVICES.some(s => s.only === "CN" && LATE(s)) ? ALL_SERVICES.filter(s => s.only === "CN" && !LATE(s) && !SERVICES.includes(s)) : [];
    const helped = Promise.all(cnHelp.map(s => ask(s).then(r => judge(s, r, null).v === "ok")));
    // The services that can be read come in first; the rest are judged by the country most of them see. That country
    // is taken once most have answered (or after 4 seconds), not after the slowest (a blocked one waits out its time
    // limit), and checked again once all are in.
    let answered = 0, ready;
    const enough = new Promise(r => { ready = r; setTimeout(r, 4000); }), need = Math.ceil(early.length * 0.8);
    const earlyAll = Promise.all(early.map(async s => { const r = await ask(s); if (++answered >= need) ready(); await watched; settle(s, r); }));
    const who = await me();
    // the country to assume where a service's own answer can't be read, from the answers in so far; true when it changed
    const fixGuess = async () => {
      const seen = early.map(s => S.v[s.id]).filter(v => v && v.cc && v.how !== "guess").map(v => v.cc), was = S.guess, cn = S.cnOk;
      S.guess = guessCountry(seen) || who.country || null;
      S.cnOk = early.some(s => s.only === "CN" && (S.v[s.id] || {}).v === "ok") || (await helped).some(Boolean);
      // a trace the browser blocked, an answer that only reads one way (its refusal), a check the server found
      // broken: now with that country
      for (const s of early) { const r = S.r[s.id]; if (!r) continue;
        if (r.watch) S.v[s.id] = judge({ ...s, probe: { reach: s.site } }, { reach: true }, guessFor(s));
        else if ((s.probe.trace && r.err && r.reach) || ((s.probe.api || s.probe.jsonp) && !r.err && r.ok == null)) S.v[s.id] = judge(s, r, guessFor(s));
        else continue;
        renderRow(s.id); }
      renderGroups(); renderSum(); renderFocus();
      return S.guess !== was || S.cnOk !== cn;
    };
    await enough; await watched;
    if (gen !== S.gen) return;
    await fixGuess();
    // the order Netflix's countries are tried in: the ones the others see first
    const prefer = [...new Set([...early.map(s => S.v[s.id]).filter(v => v && v.cc && v.how !== "guess").map(v => v.cc), who.country].filter(Boolean))];
    await Promise.all([...late.map(async s => {
      const r = await reach[s.id];
      if (r.reach) {
        if (s.probe.netflix) Object.assign(r, await netflixCountry(prefer));
        // up to 3 either way (a "not here" page sends those it serves home: one redirect or more); once more when
        // nothing loaded, as a slow page among sixty requests misses the time limit now and then
        else if (s.probe.hops) r.hops = await addedHops(s.probe.hops, 3) ?? await addedHops(s.probe.hops, 3);
      }
      settle(s, r);
    }), earlyAll.then(async () => {
      // every readable answer is in: if the country most of them see changed, the services judged by it follow
      if (gen !== S.gen || !(await fixGuess())) return;
      for (const s of late) if (S.r[s.id]) { if (s.only === "CN" && S.cnOk) S.r[s.id].cn = true; S.v[s.id] = judge(s, S.r[s.id], guessFor(s)); if (watchBad(s.id) && S.v[s.id].how !== "guess" && S.v[s.id].v !== "fail") S.v[s.id] = judge({ ...s, probe: { reach: s.site } }, { reach: true }, guessFor(s)); renderRow(s.id); }
      renderGroups(); renderSum(); renderFocus();
    })]);
    await dnsP;
    if (gen !== S.gen) return;
    S.done = true;
    remember();
    renderAll(); setProg(N, N);
    $("#run").disabled = false; $("#run").classList.remove("busy"); $("#run span").textContent = t("rerun"); $("#share").disabled = false;
    if (EMBED && !err) post(report());
  }
  // a shared result's page (or one whose link can't be read) opens the language's own page to test
  // (with ?run=1: the page opened starts at once, whether or not it starts by itself)
  $("#run").onclick = () => { if ((S.shared || S.broken) && location.pathname !== D.home[LANG]) location.href = D.paths[LANG].replace(/r\/[a-z]+\/$/, "") + "?run=1"; else run(); };

  /* ---------- questions: a dialog behind the ? button (as on 1ms.dog) ---------- */
  const scrims = { help: $("#help") };
  let lastFocus = null;
  const openDlg = k => { lastFocus = document.activeElement; scrims[k].hidden = false; document.body.classList.add("dlg-open"); (scrims[k].querySelector("[data-close]") || scrims[k]).focus(); };
  const closeDlg = () => { for (const s of Object.values(scrims)) s.hidden = true; document.body.classList.remove("dlg-open"); if (lastFocus) lastFocus.focus(); };
  for (const s of Object.values(scrims)) s.addEventListener("click", e => { if (e.target === s || e.target.closest("[data-close]")) closeDlg(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && Object.values(scrims).some(s => !s.hidden)) closeDlg(); });
  const qs = $$("#helpNav [data-hq]");
  $("#helpSel").innerHTML = qs.map((b, i) => `<option value="${i}">${i + 1} / ${qs.length} · ${esc(b.textContent)}</option>`).join("");
  let helpIdx = 0;
  function showHelp(i) {
    helpIdx = Math.max(0, Math.min(qs.length - 1, i));
    qs.forEach(b => b.setAttribute("aria-selected", +b.dataset.hq === helpIdx));
    $$("#helpC [data-hqb]").forEach(a => { a.hidden = +a.dataset.hqb !== helpIdx; });
    $("#helpSel").value = helpIdx;
    $$("[data-hstep]").forEach(b => { b.disabled = helpIdx + +b.dataset.hstep < 0 || helpIdx + +b.dataset.hstep >= qs.length; });
    $("#helpC").scrollTop = 0;
  }
  $("#helpBtn").onclick = () => { showHelp(helpIdx); openDlg("help"); };
  qs.forEach(b => { b.onclick = () => showHelp(+b.dataset.hq); });
  $("#helpSel").onchange = e => showHelp(+e.target.value);
  $$("[data-hstep]").forEach(b => { b.onclick = () => showHelp(helpIdx + +b.dataset.hstep); });

  /* ---------- a shared result ---------- */
  // the shared 1ms.dog banner above it says whose result this is and offers the visitor's own test
  function showShared(R) {
    Object.assign(S, { r: {}, v: R.verdicts, shared: R, done: true, gen: 0 });
    eye.hidden = true; $("#share").hidden = true;                 // someone else's result isn't shared again from here
    renderAll();
    $("#run span").textContent = t("test_mine"); $("#run").disabled = false; $("#share").disabled = false;
    import("/assets/share/share.js?v=9").then(({ received }) => received({ lang: LANG, ts: R.ts, at: $(".hero"), test: () => $("#run").onclick() })).catch(() => {});
  }
  // a result link that can't be read (cut short, mistyped, a format this page doesn't know) says so, and waits
  function showBroken() {
    S.broken = true; eye.hidden = true;
    document.documentElement.setAttribute("data-shared", "");
    $("#sharedTxt").textContent = t("share_bad");
    renderAll();
    $("#run span").textContent = t("test_mine"); $("#run").disabled = false;
  }
  function leaveShared() {
    if (!S.shared && !S.broken) return;
    S.shared = null; S.broken = false; eye.hidden = false; $("#share").hidden = false; document.documentElement.removeAttribute("data-shared");
    history.replaceState(null, "", location.pathname.replace(/r\/[a-z]+\/$/, ""));
  }

  /* ---------- share: the shared 1ms.dog dialog (/assets/share/, copied verbatim from 1ms-shell) ---------- */
  // the headline a shared result's preview card states (public/r/<verdict>/, see scripts/build.mjs)
  const verdict = () => {
    const v = id => (S.v[id] || {}).v, ai = ["chatgpt", "claude", "gemini"], big = ["chatgpt", "claude", "gemini", "netflix", "disney"];
    if (ai.some(id => v(id) === "no" || v(id) === "fail")) return "noai";
    return big.every(id => v(id) === "ok") ? "all" : "part";
  };
  // The result in one line: the main page's verdict, a category's count, one service's own sentence
  const headline = () => ONE ? (S.v[ONE] ? t(S.v[ONE].v === "no" ? sk("fo_no") : "fo_" + S.v[ONE].v, { name: SV[ONE].name }) : "")
    : D.scope ? (d => tn("vh_n", d, { d, n: SERVICES.length }))(tally(Object.values(S.v)).ok) : t("vh_" + verdict());
  // The link opens the headline's own page (/<lang>/r/<verdict>/), or a category's or service's own page with only its
  // result; the result itself is in the hash (src/lib.mjs), with each service's verdict and country, never an
  // address: so there is nothing for the visitor to choose to show.
  const shareLink = () => location.origin + (D.scope ? D.paths[LANG] : D.home[LANG] + "r/" + verdict() + "/") +
    encodeShare({ ts: S.shared ? S.shared.ts : Date.now(), tz: S.shared ? S.shared.tz : tzCc(), verdicts: S.v });
  // The card's middle. It is also the link's preview in chat apps, fitted into 1200×630 (about two thirds the size),
  // so the top holds what still reads there: the headline, the totals, and the five services people ask about, big.
  // Then every other service in columns, with its own icon and the country it sees (green) or what went wrong.
  // Nothing is cut short (1ms-shell tool contract, "Share card"): the headline gets smaller type, then a second line;
  // a long answer among the five a second or third line; the list fewer columns. The card grows to fit.
  const KEY = ["chatgpt", "claude", "gemini", "netflix", "disney"], RH = 38;
  // one service's page: that service alone, big, with what its verdict rests on; no totals
  const keysOf = () => ONE ? [ONE] : KEY.filter(id => S.v[id]);
  const cardRows = () => SERVICES.filter(s => S.v[s.id]), restRows = () => cardRows().filter(s => !keysOf().includes(s.id));
  const res = v => v.v === "ok" ? (v.cc ? country(v.cc) : t("v_ok")) : t("v_" + v.v);
  // where everything goes, measured: the same for height() and drawCard()
  function cardLayout(x, k) {
    const hw = k.W - k.P * 2, head = headline();
    let hs = k.fit(x, head, hw, 50, 40), hl = [head];
    if (x.measureText(head).width > hw) { hs = 40; x.font = `700 ${hs}px ${k.F}`; hl = k.wrap(x, head, hw, 2); }
    const sTop = k.top + 50 + (hl.length - 1) * hs * 1.2 - (ONE ? 62 : 0);   // the totals' baseline is sTop + 62
    const keys = keysOf(), kw = hw / Math.max(keys.length, 1);
    const ans = keys.map(id => {
      const s = res(S.v[id]), z = k.fit(x, s, kw - 16, 26, 20);
      return x.measureText(s).width <= kw - 16 ? { z, lines: [s] } : { z: 20, lines: (x.font = `700 20px ${k.F}`, k.wrap(x, s, kw - 16, 3)) };
    });
    const kLines = Math.max(1, ...ans.map(a => a.lines.length));
    let why = [];
    if (ONE) { x.font = `400 24px ${k.F}`; why = k.wrap(x, whyOf(ONE, S.v[ONE]), hw, 4); }
    const y0 = sTop + 260 + (kLines - 1) * 26 + (ONE ? why.length * 34 - 40 : 0);
    // the most columns (3 at most) in which every service's name and answer fit side by side
    const rows = restRows(), gap = 36, need = rows.map(s => {
      x.font = `500 20px ${k.F}`; const a = x.measureText(s.name).width;
      x.font = `${S.v[s.id].v === "ok" ? 400 : 600} 19px ${k.F}`; return 32 + a + 18 + x.measureText(res(S.v[s.id])).width;
    });
    let cols = 3;
    while (cols > 1 && need.some(w => w > (hw - gap * (cols - 1)) / cols)) cols--;
    return { hs, hl, sTop, keys, kw, ans, why, kLines, y0, rows, cols, gap, colW: (hw - gap * (cols - 1)) / cols, per: Math.ceil(rows.length / cols) };
  }
  async function drawCard(x, k) {
    const C = { fg: k.v("fg"), muted: k.v("muted"), line: k.v("line"), ok: k.v("ok"), no: k.v("bad"), fail: k.v("warn"), reach: k.v("muted") };
    const icon = async (id, cx, cy, n) => { const el = document.querySelector(`#s-${id} img.fi, #focus[data-s="${id}"] img.fi`); if (el) { try { x.drawImage(await k.img(el.src), cx, cy, n, n); } catch (e) {} } };
    const L = cardLayout(x, k);
    x.fillStyle = C.fg; x.font = `700 ${L.hs}px ${k.F}`;
    L.hl.forEach((s, i) => x.fillText(s, k.P, k.top + 50 + i * L.hs * 1.2));
    const n = tally(Object.values(S.v));
    let xx = k.P;
    if (!ONE) for (const key of ["ok", "no", "reach", "fail"]) {
      x.fillStyle = C[key]; x.font = `700 36px ${k.M}`; x.fillText(String(n[key]), xx, L.sTop + 62); xx += x.measureText(String(n[key])).width + 10;
      x.fillStyle = C.muted; x.font = `400 24px ${k.F}`; const lb = t("v_" + key); x.fillText(lb, xx, L.sTop + 60); xx += x.measureText(lb).width + 36;
    }
    // the report card's grades at the right of the totals, when they fit (the main page)
    if (!D.scope) {
      const sc = scoreCard(S.v, SERVICES), gs = [[t("pl_total"), sc.total], ...["ai", "video", "social"].filter(c => sc.cats[c] && sc.cats[c].g).map(c => [t(CAT_K[c]), sc.cats[c].g])].filter(([, g]) => g);
      x.font = `400 22px ${k.F}`; const lw = gs.map(([l]) => x.measureText(l).width);
      const w = gs.reduce((a, g, i) => a + lw[i] + 8 + 30 + 28, 0) - 28;
      if (xx + w < k.W - k.P) {
        let gx = k.W - k.P - w;
        gs.forEach(([l, g], i) => {
          x.fillStyle = C.muted; x.font = `400 22px ${k.F}`; x.fillText(l, gx, L.sTop + 60); gx += lw[i] + 8;
          x.fillStyle = g === "S" || g === "A" ? C.ok : g === "B" ? C.fg : g === "C" ? C.fail : C.no; x.font = `800 34px ${k.M}`; x.fillText(g, gx, L.sTop + 62); gx += 30 + 28;
        });
      }
    }
    // the five, each an icon, its name, and what it says
    for (let i = 0; i < L.keys.length; i++) {
      const id = L.keys[i], v = S.v[id], cx = k.P + i * L.kw, a = L.ans[i];
      await icon(id, cx, L.sTop + 106, 36);
      x.fillStyle = C.fg; x.font = `600 ${k.fit(x, SV[id].name, L.kw - 56, 26, 18, 600)}px ${k.F}`; x.fillText(SV[id].name, cx + 46, L.sTop + 134);
      x.fillStyle = C[v.v]; x.font = `700 ${a.z}px ${k.F}`;
      a.lines.forEach((s, j) => x.fillText(s, cx, L.sTop + 184 + j * 26));
    }
    x.fillStyle = C.muted; x.font = `400 24px ${k.F}`;
    L.why.forEach((s, j) => x.fillText(s, k.P, L.sTop + 184 + (L.kLines - 1) * 26 + 48 + j * 34));
    if (L.rows.length) { x.fillStyle = C.line; x.fillRect(k.P, L.y0 - 46, k.W - k.P * 2, 1); }
    for (let i = 0; i < L.rows.length; i++) {
      const s = L.rows[i], v = S.v[s.id], c = Math.floor(i / L.per), cx = k.P + c * (L.colW + L.gap), cy = L.y0 + (i % L.per) * RH;
      await icon(s.id, cx, cy - 18, 22);
      x.fillStyle = C.fg; x.font = `500 20px ${k.F}`; x.fillText(s.name, cx + 32, cy);
      x.textAlign = "right"; x.fillStyle = C[v.v]; x.font = `${v.v === "ok" ? 400 : 600} 19px ${k.F}`;
      x.fillText(res(v), cx + L.colW, cy); x.textAlign = "left";
    }
  }
  let dialog = null;
  $("#share").onclick = async () => {
    if (!S.done) return;
    const { share } = await import("/assets/share/share.js?v=9");
    dialog = share({
      lang: LANG, name: t("name"), file: "unlock-check", never: ["ip"],
      link: shareLink, home: location.origin + D.home[LANG],
      text: () => t("share_text", { v: headline() }),
      height: (x, k) => { const L = cardLayout(x, k); return L.y0 + L.per * RH + 50; },
      draw: drawCard,
      foot: () => ONE ? [] : [t("done", { n: cardRows().length })],
      ts: S.shared ? S.shared.ts : Date.now(),
    });
    dialog.open();
  };

  /* ---------- the result for the connection checkup (field names: 1ms-shell docs/checkup.md) ---------- */
  function report() {
    const n = tally(Object.values(S.v)), vs = SERVICES.map(s => [s, S.v[s.id]]).filter(([, v]) => v);
    const names = list => { const x = list.map(([s]) => s.name); return x.slice(0, 6).join(t("join")) + (x.length > 6 ? t("join") + "…" : ""); };
    const no = vs.filter(([, v]) => v.v === "no"), fail = vs.filter(([, v]) => v.v === "fail");
    // blocked AI services first: those are what a route is usually chosen for
    no.sort((a, b) => (b[0].cat === "ai") - (a[0].cat === "ai"));
    const ex = exitsByCountry(S.v), tz = tzCc(), findings = [];
    if (no.length) findings.push({ level: "bad", text: t("fd_no", { list: names(no) }) });
    if (ex.length > 1) findings.push({ level: "warn", text: t("ex_split", { c: ex.map((e, i) => country(e.cc) + " " + (i ? e.ids.map(id => SV[id].name).join(t("join")) : "×" + e.ids.length)).join(" · ") }) });
    const main = mainCc(ex);
    if (main && tz && tz !== main) findings.push({ level: "warn", text: t("tz_bad", { a: country(tz), b: country(main) }) });
    if (fail.length) findings.push({ level: "warn", text: t("fd_fail", { list: names(fail) }) });
    if (ex.length === 1) findings.push({ level: "ok", text: t("ex_one", { c: country(ex[0].cc) }) });
    const stats = [{ label: t("v_ok"), value: n.ok }, { label: t("v_no"), value: n.no }];
    if (n.reach) stats.push({ label: t("v_reach"), value: n.reach });
    if (n.fail) stats.push({ label: t("v_fail"), value: n.fail });
    // a country is the one a service itself reported (not the majority assumed for those that can't say);
    // AI services and Netflix are true/false only where the answer is known
    const countries = {}, ai = {};
    for (const [s, v] of vs) {
      if (v.cc && v.how !== "guess") countries[s.id] = v.cc;
      if (s.cat === "ai" && (v.v === "ok" || v.v === "no")) ai[s.id] = v.v === "ok";
    }
    const facts = { works: n.ok, blocked: n.no, total: SERVICES.length, countries, ai }, nf = S.v.netflix;
    if (nf && nf.v === "ok" && nf.cc) facts.netflix = nf.cc; else if (nf && nf.v === "no") facts.netflix = false;
    const dn = S.dns && dnsNote(S.dns.rs, main);
    if (dn) { facts.resolverCountry = dn.r; if (dn.k !== "dns_same") findings.push({ level: "warn", text: t(dn.k, { r: country(dn.r), e: country(dn.e), org: dn.org || "?" }) }); }
    return { type: "result", lang: LANG, path: shareLink().slice(location.origin.length), grade: null, score: null,
      headline: t("vh_" + verdict()), stats, findings: findings.slice(0, 4), facts };
  }

  // "Report a problem" (the shell's dialog) attaches this run the way a share link holds it: no address; each service's
  // verdict, how it was reached and what its probe got
  window.msReport = () => {
    const n = tally(Object.values(S.v)), has = S.done && Object.keys(S.v).length > 0;
    return {
      summary: has ? `${headline()} · ${t("v_ok")} ${n.ok} · ${t("v_no")} ${n.no} · ${t("v_reach")} ${n.reach} · ${t("v_fail")} ${n.fail}` : t("v_wait"),
      data: { page: location.pathname, lang: LANG, shared: !!S.shared, done: S.done, link: has ? shareLink() : null,
        tz: (S.shared ? S.shared.tz : tzCc()) || null, guess: S.guess,
        results: Object.fromEntries(SERVICES.filter(s => S.v[s.id]).map(s => {
          const v = S.v[s.id], r = S.r[s.id] || {};
          return [s.id, { v: v.v, how: v.how || null, why: v.why || null, cc: v.cc || null, err: r.err || undefined, n: r.n || undefined, reach: r.reach == null ? undefined : r.reach }];
        })) },
    };
  };

  applyMask();
  if (EMBED) { run(); return; }                                 // starts at once; a result in the link is not shown here
  const shared = parseShare(location.hash, SERVICES.map(s => s.id));
  if (shared) showShared(shared);
  else if (/^#r=/.test(location.hash) || /\/r\/[a-z]+\/$/.test(location.pathname)) showBroken();
  else {
    document.documentElement.removeAttribute("data-shared");
    // The main page asks every service at once (over 150 requests), so it waits for the button unless the visitor
    // turned on starting by itself (kept in this browser); a category's or a service's page starts at once
    // "Test mine" on a shared result lands here with ?run=1: start now, and take it off the address
    const now = new URLSearchParams(location.search).get("run") === "1";
    if (now) history.replaceState(null, "", location.pathname + location.hash);
    if (!AUTO || now || store.get(K.auto) === "1") run();
    else { $("#run span").textContent = t("start"); $("#run").disabled = false; renderAll(); }
  }
  if (AUTO) { AUTO.checked = store.get(K.auto) === "1"; AUTO.onchange = () => store.set(K.auto, AUTO.checked ? "1" : "0"); }
})();
