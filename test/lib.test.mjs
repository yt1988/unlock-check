import { test } from "node:test";
import assert from "node:assert/strict";
import { READERS, judge, offered, guessCountry, exitsByCountry, encodeShare, parseShare, maskIp, parseTrace, regionName, flagCode, dnsNote, scoreCard, routeAdvice, packRun, diffRuns } from "../src/lib.mjs";
import { SERVICES, CATS, SLUG, CAT_SLUG } from "../src/services.mjs";

const S = Object.fromEntries(SERVICES.map(s => [s.id, s]));

test("catalog: ids, categories, slugs and country codes are well formed", () => {
  const ids = new Set();
  for (const s of SERVICES) {
    assert.ok(!ids.has(s.id), "duplicate " + s.id); ids.add(s.id);
    assert.ok(CATS.includes(s.cat), s.id + " category");
    assert.match(SLUG[s.id] || "", /^[a-z0-9-]+$/, s.id + " slug");
    for (const k of ["allow", "deny"]) if (s[k]) for (const cc of s[k].split(" ")) assert.match(cc, /^[A-Z]{2}$/, `${s.id} ${k} ${cc}`);
    const p = s.probe;
    assert.ok(p.api || p.jsonp || p.trace || p.hops || p.netflix || p.reach, s.id + " probe");
    if (p.api) assert.ok(READERS[p.read], s.id + " reader");
  }
  assert.equal(new Set(Object.values(SLUG)).size, SERVICES.length);
  for (const c of CATS) assert.ok(CAT_SLUG[c] && !Object.values(SLUG).includes(CAT_SLUG[c]), c);
});

test("published lists: the countries people ask about", () => {
  for (const [id, yes, no] of [["chatgpt", "US JP SG TW KR GB DE", "CN HK MO RU IR KP"], ["claude", "US JP SG TW KR GB", "CN HK MO RU"],
    ["gemini", "US JP SG TW HK MO", "CN RU IR KP"], ["netflix", "US JP HK SG", "CN RU"], ["tiktok", "US JP", "IN CN"]]) {
    for (const cc of yes.split(" ")) assert.equal(offered(S[id], cc), true, `${id} ${cc}`);
    for (const cc of no.split(" ")) assert.equal(offered(S[id], cc), false, `${id} ${cc}`);
  }
  assert.equal(offered(S.peacock, "US"), true); assert.equal(offered(S.peacock, "JP"), false);
  assert.equal(offered(S.chatgpt, null), null);
});

test("readers: real answers (measured 2026-11-01)", () => {
  assert.deepEqual(READERS.trace(200, "fl=1\nip=3.115.99.91\nloc=JP\ncolo=NRT\n"), { cc: "JP", ip: "3.115.99.91", colo: "NRT" });
  assert.equal(READERS.trace(200, "<html>"), null);
  assert.deepEqual(READERS.openai(200, '{\n  "cookie_consent_required": false\n}'), { ok: true });
  assert.deepEqual(READERS.openai(403, '{"error":{"code":"unsupported_country","message":"Country, region, or territory not supported"}}'), { ok: false });
  assert.deepEqual(READERS.kktv(200, '{"status":{"type":"OK"},"data":{"country":"JP","ip":"3.115.99.91","is_allowed":false}}'), { ok: false, cc: "JP", ip: "3.115.99.91" });
  assert.deepEqual(READERS.philo(200, '{"status": "FAIL", "city": "tokyo", "country": "JP"}'), { ok: false, cc: "JP" });
  assert.deepEqual(READERS.tvb(200, '{"ip":"3.115.99.91","country":"JP","allow_in_this_country":true}'), { ok: true, cc: "JP", ip: "3.115.99.91" });
  assert.deepEqual(READERS.sbs(200, '{"get":{"response":{"country_code":"HK"}}}'), { ok: false, cc: "HK" });
  assert.deepEqual(READERS.fod(200, '<?xml version="1.0"?><RESULT><FLAG TYPE="false" /></RESULT>'), { ok: false, cc: null });
  assert.deepEqual(READERS.dazn(200, '{"Region":{"isAllowed":true,"GeolocatedCountry":"jp"}}'), { ok: true, cc: "JP" });
  assert.deepEqual(READERS.dazn(403, '{"odata.error": {"code": 132986,"message": {"lang": "en-US","value": "Security policy has been breached"}}}'), { ok: false });
  assert.deepEqual(READERS.nbc(200, '{"restricted":true,"requestInfo":{"mediaType":"live","geoLookupType":"ip","countryCode":"JP"}}'), { ok: false, cc: "JP" });
  assert.deepEqual(READERS.dmm(200, '{"is_blocked":true,"block_status":"FOREIGN"}'), { ok: false });
  assert.deepEqual(READERS.dmm(401, '{"code":"UNAUTHORIZED"}'), { ok: true, cc: "JP" });
  assert.deepEqual(READERS.shudder(403, "Sorry, we are not available in your country"), { ok: false });
  assert.deepEqual(READERS.bein(451, "<h1>451 Unavailable For Legal Reasons</h1>"), { ok: false });
  assert.deepEqual(READERS.bein(500, ""), { ok: true });
  assert.deepEqual(READERS.zdf(403, "Access Denied"), { ok: false });
  assert.deepEqual(READERS.zdf(404, ""), { ok: true, cc: "DE" });
});

