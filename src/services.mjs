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
  // These send visitors where they aren't offered to a page that says so (/intl/, /no-service/). Outside their
  // regions that page stays put (measured: no redirect of its own); inside them it is expected to send you home.
  { id: "paramount", cat: "video", name: "Paramount+", site: "https://www.paramountplus.com/", probe: { hops: "https://www.paramountplus.com/intl/", reach: "https://www.paramountplus.com/robots.txt" } },
  { id: "pluto", cat: "video", name: "Pluto TV", site: "https://pluto.tv/", probe: { hops: "https://pluto.tv/intl/", reach: "https://pluto.tv/robots.txt" } },
  // And these redirect from their front page (to /restricted, /denied, /unavailable/, gdpr.tubi.tv): one redirect
  // measured outside their regions, none expected inside.
  { id: "tubi", cat: "video", name: "Tubi", site: "https://tubitv.com/", probe: { hops: "https://tubitv.com/", zero: true, reach: "https://tubitv.com/robots.txt" } },
  { id: "espn", cat: "video", name: "ESPN+", site: "https://plus.espn.com/", only: "US", probe: { hops: "https://plus.espn.com/", zero: true, reach: "https://plus.espn.com/robots.txt" } },
  { id: "fubo", cat: "video", name: "Fubo", site: "https://www.fubo.tv/", probe: { hops: "https://www.fubo.tv/", zero: true, reach: "https://www.fubo.tv/robots.txt" } },
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
  tencent: "tencent-video", bilibili: "bilibili", iqiyi: "iqiyi", youku: "youku", netease: "netease-cloud-music" };
// a language's copy of the list, each service under the name that language uses
export const named = lang => SERVICES.map(s => s.names && s.names[lang] ? { ...s, name: s.names[lang] } : s);
export const CAT_SLUG = { ai: "ai", video: "streaming", social: "social", local: "regional" };
