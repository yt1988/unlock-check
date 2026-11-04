#!/usr/bin/env node
// Downloads each service's icon once into public/assets/svc/<id>.<ext>, and lists them in src/icons.json, so the
// page shows them from this site: no request to the services or to a favicon service when someone opens the page.
// Run when a service is added and commit the output. Source: Google's favicon service at build time, trying the
// service's domains in turn; an icon it doesn't know comes back as its generic 16 px globe, which is refused (any
// larger one is kept). ICON_URL is the service's own icon file, for one the favicon service doesn't have.
// A service with no icon shows none.
// Usage: node scripts/icons.mjs [id …]
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { SERVICES } from "../src/services.mjs";

const out = new URL("../public/assets/svc/", import.meta.url), list = new URL("../src/icons.json", import.meta.url);
await mkdir(out, { recursive: true });
// domains to try, where the site's host isn't the one the brand's icon is known under
const DOMAINS = { copilot: ["copilot.microsoft.com", "copilot.cloud.microsoft", "www.bing.com"], mistral: ["mistral.ai"], bein: ["beinsports.com"],
  dmm: ["tv.dmm.com"], fod: ["fod.fujitv.co.jp"], tvb: ["tvbanywhere.com"], whatsapp: ["www.whatsapp.com", "whatsapp.com"],
  disney: ["www.disneyplus.com", "disneyplus.com"], nbc: ["www.nbc.com", "nbc.com"], kktv: ["www.kktv.me", "kktv.me"], deezer: ["deezer.com", "www.deezer.com"],
  wavve: ["wavve.com", "m.wavve.com"], "4gtv": ["4gtv.tv", "m.4gtv.tv"], viutv: ["www.viu.tv", "viu.tv"], tenplay: ["www.10play.com.au", "10play.com.au", "10.com.au"],
  aetv: ["www.aetv.com", "aetv.com"], directv: ["www.directv.com", "directv.com"], molatv: ["www.mola.tv", "mola.tv"], aisplay: ["www.ais.th", "ais.th", "ais.co.th"],
  kplus: ["kplus.vn", "vstv.vn"], optus: ["www.optus.com.au", "optus.com.au"] };
// the service's own icon, for one the favicon service doesn't have
const ICON_URL = { sbs: "https://www.sbs.com.au/ondemand/favicons/favicon-96.png" };
// the image format from its first bytes; PNG and ICO also give their size
function kind(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { ext: "png", w: b.readUInt32BE(16) };
  if (b.length > 8 && b.readUInt32BE(0) === 0x00000100) return { ext: "ico", w: b[6] || 256 };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return { ext: "jpg", w: 64 };
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return { ext: "webp", w: 64 };
  if (b.length > 6 && b.toString("latin1", 0, 3) === "GIF") return { ext: "gif", w: b.readUInt16LE(6) };
  return null;
}
const icons = JSON.parse(await readFile(list, "utf8").catch(() => "{}"));
const only = process.argv.slice(2);
let bad = 0;
for (const s of SERVICES.filter(s => !only.length || only.includes(s.id))) {
  let got = null, why = "";
  const urls = ICON_URL[s.id] ? [[new URL(ICON_URL[s.id]).host, ICON_URL[s.id]]] : (DOMAINS[s.id] || [new URL(s.site).host]).map(d => [d, `https://www.google.com/s2/favicons?domain=${d}&sz=64`]);
  for (const [domain, url] of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const b = Buffer.from(await r.arrayBuffer()), k = kind(b);
      if (r.ok && k && k.w > 16) { got = { b, k, domain }; break; }
      why = `${domain}: ${r.status}, ${k ? k.w + " px " + k.ext : "not an image"}`;
    } catch (e) { why = `${domain}: ${e.message}`; }
  }
  if (!got) { console.log(`✖ ${s.id} ${why}`); bad++; continue; }
  if (icons[s.id] && icons[s.id] !== `${s.id}.${got.k.ext}`) await rm(new URL(icons[s.id], out)).catch(() => {});
  icons[s.id] = `${s.id}.${got.k.ext}`;
  await writeFile(new URL(icons[s.id], out), got.b);
  console.log(`✓ ${s.id} (${got.domain}) ${got.k.w}px ${got.k.ext} ${got.b.length} B`);
}
await writeFile(list, JSON.stringify(Object.fromEntries(SERVICES.filter(s => icons[s.id]).map(s => [s.id, icons[s.id]])), null, 1) + "\n");
if (bad) process.exitCode = 1;