test("judge: each kind of probe", () => {
  assert.deepEqual(judge(S.claude, { cc: "JP", ip: "1.2.3.4" }, null), { v: "ok", cc: "JP", ip: "1.2.3.4", how: "edge", why: null });
  assert.equal(judge(S.claude, { cc: "HK" }, null).v, "no");
  assert.equal(judge(S.claude, { err: "net" }, null).v, "fail");
  // a trace the browser blocked while the site opens: the country most services see
  assert.deepEqual(judge(S.x, { err: "net", reach: true }, "HK"), { v: "ok", cc: "HK", ip: "", how: "guess", why: null });
  assert.equal(judge(S.x, { err: "net", reach: true }, null).v, "reach");
  assert.equal(judge(S.x, { err: "net", reach: false }, "HK").v, "fail");
  assert.deepEqual(judge(S.chatgpt, { ok: false, edge: { cc: "HK", ip: "" } }, "HK"), { v: "no", cc: "HK", ip: "", how: "api", why: null });
  assert.equal(judge(S.netflix, { reach: true, cc: "JP", hops: 0 }, null).v, "ok");
  assert.equal(judge(S.netflix, { reach: true, cc: null, hops: 2 }, "RU").v, "no");
  assert.equal(judge(S.netflix, { reach: true, cc: null, hops: 2 }, "JP").v, "reach");
  assert.equal(judge(S.netflix, { reach: false }, "JP").v, "fail");
  assert.deepEqual(judge(S.peacock, { reach: true, hops: 0 }, "JP"), { v: "ok", cc: "US", ip: "", how: "hops", why: null });
  assert.equal(judge(S.peacock, { reach: true, hops: 1 }, "JP").v, "no");
  assert.equal(judge(S.disney, { reach: true, hops: null }, "JP").v, "reach");
  assert.deepEqual(judge(S.gemini, { reach: true }, "HK"), { v: "ok", cc: "HK", ip: "", how: "guess", why: null });
  assert.equal(judge(S.gemini, { reach: true }, "CN").v, "no");
  assert.equal(judge(S.tiktok, { reach: true }, null).v, "reach");
  assert.equal(judge(S.copilot, { cc: "JP" }, null).v, "ok");
});

test("guess and exits", () => {
  assert.equal(guessCountry(["JP", "HK", "JP", null]), "JP");
  assert.equal(guessCountry([]), null);
  const v = { a: { cc: "JP", how: "edge" }, b: { cc: "HK", how: "api" }, c: { cc: "JP", how: "hops" }, d: { cc: "US", how: "guess" } };
  assert.deepEqual(exitsByCountry(v), [{ cc: "JP", ids: ["a", "c"] }, { cc: "HK", ids: ["b"] }]);
});

