// The built pages keep the 1ms.dog tool contract (see the README): what the shared top bar relies on, SEO and sharing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { LANGS, VERDICTS, loadI18n, pageIds, subOf } from "../scripts/build.mjs";
import { SERVICES, CATS } from "../src/services.mjs";

const I = await loadI18n();
const SITE = "https://unlock.1ms.dog";
const at = (slug, sub = "") => (slug ? slug + "/" : "") + sub;
const page = async f => readFile(new URL(`../public/${f}index.html`, import.meta.url), "utf8");
const has = f => access(new URL("../public/" + f, import.meta.url)).then(() => true, () => false);
const holes = s => [...new Set(String(s).match(/\{\w+\}/g) || [])].sort();

test("every language has every string, with the same placeholders", () => {
  for (const [l] of LANGS) {
    assert.ok(I[l], "missing language " + l);
    for (const [k, v] of Object.entries(I.en)) {
      if (k.endsWith("_s") && !(k in I[l])) continue;   // a shared result's version, only where the line names "you"
      assert.ok(k in I[l], `${l}: missing ${k}`);
      if (typeof v === "string") assert.deepEqual(holes(I[l][k]), holes(v), `${l}: placeholders of ${k}`);
      if (k.startsWith("cat_")) for (const f of ["nav", "title", "desc", "kw", "h1", "intro"]) assert.equal(typeof I[l][k][f], "string", `${l} ${k}.${f}`);
    }
    assert.equal(I[l].faq.length, I.en.faq.length, l + ": faq");
  }
});

test("pages: charset first, standard lang, no inline styles, every service listed, small", async () => {
  for (const [l, slug] of LANGS) for (const p of pageIds()) {
    const f = at(slug, subOf(p)), h = await page(f);
    assert.match(h, /^<!doctype html>\n<html lang="[a-zA-Z-]+"/, f);
    assert.equal(h.match(/<html lang="([^"]+)"/)[1], l);
    assert.match(h, /<head>\n<meta charset="utf-8">\n<script>/);
    assert.ok(!/\sstyle="/.test(h), f + ": inline style attribute");
    // a page lists only what it tests: every service, its category's, or none besides its own panel
    for (const s of SERVICES) assert.equal(h.includes(`id="s-${s.id}"`), !p || (!!p.cat && s.cat === p.cat), `${f}: row ${s.id}`);
    if (p) assert.ok(h.includes(`<p class="all"><a class="btn" href="/${slug ? slug + "/" : ""}">`), f + ": test-all link");
    assert.equal((h.match(/<h1>/g) || []).length, 1, f + ": one h1");
    assert.ok(h.length < 60_000, f + ": page too big");
    if (p && p.svc) assert.ok(h.includes(`data-s="${p.svc}"`), f + ": lead panel");
  }
  const css = await readFile(new URL("../public/assets/" + /app\.[0-9a-f]+\.css/.exec(await page(""))[0], import.meta.url), "utf8");
  assert.ok(/select option, ?select optgroup/.test(css) && /scrollbar-gutter:\s?stable/.test(css));
});

test("SEO: own title per page and language, canonical, hreflang, og image, sitemap", async () => {
  const sitemap = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  for (const p of pageIds()) {
    const titles = new Set(), sub = subOf(p);
    for (const [l, slug] of LANGS) {
      const h = await page(at(slug, sub)), url = `${SITE}/${at(slug, sub)}`;
      titles.add(/<title>([^<]+)<\/title>/.exec(h)[1]);
      assert.ok(h.includes(`<link rel="canonical" href="${url}">`), url + " canonical");
      for (const [l2, s2] of LANGS) assert.ok(h.includes(`hreflang="${l2}" href="${SITE}/${at(s2, sub)}"`), `${url} hreflang ${l2}`);
      assert.ok(h.includes(`hreflang="x-default" href="${SITE}/${sub}"`));
      assert.match(h, /name="twitter:card" content="summary_large_image"/);
      assert.match(h, /"@type":"FAQPage"/);
      const og = /property="og:image" content="([^"]+)"/.exec(h)[1];
      assert.ok(await has(og.slice(SITE.length + 1)), url + ": og image " + og);
      assert.ok(sitemap.includes(`<loc>${url}</loc>`), url + " in the sitemap");
    }
    assert.equal(titles.size, LANGS.length, (sub || "/") + ": a title per language");
  }
  for (const f of ["robots.txt", "sitemap.xml", "llms.txt"]) assert.ok(await has(f), f);
});

test("shared results: a page and an image per headline, not indexed", async () => {
  for (const [l, slug] of LANGS) for (const v of VERDICTS) {
    const h = await page(at(slug, `r/${v}/`));
    assert.match(h, /name="robots" content="noindex/);
    assert.ok(await has(`og/${l.toLowerCase()}/r-${v}.png`), `${l}: ${v} image`);
  }
});

test("the redirect chain: a rule per hop, the last one leaves the site", async () => {
  const r = await readFile(new URL("../public/_redirects", import.meta.url), "utf8");
  for (let n = 2; n <= 25; n++) assert.ok(r.includes(`/h/${n}/* /h/${n - 1}/:splat 302`), "hop " + n);
  assert.ok(r.includes("/h/1/:host/* https://:host/:splat 302"));
  assert.ok(await has("hop.txt"));
});

// Visible text that is not in the strings files is a brand (the same everywhere) or a gap
const BRANDS = new Set(["", "1ms", "GitHub", "Streaming & AI Unlock Check", ...SERVICES.map(s => s.name)]);
test("no English left on other languages' pages (aria-label, title, alt)", async () => {
  const attrs = h => [...h.matchAll(/\s(aria-label|title|alt)="([^"]*)"/g)].map(m => m[2]);
  const en = new Set(attrs(await page("")));
  for (const [l, slug] of LANGS.slice(1)) {
    const leaks = attrs(await page(at(slug))).filter(v => en.has(v) && !BRANDS.has(v));
    assert.deepEqual([...new Set(leaks)], [], l + ": untranslated");
  }
});

test("categories cover every service", () => {
  for (const c of CATS) assert.ok(SERVICES.some(s => s.cat === c), c);
});
