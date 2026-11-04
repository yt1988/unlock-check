// The status page (/status/, /<lang>/status/): fills the table the build wrote (scripts/build.mjs) with the hourly
// check from 1ms.dog's Tokyo server (scripts/watch.mjs, watch/README.md): whether each check still works, now, over the
// last 24 runs and the last week, and the runs where one didn't. Only on 1ms.dog itself and localhost, as on the main
// page (a copy hosted elsewhere doesn't ask our server).
(function () {
  "use strict";
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const D = JSON.parse($("#data").textContent), L = window.LUNLOCK || {}, LANG = D.lang;
  const t = (k, v) => { let s = L[k] ?? k; if (v) for (const x in v) s = s.split("{" + x + "}").join(v[x]); return s; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  /* ---------- the header, as on the main page (src/app.js) ---------- */
  const thBtn = $("#theme"), TH = ["system", "light", "dark"];
  const applyTheme = th => {
    if (th === "light" || th === "dark") document.documentElement.setAttribute("data-theme", th); else document.documentElement.removeAttribute("data-theme");
    thBtn.dataset.th = th; thBtn.title = t("th_" + th); thBtn.setAttribute("aria-label", t("th_" + th));
  };
  applyTheme(TH.includes(store.get("unlock:theme")) ? store.get("unlock:theme") : "system");
  thBtn.onclick = () => { const n = TH[(TH.indexOf(thBtn.dataset.th) + 1) % 3]; store.set("unlock:theme", n); applyTheme(n); };
  $("#lang").onchange = e => { const l = e.target.value; store.set("unlock:lang", l); location.href = D.paths[l]; };
  const help = $("#help");
  let lastFocus = null, helpIdx = 0;
  const close = () => { help.hidden = true; document.body.classList.remove("dlg-open"); if (lastFocus) lastFocus.focus(); };
  help.addEventListener("click", e => { if (e.target === help || e.target.closest("[data-close]")) close(); });
  addEventListener("keydown", e => { if (e.key === "Escape" && !help.hidden) close(); });
  const qs = $$("#helpNav [data-hq]");
  $("#helpSel").innerHTML = qs.map((b, i) => `<option value="${i}">${i + 1} / ${qs.length} · ${esc(b.textContent)}</option>`).join("");
  function showHelp(i) {
    helpIdx = Math.max(0, Math.min(qs.length - 1, i));
    qs.forEach(b => b.setAttribute("aria-selected", +b.dataset.hq === helpIdx));
    $$("#helpC [data-hqb]").forEach(a => { a.hidden = +a.dataset.hqb !== helpIdx; });
    $("#helpSel").value = helpIdx;
    $$("[data-hstep]").forEach(b => { b.disabled = helpIdx + +b.dataset.hstep < 0 || helpIdx + +b.dataset.hstep >= qs.length; });
    $("#helpC").scrollTop = 0;
  }
  $("#helpBtn").onclick = () => { lastFocus = document.activeElement; showHelp(helpIdx); help.hidden = false; document.body.classList.add("dlg-open"); help.querySelector("[data-close]").focus(); };
  qs.forEach(b => { b.onclick = () => showHelp(+b.dataset.hq); });
  $("#helpSel").onchange = e => showHelp(+e.target.value);
  $$("[data-hstep]").forEach(b => { b.onclick = () => showHelp(helpIdx + +b.dataset.hstep); });

  /* ---------- the table ---------- */
  const meta = $("#stMeta");
  const fail = k => { meta.textContent = t(k); meta.classList.add("warn"); };
  const WATCH = /(^|\.)1ms\.dog$|^localhost$/.test(location.hostname) ? "https://data.1ms.dog:2083/unlock/status.json" : "";
  if (!WATCH) { fail("sp_off"); return; }
  const when = s => new Intl.DateTimeFormat(LANG, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(s));
  const clock = s => new Intl.DateTimeFormat(LANG, { hour: "2-digit", minute: "2-digit" }).format(new Date(s));
  const ST = { o: "sp_ok", d: "sp_drift", b: "sp_bad" };
  // the share of runs that were ok, among those it was checked in; null without any
  const up = h => { const n = h.replace(/-/g, "").length; return n ? h.split("o").length - 1 === n ? 100 : ((h.split("o").length - 1) / n) * 100 : null; };
  const pct = v => v == null ? "–" : (v >= 99.95 ? "100" : v.toFixed(1)) + "%";
  const upCls = v => v == null ? "" : v >= 99.5 ? "c-ok" : v >= 95 ? "c-mid" : "c-bad";

  fetch(WATCH, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(8000) })
    .then(r => r.ok ? r.json() : Promise.reject()).then(j => {
      const S = j.services || {}, runs = Array.isArray(j.runs) && j.runs.length ? j.runs : [j.at];
      if (!j.at || !Object.keys(S).length) throw new Error("empty");
      const old = Date.now() - Date.parse(j.at) > 3 * (j.every || 3600) * 1000;
      meta.textContent = t(old ? "sp_stale" : "sp_meta", { t: when(j.at) });
      meta.classList.toggle("warn", old);
      let ok = 0, n = 0;
      const outs = [];
      for (const tr of $$("#stTable tr[data-id]")) {
        const id = tr.dataset.id, b = S[id];
        if (!b) continue;
        n++; if (b.s === "ok") ok++;
        const h = (b.h || ({ ok: "o", drift: "d", bad: "b" }[b.s] || "-")).padStart(runs.length, "-").slice(-runs.length);
        const now = tr.querySelector(".now"), k = { ok: "o", drift: "d", bad: "b" }[b.s] || "-";
        now.className = "now s-" + k;
        now.innerHTML = `<i></i>${esc(t(ST[k] || "sp_bad"))}` + (b.dc ? `<small>${esc(t("sp_dc"))}</small>` : "");
        if (k !== "o") now.title = (b.err ? b.err + " · " : "") + t("sp_since", { t: when(b.since) });
        // the last 24 runs, oldest first, each a cell with its time
        const last = h.slice(-24).padStart(24, "-"), base = runs.length - 24;
        tr.querySelector(".bar24").innerHTML = `<span class="hb">${[...last].map((c, i) => { const at = runs[base + i];
          return `<i class="s-${c}"${at ? ` title="${esc(when(at) + " · " + (c === "-" ? "–" : t(ST[c])))}"` : ""}></i>`; }).join("")}</span>`;
        const u24 = up(h.slice(-24)), u7 = up(h), a = tr.querySelector(".u24"), c = tr.querySelector(".u7");
        a.textContent = pct(u24); a.className = "u24 " + upCls(u24);
        c.textContent = pct(u7); c.className = "u7 " + upCls(u7);
        // runs in a row that weren't ok, as one outage each
        for (let i = 0; i < h.length; i++) {
          if (h[i] !== "d" && h[i] !== "b") continue;
          let e = i; while (e + 1 < h.length && h[e + 1] === h[i]) e++;
          outs.push({ name: tr.dataset.name, s: h[i], from: runs[i], to: runs[e], open: e === h.length - 1, err: e === h.length - 1 ? b.err : "" });
          i = e;
        }
      }
      $("#stSum").textContent = t("sp_sum", { ok, n });
      $("#stSum").classList.toggle("warn", ok < n);
      outs.sort((a, b) => Date.parse(b.to) - Date.parse(a.to));
      $("#stOut").innerHTML = outs.length ? outs.slice(0, 40).map(o => {
        const to = o.open ? t("sp_now") : new Date(o.from).toDateString() === new Date(o.to).toDateString() ? clock(o.to) : when(o.to);
        return `<li><b>${esc(o.name)}</b> <span class="now s-${o.s}"><i></i>${esc(t(ST[o.s]))}</span> <span class="m">${esc(o.from === o.to && !o.open ? when(o.from) : when(o.from) + " – " + to)}${o.err ? " · " + esc(o.err) : ""}</span></li>`;
      }).join("") : `<li class="m">${esc(t("sp_none"))}</li>`;
    }).catch(() => fail("sp_err"));
})();
