# Hourly probe check (1ms-unlock-watch)

Every hour, 1ms.dog's Tokyo server asks every service the way the page does and records whether each check still works.
The page reads that record. When a check has failed twice in a row, the page stops trusting it and makes a guess instead.
When a check is fine, the page says when it was last confirmed.

A copy of this site hosted somewhere else doesn't ask our server (src/app.js, `WATCH`).

## What it checks

`scripts/watch.mjs` reuses the page's own code:

- the list of services, from `src/services.mjs`;
- the readers and `judge()`, from `src/lib.mjs`.

It makes the page's requests from the server.

| Check type | What the server does |
|---|---|
| api | Reads the service's answer, sending the same request the page sends. |
| jsonp | Removes the callback wrapper and reads the JSON inside it. |
| trace | Reads Cloudflare's trace. |
| hops | Follows redirects one at a time and counts them. A browser can't do this; the page has to infer the count. |
| Netflix | Checks whether `/` or `/jp/` answers without a redirect. |
| reach | Checks that any HTTP answer comes back. |

A server in a datacenter doesn't see what a visitor sees: Netflix and DAZN, among others, refuse datacenter addresses. So this run only answers whether each check still works. It does not test unlocking.

Each service gets one of three states:

- `ok`: the answer can be read, and it agrees with the service's published country list. The list is checked against the country the service names, or Japan if it names none.
- `drift`: the answer can be read, but says the service is available where its list says it isn't. The endpoint probably changed what it returns.

The opposite case, "not available" where the list offers the service, is not held against the check. A datacenter address can produce that answer (DMM TV calls this server foreign), but it can't produce a false "available". Such a service stays `ok` and is marked with `dc: true`.
- `bad`: there was no answer, an answer the reader doesn't understand, or a redirect chain that couldn't be followed.

Every check that isn't `ok` gets one retry, as the page does.

## Output

The output is `/srv/1ms-data/unlock/status.json`. It is written atomically (to a temporary file, then renamed), and Caddy publishes it read-only at https://data.1ms.dog:2083/unlock/status.json.

```json
{ "v": 1, "at": "2026-11-04T05:13:02.512Z", "from": "JP", "took_ms": 9000, "count": 67, "bad": ["dazn"],
  "services": { "chatgpt": { "s": "ok", "how": "api", "v": "ok", "cc": "JP", "n": null, "hops": null, "err": null, "ms": 480,
                             "streak": 12, "since": "…", "ok_at": "…" }, … } }
```

The file holds no history apart from what it carries over from the previous run:

- `streak`: how many runs in a row have had the current state;
- `since`: when the current state began;
- `ok_at`: the last run in which the check was `ok`.

The page only acts on a `drift` or `bad` state that has lasted at least 2 runs.

The page ignores a status file that is more than 3 hours old.

Each failing check is listed in `bad`. Look at that list during the daily review. The server holds no GitHub or Cloudflare tokens, so it doesn't open issues itself.

The check stores no visitor data: it never sees a visitor.

## Running it

To try it on any machine with Node 20 or later:

```sh
node scripts/watch.mjs out
```

On a machine whose traffic doesn't leave through Japan, set `WATCH_CC` to the country it does leave through, for example `WATCH_CC=US`. Otherwise the run compares the services' lists against Japan.

On the server, it runs as a systemd timer:

| | |
|---|---|
| Unit files | `1ms-unlock-watch.service` and `1ms-unlock-watch.timer`, in this folder |
| Schedule | minute 13 of every hour |
| User | system user `1ms-unlock` |
| Code | `/opt/1ms/unlock/`, laid out like this repository: `scripts/watch.mjs`, `src/lib.mjs`, `src/services.mjs` |
| Node | `/usr/bin/node`, Debian's `nodejs` package |
| Memory | `MemoryMax=128M`; a run uses about 60 MB and exits when done |
| Traffic | about 1 MB per run |

The ports, directories and user are allocated in 1ms-shell `docs/processes.md`, under 专用服务器.

To deploy, copy the three files into `/opt/1ms/unlock/` (owned by root, readable by `1ms-unlock`), then run:

```sh
systemctl daemon-reload
systemctl enable --now 1ms-unlock-watch.timer
```

When `src/services.mjs` or `src/lib.mjs` changes, copy them again.

To verify:

```sh
systemctl start 1ms-unlock-watch
systemctl status 1ms-unlock-watch
curl https://data.1ms.dog:2083/unlock/status.json
```
