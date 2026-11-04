#!/usr/bin/env node
// Builds the static site in public/ from src/:
//   index.html, <lang>/index.html              the page per language: every service, by category
//   <lang>/<category>/                          a category's page (CAT_SLUG): its services first, its own words
//   <lang>/<service>/                           a service's page (SLUG): its verdict up front, its countries and method
//                                               in the questions
//   r/<verdict>/, <lang>/r/<verdict>/           the page for a shared result: its preview card states the headline
//                                               (the result itself is in the link's hash; og/ images: scripts/og.mjs)
//   _redirects, hop.txt                         the redirect chain the page counts with (/h/<n>/…, see src/app.js)
//   assets/app.<hash>.js|css, assets/l.<lang>.<hash>.js, sitemap.xml, robots.txt, llms.txt, _headers
// Usage: node scripts/build.mjs          write the files
//        node scripts/build.mjs --check  exit 1 if anything is out of date, or the app code does not parse (CI)
// SITE_URL sets the address used in canonical links and the sitemap (default https://unlock.1ms.dog).
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import { SERVICES, CATS, NETFLIX_TRY, SLUG, CAT_SLUG, named } from "../src/services.mjs";
import { regionName } from "../src/lib.mjs";
// each service's icon in public/assets/svc/ (scripts/icons.mjs); a service without one keeps the space empty
const ICONS = JSON.parse(await readFile(new URL("../src/icons.json", import.meta.url), "utf8"));

const SITE = (process.env.SITE_URL || "https://unlock.1ms.dog").replace(/\/+$/, "");
export const REPO = "https://github.com/yt1988/unlock-check";
const pub = new URL("../public/", import.meta.url), src = new URL("../src/", import.meta.url);
// language, URL folder, og:locale, name in its own language; the first is the root
export const LANGS = [["en", "", "en_US", "English"], ["zh-CN", "zh-cn", "zh_CN", "简体中文"], ["zh-TW", "zh-tw", "zh_TW", "繁體中文"],
  ["ja", "ja", "ja_JP", "日本語"], ["ko", "ko", "ko_KR", "한국어"], ["es", "es", "es_ES", "Español"], ["fr", "fr", "fr_FR", "Français"],
  ["de", "de", "de_DE", "Deutsch"], ["pt", "pt", "pt_BR", "Português"], ["ru", "ru", "ru_RU", "Русский"]];
// the headlines a shared result can have (src/app.js verdict())
export const VERDICTS = ["all", "part", "noai"];
// the redirects the chain can add; more than any browser follows (Chrome and Firefox: 20, Safari: 16)
const HOPS = 25;

// Runs before first paint: apply the saved theme.
// On the English root and on every shared-result page, send visitors to their language's page (a saved choice first,
// then the browser languages); crawlers and readers of the page's language stay.
export const PREPAINT = `(function(){var d=document.documentElement,th=null,s=null;try{th=localStorage.getItem("unlock:theme");s=localStorage.getItem("unlock:lang")}catch(e){}if(th==="light"||th==="dark")d.setAttribute("data-theme",th);if(!d.hasAttribute("data-root"))return;var P=JSON.parse(d.getAttribute("data-paths")||"{}"),l=null;try{var q=new URLSearchParams(location.search).get("lang");if(P[q])l=q}catch(e){}if(!l&&P[s])l=s;for(var ls=navigator.languages||[navigator.language||"en"],i=0;!l&&!s&&i<ls.length;i++){var x=String(ls[i]).toLowerCase(),b=x.split("-")[0];l=b==="zh"?(/tw|hk|mo|hant/.test(x)?"zh-TW":"zh-CN"):P[b]?b:null}if(l&&l!==d.lang)location.replace(P[l]+location.hash)})();`;

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (s, v) => { for (const k in v) s = s.split("{" + k + "}").join(v[k]); return s; };
const hash = s => createHash("sha256").update(s).digest("hex").slice(0, 10);
const sha = s => createHash("sha256").update(s).digest("base64");