test("share links round-trip and ignore what they don't know", () => {
  const verdicts = { chatgpt: { v: "ok", how: "api", cc: "JP", ip: "1.2.3.4" }, gemini: { v: "reach", how: "guess", cc: null, ip: "" }, claude: { v: "fail", how: null, cc: null } };
  const h = encodeShare({ ts: 1793517762000, tz: "JP", verdicts });
  assert.ok(!h.includes("1.2.3.4"), "no address in the link");
  const r = parseShare(h + "_nope~oaJP", SERVICES.map(s => s.id));
  assert.equal(r.ts, 1793517762000); assert.equal(r.tz, "JP");
  assert.deepEqual(r.verdicts.chatgpt, { v: "ok", how: "api", cc: "JP", ip: "" });
  assert.deepEqual(r.verdicts.claude, { v: "fail", how: null, cc: null, ip: "" });
  assert.equal(r.verdicts.nope, undefined);
  assert.equal(parseShare("#r=2.x", []), null);
});

test("small helpers", () => {
  assert.equal(maskIp("203.0.113.9"), "203.0.•.•");
  assert.equal(maskIp("2001:db8::1"), "2001:db8:•");
  assert.equal(parseTrace("a=1\nb=x=y").b, "x=y");
});

test("Taiwan: its own name in every language and the cn flag (1ms-shell tool contract §5); others the system's", () => {
  assert.equal(regionName("TW", "zh-CN"), "中国台湾");
  assert.equal(regionName("TW", "zh-TW"), "中國台灣");
  assert.equal(regionName("TW", "en"), "Taiwan, China");
  assert.equal(regionName("TW", "ru"), "Тайвань, Китай");
  assert.equal(regionName("HK", "en"), new Intl.DisplayNames(["en"], { type: "region" }).of("HK"));
  assert.equal(flagCode("TW"), "cn");
  assert.equal(flagCode("HK"), "hk");
  assert.equal(flagCode("MO"), "mo");
});

test("dnsNote: where the DNS lookups come from against the exit", () => {
  assert.equal(dnsNote([], "JP"), null);
  assert.equal(dnsNote([{ cc: "JP", org: "x" }], null), null);
  assert.deepEqual(dnsNote([{ cc: "JP", org: "Google" }], "JP"), { k: "dns_same", r: "JP", e: "JP", org: "Google", ecs: null });
  assert.deepEqual(dnsNote([{ cc: "HK", org: "HKT" }], "JP"), { k: "dns_split", r: "HK", e: "JP", org: "HKT", ecs: null });
  // a mainland resolver among others is the one named
  assert.deepEqual(dnsNote([{ cc: "JP", org: "a" }, { cc: "CN", org: "China Unicom" }], "JP"), { k: "dns_cn", r: "CN", e: "JP", org: "China Unicom", ecs: null });
  // in mainland China with a mainland resolver: nothing leaks
  assert.equal(dnsNote([{ cc: "CN", org: "x" }], "CN").k, "dns_same");
  // the visitor's subnet passed on by a resolver
  assert.deepEqual(dnsNote([{ cc: "HK", org: "Google LLC", ecs: { net: "47.76.29.0/24" } }], "JP").ecs, { net: "47.76.29.0/24" });
  assert.equal(dnsNote([{ cc: "JP", org: "Google LLC", ecs: null }], "JP").ecs, null);
});

