// The Unlock Check Worker. Files in ./public are served before it runs, except the HTML pages wrangler.toml lists in
// assets.run_worker_first: those pass through it so it can add our deploy-time measurement endpoints from the
// environment (docs/tool-contract.md §2). Nothing set -> no meta, and the page hides the split hint.
const ENDPOINTS = [["ms-anchors", "MS_ANCHORS"], ["ms-egress", "MS_EGRESS"]];
const escAttr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// The metas this environment asks for; exported for the test that no env means none.
export function endpointTags(env = {}) {
  return ENDPOINTS.filter(([, key]) => env[key]).map(([name, key]) => [name, String(env[key])]);
}

function withEndpoints(rw, env) {
  const tags = endpointTags(env);
  if (!tags.length) return rw;
  return rw.on("head", { element: e => { for (const [name, value] of tags) e.append(`<meta name="${name}" content="${escAttr(value)}">`, { html: true }); } });
}

export default {
  async fetch(req, env) {
    if (!env.ASSETS) return new Response(req.method === "HEAD" ? null : "Not found\n", {
      status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" },
    });
    const page = await env.ASSETS.fetch(req);
    const html = (page.headers.get("content-type") || "").includes("text/html");
    if (page.status !== 200 || req.method === "HEAD" || !html || !endpointTags(env).length) return page;
    return withEndpoints(new HTMLRewriter(), env).transform(page);
  },
};