// Windows sometimes holds a just-written file for a moment (antivirus, the preview server): retry before failing
async function writeRetry(url, text) {
  for (let i = 0; ; i++) {
    try { return await writeFile(url, text); }
    catch (e) { if (i >= 4 || !["UNKNOWN", "EBUSY", "EPERM"].includes(e.code)) throw e; await new Promise(r => setTimeout(r, 150 * (i + 1))); }
  }
}

export async function loadI18n() {
  const out = {};
  for (const f of (await readdir(new URL("i18n/", src))).filter(f => f.endsWith(".mjs")))
    out[f.slice(0, -4)] = (await import(new URL("i18n/" + f, src).href + "?" + Date.now())).default;
  return out;
}

// the countries of a list, by name in the page's language
const names = (lang, codes) => codes.split(" ").map(c => regionName(c, lang)).sort((a, b) => a.localeCompare(b, lang));
// countries in a row: " · " where the language's list comma would split a name ("Taiwan, China"); 、 stays (tool contract §5)
const joinCc = join => join === "、" ? join : " · ";

// A page of the site: which one (null for the main page, { cat } or { svc }), in one language
export function pageIds() {
  return [null, ...CATS.map(cat => ({ cat })), ...SERVICES.map(s => ({ svc: s.id }))];
}
export const subOf = p => !p ? "" : p.cat ? CAT_SLUG[p.cat] + "/" : SLUG[p.svc] + "/";

