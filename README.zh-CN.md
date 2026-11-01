# 流媒体/AI 解锁检测（Streaming & AI Unlock Check）

[English](README.md) · **简体中文**

你的 IP 能用哪些流媒体和 AI，每个服务看到你在哪个国家？[流媒体/AI 解锁检测](https://unlock.1ms.dog) 从你的浏览器询问 33 个服务（Netflix、Disney+、TikTok、ChatGPT、Claude、Gemini 等），每个都走你的代理给它分配的线路，并标明每个结论有多可靠。

**在线使用：** https://unlock.1ms.dog

## 为什么做成网页

常用的解锁脚本（RegionRestrictionCheck 及其分支）在服务器上跑 `curl`，测的是那台服务器的 IP。用规则代理（Clash、Surge、Shadowrocket、sing-box）的人，每个网站走的线路不同；只有从自己浏览器发起的检测，才和打开 Netflix、ChatGPT 时走同一条线路。浏览器读不到大多数网站的回答（没有 CORS），所以每项检测用静态页面能拿到的最强信号，并标出来：

| 标签 | 方法 | 服务 |
|---|---|---|
| **官方接口** | 服务自己的地区接口，任何网页都能读（CORS），和命令行脚本读的是同一个接口。 | ChatGPT（`api.openai.com/compliance/cookie_requirements` 加它的 trace）、DAZN、Philo、NBC、Shudder、beIN CONNECT、KKTV、TVB Anywhere+、SBS On Demand、FOD、DMM TV、ZDF |
| **官方定位** | 服务自己域名下 Cloudflare 的 `/cdn-cgi/trace`（`Access-Control-Allow-Origin: *`）给出这个节点看到的国家，再对照服务公布的列表。 | Claude、Copilot、Grok、Perplexity、Le Chat、Poe、Character.AI、Crunchyroll、X |
| **跳转判断** | 数跳转次数，见下文。 | Netflix（地区）、Disney+、Peacock |
| **推测** | 服务自己的东西一样也读不到：只确认它在你的线路上能访问，再拿多数服务看到的国家对照它公布的列表。 | Gemini、TikTok、YouTube、Instagram、Telegram、WhatsApp、Discord、Reddit、Twitch |

国家列表来自各服务官方：[OpenAI](https://developers.openai.com/api/docs/supported-countries)、[Anthropic](https://www.anthropic.com/supported-countries)、[Gemini 应用](https://support.google.com/gemini/answer/13575153)（包含香港和澳门；Gemini API 的列表不含）、[Netflix](https://help.netflix.com/en/node/14164)。

### 数跳转次数

浏览器最多跟随 20 次跳转（Chrome、Firefox；Safari 更少），超过就让请求失败。`public/_redirects` 让 `/h/<n>/<host>/<path>` 在本站跳转 n 次，最后一次跳到 `https://<host>/<path>`。把 `no-cors` 请求先经过本站 `MAX − k` 次跳转，只有服务自己最多再跳 `k` 次时才能加载成功。这样不读任何内容就能数出服务跳转了几次。上限先实测（`/hop.txt`），所以其他浏览器也能用。这些规则是静态的：由静态资源服务直接响应，不运行脚本（免费、不计请求数）。

2026-11-01 在 Chrome 141 中实测（日本出口；美国的数据来自洛杉矶的服务器）：

| 请求 | 日本 | 美国 |
|---|---|---|
| `netflix.com/jp/` | 0 次 | 2 次 |
| `netflix.com/us/`、`/sg/`、`/de/`、`/gb/`… | 2 次 | `/us/` → `/`：1 次 |
| `netflix.com/` | 1 次（→ `/jp-en/`） | 0 次 |
| `peacocktv.com/` | 1 次（→ `/unavailable`） | 0 次 |
| `disneyplus.com/` | 0 次 | 0 次 |

所以 Netflix 只直接响应你所在国家的路径：先试其他服务看到的国家，一两个请求就能找到 Netflix 地区。在 Cloudflare 线上（unlock.1ms.dog，2026-11-01）这些静态规则的跳转和上面一致，最后一跳会离开本站，线上实测的次数也一样。Netflix 对爬虫不做跳转，测试时要用正常浏览器的 UA（无头 Chrome 的 `HeadlessChrome` 在哪都是 0 次）。

### 浏览器看不出来的

- **Netflix 片库：** 能找到地区，但非自制剧能不能播看不出来；Netflix 会把很多代理和机房 IP 限制为只能看自制剧。脚本是从影片页的正文里读的，浏览器读不到。
- **Gemini：** Google 用自己的数据库给 IP 定位（俗称「送中」），没有网页能读的 Google 接口能看出来。Gemini 标为推断。
- **有意不做的：** 需要内嵌第三方 API 密钥、或者要提交注册表单的检测（脚本里的 Spotify、Catchplay、Tving 等）。YouTube Premium：暂时没有能读的信号。

资源策略拒绝其他网站的页面（`Cross-Origin-Resource-Policy: same-origin`/`same-site`：claude.ai/login、gemini.google.com、aistudio.google.com）也数不了：不管状态码是什么，浏览器都会让请求失败。

### 其他发现

- 规则分流时，不同服务看到的国家不一样：测试时 SBS On Demand 看到香港，另外 15 个看到日本。页面会列出哪些服务看到哪个国家，并链到 1ms.dog 的出口照妖镜。
- 浏览器时区和服务看到的国家：AI 服务会把它当成代理特征。

**隐私：** 只有静态文件。你的浏览器直接询问每个服务，结果不会发送到本站。分享链接只带每个服务的结论和国家，不带 IP。

## 页面

每种语言（`/`、`/zh-cn/`、`/zh-tw/`、`/ja/`、`/ko/`、`/es/`、`/fr/`、`/de/`、`/pt/`、`/ru/`）都有主页、每个分类一页（`/ai/`、`/streaming/`、`/social/`、`/regional/`）和每个服务一页（`/netflix/`、`/chatgpt/`、`/claude/`…），各有自己的标题、问答和预览图；服务页首先显示这个服务的结论，并列出它在哪些国家可用。

## 自己部署

`public/` 已经提交，不改代码就不用构建。

```bash
git clone https://github.com/yt1988/unlock-check
cd unlock-check
npx wrangler login
npx wrangler deploy        # 纯静态资源 Worker：没有脚本，免费、不计请求数
```

`wrangler.toml` 关掉了 `*.workers.dev` 和预览地址；在 **Workers & Pages → unlock → Settings → Domains & Routes** 绑定自己的域名，或者临时设 `workers_dev = true` 测试。其他静态托管只要支持 Cloudflare 格式的 `_headers` 和 `_redirects`（Cloudflare Pages、Netlify）也能用；没有 `_redirects` 时，Netflix、Disney+、Peacock 只显示能否访问。

把自己的域名写进 canonical 链接和 sitemap：

```bash
npm install
SITE_URL=https://unlock.example.com npm run build
```

## 开发

```bash
npm install
npm run dev        # http://localhost:8787，带生产环境的响应头和跳转链
npm run build      # 改了 src/ 之后重新生成 public/（public/ 要提交）
npm test           # public/ 是否最新、页面约定、SEO 和逻辑测试
npm run og         # 改了标题后重画 public/og/ 里的预览图（要提交）
```

新增服务：在 `src/services.mjs` 加一项（接口类的在 `src/lib.mjs` 加一个读取函数）和它的路径，然后 `npm run build && npm run og`。

## 许可

MIT
