// Every service the page checks, and how. A browser can't read most sites' answers (no CORS), so each check uses the
// strongest signal a static page can get, and says which one it used (`how` in src/lib.mjs judge()):
//
//   api    the service's own region API, readable from any page (CORS); the same endpoint the command-line
//          unlock scripts read (RegionRestrictionCheck by lmc999). Strongest: the service itself says yes or no.
//   edge   the service's own Cloudflare edge: /cdn-cgi/trace on its domain returns the country it sees you in
//          (Access-Control-Allow-Origin: *), compared with the service's published list of supported countries.
//   hops   redirect counting: the browser gives up after 20 redirects, so sending the request through N redirects of
//          this site first and seeing whether it still loads tells how many redirects the service itself added. A
//          service that sends unsupported visitors to an "unavailable" page, or Netflix's country paths, show the
//          answer this way (the README has the measurements).
//   guess  nothing of the service's own is readable: it is reachable, and the country is the one the other
//          services see; the published list decides. The page marks these as inferred.
//
// id     stable id (row ids, share links, the page /<slug>/)
// cat    category, see CATS
// name   brand, the same in every language
// site   the service's own site (the page links to it)
// probe  what the browser asks:
//          { trace: url }                      Cloudflare trace (edge)
//          { api: url, init, read }            CORS-readable API, read with READERS[read]
//          { hops: url, zero }                 zero: the service is available when url adds no redirect
//          { netflix: true }                   Netflix's country paths (hops)
//          { reach: url }                      reachability only (guess)
//          { jsonp: url, cb, read }            an answer only given as a script (JSONP), run in /assets/jsonp.html, a
//                                              sandboxed frame of its own that only those hosts' scripts may run in;
//                                              read with READERS[read] like an api answer
//        an api url may hold {tk2}: Mango TV's request token, made in the browser (src/app.js)
//        plus `reach` on any of them: a URL to tell "blocked" from "not available"
// allow  ISO 3166 codes where it is available (a published list; `src` is the page it comes from), or
// deny   codes where it is not (when the service is available almost everywhere)
// only   the one country it serves (regional services)
// names  its name where a language calls it something else ({ "zh-CN": … }); name is used everywhere else

export const CATS = ["ai", "video", "social", "local"];

// OpenAI: https://developers.openai.com/api/docs/supported-countries (ChatGPT and the API share the list)
const OPENAI = "AL DZ AF AX AD AO AG AR AM AW AU AT AZ BS BH BD BB BE BZ BM BJ BT BO BA BW BR BN BG BF BI CV KH CM CA KY CF TD CL CO KM CG CD CR CI HR CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FO FJ FI FR GF PF TF GA GM GE DE GH GR GD GL GT GP GN GW GY HT VA HN HU IS IN ID IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MA MZ MM NA NR NP NL NC NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RE RO RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SR SE CH SD SJ TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VN WF YE ZM ZW";
// Anthropic: https://www.anthropic.com/supported-countries (Claude.ai and the API)
const ANTHROPIC = "AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CO KM CG CD CR CI HR CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SO SB ZA KR SS ES LK SD SR SE CH TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VN ZM ZW";
// Gemini app: https://support.google.com/gemini/answer/13575153 (mainland China is Workspace only, so left out)
const GEMINI = "AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BH BD BB BE BZ BJ BM BT BO BA BW BR IO VG BN BG BF BI CV KH CM CA BQ KY CF TD CL CX CC CO KM CK CR CI HR CW CZ CD DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM HN HK HU IS IN ID IQ IE IM IL IT JM JP JE JO KZ KE KI XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA CY CG RE RO RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS KR SS ES LK SD SR SJ SE CH TW TJ TZ TH BS GM TL TG TK TO TT TN TR TM TC TV VI UG UA AE GB US UM UY UZ VU VA VE VN WF EH YE ZM ZW";
// Netflix is everywhere but these: https://help.netflix.com/en/node/14164
const NETFLIX_NO = "CN KP RU SY";
// TikTok is banned or not offered: India (2020), Afghanistan (2022), mainland China (Douyin instead), North Korea, Iran
const TIKTOK_NO = "IN AF CN KP IR";
// Social apps: where governments block them (they are offered almost everywhere else)
const BLOCK = { youtube: "CN KP IR TM", x: "CN KP IR RU TM MM", instagram: "CN KP IR RU TM", telegram: "CN IR KP", whatsapp: "CN KP", discord: "CN RU TR", reddit: "CN", twitch: "CN",
  facebook: "CN KP IR RU TM MM", threads: "CN KP IR RU TM", signal: "CN IR RU", line: "CN", snapchat: "CN KP IR", pinterest: "CN", google: "CN KP", wikipedia: "CN",
  roblox: "CN TR QA KW JO OM", soundcloud: "CN", viki: "CN", bilibilitv: "CN" };
// services that left Russia and Belarus in 2022, and aren't offered in mainland China or under sanctions
const GONE_RU = "CN RU BY CU IR KP SY";
// Sanctioned places most US services turn away (used where a service publishes no list)
const SANCTIONED = "CU IR KP SY";