export async function build({ check = false } = {}) {
  const I = await loadI18n();
  const langs = LANGS.filter(([l]) => I[l]);
  const tpl = await readFile(new URL("page.html", src), "utf8");

  // src/lib.mjs (the pure logic the tests import) goes inside the app's scope, at its /* @lib */ marker
  const lib = (await readFile(new URL("lib.mjs", src), "utf8")).replace(/^export /gm, "");
  const appSrc = await readFile(new URL("app.js", src), "utf8");
  if (!appSrc.includes("/* @lib */")) throw new Error("src/app.js has no /* @lib */ marker");
  const svcs = SERVICES.map(({ src: _, ...s }) => s);
  const appFull = `const ALL_SERVICES = ${JSON.stringify(svcs)}, ALL_CATS = ${JSON.stringify(CATS)}, NETFLIX_TRY = ${JSON.stringify(NETFLIX_TRY)};\n` + appSrc.replace("/* @lib */", () => lib);
  new Function(appFull);                                                // must parse
  const cssFull = (await Promise.all(["fonts.css", "style.css", "tool.css"].map(f => readFile(new URL(f, src), "utf8")))).join("\n");
  const js = (await transform(appFull, { loader: "js", minify: true, target: "es2020", legalComments: "none" })).code;
  const css = (await transform(cssFull, { loader: "css", minify: true, legalComments: "none" })).code;
  const jsName = `app.${hash(js)}.js`, cssName = `app.${hash(css)}.css`;

  // the strings the browser needs; the page's own text is already in the HTML
  const RUNTIME = /^(name|fd_\w+|v_\w+|how_\w+|why_\w+|note_\w+|watch_\w+|dns_\w+|pl_\w+|id_\w+|ln_\w+|pr_\w+|fo_\w+|ex_\w+|tz_\w+|wait_\w+|ip_\w+|ipq_title|vh_\w+|th_\w+|egress_link|ck_link|progress|done|rerun|running|hide|show|share|share_text|test_mine|share_bad|err_blocked|join)$/;
  const path = slug => "/" + (slug ? slug + "/" : "");
  const N = SERVICES.length;
  const pages = [], files = {};
  for (const [lang, slug, locale] of langs) {
    const SERVICES = named(lang);                                       // each under the name this language uses
    // no fallback to English: a string missing in this language stops the build
    const d = I[lang], T = k => { if (d[k] == null) throw new Error(`${lang}: missing string "${k}"`); return d[k]; };
    // a line's version for someone else's shared result (<key>_s) is left out where the line names nobody ("you")
    const strings = Object.fromEntries(Object.keys(I.en).filter(k => RUNTIME.test(k) && !(/_(s|one|few|many)$/.test(k) && d[k] == null)).map(k => [k, T(k)]));
    const sjs = `window.LUNLOCK=${JSON.stringify(strings).replace(/</g, "\\u003c")};\n`;
    const sName = `l.${lang.toLowerCase()}.${hash(sjs)}.js`;
    files["assets/" + sName] = sjs;
    const home = path(slug), href = p => home + subOf(p);
    const alias = id => (d.alias || {})[id];

    // every service is in the HTML from the start, in its category (crawlers see what is checked; rows never move)
    const row = s => `<li class="sv" id="s-${s.id}"><span class="vd sr"></span>` +
      (ICONS[s.id] ? `<img class="fi" src="/assets/svc/${ICONS[s.id]}" width="16" height="16" alt="" decoding="async">` : `<span class="fi"></span>`) + `<a class="sn" href="${href({ svc: s.id })}">${esc(s.name)}</a>` +
      `<span class="rg"></span></li>`;
    // A page tests only what it is about (1ms-shell tool contract, "a sub-page tests only its own item"): the main
    // page every service, a category page that category, a service page that service, with its category's other
    // pages linked below (names only, not tested). Both lead to the main page to test everything.
    const listOf = p => !p ? `    <section class="list card">\n${groupsOf(CATS)}\n    </section>` : p.cat ? `    <section class="list card">\n${groupsOf([p.cat])}\n    </section>`
      : `    <nav class="peers card"><h2><a href="${href({ cat: SV(p.svc).cat })}">${esc(T("cat_" + SV(p.svc).cat).nav)}</a></h2><p>` +
        SERVICES.filter(s => s.cat === SV(p.svc).cat && s.id !== p.svc).map(s => `<a href="${href({ svc: s.id })}">${esc(s.name)}</a>`).join("") + `</p></nav>`;
    const scopeOf = p => !p ? null : p.cat ? SERVICES.filter(s => s.cat === p.cat).map(s => s.id) : [p.svc];
    const allLink = p => !p ? "" : `      <p class="all"><a class="btn" href="${home}">${esc(fill(T("all_link"), { n: N }))}</a></p>\n`;
    const groupsOf = cats => cats.map(c =>
      `<div class="grp" data-c="${c}"><h2><a href="${href({ cat: c })}">${esc(T("cat_" + c).nav)}</a><b class="g-n"></b></h2><ul>${SERVICES.filter(s => s.cat === c).map(row).join("")}</ul></div>`).join("\n");
    const focusOf = id => !id ? "" : `<div class="focus wait" id="focus" data-s="${id}"><div class="fo-h"><i class="st"></i>${ICONS[id] ? `<img class="fi" src="/assets/svc/${ICONS[id]}" width="22" height="22" alt="">` : ""}<b class="fo-t">${esc(SV(id).name)}</b></div><p class="fo-d"><span class="bar"></span></p></div>`;
    const SV = id => SERVICES.find(s => s.id === id);
    const langOpts = langs.map(([l, , , nm]) => `<option value="${l}"${l === lang ? " selected" : ""}>${esc(nm)}</option>`).join("");
    // the footer links every page of the language: categories, then services
    const nav = [`<a href="${home}">${esc(T("nav_all"))}</a>`, ...CATS.map(c => `<a href="${href({ cat: c })}">${esc(T("cat_" + c).nav)}</a>`)].join("") +
      `</nav><nav class="foot-nav svcs">` + SERVICES.map(s => `<a href="${href({ svc: s.id })}">${esc(s.name)}</a>`).join("");

    // A service's own questions: where it is offered (its published list, by name in this language), how this page
    // checks it, and its notes; then the site's questions.
    const svcFaq = s => {
      const n = s.name, f = v => fill(v, { name: n });
      const where = s.only ? fill(T("a_only"), { name: n, c: names(lang, s.only)[0] })
        : s.allow ? fill(T("a_allow"), { name: n, n: s.allow.split(" ").length, list: names(lang, s.allow).join(joinCc(T("join"))) })
          : s.deny ? fill(T("a_deny"), { name: n, list: names(lang, s.deny).join(joinCc(T("join"))) }) : fill(T("a_nolist"), { name: n });
      const how = s.probe.api || s.probe.jsonp ? "m_api" : s.probe.trace ? "m_edge" : s.probe.netflix ? "m_nf" : s.probe.hops ? "m_hops" : "m_guess";
      const out = [[f(T("q_where")), where + (s.src ? ` <a href="${esc(s.src)}" target="_blank" rel="noopener">${esc(T("source"))}</a>` : "")],
        [f(T("q_how")), esc(f(T(how)))]];
      if (s.id === "netflix") out.push([f(T("q_netflix")), esc(T("a_netflix"))]);
      if (s.id === "gemini") out.push([f(T("q_gemini")), esc(T("a_gemini"))]);
      out.push([f(T("q_no")), esc(f(T("a_no")))]);
      return out;
    };
    const general = T("faq").map(([q, a]) => [q, esc(a)]);

    for (const p of pageIds()) {
      const sub = subOf(p), s = p && p.svc ? SV(p.svc) : null, C = p && p.cat ? T("cat_" + p.cat) : null;
      const v = s ? { title: fill(T("svc_title"), { name: s.name }), desc: fill(T("svc_desc"), { name: s.name }), h1: fill(T("svc_h1"), { name: s.name }),
          intro: fill(T("svc_intro"), { name: s.name }), kw: fill(T("svc_kw"), { name: s.name }) + (alias(s.id) ? ", " + alias(s.id) : ""), faq: [...svcFaq(s), ...general] }
        : C ? { title: C.title, desc: C.desc, h1: C.h1, intro: C.intro, kw: C.kw, faq: general }
          : { title: T("name") + " · " + T("seo_title"), desc: fill(T("seo_desc"), { n: N }), h1: T("h1"), intro: fill(T("intro"), { n: N }), kw: T("seo_kw"), faq: general };
      const purl = SITE + home + sub, paths = Object.fromEntries(langs.map(([l, sl]) => [l, path(sl) + sub]));
      const og = `${SITE}/og/${lang.toLowerCase()}${sub ? "/" + sub.slice(0, -1) : ""}.png`;
      const alts = langs.map(([l, sl]) => `<link rel="alternate" hreflang="${l}" href="${SITE + path(sl) + sub}">`).join("\n") +
        `\n<link rel="alternate" hreflang="x-default" href="${SITE}/${sub}">`;
      const strip = h => h.replace(/<[^>]+>/g, "");
      const graph = { "@context": "https://schema.org", "@graph": [
        { "@type": "WebApplication", name: s ? v.h1 : T("name"), url: purl, applicationCategory: "UtilitiesApplication",
          operatingSystem: "Any", browserRequirements: "Requires JavaScript", description: v.desc, inLanguage: lang, isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
        { "@type": "FAQPage", inLanguage: lang, mainEntity: v.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: strip(a) } })) },
        ...(p ? [{ "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: T("name"), item: SITE + home },
          ...(s ? [{ "@type": "ListItem", position: 2, name: T("cat_" + s.cat).nav, item: SITE + href({ cat: s.cat }) }] : []),
          { "@type": "ListItem", position: s ? 3 : 2, name: s ? s.name : C.nav, item: purl }] }] : [])] };
      const head = [
        `<title>${esc(v.title)}</title>`,
        `<meta name="description" content="${esc(v.desc)}">`,
        `<meta name="keywords" content="${esc(v.kw)}">`,
        ...(lang === "zh-CN" ? [`<meta http-equiv="Cache-Control" content="no-transform">`, `<meta http-equiv="Cache-Control" content="no-siteapp">`, `<meta name="applicable-device" content="pc,mobile">`] : []),
        `<meta name="robots" content="index, follow">`,
        `<meta name="theme-color" content="#f6f6f7" media="(prefers-color-scheme: light)">`,
        `<meta name="theme-color" content="#1c1c1c" media="(prefers-color-scheme: dark)">`,
        `<link rel="canonical" href="${purl}">`, alts,
        `<link rel="icon" href="/favicon.ico" sizes="any">`, `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`,
        `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="1ms.dog">`, `<meta property="og:title" content="${esc(v.title)}">`, `<meta property="og:description" content="${esc(v.desc)}">`,
        `<meta property="og:url" content="${purl}">`, `<meta property="og:locale" content="${locale}">`,
        `<meta property="og:image" content="${og}">`, `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`,
        `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:image" content="${og}">`,
        `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`,
      ].join("\n");
      pages.push({ file: (slug ? slug + "/" : "") + sub + "index.html", url: purl, sub, html: page(head, paths, !slug && !p, p, v) });
    }
    // A shared result opens /<lang>/r/<verdict>/#r=…: the main page, with a preview card that states the headline.
    // Not for search engines (noindex, canonical to the main page); visitors are sent to their own language's copy.
    for (const vd of VERDICTS) {
      const rp = home + "r/" + vd + "/", rtitle = T("vh_" + vd) + " · " + T("name"), rog = `${SITE}/og/${lang.toLowerCase()}/r-${vd}.png`;
      const rhead = [
        `<title>${esc(rtitle)}</title>`, `<meta name="description" content="${esc(T("r_desc"))}">`, `<meta name="robots" content="noindex, follow">`,
        `<meta name="theme-color" content="#f6f6f7" media="(prefers-color-scheme: light)">`, `<meta name="theme-color" content="#1c1c1c" media="(prefers-color-scheme: dark)">`,
        `<link rel="canonical" href="${SITE + home}">`,
        `<link rel="icon" href="/favicon.ico" sizes="any">`, `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`,
        `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="1ms.dog">`, `<meta property="og:title" content="${esc(rtitle)}">`,
        `<meta property="og:description" content="${esc(T("r_desc"))}">`, `<meta property="og:url" content="${SITE + rp}">`, `<meta property="og:locale" content="${locale}">`,
        `<meta property="og:image" content="${rog}">`, `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`,
        `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:image" content="${rog}">`,
      ].join("\n");
      const rpaths = Object.fromEntries(langs.map(([l, sl]) => [l, path(sl) + "r/" + vd + "/"]));
      pages.push({ file: rp.slice(1) + "index.html", url: SITE + rp, shared: true,
        html: page(rhead, rpaths, true, null, { h1: T("h1"), intro: fill(T("intro"), { n: N }), faq: general }) });
    }

    function page(head, paths, root, p, v) {
      const helpNav = v.faq.map(([q], i) => `<button type="button" role="tab" data-hq="${i}" aria-selected="${i === 0}">${esc(q)}</button>`).join("");
      const helpC = v.faq.map(([q, a], i) => `<article data-hqb="${i}"${i ? " hidden" : ""}><h3>${esc(q)}</h3><p>${a}</p></article>`).join("");
      const html = tpl
        .replace(/(<(\w+)\b[^>]*\sdata-i="(\w+)"[^>]*>)([^<]*)(<\/\2>)/g, (m, open, tag, k, inner, close) => open + esc(T(k)) + close)
        .replace("{{lang}}", lang).replace("{{pathsAttr}}", esc(JSON.stringify(paths))).replace("{{rootAttr}}", root ? " data-root" : "")
        .replace("{{prepaint}}", PREPAINT).replace("{{head}}", head).replace("{{css}}", cssName).replace("{{js}}", jsName).replace("{{strings}}", sName)
        .replace("{{homeHref}}", home).replace("{{langOpts}}", langOpts).replace("{{h1}}", esc(v.h1)).replace("{{intro}}", esc(v.intro))
        .replace("{{play}}", p ? "" : `    <section class="play card" id="play" hidden><div class="pl"></div></section>\n`)
        .replace("{{notesWait}}", (p && p.svc ? ["wait_ip", "wait_tz"] : ["wait_ex", "wait_ip", "wait_tz"]).map(k => `<li class="nt wait"><i></i><span>${esc(T(k))}</span></li>`).join(""))
        .replace("{{focus}}", focusOf(p && p.svc)).replace("{{list}}", listOf(p)).replace("{{allLink}}", allLink(p)).replace("{{nav}}", nav)
        .replace("{{heroAttr}}", p && p.svc ? " data-one" : "")
        .replace("{{helpNav}}", helpNav).replace("{{helpC}}", helpC).replaceAll("{{repo}}", REPO)
        .replace("{{themeLabel}}", esc(T("th_system"))).replaceAll("{{closeLabel}}", esc(T("close")))
        .replace("{{prevLabel}}", esc(T("prev"))).replace("{{nextLabel}}", esc(T("next")))
        .replace("{{data}}", JSON.stringify({ lang, paths, home: Object.fromEntries(langs.map(([l, sl]) => [l, path(sl)])), egressPath: home, scope: scopeOf(p), one: p && p.svc || null }).replace(/</g, "\\u003c"));
      if (/\{\{\w+\}\}/.test(html)) throw new Error("unfilled placeholder: " + /\{\{\w+\}\}/.exec(html)[0]);
      return html;
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    pages.filter(p => !p.shared).map(p => `  <url>\n    <loc>${p.url}</loc>\n` + langs.map(([l, s]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE + path(s) + p.sub}"/>`).join("\n") +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/${p.sub}"/>\n  </url>`).join("\n") + "\n</urlset>\n";
  const robots = `User-agent: *\nAllow: /\nDisallow: /h/\n\nSitemap: ${SITE}/sitemap.xml\n`;
  const en = I.en;
  const llms = `# ${en.name}

> Free browser tool that checks, over the visitor's own connection and route, whether streaming and AI services are
> available and which country each one sees: ${SERVICES.map(s => s.name).join(", ")}. It uses each service's own
> region API where a page can read it, the service's own Cloudflare edge (/cdn-cgi/trace) against its published
> country list, redirect counting (Netflix's country pages, "unavailable" redirects), and marks inferred results.
> Everything runs client-side; no results are sent to the site.

- Page: ${SITE}/ (also ${langs.slice(1).map(([, s]) => "/" + s + "/").join(", ")})
${CATS.map(c => `- ${en["cat_" + c].nav}: ${SITE}/${CAT_SLUG[c]}/`).join("\n")}
${SERVICES.map(s => `- ${s.name}: ${SITE}/${SLUG[s.id]}/`).join("\n")}
- Source: ${REPO}
`;

  // The redirect chain: /h/<n>/<host>/<path> → … → https://<host>/<path>. Static rules, answered by the asset
  // server without running a script (free, unmetered).
  const redirects = "# Generated by scripts/build.mjs: the redirect chain src/app.js counts with\n" +
    Array.from({ length: HOPS - 1 }, (_, i) => `/h/${HOPS - i}/* /h/${HOPS - i - 1}/:splat 302`).join("\n") + "\n/h/1/:host/* https://:host/:splat 302\n";

  // The only inline script is the pre-paint snippet, identical on every page: one hash covers the site.
  // connect-src allows any https host: the services are asked from the browser.
  const csp = ["default-src 'self'", `script-src 'self' 'sha256-${sha(PREPAINT)}'`, "style-src 'self'",
    "font-src 'self'", "img-src 'self' data: blob:", "connect-src 'self' https:", "manifest-src 'self'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"].join("; ");
  // The JSONP frame (src/app.js jsonp()), under /assets/ so the shell passes it through untouched: opened sandboxed, so it has no origin of its own and nothing of this site to
  // reach. It runs one script, from the hosts the services' JSONP probes name and nowhere else, and posts back what
  // the callback got. Its own policy replaces the site's; it may be framed by this site's pages.
  const JSONP_JS = `addEventListener("message",function(e){var m=e.data,w=e.source;if(!m||typeof m.src!=="string"||!/^[A-Za-z_$][\\w$]*$/.test(m.cb))return;` +
    `window[m.cb]=function(d){w.postMessage({id:m.id,text:JSON.stringify(d)},"*")};var s=document.createElement("script");s.src=m.src;` +
    `s.onerror=function(){w.postMessage({id:m.id},"*")};document.head.appendChild(s)});`;
  const jsonpHtml = `<!doctype html>\n<meta charset="utf-8">\n<title>jsonp</title>\n<script>${JSONP_JS}</script>\n`;
  const jsonpHosts = [...new Set(SERVICES.filter(s => s.probe.jsonp).map(s => new URL(s.probe.jsonp).origin))].join(" ");
  const jsonpCsp = `default-src 'none'; script-src 'sha256-${sha(JSONP_JS)}' ${jsonpHosts}; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`;
  const headers = `# Generated by scripts/build.mjs
/*
  Content-Security-Policy: ${csp}
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
/assets/*
  Cache-Control: public, max-age=604800
/assets/app.*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
/assets/l.*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
/assets/fonts/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
/assets/share/*
  ! Cache-Control
  Cache-Control: public, max-age=0, must-revalidate
/flags/*
  Cache-Control: public, max-age=2592000
/og/*
  Cache-Control: public, max-age=604800
/hop.txt
  Cache-Control: no-store
/assets/jsonp*
  ! Content-Security-Policy
  ! X-Frame-Options
  ! Cache-Control
  Content-Security-Policy: ${jsonpCsp}
  Cache-Control: public, max-age=3600
/llms.txt
  Access-Control-Allow-Origin: *
  Content-Type: text/plain; charset=utf-8
`;

  Object.assign(files, { ["assets/" + jsName]: js, ["assets/" + cssName]: css, "sitemap.xml": sitemap, "robots.txt": robots, "llms.txt": llms,
    "_headers": headers, "_redirects": redirects, "hop.txt": "ok\n", "assets/jsonp.html": jsonpHtml });
  for (const p of pages) files[p.file] = p.html;

  const stale = [];
  for (const [name, text] of Object.entries(files)) {
    const url = new URL(name, pub);
    const current = await readFile(url, "utf8").catch(() => null);
    if (current === text) continue;
    if (check) { stale.push(name); continue; }
    await mkdir(new URL(".", url), { recursive: true });
    await writeRetry(url, text);
  }
  // old bundles
  await mkdir(new URL("assets/", pub), { recursive: true });
  const old = (await readdir(new URL("assets/", pub))).filter(f => /^(app|l\.[a-z-]+)\.[0-9a-f]+\.(js|css)$/.test(f) && !files["assets/" + f]);
  if (check && old.length) stale.push(...old.map(f => f + " (old)"));
  else for (const f of old) await rm(new URL("assets/" + f, pub));
  return { stale, pages: pages.filter(p => !p.shared).length, sizes: { html: Math.max(...pages.map(p => p.html.length)), js: js.length, css: css.length } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const r = await build({ check });
  if (check && r.stale.length) { console.error("out of date (run npm run build):\n  " + r.stale.join("\n  ")); process.exit(1); }
  console.log(`${r.pages} pages · largest HTML ${(r.sizes.html / 1024).toFixed(1)} KB · JS ${(r.sizes.js / 1024).toFixed(1)} KB · CSS ${(r.sizes.css / 1024).toFixed(1)} KB`);
}
