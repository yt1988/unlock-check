#!/usr/bin/env node
// Local preview of ./public with the same headers as production (public/_headers, including the CSP), and the
// redirect chain of public/_redirects (/h/<n>/<host>/<path>), whose last hop goes to http for this server itself.
// Usage: node scripts/dev.mjs [port]
// CHECK=http://127.0.0.1:<port> also plays the shell's part for the connection checkup's embed mode (1ms-shell
// docs/checkup.md): pages get <meta name="check">, may be framed by that origin, and /__checkup.html there frames
// /?embed=checkup on localhost and logs what it posts back.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = +process.argv[2] || 8787;
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".yaml": "text/plain; charset=utf-8", ".list": "text/plain; charset=utf-8", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };

// Cloudflare-style _headers: a path pattern line, then indented "Name: value" lines; * matches anything
async function rules() {
  const text = await readFile(root + "_headers", "utf8").catch(() => "");
  const out = []; let cur = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) { cur = { re: new RegExp("^" + line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"), h: {} }; out.push(cur); }
    else if (cur && line.trim().startsWith("!")) cur.h[line.trim().slice(1).trim()] = null;   // "! Name": the header set by an earlier rule is removed
    else if (cur && line.includes(":")) { const i = line.indexOf(":"); cur.h[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
  return out;
}

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const h = /^\/h\/(\d+)\/([^/]+)(\/.*)?$/.exec(new URL(req.url, "http://x").pathname);
  if (h) {
    const n = +h[1], rest = (h[3] || "/") + new URL(req.url, "http://x").search;
    const to = n > 1 ? `/h/${n - 1}/${h[2]}${rest}` : `${h[2] === req.headers.host ? "http" : "https"}://${h[2]}${rest}`;
    res.writeHead(n > 0 && n <= 25 ? 302 : 404, { Location: to }).end(); return;
  }
  // ME='{"country":"JP",…}' answers the shell's /_ms/me (without it, a 404, as when self-hosted)
  if (urlPath === "/_ms/me" && process.env.ME) { res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-store" }).end(process.env.ME); return; }
  const CHECK = process.env.CHECK;
  if (CHECK && urlPath === "/__checkup.html") {
    const src = `http://localhost:${port}${new URL(req.url, "http://x").searchParams.get("p") || "/zh-cn/"}?embed=checkup`;
    res.writeHead(200, { "Content-Type": TYPES[".html"] }).end(`<!doctype html><meta charset="utf-8"><title>checkup</title>
<iframe id="f" src="${src}" style="width:min(100%,720px);height:400px;border:1px solid #ccc"></iframe><pre id="log"></pre>
<script>window.msgs=[];addEventListener("message",e=>{if(e.origin!=="http://localhost:${port}")return;msgs.push(e.data);
if(e.data.type==="size")f.style.height=e.data.height+"px";log.textContent+=JSON.stringify(e.data)+"\\n";});</script>`);
    return;
  }
  let path = urlPath;
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(root + path);
  if (!file.startsWith(normalize(root))) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    const headers = { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" };
    for (const r of await rules()) if (r.re.test(urlPath)) for (const [k, v] of Object.entries(r.h)) { if (v == null) delete headers[k]; else headers[k] = v; }
    headers["Cache-Control"] = "no-cache";
    if (CHECK && extname(file) === ".html") {
      delete headers["X-Frame-Options"];
      headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace("frame-ancestors 'none'", "frame-ancestors " + CHECK);
      let html = body.toString().replace("</head>", `<meta name="check" content="${CHECK}">
</head>`);
      if (new URL(req.url, "http://x").searchParams.get("embed") === "checkup") html = html.replace("<html ", '<html data-ms-embed="checkup" ');
      res.writeHead(200, headers).end(html); return;
    }
    res.writeHead(200, headers).end(body);
  } catch { res.writeHead(404, { "Content-Type": "text/plain" }).end("not found"); }
}).listen(port, () => console.log(`unlock: http://localhost:${port}/`));
