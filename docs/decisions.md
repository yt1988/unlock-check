# Technical decisions and what was measured

Why the code is the way it is, and what was tried, measured or dropped, with the date it was found. The methods
themselves (official API, location, redirect test, guess) and what a browser can't tell are in
[README.md](../README.md); every check in the command-line scripts is in [coverage.md](coverage.md). Newest
additions go at the end of each section.

## Verdicts

- **A check never says "available" when it can't tell.** A reader that can only read one way (a service that
  answers "no" in a way the page understands, but anything else in ways it doesn't) returns `{ ok: null }`, and
  `judge()` falls back to the guess: reachable over the route, and the country most services see checked against the
  service's list. The verdict is then labeled a guess. (2026-11-04)
- **A guess without a published list** says the country is the other services', not the service's own: the page
  doesn't know where that service thinks you are. (2026-11-04)
- **The guess is taken early.** Services judged by the country the others see used to wait for the slowest readable
  answer. That country is now taken once 80% of the readable services have answered, or after 4 seconds; when the
  remaining answers change the majority, the services already judged by it are judged again. (2026-11-04)
- **The progress bar counts verdicts**, as the totals above it do, not requests sent or answered: counting requests,
  the bar stalled for seconds and then jumped, and didn't match the totals. While it waits, it names the last five
  services still out. (2026-11-04)
- **The main page waits for its button.** It sends over 150 requests at once, which some networks and proxies treat
  as a burst; a category's or a service's page asks few and starts at once. The option to start on opening is kept in
  the browser (`localStorage`). A shared result's "test mine" link adds `?run=1`, which starts the check and is
  removed from the address once read. (2026-11-04, 2026-11-05)
- **A shared result asks no service.** The share link (`#r=1.<time>.<tz>.<id>~<verdict><method><country>_…`)
  carries each service's verdict, method and country, never an address; the receiving page only renders it. (2026-11-02)

## Redirect tests

- Measured in Chrome 141 from Japan and from a server in Los Angeles; the tables are in the README. Netflix answers
  only its own country's path directly, so trying the countries other services see first finds its region in one or
  two requests. (2026-11-01)
- Netflix serves crawlers without redirects: headless Chrome's `HeadlessChrome` user agent gets 0 redirects
  everywhere. Test redirect checks with a normal browser user agent. (2026-11-01)
- Every redirect test counts up to 3 of the service's own redirects: a "not available here" page sends the visitors
  it does serve home, which takes a redirect or two. (2026-11-04)
- One retry when nothing loaded: among sixty requests at once, Viu's page once missed the time limit. (2026-11-04)
- Paramount+, Tubi, Pandora and Viu tell both sides (measured from Japan, Hong Kong and the US). Pluto TV, ESPN+ and
  Fubo redirect inside their regions too (ESPN+ to `/denied` from a US proxy), so they are guesses. (2026-11-04)
- A page whose resource policy refuses other sites (`Cross-Origin-Resource-Policy: same-origin` or `same-site`) fails
  in the browser whatever its status, so it can't be counted (claude.ai/login, gemini.google.com,
  aistudio.google.com). Such a service is checked another way or guessed. (2026-11-01)

## Services, measured

- **STARZ**: its region endpoint answered "available, US" from a Japanese exit: its 403 only refuses datacenter
  addresses. It is a reachability check (guess). (2026-11-04)
- **NHK ONE**: outside Japan its API answers `"other"`, not an error; the reader reads `"other"` as not available.
  (2026-11-04)
- **TELASA**: answers 400 under load, so its reader is soft (`{ ok: null }` for anything but a clear answer).
  (2026-11-04)
- **CATCHPLAY+**: code `0` is available, with the country in `data.isoCode`; code `100016` is not, with the country
  in the message. Anything else is unknown. (2026-11-04)
- **Mola TV, Optus Sport**: removed; their domains no longer resolve. The hourly check found it on its first run with
  them. (2026-11-04)
- **Not included**: Sora (the app closed in 2026), PlayStation Store (not region-locked), Midjourney (its pages refuse
  other sites); checks that need a third party's embedded API keys or that submit sign-up forms. The full list, with a
  reason for each, is in coverage.md. (2026-11-04)
- **Wikipedia's block check** (whether an address is blocked from editing as an open proxy or hosting range): its API
  answers any site (`origin=*`) and names the blocked range. It is the one identity signal a page can read for free.
  (2026-11-04)

## The hourly check

- **It reuses the page's code** (`src/services.mjs`, `src/lib.mjs`), so the server and the page can't disagree about
  how an answer is read. The server only answers whether each check still works: a datacenter address doesn't see
  what a visitor sees (Netflix and DAZN, among others, refuse datacenters). (2026-11-04)
- **Only a false "available" counts as drift.** A "not available" where the published list offers the service is what
  a datacenter refusal looks like (DMM TV calls the server foreign); it is recorded as `dc: true` and not held against
  the check. A datacenter can't produce a false "available", so that one means the endpoint changed. (2026-11-04)
- **One retry**, as the page does: a first connection is sometimes dropped. (2026-11-04)
- **Two runs in a row** before the page acts on a broken check, so one bad hour doesn't change verdicts. The page
  ignores a status file more than 3 hours old. (2026-11-04)
- **A week of history** in the same file (`runs`, the last 168 runs, and a letter per run per service), so the status
  page needs no database and the server keeps no other state. (2026-11-04)
- **Cache**: the file changes once an hour; the server lets browsers cache it for 5 minutes. The main page takes the
  cached copy; the status page asks with `cache: "no-store"`, since it is about freshness. (2026-11-04)

## Layout

- **Phones**: below 760 px the action bar takes two lines (the progress and the checkup link, then the option and the
  buttons); below 420 px the option takes a row of its own. German's buttons are wide enough that beside them the
  option's label got 58 px and spilled out. The checkbox is 26 px on phones, 2 px over the 24 px tap target floor, and
  doesn't shrink. (2026-11-06)
- **The status table** hides its header row with `visibility: collapse`, not `display: none`, so the columns of the
  later tables keep the widths of the first. (2026-11-04)
