# Coverage: every check in the command-line unlock scripts

The well-known scripts test from a server; this page tests from the visitor's browser, which can read far less
(no CORS). This list has every check in them, as of 2026-11-04, and what the page does with each: the strongest
signal a page can get for it, or why there is none. The scripts:

| | Script | Checks |
|---|---|---|
| 1 | [1-stream/RegionRestrictionCheck](https://github.com/1-stream/RegionRestrictionCheck) (2026-10) | 177 |
| L | [lmc999/RegionRestrictionCheck](https://github.com/lmc999/RegionRestrictionCheck) (2025-12) | 140 |
| X | [xykt/RegionRestrictionCheck](https://github.com/xykt/RegionRestrictionCheck) (2026-01) | 155 |
| H | [HsukqiLee/MediaUnlockTest](https://github.com/HsukqiLee/MediaUnlockTest) (2026-10) | 169 |
| N | [nkeonkeo/MediaUnlockTest](https://github.com/nkeonkeo/MediaUnlockTest) (2024-10) | 77 |

OpenClash's streaming check (17 services) and xykt/IPQuality's streaming section (6) are all in the lists above.

How each endpoint was measured: every URL in these scripts was requested from 1ms.dog's Tokyo server with an
`Origin` of this site, recording whether the answer lets other sites read it (`Access-Control-Allow-Origin`), and
every host's `/cdn-cgi/trace` (a Cloudflare edge that names the visitor's country). The new checks were then run
in a browser on a Japanese exit. A check's name below is the scripts' own, lowercased; one service often has several.

Methods, strongest first (src/services.mjs): **official API** (the service's own answer, read), **official
location** (its Cloudflare edge's country against its published list), **redirect test**, **guess** (it opens, and
the country most services see is checked against the one country it serves).

Totals: 57 had it before, 92 added (9 by API, 10 by location, 73 by guess), 37 can be added with more work, 57 not added.

## Added: official API (9)

| Check | In | Here | Notes |
|---|---|---|---|
| aetv | 1HLX | `aetv` | thePlatform's GeoLocationBlocked; any other answer is left to the country |
| channel10 | 1HLX | `tenplay` | e410fasadvz.global.ssl.fastly.net/geo: {allow} |
| itvhub | 1LX | `itvx` | simulcast.itv.com: 403 geoblock outside the UK, 404 inside |
| itvx | H | `itvx` | As ITV Hub |
| molotov | 1HLX | `molotov` | fapi.molotov.tv/v1/open-europe/is-france |
| nhkplus | 1H | `nhk` | location-plus.nhk.jp/geoip/area.json: JP in Japan, "other" elsewhere (NHK+ is now NHK ONE) |
| slingtv | 1HLNX | `sling` | p-geo.movetv.com/geo, which also says when it takes you for a proxy or a data center (shown) |
| telasa | 1HLNX | `telasa` | api-videopass-anon.kddi-video.com/v1/playback/system_status: IPLocationNotAllowed outside Japan |
| wikipediaeditable | 1 |  | Wikipedia's API (origin=*) says whether the address is blocked from editing, and why: an open proxy or a hosting range. Shown under the totals with Sling TV's proxy refusal |

## Added: official location (10)

| Check | In | Here | Notes |
|---|---|---|---|
| 4gtv | 1HLNX | `4gtv` | Cloudflare edge of www.4gtv.tv (its own API refuses other sites) |
| attnow | 1X | `directv` |  |
| bahamutanime | 1HLNX | `bahamut` | Cloudflare edge; the scripts' token API needs its cookies, which a page can't send |
| cwtv | 1HLNX | `cw` |  |
| directv | L | `directv` |  |
| directvstream | HN | `directv` |  |
| j | 1X | `jcom` | J:COM (as above) |
| jcomondemand | HLN | `jcom` | The Cloudflare edge of its sign-in site (id.zaq.ne.jp) |
| litv | 1HLNX | `litv` | Cloudflare edge of its API host |
| nlziet | 1HLX | `nlziet` | Cloudflare edge of nlziet.nl |

## Added: guess (73)

| Check | In | Here | Notes |
|---|---|---|---|
| 7plus | 1HLX | `7plus` |  |
| abciview | 1HLX | `iview` |  |
| abema | HN | `abema` | Its IP check (api.abema.io) refuses other sites |
| abematv | L | `abema` |  |
| abematviptest | 1X | `abema` |  |
| aisplay | 1HLX | `aisplay` |  |
| amediateka | 1HLX | `amediateka` |  |
| binge | 1LX | `binge` | Its sign-in host answers other sites, but with Akamai's refusal for datacenters |
| cbcgem | 1HLNX | `cbcgem` |  |
| channel4 | 1HLX | `channel4` |  |
| channel5 | 1HLX | `my5` | The scripts' answer is the same from Japan (code 4003, a stale timestamp), so it says nothing |
| channel9 | 1HLX | `9now` |  |
| coupangplay | 1HLX | `coupang` | Sends visitors outside Korea to /not-available: a redirect test, to measure from inside Korea |
| crave | 1HLNX | `crave` | Its API answers other sites, but the scripts' titles are gone |
| danimestore | 1HLX | `danime` |  |
| epix | 1LNX | `mgmplus` | Now MGM+ |
| francetv | 1H | `francetv` |  |
| fridayvideo | 1H | `friday` |  |
| fxnow | 1HLNX | `fxnow` |  |
| galaxyplay | 1H | `galaxyplay` |  |
| hamivideo | 1HLNX | `hami` |  |
| hotstar | 1HLNX | `hotstar` |  |
| hoytv | 1H | `hoytv` |  |
| hulujp | 1LX | `hulujp` |  |
| jiocinema | 1HLX | `hotstar` | Merged into JioHotstar |
| joyn | 1HLX | `joyn` |  |
| kayosports | 1HLX | `kayo` | As Binge |
| kplus | 1HLX | `kplus` |  |
| lemino | 1HLX | `lemino` |  |
| linetv | 1HNX | `linetv` |  |
| linetvtw | L | `linetv` |  |
| mewatch | 1HLX | `mewatch` |  |
| mgmplus | H | `mgmplus` |  |
| molatv | 1LX | `molatv` |  |
| mora | 1HLX | `mora` |  |
| movistarplus | 1HLX | `movistar` |  |
| mxplayer | 1HLX | `mxplayer` |  |
| mytvsuper | 1HLNX | `mytvsuper` |  |
| myvideo | 1HLNX | `myvideo` |  |
| neontv | 1HLX | `neon` |  |
| nflplus | 1HLNX | `nflplus` |  |
| nowe | 1LNX | `nowe` |  |
| npostartplus | 1HLX | `npo` |  |
| ofiii | 1H | `ofiii` | Its API answers other sites but the scripts' title is gone |
| optussports | 1LX | `optus` |  |
| radiko | 1HLNX | `radiko` |  |
| raiplay | 1HLX | `raiplay` |  |
| rakutentvjp | 1L | `rakutenjp` |  |
| skych | 1HLX | `skych` | The scripts' endpoint creates a customer: not used |
| skyde | 1HLX | `skyde` | The scripts read Brightcove with Sky's player key |
| skygo | 1HLX | `skygo` |  |
| skygonz | 1LX | `skygonz` |  |
| sonyliv | 1HLX | `sonyliv` |  |
| sooka | 1H | `sooka` |  |
| spotvnow | 1HLX | `spotv` | The scripts read Brightcove with SPOTV's player key; to test from a page |
| stan | 1HLX | `stan` |  |
| starhubtvplus | 1 | `starhub` |  |
| starz | 1HLNX | `starz` | Its header token is given to any visitor (Japan too) and refused to datacenters; the geolocation API behind it refuses other sites |
| tataplay | 1H | `tataplay` |  |
| threenow | 1HLX | `threenow` |  |
| tlcgo | 1HLNX | `tlc` | Through discovery+'s API (to build) |
| trueid | 1HLX | `trueid` |  |
| tv360 | 1LX | `tv360` |  |
| tver | 1HLNX | `tver` | Its player API answers other sites, but refuses datacenters even from Japan; to retest from a home connection |
| tving | 1HLX | `tving` | As Wavve |
| unext | 1HLNX | `unext` | Its API refuses other sites |
| videoland | 1HLX | `videoland` |  |
| videomarket | 1HLNX | `videomarket` |  |
| vidio | 1 | `vidio` |  |
| viutv | 1HLNX | `viutv` | Its live API (api.viu.now.com) answers other sites; a POST to test from a page |
| watcha | HLX | `watcha` |  |
| wavve | 1HLX | `wavve` | The scripts send an embedded API key; this page doesn't |
| wowow | 1HLNX | `wowow` | Its playback API answers other sites but needs a title's ids |

## Had it (57)

| Check | In | Here | Notes |
|---|---|---|---|
| bbciplayer | 1HLX | `bbc` |  |
| beinconnect | 1LX | `bein` |  |
| bglobalid | L | `bilibilitv` |  |
| bglobalsea | L | `bilibilitv` |  |
| bglobalth | L | `bilibilitv` |  |
| bglobalvn | L | `bilibilitv` |  |
| bilibili | HN | `bilibili` |  |
| bilibilianimenew | 1 | `bilibili` |  |
| bilibilichinamainland | LX | `bilibili` |  |
| chatgpt | 1HN | `chatgpt` | API + its trace |
| claude | H | `claude` |  |
| copilot | H | `copilot` |  |
| crunchyroll | 1HLNX | `crunchyroll` |  |
| dazn | 1HLNX | `dazn` |  |
| disney | N | `disney` |  |
| disneyplus | 1HLX | `disney` |  |
| dmm | 1HLNX | `dmm` |  |
| dmmtv | 1LX | `dmm` |  |
| espn | N | `espn` |  |
| espnplus | 1HLX | `espn` |  |
| fod | 1HLNX | `fod` |  |
| fubotv | 1HLNX | `fubo` |  |
| gemini | H | `gemini` |  |
| google | 1 | `google` |  |
| grok | H | `grok` |  |
| hbomax | 1LNX | `max` |  |
| hulu | HN | `hulu` |  |
| huluus | 1LX | `hulu` |  |
| instagram | 1HX | `instagram` |  |
| iqiyi | H | `iqiyi` |  |
| kktv | 1HLNX | `kktv` |  |
| max | H | `max` |  |
| mistral | H | `mistral` |  |
| nbctv | 1HLX | `nbc` |  |
| netflix | 1HLNX | `netflix` | Redirect test on the country paths; the catalog (originals only or not) can't be seen |
| paramount | N | `paramount` |  |
| paramountplus | 1HLX | `paramount` |  |
| peacocktv | 1HLNX | `peacock` |  |
| perplexity | H | `perplexity` |  |
| philo | 1HLNX | `philo` |  |
| plutotv | 1HLNX | `pluto` |  |
| poe | H | `poe` |  |
| primevideo | HLN | `primevideo` |  |
| reddit | H | `reddit` |  |
| sbsondemand | 1HLX | `sbs` |  |
| shudder | 1HLNX | `shudder` |  |
| spotify | 1HLNX | `spotify` | The scripts post to its sign-up API with an embedded key; this page doesn't |
| tiktok | 1HX | `tiktok` |  |
| tubitv | 1HLNX | `tubi` |  |
| tvb | N | `tvb` |  |
| tvbanywhere | 1HLX | `tvb` |  |
| viu | 1HX | `viu` |  |
| viucom | LN | `viu` |  |
| wikipedia | H | `wikipedia` |  |
| x | H | `x` |  |
| youtube | HN | `youtube` |  |
| zdf | 1HLX | `zdf` |  |

## Can be added, needs work (37)

| Check | In | Here | Notes |
|---|---|---|---|
| acorntv | 1HLNX |  | Several English-speaking countries: needs its list |
| amcplus | HLX |  | Sends visitors where it isn't offered to /pages/geographic-restriction: a redirect test to measure |
| animefesta | 1H |  | Its API answers per title; to check whether it lets other sites read it |
| bing | H |  | Bing sends mainland China to cn.bing.com: a redirect test, to measure from inside China |
| britbox | 1HLNX |  | Several countries: needs its list |
| canalplus | 1HLX |  | Offered in many countries: needs its list |
| catchplay | 1HLNX |  | Its geo API answers other sites ("The location JP is not allowed") but its answer inside its countries is unknown; offered in several Asian countries |
| cliptv | 1 |  | Vietnam: to check |
| coze | H |  | Has regional sites (coze.com, coze.cn) but no published list; its API refuses other sites |
| directvgo | 1HLX |  | DGO, across Latin America: needs its list |
| discovery | N |  |  |
| discoveryplus | 1HLX |  | discovery+'s API answers other sites (a token, then currentLocationTerritory): to build |
| discoveryplusuk | 1 |  | discovery+'s API answers other sites (a token, then /users/me): to build |
| docplay | 1HLX |  | Offered in Australia and New Zealand: to check |
| dola | H |  | ByteDance's assistant outside China; no published list, and its pages refuse other sites |
| dstv | 1HLX |  | DStv: much of sub-Saharan Africa, needs its list |
| encoretvb | 1HLNX |  | TVB's US service, read through Brightcove with its player key |
| eurosport | 1 |  | Through discovery+'s API, which answers other sites: to build |
| eurosportro | 1HLX |  | As Eurosport |
| kbs | H |  | KBS's domestic and American services: to check which answer other sites |
| kbsamerican | 1LX |  |  |
| kbsdomestic | 1LX |  |  |
| kocowa | 1HLX |  | Offered across the Americas: needs its country list |
| maoritv | 1HLX |  | Read through Brightcove with its player key: to test from a page |
| megogotv | 1LX |  | The former Soviet countries: needs its list; its API refuses unknown clients (antibot) |
| music | 1X |  | music.jp: to check that it is Japan-only |
| musicjp | HLN |  | music.jp: to check that it is Japan-only |
| mytv | 1 |  | MyTV (Vietnam): its API answers other sites; the title is gone |
| niconico | 1HLNX |  | Only some titles are Japan-only; the site opens everywhere |
| nowtv | H |  | NOW (Sky): the UK, Ireland and Italy each have their own |
| rakutentv | 1HLX |  | Rakuten TV Europe: about 40 countries |
| showmax | LX |  | Showmax: much of Africa, needs its list |
| skyshowtime | 1HLX |  | About 20 European countries: needs its list |
| steam | HN |  | The store's currency shows the region, in the page body; its API refuses other sites |
| tntsports | H |  | The UK and Ireland, through discovery+ |
| viaplay | 1H |  | The Nordic and Baltic countries, Poland, the Netherlands: needs its list |
| vtvcab | 1 |  | Needs a token |

## Not added (57)

| Check | In | Here | Notes |
|---|---|---|---|
| afreeca | 1LX |  | SOOP (AfreecaTV) streams worldwide; only some are Korea-only |
| apple | H |  | Apple's region lookup refuses other sites |
| beinsports | 1 |  | A stream manifest on CloudFront; beIN CONNECT's offers API is already read |
| bilibilihkmctw | 1LX |  | As above |
| bilibilitw | 1LX |  | Bilibili's API only answers its own sites |
| cinemax | 1X |  | Now part of HBO Max |
| crackle | 1HLX |  | Closed in 2025 |
| dam | 1LX |  | Karaoke DAM's stream is served over plain HTTP, which an HTTPS page can't fetch |
| deepseek | H |  | Not region-locked: offered everywhere it isn't blocked, so there's nothing to tell |
| elevensportstw | X |  | Its API needs a member id |
| erogamescape | H |  | Adult content: left out on purpose |
| erogamespace | 1X |  | Adult content: left out on purpose |
| fox | 1HLNX |  | The scripts' stream segment loads from Japan too |
| funimation | HNX |  | Merged into Crunchyroll |
| googleplaystore | H |  | The country is in the store page body |
| gyao | N |  | Closed in 2023 |
| hbogoaisa | N |  | Closed in 2022 |
| hbogoasia | 1HLX |  | Closed in 2022 |
| hbogoeurope | X |  | Now HBO Max |
| hbonordic | 1X |  | Now HBO Max |
| hbonow | 1X |  | Now HBO Max |
| hboportugal | 1X |  | Now HBO Max |
| hbospain | 1X |  | Now HBO Max |
| instagrammusic | L |  | Whether music plays in Reels: needs a signed-in request |
| iq | N |  | As above |
| iqyiregion | 1X |  | iQIYI international's region is in a cookie |
| kancolle | 1HNX |  | A Japan-only game: the answer would only repeat whether the exit is Japan |
| karaoke | HN |  | As DAM |
| kimi | H |  | Not region-locked (it has a Cloudflare edge, but no published list to check it against) |
| konosubafd | 1HNX |  | A Japan-only game (as above) |
| mathsspot | 1 |  | A cloud gaming service; nothing to unlock |
| mgstage | 1H |  | Adult content: left out on purpose |
| navertv | 1HLX |  | Only some clips are Korea-only |
| nbatv | 1HLNX |  | NBA League Pass is offered worldwide |
| netflixcdn | 1X |  | The CDN node is found from a server; a page can't read which node serves it |
| nowgg | H |  | A cloud gaming service; nothing to unlock |
| pandatv | 1H |  | Streams worldwide |
| paravi | 1HN |  | Merged into U-NEXT in 2023 |
| pcrjp | 1HNX |  | A Japan-only game (as above) |
| pjsk | HN |  | A Japan-only game (as above) |
| popcornflix | 1HLNX |  | Closed |
| prettyderby | HN |  | A Japan-only game (as above) |
| primevideoregion | 1X |  | The region is in the page body, which a page can't read |
| projectsekai | 1X |  | A Japan-only game (as above) |
| rakutenmagazine | 1H |  | An e-magazine store, not a stream |
| salto | 1X |  | Closed in 2023 |
| setantasports | 1HLX |  | Closed |
| showtime | 1NX |  | Merged into Paramount+ |
| soop | H |  | As AfreecaTV |
| sora | 1 |  | The app closed in 2026 |
| starplus | H |  | Merged into Disney+ |
| umajp | 1X |  | A Japan-only game (as above) |
| wetv | H |  | Tencent Video's international app: offered everywhere but mainland China |
| wfjp | N |  | A Japan-only game (as above) |
| youtubecdn | 1X |  | The CDN node is found from a server |
| youtubepremium | 1LX |  | The answer is in the page body; no readable signal yet |
| zee5 | 1HLX |  | ZEE5 is offered worldwide |