test("readers added from the command-line scripts (answers measured from Tokyo, 2026-11-04)", () => {
  assert.deepEqual(READERS.ten(200, ' { "state": "WA", "allow": false } '), { ok: false, cc: null });
  assert.deepEqual(READERS.ten(200, '{"state":"NSW","allow":true}'), { ok: true, cc: "AU" });
  assert.deepEqual(READERS.molotov(200, '{"is_france":false}'), { ok: false, cc: null });
  assert.deepEqual(READERS.nhk(200, '{ "continent_code": "AS", "country_code": "JP", "country_name": "Japan" }'), { ok: true, cc: "JP" });
  assert.deepEqual(READERS.nhk(200, '{ "continent_code": "other", "country_code": "other" }'), { ok: false, cc: null });
  assert.deepEqual(READERS.sling(200, '{"playback_allowed": null, "playback_disallowed": true, "playback_disallowed_code": 10, "playback_disallowed_reason": "proxy not allowed: commercial \'hosting,cloud\' for 16.76.79.94", "country": "jpn"}'),
    { ok: false, cc: null, proxy: true });
  assert.deepEqual(READERS.sling(200, '{"playback_allowed": true, "playback_disallowed": false, "country": "usa"}'), { ok: true, cc: "US" });
  assert.deepEqual(READERS.itv(403, '{ "error":"geoblock", "IP":"16.76.79.94"}'), { ok: false });
  assert.deepEqual(READERS.itv(404, ""), { ok: true, cc: "GB" });
  assert.deepEqual(READERS.itv(500, ""), { ok: null });
  assert.deepEqual(READERS.telasa(200, '{"status":{"type":"OK","subtype":null,"message":null},"data":null}'), { ok: true, cc: "JP" });
  assert.deepEqual(READERS.telasa(403, '{"status":{"type":"NG","subtype":"IPLocationNotAllowed"}}'), { ok: false });
  assert.deepEqual(READERS.aetv(403, '{ "title": "Geographic Restriction", "exception": "GeoLocationBlocked", "responseCode": "403" }'), { ok: false });
  // an answer that only reads one way leaves it to the country the others see
  const itvx = SERVICES.find(s => s.id === "itvx");
  assert.deepEqual(judge(itvx, { err: null, ok: null }, "GB"), { v: "ok", cc: "GB", ip: "", how: "guess", why: null });
  assert.equal(judge(itvx, { err: null, ok: null }, "JP").v, "no");
});

test("report card, route advice, comparing runs", () => {
  const sv = [{ id: "a", cat: "ai", deny: "CN" }, { id: "b", cat: "ai", only: "US" }, { id: "n", cat: "video", deny: "CN" }, { id: "j", cat: "local", only: "JP" }, { id: "k", cat: "local", only: "KR" }];
  const v = { a: { v: "ok", cc: "JP" }, b: { v: "no", cc: "JP" }, n: { v: "reach" }, j: { v: "ok", cc: null }, k: { v: "no" } };
  const c = scoreCard(v, sv);
  assert.deepEqual(c.cats.ai, { ok: 1, n: 2, places: [], g: "C" });
  assert.equal(c.cats.video.n, 0);                       // unclear doesn't count
  assert.deepEqual(c.cats.local.places, ["JP"]);
  assert.equal(c.total, "C");
  // another exit offers it: route there; none does: it needs another country
  assert.deepEqual(routeAdvice(v, sv, [{ cc: "JP", ids: ["a", "b"] }, { cc: "US", ids: ["x"] }]), [{ id: "b", k: "to", at: "JP", to: "US", via: "x" }]);
  assert.deepEqual(routeAdvice(v, sv, [{ cc: "JP", ids: ["a", "b"] }]), [{ id: "b", k: "need", at: "JP" }]);
  assert.deepEqual(routeAdvice({ a: { v: "fail" } }, sv, []), [{ id: "a", k: "fail" }]);
  const p = packRun(1, { a: { v: "ok", cc: "JP" }, b: { v: "no", cc: "JP" } }), q = packRun(2, { a: { v: "ok", cc: "HK" }, b: { v: "no", cc: "JP" }, n: { v: "ok" } });
  assert.deepEqual(p.v, { a: "oJP", b: "nJP" });
  assert.deepEqual(diffRuns(p, q), [{ id: "a", a: { v: "ok", cc: "JP" }, b: { v: "ok", cc: "HK" } }]);
});
