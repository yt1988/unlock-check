# AGENTS.md

For anyone working in this repository, people and AI agents alike. What the tool does, which method each service
uses and what a browser can't tell are in [README.md](README.md); the technical reasons behind the code, and what was
measured and dropped, are in [docs/decisions.md](docs/decisions.md); every check in the command-line unlock scripts
and why each is or isn't here, in [docs/coverage.md](docs/coverage.md). 1ms.dog's operations notes are in the
private repository 1ms-shell.

## What this is

Streaming & AI Unlock Check asks about 150 streaming, AI and regional services from the visitor's browser, over the
route their proxy picks for each one, and says for each whether it is available, which country it sees, and how sure
that verdict is. It has two parts:

- **The page** (`src/`, built into `public/`): static files on a Cloudflare Workers static-assets deployment, with
  no Worker script. Every check runs in the visitor's browser; nothing is sent to the site. The redirect chain the
  Netflix, Disney+ and Peacock checks count is static rules in `public/_redirects`.
- **The hourly check** (`scripts/watch.mjs`, `watch/`): optional. A Node script on a server asks every service the
  way the page does and writes `status.json`, saying whether each check's endpoint still answers the way the page
  reads it. The page reads that file (`WATCH` in `src/app.js` and `src/status.js`) and stops trusting a check that
  failed twice in a row. Self-hosted without it, `WATCH` is empty and the page works without the file; the `/status/`
  page says the copy isn't connected to an hourly check.

```
src/services.mjs     the services: category, method, endpoint, published country list
src/lib.mjs          pure logic: answer readers, judge(), report card, route advice, share links (unit-tested)
src/app.js           browser code for the main, category and service pages
src/status.js        browser code for /status/
src/i18n/*.mjs       strings in 10 languages; English (en.mjs) is the reference
scripts/build.mjs    builds public/: every page in every language, _redirects, _headers, sitemap, bundles
scripts/watch.mjs    the hourly check; imports src/services.mjs and src/lib.mjs, no dependencies
watch/               its README and systemd units
```

## Run it locally

Node 20 or later.

```bash
npm ci
npm run build      # src/ → public/; commit public/ with your change
npm run dev        # http://localhost:8787, the production headers and the redirect chain
npm test           # public/ up to date, page contract, SEO, and the logic tests
```

`CHECK=http://127.0.0.1:8787 npm run dev` also serves the connection checkup's embed mode at `/__checkup.html`.
Some browsers' privacy or ad-blocking settings refuse the third-party requests the checks make
(`ERR_BLOCKED_BY_CLIENT`): that is the browser, not the page. Test a check from a browser without such blocking, and
on the exit country you mean to test.

The hourly check runs on any machine:

```bash
node scripts/watch.mjs out          # writes out/status.json
WATCH_CC=US node scripts/watch.mjs out   # when the machine's traffic leaves through another country than Japan
```

## Test by what you changed

| You changed | Run |
|---|---|
| strings (`src/i18n/*.mjs`) | `npm run build && npm test` (every language has every key, with the same placeholders). Read the sentence in Chinese and Russian at 375 px wide |
| a service or a reader (`src/services.mjs`, `src/lib.mjs`) | `npm run build && npm test`; `node scripts/watch.mjs out` and look for the service in `out/status.json` (`"s":"ok"`); then open its page (`/<slug>/`) in a browser on a real exit. A new service also needs `npm run icons` and `npm run og` |
| the page (`src/app.js`, `src/page.html`, `src/tool.css`) | `npm run build && npm test`, then open the main page, run a check, and look at 375 px and 320 px wide (German has the longest buttons) |
| the status page (`src/status.js`) | the above, with a `status.json` the page can read (served from `localhost`, `WATCH` points at it) |
| the build (`scripts/build.mjs`) | `npm test` (`public/ is up to date`) |
| the hourly check (`scripts/watch.mjs`) | `node scripts/watch.mjs out` twice (the second run carries `streak`, `since` and the history over from the first) |