export const SERVICES = [
  // AI
  { id: "chatgpt", cat: "ai", name: "ChatGPT", site: "https://chatgpt.com/", allow: OPENAI, src: "https://developers.openai.com/api/docs/supported-countries",
    probe: { api: "https://api.openai.com/compliance/cookie_requirements", read: "openai", edge: "https://chatgpt.com/cdn-cgi/trace" } },
  { id: "claude", cat: "ai", name: "Claude", site: "https://claude.ai/", allow: ANTHROPIC, src: "https://www.anthropic.com/supported-countries",
    probe: { trace: "https://claude.ai/cdn-cgi/trace" } },
  { id: "gemini", cat: "ai", name: "Gemini", site: "https://gemini.google.com/", allow: GEMINI, src: "https://support.google.com/gemini/answer/13575153",
    probe: { reach: "https://gemini.google.com/generate_204" } },
  { id: "copilot", cat: "ai", name: "Copilot", site: "https://copilot.microsoft.com/", deny: "CN RU BY " + SANCTIONED, probe: { trace: "https://copilot.microsoft.com/cdn-cgi/trace" } },
  { id: "grok", cat: "ai", name: "Grok", site: "https://grok.com/", deny: "CN " + SANCTIONED, probe: { trace: "https://grok.com/cdn-cgi/trace" } },
  { id: "perplexity", cat: "ai", name: "Perplexity", site: "https://www.perplexity.ai/", deny: SANCTIONED, probe: { trace: "https://www.perplexity.ai/cdn-cgi/trace" } },
  { id: "mistral", cat: "ai", name: "Le Chat", site: "https://chat.mistral.ai/", deny: SANCTIONED, probe: { trace: "https://chat.mistral.ai/cdn-cgi/trace" } },
  { id: "poe", cat: "ai", name: "Poe", site: "https://poe.com/", deny: "CN " + SANCTIONED, probe: { trace: "https://poe.com/cdn-cgi/trace" } },
  { id: "characterai", cat: "ai", name: "Character.AI", site: "https://character.ai/", deny: SANCTIONED, probe: { trace: "https://character.ai/cdn-cgi/trace" } },
  // Meta AI publishes no list of countries: whether it opens is all there is
  { id: "metaai", cat: "ai", name: "Meta AI", site: "https://www.meta.ai/", probe: { reach: "https://www.meta.ai/robots.txt" } },

  // international streaming
  { id: "netflix", cat: "video", name: "Netflix", site: "https://www.netflix.com/", deny: NETFLIX_NO, src: "https://help.netflix.com/en/node/14164",
    probe: { netflix: true, reach: "https://www.netflix.com/" } },
  { id: "disney", cat: "video", name: "Disney+", site: "https://www.disneyplus.com/", probe: { hops: "https://www.disneyplus.com/", zero: true, reach: "https://www.disneyplus.com/robots.txt" } },
  { id: "dazn", cat: "video", name: "DAZN", site: "https://www.dazn.com/", probe: { api: "https://startup.core.indazn.com/misl/v5/Startup", read: "dazn",
    init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ Version: "2", LandingPageKey: "generic", Languages: "en", Platform: "web", Manufacturer: "", PromoCode: "", PlatformAttributes: {} }) } } },
  { id: "crunchyroll", cat: "video", name: "Crunchyroll", site: "https://www.crunchyroll.com/", deny: "CN " + SANCTIONED, probe: { trace: "https://www.crunchyroll.com/cdn-cgi/trace" } },
  { id: "peacock", cat: "video", name: "Peacock", site: "https://www.peacocktv.com/", only: "US", probe: { hops: "https://www.peacocktv.com/", zero: true, reach: "https://www.peacocktv.com/robots.txt" } },
  { id: "philo", cat: "video", name: "Philo", site: "https://www.philo.com/", only: "US", probe: { api: "https://content-us-east-2-fastly-b.www.philo.com/geo", read: "philo" } },
  { id: "nbc", cat: "video", name: "NBC", site: "https://www.nbc.com/", only: "US", probe: { api: "https://geolocation.digitalsvc.apps.nbcuni.com/geolocation/live/usa", read: "nbc",
    init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ adobeMvpdId: null, serviceZip: null, device: "web" }) } } },
  { id: "shudder", cat: "video", name: "Shudder", site: "https://www.shudder.com/", probe: { api: "https://www.shudder.com/", read: "shudder" } },
  { id: "bein", cat: "video", name: "beIN CONNECT", site: "https://connect.beinsports.com/", probe: { api: "https://proxies.bein-mena-production.eu-west-2.tuc.red/proxy/availableOffers", read: "bein" } },
  { id: "twitch", cat: "video", name: "Twitch", site: "https://www.twitch.tv/", deny: BLOCK.twitch, probe: { reach: "https://www.twitch.tv/robots.txt" } },
  { id: "primevideo", cat: "video", name: "Prime Video", site: "https://www.primevideo.com/", deny: GONE_RU, probe: { reach: "https://www.primevideo.com/robots.txt" } },
  { id: "appletv", cat: "video", name: "Apple TV+", site: "https://tv.apple.com/", deny: GONE_RU, probe: { reach: "https://tv.apple.com/robots.txt" } },
  { id: "max", cat: "video", name: "HBO Max", site: "https://www.hbomax.com/", probe: { reach: "https://www.hbomax.com/robots.txt" } },
  // Hulu sends visitors outside the US to Disney+, but its US front page redirects too: inferred from the country
  { id: "hulu", cat: "video", name: "Hulu", site: "https://www.hulu.com/", only: "US", probe: { reach: "https://www.hulu.com/robots.txt" } },
  // These send visitors where they aren't offered to a page that says so (/intl/, /no-service/), which stays put
  // there and sends everyone else home (measured 2026-11-04: Paramount+ from Japan and the US, Viu from Japan, Hong
  // Kong and the US).
  { id: "paramount", cat: "video", name: "Paramount+", site: "https://www.paramountplus.com/", probe: { hops: "https://www.paramountplus.com/intl/", reach: "https://www.paramountplus.com/robots.txt" } },
  // And these redirect from their front page outside their regions (to /restricted, gdpr.tubi.tv), and not inside
  // them (measured from Japan and the US).
  { id: "tubi", cat: "video", name: "Tubi", site: "https://tubitv.com/", probe: { hops: "https://tubitv.com/", zero: true, reach: "https://tubitv.com/robots.txt" } },
  // Pluto TV, ESPN+ and Fubo redirect inside their regions too (ESPN+ to /denied from a US proxy, Fubo to
  // /welcome; Pluto TV's /intl/ stays put in the US), so a redirect tells nothing: inferred from the country
  { id: "pluto", cat: "video", name: "Pluto TV", site: "https://pluto.tv/", probe: { reach: "https://pluto.tv/robots.txt" } },
  { id: "espn", cat: "video", name: "ESPN+", site: "https://plus.espn.com/", only: "US", probe: { reach: "https://plus.espn.com/robots.txt" } },
  { id: "fubo", cat: "video", name: "Fubo", site: "https://www.fubo.tv/", allow: "US CA", probe: { reach: "https://www.fubo.tv/robots.txt" } },
  { id: "viu", cat: "video", name: "Viu", site: "https://www.viu.com/", probe: { hops: "https://www.viu.com/ott/no-service/", reach: "https://www.viu.com/robots.txt" } },
  { id: "viki", cat: "video", name: "Viki", site: "https://www.viki.com/", deny: BLOCK.viki, probe: { reach: "https://www.viki.com/robots.txt" } },
  { id: "bilibilitv", cat: "video", name: "Bilibili TV", site: "https://www.bilibili.tv/", deny: BLOCK.bilibilitv, probe: { reach: "https://www.bilibili.tv/robots.txt" } },
  // music
  { id: "spotify", cat: "video", name: "Spotify", site: "https://open.spotify.com/", deny: GONE_RU, probe: { reach: "https://open.spotify.com/robots.txt" } },
  { id: "pandora", cat: "video", name: "Pandora", site: "https://www.pandora.com/", only: "US", probe: { hops: "https://www.pandora.com/", zero: true, reach: "https://www.pandora.com/robots.txt" } },
  { id: "deezer", cat: "video", name: "Deezer", site: "https://www.deezer.com/", probe: { reach: "https://www.deezer.com/robots.txt" } },
  { id: "soundcloud", cat: "video", name: "SoundCloud", site: "https://soundcloud.com/", deny: BLOCK.soundcloud, probe: { reach: "https://soundcloud.com/robots.txt" } },

  // social apps: mostly whether they open at all over this route
  { id: "tiktok", cat: "social", name: "TikTok", site: "https://www.tiktok.com/", deny: TIKTOK_NO, probe: { reach: "https://www.tiktok.com/robots.txt" } },
  { id: "youtube", cat: "social", name: "YouTube", site: "https://www.youtube.com/", deny: BLOCK.youtube, probe: { reach: "https://www.youtube.com/generate_204" } },
  { id: "x", cat: "social", name: "X", site: "https://x.com/", deny: BLOCK.x, probe: { trace: "https://x.com/cdn-cgi/trace" } },
  { id: "instagram", cat: "social", name: "Instagram", site: "https://www.instagram.com/", deny: BLOCK.instagram, probe: { reach: "https://www.instagram.com/robots.txt" } },
  { id: "telegram", cat: "social", name: "Telegram", site: "https://telegram.org/", deny: BLOCK.telegram, probe: { reach: "https://telegram.org/robots.txt" } },
  { id: "whatsapp", cat: "social", name: "WhatsApp", site: "https://web.whatsapp.com/", deny: BLOCK.whatsapp, probe: { reach: "https://web.whatsapp.com/robots.txt" } },
  { id: "discord", cat: "social", name: "Discord", site: "https://discord.com/", deny: BLOCK.discord, probe: { reach: "https://discord.com/robots.txt" } },
  { id: "reddit", cat: "social", name: "Reddit", site: "https://www.reddit.com/", deny: BLOCK.reddit, probe: { reach: "https://www.reddit.com/robots.txt" } },
  { id: "facebook", cat: "social", name: "Facebook", site: "https://www.facebook.com/", deny: BLOCK.facebook, probe: { reach: "https://www.facebook.com/" } },
  { id: "messenger", cat: "social", name: "Messenger", site: "https://www.messenger.com/", deny: BLOCK.facebook, probe: { reach: "https://www.messenger.com/robots.txt" } },
  { id: "threads", cat: "social", name: "Threads", site: "https://www.threads.com/", deny: BLOCK.threads, probe: { reach: "https://www.threads.com/robots.txt" } },
  { id: "signal", cat: "social", name: "Signal", site: "https://signal.org/", deny: BLOCK.signal, probe: { reach: "https://signal.org/robots.txt" } },
  { id: "line", cat: "social", name: "LINE", site: "https://line.me/", deny: BLOCK.line, probe: { reach: "https://line.me/robots.txt" } },
  { id: "snapchat", cat: "social", name: "Snapchat", site: "https://www.snapchat.com/", deny: BLOCK.snapchat, probe: { reach: "https://www.snapchat.com/robots.txt" } },
  { id: "pinterest", cat: "social", name: "Pinterest", site: "https://www.pinterest.com/", deny: BLOCK.pinterest, probe: { reach: "https://www.pinterest.com/robots.txt" } },
  { id: "google", cat: "social", name: "Google", site: "https://www.google.com/", deny: BLOCK.google, probe: { reach: "https://www.google.com/generate_204" } },
  { id: "wikipedia", cat: "social", name: "Wikipedia", site: "https://www.wikipedia.org/", deny: BLOCK.wikipedia, probe: { reach: "https://www.wikipedia.org/robots.txt" } },
  { id: "roblox", cat: "social", name: "Roblox", site: "https://www.roblox.com/", deny: BLOCK.roblox, probe: { reach: "https://www.roblox.com/robots.txt" } },

  // services for one country or region
  { id: "kktv", cat: "local", name: "KKTV", site: "https://www.kktv.me/", only: "TW", probe: { api: "https://api.kktv.me/v3/ipcheck", read: "kktv" } },
  { id: "tvb", cat: "local", name: "TVB Anywhere+", site: "https://www.tvbanywhere.com/", probe: { api: "https://uapisfm.tvbanywhere.com.sg/geoip/check/platform/android", read: "tvb" } },
  { id: "sbs", cat: "local", name: "SBS On Demand", site: "https://www.sbs.com.au/ondemand/", only: "AU", probe: { api: "https://www.sbs.com.au/api/v3/network?context=odwebsite", read: "sbs" } },
  { id: "fod", cat: "local", name: "FOD", site: "https://fod.fujitv.co.jp/", only: "JP", probe: { api: "https://geocontrol1.stream.ne.jp/fod-geo/check.xml", read: "fod" } },
  { id: "dmm", cat: "local", name: "DMM TV", site: "https://tv.dmm.com/", only: "JP", probe: { api: "https://api.beacon.dmm.com/v1/streaming/start", read: "dmm",
    init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ player_name: "dmmtv_browser", player_version: "0.0.0", content_type_detail: "VOD_SVOD", content_id: "11uvjcm4fw2wdu7drtd1epnvz", purchase_product_id: null }) } } },
  { id: "zdf", cat: "local", name: "ZDF", site: "https://www.zdf.de/", only: "DE", probe: { api: "https://ssl.zdf.de/geo/de/geo.txt/", read: "zdf" } },
  // BBC iPlayer's media selector answers as a script: "geolocation" outside the UK
  { id: "bbc", cat: "local", name: "BBC iPlayer", site: "https://www.bbc.co.uk/iplayer", only: "GB",
    probe: { jsonp: "https://open.live.bbc.co.uk/mediaselector/6/select/version/2.0/mediaset/pc/vpid/bbc_one_london/format/json/jsfunc/JS_unlock_bbc", cb: "JS_unlock_bbc", read: "bbc" } },
  // Added 2026-11-04 from the command-line scripts (RegionRestrictionCheck by lmc999 and its 1-stream and xykt forks,
  // MediaUnlockTest by HsukqiLee and nkeonkeo, OpenClash): by the scripts' own endpoint where it lets other sites read
  // it (CORS, measured from Tokyo), else the service's Cloudflare edge, else whether it opens with the one country it
  // serves. docs/coverage.md has every check in those scripts and why it is or isn't here.
  // Japan
  { id: "nhk", cat: "local", name: "NHK ONE", site: "https://www.nhk.or.jp/", only: "JP", probe: { api: "https://location-plus.nhk.jp/geoip/area.json", read: "nhk" } },
  { id: "telasa", cat: "local", name: "TELASA", site: "https://www.telasa.jp/", only: "JP", probe: { api: "https://api-videopass-anon.kddi-video.com/v1/playback/system_status", read: "telasa" } },
  { id: "jcom", cat: "local", name: "J:COM STREAM", site: "https://linkvod.myjcom.jp/", only: "JP", probe: { trace: "https://id.zaq.ne.jp/cdn-cgi/trace" } },
  { id: "abema", cat: "local", name: "ABEMA", site: "https://abema.tv/", only: "JP", probe: { reach: "https://abema.tv/robots.txt" } },
  { id: "unext", cat: "local", name: "U-NEXT", site: "https://video.unext.jp/", only: "JP", probe: { reach: "https://video.unext.jp/robots.txt" } },
  { id: "tver", cat: "local", name: "TVer", site: "https://tver.jp/", only: "JP", probe: { reach: "https://tver.jp/robots.txt" } },
  { id: "hulujp", cat: "local", name: "Hulu Japan", names: { ja: "Hulu", "zh-CN": "Hulu 日本", "zh-TW": "Hulu 日本" }, site: "https://www.hulu.jp/", only: "JP", probe: { reach: "https://www.hulu.jp/robots.txt" } },
  { id: "lemino", cat: "local", name: "Lemino", site: "https://lemino.docomo.ne.jp/", only: "JP", probe: { reach: "https://lemino.docomo.ne.jp/robots.txt" } },
  { id: "danime", cat: "local", name: "d Anime Store", names: { ja: "dアニメストア", "zh-CN": "d动画商店", "zh-TW": "d動畫商店" }, site: "https://animestore.docomo.ne.jp/", only: "JP", probe: { reach: "https://animestore.docomo.ne.jp/robots.txt" } },
  { id: "wowow", cat: "local", name: "WOWOW", site: "https://www.wowow.co.jp/", only: "JP", probe: { reach: "https://www.wowow.co.jp/robots.txt" } },
  { id: "radiko", cat: "local", name: "radiko", site: "https://radiko.jp/", only: "JP", probe: { reach: "https://radiko.jp/robots.txt" } },
  { id: "videomarket", cat: "local", name: "VideoMarket", site: "https://www.videomarket.jp/", only: "JP", probe: { reach: "https://www.videomarket.jp/robots.txt" } },
  { id: "rakutenjp", cat: "local", name: "Rakuten TV Japan", names: { ja: "楽天TV", "zh-CN": "乐天 TV 日本", "zh-TW": "樂天 TV 日本" }, site: "https://tv.rakuten.co.jp/", only: "JP", probe: { reach: "https://tv.rakuten.co.jp/robots.txt" } },
  { id: "mora", cat: "local", name: "mora", site: "https://mora.jp/", only: "JP", probe: { reach: "https://mora.jp/robots.txt" } },
  // Korea
  { id: "wavve", cat: "local", name: "Wavve", site: "https://www.wavve.com/", only: "KR", probe: { reach: "https://www.wavve.com/robots.txt" } },
  { id: "tving", cat: "local", name: "TVING", site: "https://www.tving.com/", only: "KR", probe: { reach: "https://www.tving.com/robots.txt" } },
  { id: "coupang", cat: "local", name: "Coupang Play", site: "https://www.coupangplay.com/", only: "KR", probe: { reach: "https://www.coupangplay.com/robots.txt" } },
  { id: "watcha", cat: "local", name: "Watcha", site: "https://watcha.com/", only: "KR", probe: { reach: "https://watcha.com/robots.txt" } },
  { id: "spotv", cat: "local", name: "SPOTV NOW", site: "https://www.spotvnow.co.kr/", only: "KR", probe: { reach: "https://www.spotvnow.co.kr/robots.txt" } },
  // Taiwan, China; Hong Kong
  { id: "4gtv", cat: "local", name: "4GTV", names: { "zh-CN": "四季线上", "zh-TW": "四季線上" }, site: "https://www.4gtv.tv/", only: "TW", probe: { trace: "https://www.4gtv.tv/cdn-cgi/trace" } },
  { id: "litv", cat: "local", name: "LiTV", names: { "zh-CN": "LiTV 立视", "zh-TW": "LiTV 立視" }, site: "https://www.litv.tv/", only: "TW", probe: { trace: "https://proxy.svc.litv.tv/cdn-cgi/trace" } },
  { id: "bahamut", cat: "local", name: "Bahamut Anime Crazy", names: { "zh-CN": "巴哈姆特动画疯", "zh-TW": "巴哈姆特動畫瘋", ja: "バハムート動畫瘋" }, site: "https://ani.gamer.com.tw/", allow: "TW HK MO", probe: { trace: "https://ani.gamer.com.tw/cdn-cgi/trace" } },
  { id: "hami", cat: "local", name: "Hami Video", site: "https://hamivideo.hinet.net/", only: "TW", probe: { reach: "https://hamivideo.hinet.net/robots.txt" } },
  { id: "myvideo", cat: "local", name: "myVideo", site: "https://www.myvideo.net.tw/", only: "TW", probe: { reach: "https://www.myvideo.net.tw/robots.txt" } },
  { id: "friday", cat: "local", name: "friDay Video", names: { "zh-CN": "friDay影音", "zh-TW": "friDay影音" }, site: "https://video.friday.tw/", only: "TW", probe: { reach: "https://video.friday.tw/robots.txt" } },
  { id: "ofiii", cat: "local", name: "ofiii", names: { "zh-CN": "欧飞", "zh-TW": "歐飛" }, site: "https://www.ofiii.com/", only: "TW", probe: { reach: "https://www.ofiii.com/robots.txt" } },
  { id: "linetv", cat: "local", name: "LINE TV", site: "https://www.linetv.tw/", only: "TW", probe: { reach: "https://www.linetv.tw/robots.txt" } },
  { id: "mytvsuper", cat: "local", name: "myTV SUPER", site: "https://www.mytvsuper.com/", only: "HK", probe: { reach: "https://www.mytvsuper.com/robots.txt" } },
  { id: "nowe", cat: "local", name: "Now E", site: "https://www.nowe.com/", only: "HK", probe: { reach: "https://www.nowe.com/robots.txt" } },
  { id: "viutv", cat: "local", name: "ViuTV", site: "https://viu.tv/", only: "HK", probe: { reach: "https://viu.tv/robots.txt" } },
  { id: "hoytv", cat: "local", name: "HOY TV", site: "https://hoy.tv/", only: "HK", probe: { reach: "https://hoy.tv/robots.txt" } },
  // South and Southeast Asia
  { id: "hotstar", cat: "local", name: "JioHotstar", site: "https://www.hotstar.com/", only: "IN", probe: { reach: "https://www.hotstar.com/robots.txt" } },
  { id: "sonyliv", cat: "local", name: "Sony LIV", site: "https://www.sonyliv.com/", only: "IN", probe: { reach: "https://www.sonyliv.com/robots.txt" } },
  { id: "tataplay", cat: "local", name: "Tata Play Binge", site: "https://www.tataplaybinge.com/", only: "IN", probe: { reach: "https://www.tataplaybinge.com/robots.txt" } },
  { id: "mxplayer", cat: "local", name: "MX Player", site: "https://www.mxplayer.in/", only: "IN", probe: { reach: "https://www.mxplayer.in/robots.txt" } },
  { id: "mewatch", cat: "local", name: "meWATCH", site: "https://www.mewatch.sg/", only: "SG", probe: { reach: "https://www.mewatch.sg/robots.txt" } },
  { id: "starhub", cat: "local", name: "StarHub TV+", site: "https://www.starhubtvplus.com/", only: "SG", probe: { reach: "https://www.starhubtvplus.com/robots.txt" } },
  { id: "vidio", cat: "local", name: "Vidio", site: "https://www.vidio.com/", only: "ID", probe: { reach: "https://www.vidio.com/robots.txt" } },
  { id: "trueid", cat: "local", name: "TrueID", site: "https://tv.trueid.net/", only: "TH", probe: { reach: "https://tv.trueid.net/robots.txt" } },
  { id: "aisplay", cat: "local", name: "AIS PLAY", site: "https://aisplay.ais.co.th/", only: "TH", probe: { reach: "https://aisplay.ais.co.th/robots.txt" } },
  { id: "sooka", cat: "local", name: "sooka", site: "https://sooka.my/", only: "MY", probe: { reach: "https://sooka.my/robots.txt" } },
  { id: "galaxyplay", cat: "local", name: "Galaxy Play", site: "https://galaxyplay.vn/", only: "VN", probe: { reach: "https://galaxyplay.vn/robots.txt" } },
  { id: "tv360", cat: "local", name: "TV360", site: "https://tv360.vn/", only: "VN", probe: { reach: "https://tv360.vn/robots.txt" } },
  { id: "kplus", cat: "local", name: "K+", site: "https://www.kplus.vn/", only: "VN", probe: { reach: "https://www.kplus.vn/robots.txt" } },
  // Australia, New Zealand
  { id: "tenplay", cat: "local", name: "10 Play", site: "https://10play.com.au/", only: "AU", probe: { api: "https://e410fasadvz.global.ssl.fastly.net/geo", read: "ten" } },
  { id: "stan", cat: "local", name: "Stan", site: "https://www.stan.com.au/", only: "AU", probe: { reach: "https://www.stan.com.au/robots.txt" } },
  { id: "binge", cat: "local", name: "Binge", site: "https://binge.com.au/", only: "AU", probe: { reach: "https://binge.com.au/robots.txt" } },
  { id: "kayo", cat: "local", name: "Kayo Sports", site: "https://kayosports.com.au/", only: "AU", probe: { reach: "https://kayosports.com.au/robots.txt" } },
  { id: "7plus", cat: "local", name: "7plus", site: "https://7plus.com.au/", only: "AU", probe: { reach: "https://7plus.com.au/robots.txt" } },
  { id: "iview", cat: "local", name: "ABC iview", site: "https://iview.abc.net.au/", only: "AU", probe: { reach: "https://iview.abc.net.au/robots.txt" } },
  { id: "9now", cat: "local", name: "9Now", site: "https://www.9now.com.au/", only: "AU", probe: { reach: "https://www.9now.com.au/robots.txt" } },
  { id: "threenow", cat: "local", name: "ThreeNow", site: "https://www.threenow.co.nz/", only: "NZ", probe: { reach: "https://www.threenow.co.nz/robots.txt" } },
  { id: "neon", cat: "local", name: "Neon", site: "https://www.neontv.co.nz/", only: "NZ", probe: { reach: "https://www.neontv.co.nz/robots.txt" } },
  { id: "skygonz", cat: "local", name: "Sky Go NZ", site: "https://www.skygo.co.nz/", only: "NZ", probe: { reach: "https://www.skygo.co.nz/robots.txt" } },
  // United Kingdom, Europe
  { id: "itvx", cat: "local", name: "ITVX", site: "https://www.itv.com/", only: "GB", probe: { api: "https://simulcast.itv.com/playlist/itvonline/ITV", read: "itv" } },
  { id: "channel4", cat: "local", name: "Channel 4", site: "https://www.channel4.com/", only: "GB", probe: { reach: "https://www.channel4.com/robots.txt" } },
  { id: "my5", cat: "local", name: "My5", site: "https://www.channel5.com/", only: "GB", probe: { reach: "https://www.channel5.com/robots.txt" } },
  { id: "skygo", cat: "local", name: "Sky Go", site: "https://www.sky.com/watch/sky-go", allow: "GB IE", probe: { reach: "https://www.sky.com/robots.txt" } },
  { id: "molotov", cat: "local", name: "Molotov", site: "https://www.molotov.tv/", only: "FR", probe: { api: "https://fapi.molotov.tv/v1/open-europe/is-france", read: "molotov" } },
  { id: "francetv", cat: "local", name: "france.tv", site: "https://www.france.tv/", only: "FR", probe: { reach: "https://www.france.tv/robots.txt" } },
  { id: "joyn", cat: "local", name: "Joyn", site: "https://www.joyn.de/", allow: "DE AT CH", probe: { reach: "https://www.joyn.de/robots.txt" } },
  { id: "rtlplus", cat: "local", name: "RTL+", site: "https://plus.rtl.de/", only: "DE", probe: { reach: "https://plus.rtl.de/robots.txt" } },
  { id: "skyde", cat: "local", name: "Sky Go Germany", names: { de: "Sky Go" }, site: "https://www.sky.de/", allow: "DE AT", probe: { reach: "https://www.sky.de/robots.txt" } },
  { id: "skych", cat: "local", name: "Sky Switzerland", names: { de: "Sky Schweiz", fr: "Sky Suisse" }, site: "https://www.sky.ch/", only: "CH", probe: { reach: "https://www.sky.ch/robots.txt" } },
  { id: "raiplay", cat: "local", name: "RaiPlay", site: "https://www.raiplay.it/", only: "IT", probe: { reach: "https://www.raiplay.it/robots.txt" } },
  { id: "movistar", cat: "local", name: "Movistar Plus+", site: "https://www.movistarplus.es/", only: "ES", probe: { reach: "https://www.movistarplus.es/robots.txt" } },
  { id: "npo", cat: "local", name: "NPO Start", site: "https://npo.nl/", only: "NL", probe: { reach: "https://npo.nl/robots.txt" } },
  { id: "videoland", cat: "local", name: "Videoland", site: "https://www.videoland.com/", only: "NL", probe: { reach: "https://www.videoland.com/robots.txt" } },
  { id: "nlziet", cat: "local", name: "NLZIET", site: "https://www.nlziet.nl/", only: "NL", probe: { trace: "https://nlziet.nl/cdn-cgi/trace" } },
  { id: "amediateka", cat: "local", name: "Amediateka", names: { ru: "Амедиатека" }, site: "https://www.amediateka.ru/", only: "RU", probe: { reach: "https://www.amediateka.ru/robots.txt" } },
  // North America. STARZ: the scripts read its geolocation API, which refuses other sites; its header token, which
  // does not, is refused to datacenters but given to any visitor (a Japanese one too), so it says nothing
  { id: "sling", cat: "local", name: "Sling TV", site: "https://www.sling.com/", only: "US", probe: { api: "https://p-geo.movetv.com/geo", read: "sling" } },
  { id: "starz", cat: "local", name: "STARZ", site: "https://www.starz.com/", only: "US", probe: { reach: "https://www.starz.com/robots.txt" } },
  { id: "aetv", cat: "local", name: "A&E", site: "https://play.aetv.com/", only: "US", probe: { api: "https://link.theplatform.com/s/xc6n8B/UR27JDU0bu2s/", read: "aetv" } },
  { id: "cw", cat: "local", name: "The CW", site: "https://www.cwtv.com/", only: "US", probe: { trace: "https://www.cwtv.com/cdn-cgi/trace" } },
  { id: "directv", cat: "local", name: "DIRECTV Stream", site: "https://stream.directv.com/", only: "US", probe: { trace: "https://www.atttvnow.com/cdn-cgi/trace" } },
  { id: "mgmplus", cat: "local", name: "MGM+", site: "https://www.mgmplus.com/", only: "US", probe: { reach: "https://www.mgmplus.com/robots.txt" } },
  { id: "fxnow", cat: "local", name: "FX", site: "https://www.fxnetworks.com/", only: "US", probe: { reach: "https://www.fxnetworks.com/robots.txt" } },
  { id: "nflplus", cat: "local", name: "NFL+", site: "https://www.nfl.com/plus/", only: "US", probe: { reach: "https://www.nfl.com/robots.txt" } },
  { id: "tlc", cat: "local", name: "TLC GO", site: "https://go.tlc.com/", only: "US", probe: { reach: "https://go.tlc.com/robots.txt" } },
  { id: "cbcgem", cat: "local", name: "CBC Gem", site: "https://gem.cbc.ca/", only: "CA", probe: { reach: "https://gem.cbc.ca/robots.txt" } },
  { id: "crave", cat: "local", name: "Crave", site: "https://www.crave.ca/", only: "CA", probe: { reach: "https://www.crave.ca/robots.txt" } },
  // Mainland China. Mango TV's player and Tencent Video's say whether a mainland title plays here (titles that
  // play in mainland China; replace them when they go offline). The others can't be read from another site:
  // whether they open, and mainland China when Mango TV or Tencent Video play (src/app.js).
  { id: "mgtv", cat: "local", name: "Mango TV", names: { "zh-CN": "芒果TV", "zh-TW": "芒果TV" }, site: "https://www.mgtv.com/", only: "CN",
    probe: { api: "https://pcweb.api.mgtv.com/player/video?video_id=22028443&type=pch5&tk2={tk2}", read: "mgtv" } },
  { id: "tencent", cat: "local", name: "Tencent Video", names: { "zh-CN": "腾讯视频", "zh-TW": "騰訊視頻" }, site: "https://v.qq.com/", only: "CN",
    probe: { jsonp: "https://vv.video.qq.com/getinfo?vids=j4102i5tqu0&otype=json&platform=11&defn=shd&callback=unlockQQ", cb: "unlockQQ", read: "qq" } },
  { id: "bilibili", cat: "local", name: "Bilibili", names: { "zh-CN": "哔哩哔哩", "zh-TW": "嗶哩嗶哩" }, site: "https://www.bilibili.com/", only: "CN", probe: { reach: "https://www.bilibili.com/robots.txt" } },
  { id: "iqiyi", cat: "local", name: "iQIYI", names: { "zh-CN": "爱奇艺", "zh-TW": "愛奇藝" }, site: "https://www.iqiyi.com/", only: "CN", probe: { reach: "https://www.iqiyi.com/robots.txt" } },
  { id: "youku", cat: "local", name: "Youku", names: { "zh-CN": "优酷", "zh-TW": "優酷" }, site: "https://www.youku.com/", only: "CN", probe: { reach: "https://www.youku.com/robots.txt" } },
  { id: "netease", cat: "local", name: "NetEase Cloud Music", names: { "zh-CN": "网易云音乐", "zh-TW": "網易雲音樂" }, site: "https://music.163.com/", only: "CN", probe: { reach: "https://music.163.com/robots.txt" } },
];

