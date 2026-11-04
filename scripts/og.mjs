#!/usr/bin/env node
// Renders the link-preview images with resvg (dev dependency), 1200 × 630, for every page scripts/build.mjs makes:
//   og/<lang>.png                the main page
//   og/<lang>/<slug>.png         each category's and each service's page
//   og/<lang>/r-<verdict>.png    the shared-result pages, whose card states the headline
// Run when a headline or the picture changes, and commit the output. Uses system fonts for the text
// (Windows: Segoe UI, Microsoft YaHei, Microsoft JhengHei, Yu Gothic UI, Malgun Gothic).
// Usage: node scripts/og.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import { LANGS, VERDICTS, loadI18n } from "./build.mjs";
import { SERVICES as ALL, CATS, SLUG, CAT_SLUG, named } from "../src/services.mjs";

const pub = new URL("../public/", import.meta.url);
const HOST = new URL(process.env.SITE_URL || "https://unlock.1ms.dog").host;
const render = svg => new Resvg(svg, { fitTo: { mode: "width", value: 1200 }, font: { loadSystemFonts: true, defaultFontFamily: "Segoe UI" } }).render().asPng();
const logo = Buffer.from(await readFile(new URL("assets/logo-dark.svg", pub))).toString("base64");
const FONTS = { "zh-CN": "Microsoft YaHei", "zh-TW": "Microsoft JhengHei", ja: "Yu Gothic UI", ko: "Malgun Gothic" };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// the page's dark-theme colors
const C = { bg: "#1c1c1c", panel: "#232323", line: "#363636", fg: "#ededed", muted: "#a0a0a0", ink: "#a5b4fc", ok: "#34d399", bad: "#f87171" };

// wide characters (CJK, kana, Hangul, full-width forms) are one em, Latin about half
const WIDE = /[　-鿿가-힯＀-￯]/;
const emW = s => [...s].reduce((a, ch) => a + (WIDE.test(ch) ? 1 : /[A-Z0-9]/.test(ch) ? .62 : .52), 0);
function wrap(s, size, w) {
  const toks = s.match(/[　-鿿가-힯＀-￯]|[^\s　-鿿가-힯＀-￯]+\s*|\s+/g) || [], out = [];
  let line = "";
  for (const t of toks) {
    if (line && emW(line + t) * size > w && !/^[，。：、）)!?！？:,.]/.test(t)) { out.push(line.trimEnd()); line = t.trimStart(); } else line += t;
  }
  if (line.trim()) out.push(line.trimEnd());
  return out;
}

// The picture on the right: a panel of services with their verdict marks, as on the page.
// rows: [name, "ok" | "no" | "reach"]
function card(lang, name, title, sub, rows) {
  const ff = `${FONTS[lang] ? `'${FONTS[lang]}', ` : ""}'Segoe UI', 'Microsoft YaHei', sans-serif`;
  let size = 58, lines = wrap(title, size, 600);
  if (lines.length > 3) { size = 46; lines = wrap(title, size, 600); }
  if (lines.length > 4) { size = 40; lines = wrap(title, size, 600); }
  const top = 250 + (3 - Math.min(3, lines.length)) * 20;
  const MK = { ok: ["✓", C.ok], no: ["✕", C.bad], reach: ["•", C.muted] };
  const list = rows.slice(0, 6).map(([n, v], i) => {
    const y = 160 + i * 64, [m, col] = MK[v];
    return (i ? `<line x1="745" y1="${y - 26}" x2="1112" y2="${y - 26}" stroke="${C.line}" stroke-width="1.5"/>` : "") +
      `<circle cx="762" cy="${y + 6}" r="15" fill="${col}"/>` +
      `<text x="762" y="${y + 12}" text-anchor="middle" font-size="18" font-weight="700" fill="#111" font-family="Segoe UI, sans-serif">${m}</text>` +
      `<text x="792" y="${y + 15}" font-size="27" font-weight="600" fill="${C.fg}" font-family="Segoe UI, sans-serif">${esc(n)}</text>`;
  }).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${C.bg}"/>
  <rect x="712" y="102" width="432" height="420" rx="22" fill="${C.panel}" stroke="${C.line}" stroke-width="2"/>
  <image href="data:image/svg+xml;base64,${logo}" x="72" y="56" width="200" height="80"/>
  <text x="292" y="114" font-size="34" font-weight="700" fill="${C.ink}" font-family="${ff}">${esc(name)}</text>
  ${lines.map((l, i) => `<text x="80" y="${top + i * (size + 16)}" font-size="${size}" font-weight="700" fill="#ffffff" font-family="${ff}">${esc(l)}</text>`).join("\n  ")}
  <text x="80" y="${top + lines.length * (size + 16) + 14}" font-size="${Math.min(26, Math.floor(600 / emW(sub)))}" fill="${C.muted}" font-family="${ff}">${esc(sub)}</text>
  ${list}
  <text x="1144" y="590" text-anchor="end" font-size="28" font-weight="600" fill="${C.ink}" font-family="Consolas, monospace">${HOST}</text>
</svg>`;
}

const fill = (s, v) => { for (const k in v) s = s.split("{" + k + "}").join(v[k]); return s; };
const pick = ids => ids.map(id => ALL.find(s => s.id === id).name);
const MAIN = pick(["netflix", "chatgpt", "claude", "gemini", "disney", "tiktok"]);
const I = await loadI18n();
for (const [lang] of LANGS) {
  const SERVICES = named(lang), d = I[lang], file = lang.toLowerCase(), sub = CATS.map(c => d["cat_" + c].nav).join(" · ");
  await mkdir(new URL(`og/${file}/`, pub), { recursive: true });
  await writeFile(new URL(`og/${file}.png`, pub), render(card(lang, d.name, d.h1, sub, MAIN.map(n => [n, "ok"]))));
  for (const c of CATS) {
    const rows = SERVICES.filter(s => s.cat === c).map(s => [s.name, "ok"]);
    await writeFile(new URL(`og/${file}/${CAT_SLUG[c]}.png`, pub), render(card(lang, d.name, d["cat_" + c].h1, sub, rows)));
  }
  // a service's card leads with that service, then the others of its category
  for (const s of SERVICES) {
    const rows = [[s.name, "ok"], ...SERVICES.filter(x => x.cat === s.cat && x !== s).map(x => [x.name, "reach"])];
    await writeFile(new URL(`og/${file}/${SLUG[s.id]}.png`, pub), render(card(lang, d.name, fill(d.svc_h1, { name: s.name }), d["cat_" + s.cat].nav, rows)));
  }
  const V = { all: MAIN.map(n => [n, "ok"]), part: MAIN.map((n, i) => [n, i < 4 ? "ok" : "no"]), noai: MAIN.map((n, i) => [n, i >= 1 && i <= 3 ? "no" : "ok"]) };
  for (const v of VERDICTS) await writeFile(new URL(`og/${file}/r-${v}.png`, pub), render(card(lang, d.name, d["vh_" + v], sub, V[v])));
  console.log(`wrote og/${file}.png and ${CATS.length + ALL.length + VERDICTS.length} more`);
}