`npm test` is what the deploy runs; it must pass.

## Deploy

- **The page**: pushing `main` deploys it when the repository is connected to Cloudflare Workers Builds
  (`npm ci && npm test`, then `npx wrangler deploy`). To host it yourself:
  ```bash
  npx wrangler login
  npx wrangler deploy
  ```
  then bind your domain to the Worker in the Cloudflare dashboard (`wrangler.toml` turns off `*.workers.dev`).
  `SITE_URL=https://<your-domain> npm run build` puts your domain into canonical links and the sitemap. Another static
  host works if it reads Cloudflare-style `_headers` and `_redirects`; without `_redirects` the redirect-counting checks
  show as reachable only.
- **The hourly check**: by hand, as below. A push doesn't deploy it.

## The hourly check, from nothing

It needs a Linux machine with systemd and Node 20 or later (a distribution's `nodejs` package is enough; no npm, no
packages), and something that serves one directory read-only over HTTPS with `Access-Control-Allow-Origin: *`.

1. **A user and two directories**
   ```bash
   useradd --system --no-create-home --shell /usr/sbin/nologin <user>
   mkdir -p /opt/<app>/scripts /opt/<app>/src /srv/<data>/unlock
   chown <user>:<user> /srv/<data>/unlock
   ```
2. **The code**: copy `scripts/watch.mjs`, `src/lib.mjs` and `src/services.mjs` into `/opt/<app>/`, at the same
   paths as in this repository, owned by root, mode 644. Copy `src/services.mjs` and `src/lib.mjs` again whenever they
   change, so the server checks what the page checks.
3. **The units**: [watch/1ms-unlock-watch.service](watch/1ms-unlock-watch.service) and
   [.timer](watch/1ms-unlock-watch.timer) are written for one particular machine. Change `User=`, `Group=`,
   `WorkingDirectory=`, the paths in `ExecStart=` and `ReadWritePaths=`, and, if the machine's traffic doesn't leave
   through Japan, add `Environment=WATCH_CC=<country>`. Copy them to `/etc/systemd/system/`, then:
   ```bash
   systemctl daemon-reload
   systemctl enable --now <unit>.timer
   ```
4. **Publish** `/srv/<data>/unlock/status.json` read-only at `https://<data-domain>/unlock/status.json`, with
   `Access-Control-Allow-Origin: *` and a short cache (a few minutes: the file changes once an hour). With Caddy:
   ```
   <data-domain> {
       root * /srv/<data>
       file_server
       header Access-Control-Allow-Origin *
       header /unlock/* Cache-Control "public, max-age=300"
   }
   ```
5. **Point the page at it**: change `WATCH` in `src/app.js` and `src/status.js` (the host test and the address),
   then `npm run build`.

### Verify

```bash
systemctl start <unit>                 # one run, about 10 seconds
systemctl status <unit>                # Result=success; errors go to the journal
systemctl list-timers <unit>.timer     # the next run is scheduled
curl -sD - https://<data-domain>/unlock/status.json -o /dev/null   # 200, the CORS header, the cache header
```

In the file, `at` is the run's time, `count` the number of services (the same as `src/services.mjs`), and `bad` the
checks that failed. A check in `bad` is the thing to look at: the service probably changed its endpoint. The format
is in [watch/README.md](watch/README.md).

## Rules of the road

- Pushing `main` deploys the page (when it is connected to Workers Builds): push only what is ready to go live.
- `public/` is built output, committed with the source change that made it (`npm run build`).
- No secrets and no personal email in this public repository. Where a particular deployment runs (domains,
  directories, accounts) belongs with that deployment's own notes, not here; use placeholders.
- Commit messages in English. User-facing strings exist in 10 languages; English is the reference.
- A check must never say "available" when it can't tell: a reader that only reads one way returns `{ ok: null }`
  and the verdict falls back to a guess, labeled as one.
- When something technical is decided, or measured and dropped, write it in [docs/decisions.md](docs/decisions.md)
  the same day.
