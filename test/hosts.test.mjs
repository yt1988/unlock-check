// Internal measurement and helper hosts never appear in visitor-facing text: i18n, the built pages, the README and
// llms.txt say "our server in Tokyo", "this site's name server" and so on. The code that builds those requests keeps
// the real addresses; this test only reads what a visitor can see. (Site rule, 2026-11-24.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const INTERNAL = [
  /\bprobe\.1ms\.dog\b/, /\bprobe\.dog\.1msapp\.com\b/,
  /\becho\.1ms\.dog\b/, /\becho\.dog\.1msapp\.com\b/,
  /\bstun\.1ms\.dog\b/, /\brtc\.1ms\.dog\b/, /\bcross\.1ms\.one\b/,
  /\bv4\.ipv6\.1ms\.dog\b/, /\bv6\.ipv6\.1ms\.dog\b/, /\bhe\.ipv6\.1ms\.dog\b/,
  /\bapi\.l\.1ms\.dog\b/, /\bl\.1ms\.dog\b/, /\bdata\.1ms\.dog\b/,
  /\b[a-z0-9-]+\.1msapp\.com\b/,
  /\bmaybe\.1ms\.one\b/, /\bprivacy\.maybe\.1ms\.one\b/,
];
const root = new URL("../", import.meta.url);
const read = rel => readFile(new URL(rel, root), "utf8");
const hit = s => INTERNAL.map(re => re.exec(s)).find(Boolean);
const fail = (f, s) => { const m = hit(s); assert.ok(!m, `${f}: ${m && m[0]}`); };

async function publicPages(dir = "public/") {
  const out = [];
  for (const it of await readdir(new URL(dir, root), { withFileTypes: true })) {
    const rel = dir + it.name;
    if (it.isDirectory()) {
      if (rel !== "public/assets/") out.push(...await publicPages(rel + "/"));
    } else if (it.name.endsWith(".html")) out.push(rel);
  }
  return out;
}

test("no internal host in visitor-visible text", async () => {
  for (const f of ["README.md", "README.zh-CN.md", "public/llms.txt"]) fail(f, await read(f));
  for (const f of (await readdir(new URL("src/i18n/", root))).filter(f => f.endsWith(".mjs"))) fail("src/i18n/" + f, await read("src/i18n/" + f));
  for (const f of await publicPages()) fail(f, await read(f));
});