// Netflix countries tried in this order after the ones the other services see (most visitors' exits are among them)
export const NETFLIX_TRY = "JP SG HK TW KR GB DE FR CA AU IN BR MX ES IT NL TR TH MY ID PH VN AE SA IL PL SE NO DK FI CH AT BE IE PT AR CL CO NZ ZA EG UA RO CZ HU GR".split(" ");

// the URL path of a service's own page (/<slug>/) and of a category's (/<cat>/)
export const SLUG = { chatgpt: "chatgpt", claude: "claude", gemini: "gemini", copilot: "copilot", grok: "grok", perplexity: "perplexity",
  mistral: "le-chat", poe: "poe", characterai: "character-ai", netflix: "netflix", disney: "disney-plus", tiktok: "tiktok", dazn: "dazn",
  crunchyroll: "crunchyroll", peacock: "peacock", philo: "philo", kktv: "kktv", tvb: "tvb-anywhere", sbs: "sbs-on-demand", fod: "fod",
  nbc: "nbc", shudder: "shudder", bein: "bein-connect", twitch: "twitch", youtube: "youtube", x: "x-twitter", instagram: "instagram", telegram: "telegram",
  whatsapp: "whatsapp", discord: "discord", reddit: "reddit", dmm: "dmm-tv", zdf: "zdf",
  metaai: "meta-ai", primevideo: "prime-video", appletv: "apple-tv-plus", max: "hbo-max", hulu: "hulu", paramount: "paramount-plus", pluto: "pluto-tv",
  tubi: "tubi", espn: "espn-plus", fubo: "fubo", viu: "viu", viki: "viki", bilibilitv: "bilibili-tv", spotify: "spotify", pandora: "pandora",
  deezer: "deezer", soundcloud: "soundcloud", facebook: "facebook", messenger: "messenger", threads: "threads", signal: "signal", line: "line",
  snapchat: "snapchat", pinterest: "pinterest", google: "google", wikipedia: "wikipedia", roblox: "roblox", bbc: "bbc-iplayer", mgtv: "mango-tv",
  tencent: "tencent-video", bilibili: "bilibili", iqiyi: "iqiyi", youku: "youku", netease: "netease-cloud-music",
  nhk: "nhk-one", telasa: "telasa", jcom: "jcom-stream", abema: "abema", unext: "u-next", tver: "tver", hulujp: "hulu-japan", lemino: "lemino",
  danime: "d-anime-store", wowow: "wowow", radiko: "radiko", wavve: "wavve", tving: "tving", coupang: "coupang-play", watcha: "watcha",
  "4gtv": "4gtv", litv: "litv", bahamut: "bahamut-anime", hami: "hami-video", myvideo: "myvideo", friday: "friday-video",
  mytvsuper: "mytv-super", nowe: "now-e", viutv: "viutv", hotstar: "jiohotstar", sonyliv: "sony-liv", mewatch: "mewatch", vidio: "vidio",
  trueid: "trueid", sooka: "sooka", tenplay: "10-play", stan: "stan", binge: "binge", kayo: "kayo-sports", "7plus": "7plus",
  iview: "abc-iview", "9now": "9now", threenow: "threenow", itvx: "itvx", channel4: "channel-4", my5: "my5", molotov: "molotov",
  francetv: "france-tv", joyn: "joyn", rtlplus: "rtl-plus", raiplay: "raiplay", movistar: "movistar-plus", npo: "npo-start",
  videoland: "videoland", nlziet: "nlziet", amediateka: "amediateka", sling: "sling-tv", starz: "starz", aetv: "a-and-e", cw: "the-cw",
  directv: "directv-stream", mgmplus: "mgm-plus", cbcgem: "cbc-gem", crave: "crave",
  videomarket: "videomarket", rakutenjp: "rakuten-tv-japan", mora: "mora", spotv: "spotv-now", ofiii: "ofiii", linetv: "line-tv",
  hoytv: "hoy-tv", tataplay: "tata-play-binge", mxplayer: "mx-player", starhub: "starhub-tv-plus", aisplay: "ais-play",
  galaxyplay: "galaxy-play", tv360: "tv360", kplus: "k-plus", neon: "neon", skygonz: "sky-go-nz", skygo: "sky-go",
  skyde: "sky-go-germany", skych: "sky-switzerland", fxnow: "fx", nflplus: "nfl-plus", tlc: "tlc-go" };
// a language's copy of the list, each service under the name that language uses
export const named = lang => SERVICES.map(s => s.names && s.names[lang] ? { ...s, name: s.names[lang] } : s);
export const CAT_SLUG = { ai: "ai", video: "streaming", social: "social", local: "regional" };
