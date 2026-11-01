# Streaming & AI Unlock Check (流媒体/AI 解锁检测)

**English** · [简体中文](README.zh-CN.md)

Which streaming and AI services work on your IP, and which country does each one see? [Streaming & AI Unlock Check](https://unlock.1ms.dog) asks 20 services from your browser — Netflix, Disney+, TikTok, ChatGPT, Claude, Gemini and more — over the route your proxy picks for each one, and says how sure each verdict is.

**Live:** https://unlock.1ms.dog

## Why a web page

The well-known unlock scripts (RegionRestrictionCheck and its forks) run `curl` on a server, so they test that server's IP. People with rule-based proxies (Clash, Surge, Shadowrocket, sing-box) route each site differently; only a check from their own browser takes the same route their Netflix or ChatGPT tab takes. A browser can't read most sites' answers (no CORS), so each check uses the strongest signal a static page can get, and labels it:

| Label | How | Services |
|---|---|---|
| **Own API** | The service's own region API, readable from any page (CORS). The same endpoint the command-line scripts read. | ChatGPT (`api.openai.com/compliance/cookie_requirements` + its trace), DAZN, Philo, KKTV, TVB Anywhere+, SBS On Demand, FOD |
| **Own server** | Cloudflare's `/cdn-cgi/trace` on the service's own domain (`Access-Control-Allow-Origin: *`) gives the country that edge sees, checked against the service's published list. | Claude, Copilot, Grok, Perplexity, Le Chat, Poe, Character.AI, Crunchyroll |
| **Redirects** | Redirect counting, below. | Netflix (region), Disney+, Peacock |
| **Inferred** | Nothing of the service's own is readable: it is reachable over your route, and the country most services see is checked against its published list. | Gemini, TikTok |

Country lists come from the services: [OpenAI](https://developers.openai.com/api/docs/supported-countries), [Anthropic](https://www.anthropic.com/supported-countries), [Gemini app](https://support.google.com/gemini/answer/13575153) (it includes Hong Kong and Macau; the Gemini API list doesn't), [Netflix](https://help.netflix.com/en/node/14164).

### Redirect counting

A browser follows at most 20 redirects (Chrome, Firefox; Safari fewer) and then fails the request. `public/_redirects` makes `/h/<n>/<host>/<path>` redirect n times on this site, the last time to `https://<host>/<path>`. Sending a `no-cors` request through `MAX − k` of ours loads only when the service adds at most `k` of its own, so the page counts the service's redirects without reading anything. The limit is measured first (`/hop.txt`), so other browsers work too. The rules are static: the asset server answers them without running a script (free, unmetered).

Measured in Chrome 141 on 2026-11-01 (a Japanese exit; the US numbers from a server in Los Angeles):

| Request | Japan | US |
|---|---|---|
| `netflix.com/jp/` | 0 redirects | 2 |
| `netflix.com/us/`, `/sg/`, `/de/`, `/gb/`… | 2 | `/us/` → `/`: 1 |
| `netflix.com/` | 1 (→ `/jp-en/`) | 0 |
| `peacocktv.com/` | 1 (→ `/unavailable`) | 0 |
| `disneyplus.com/` | 0 | 0 |

So Netflix answers only its own country's path directly: trying the countries other services see first finds the Netflix region in one or two requests. Netflix serves crawlers without redirects, so test with a normal browser user agent (headless Chrome's `HeadlessChrome` gets 0 everywhere).

### What a browser can't tell

- **Netflix catalog:** a region is found, but whether licensed (non-Netflix) titles play isn't visible; Netflix limits many proxy and datacenter IPs to its own shows. The scripts read this from the title page's body, which a browser can't.
- **Gemini:** Google locates IPs with its own database (the "sent to China" problem), and no Google endpoint a page can read reveals it. Gemini is marked inferred.
- **Not included on purpose:** checks that need a third party's embedded API keys or that submit sign-up forms (Spotify, Catchplay, Tving and others in the scripts). YouTube Premium: no readable signal yet.

Pages whose resource policy refuses other sites (`Cross-Origin-Resource-Policy: same-origin`/`same-site`: claude.ai/login, gemini.google.com, aistudio.google.com) can't be counted either: the browser fails them whatever the status.

### Other findings

- Services see different countries when rules split traffic: in testing, SBS On Demand saw Hong Kong while 15 others saw Japan. The page lists which services see which country, and links to EgressLens on 1ms.dog.
- Browser time zone vs. the services' country: AI services use it as a proxy signal.

**Private by design:** static files only. Your browser talks to each service directly; no result is sent to the site. Share links carry each service's verdict and country, never an IP.

## Pages

Every language (`/`, `/zh-cn/`, `/zh-tw/`, `/ja/`, `/ko/`, `/es/`, `/fr/`, `/de/`, `/pt/`, `/ru/`) has the main page, a page per category (`/ai/`, `/streaming/`, `/regional/`) and a page per service (`/netflix/`, `/chatgpt/`, `/claude/`…), each with its own title, questions and preview image; a service's page leads with its verdict and lists where it is offered.

## Self-hosting

`public/` is committed, so nothing needs building unless you change the code.

```bash
git clone https://github.com/yt1988/unlock-check
cd unlock-check
npx wrangler login
npx wrangler deploy        # a static-assets Worker: no script, free and unmetered
```

`wrangler.toml` turns off `*.workers.dev` and preview URLs; bind your own domain under **Workers & Pages → unlock → Settings → Domains & Routes**, or set `workers_dev = true` for a quick test. Another static host works if it supports Cloudflare-style `_headers` and `_redirects` (Cloudflare Pages, Netlify); without `_redirects`, Netflix, Disney+ and Peacock show as reachable only.

To put your own domain into canonical links and the sitemap:

```bash
npm install
SITE_URL=https://unlock.example.com npm run build
```

## Development

```bash
npm install
npm run dev        # http://localhost:8787, with the production headers and the redirect chain
npm run build      # regenerate public/ after changing src/ (commit public/)
npm test           # public/ up to date, page contract, SEO, and the logic tests
npm run og         # redraw the link-preview images in public/og/ after changing a headline (commit them)
```

```
src/services.mjs     the services: category, probe, published country list
src/lib.mjs          pure logic (answer readers, verdicts, share links), unit-tested
src/app.js           browser code: asks the services, counts redirects, renders, shares
src/i18n/*.mjs       strings for 10 languages
scripts/build.mjs    builds public/: every page, _redirects, _headers, sitemap
```

Adding a service: an entry in `src/services.mjs` (a reader in `src/lib.mjs` for an API), its slug, then `npm run build && npm run og`.

## License

MIT
