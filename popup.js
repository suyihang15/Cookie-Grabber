let siteHistory = {};
let currentSite = null;
let currentCookies = [];

const $ = (id) => document.getElementById(id);

function getHostname(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}

function getBaseDomain(hostname) {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

async function grabDocumentCookie(tabId, url) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.cookie,
    });
    if (results && results[0] && results[0].result) {
      const docCookie = results[0].result;
      if (!docCookie) return [];
      const hostname = getHostname(url);
      return docCookie.split(";").map((pair) => {
        const idx = pair.indexOf("=");
        if (idx === -1) return null;
        const name = pair.substring(0, idx).trim();
        const value = pair.substring(idx + 1).trim();
        if (!name) return null;
        return {
          name,
          value,
          domain: hostname,
          path: "/",
          expires: "Session",
          secure: url.startsWith("https"),
          httpOnly: false,
          sameSite: "Unspecified",
          _source: "document.cookie",
        };
      }).filter(Boolean);
    }
  } catch (e) {}
  return [];
}

async function fetchAllCookies(tab, url) {
  const hostname = getHostname(url);
  if (!hostname) return [];

  const [byUrl, byHost, byBase, docCookies] = await Promise.all([
    chrome.cookies.getAll({ url }),
    chrome.cookies.getAll({ domain: hostname }),
    chrome.cookies.getAll({ domain: getBaseDomain(hostname) }),
    grabDocumentCookie(tab.id, url),
  ]);

  const seen = new Set();
  const merged = [];

  for (const c of [...byUrl, ...byHost, ...byBase]) {
    const key = c.name + "|" + c.domain;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expirationDate ? new Date(c.expirationDate * 1000).toISOString() : "Session",
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        _source: "chrome.cookies",
      });
    }
  }

  for (const c of docCookies) {
    const key = c.name + "|" + c.domain;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(c);
    }
  }

  return merged;
}

function init() {
  chrome.storage.local.get(["siteHistory"], (data) => {
    siteHistory = data.siteHistory || {};
    renderHistory();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.siteHistory) {
      siteHistory = changes.siteHistory.newValue || {};
      renderHistory();
    }
  });

  $("btnGrab").addEventListener("click", grabCookies);
  $("btnClear").addEventListener("click", clearCurrent);
  $("btnJSON").addEventListener("click", exportJSON);
  $("btnHeader").addEventListener("click", exportHeader);
  $("btnCopy").addEventListener("click", copyHeader);
  $("filterInput").addEventListener("input", renderCookies);
}

async function grabCookies() {
  setStatus("正在采集...");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      setStatus("无法获取当前标签页");
      return;
    }

    const url = tab.url;
    const hostname = getHostname(url);
    if (!hostname) {
      setStatus("无法识别网站地址");
      return;
    }

    const allCookies = await fetchAllCookies(tab, url);

    const entry = {
      hostname,
      url,
      cookies: allCookies,
      grabTime: new Date().toISOString(),
    };

    siteHistory[hostname] = entry;
    chrome.storage.local.set({ siteHistory });

    currentSite = hostname;
    currentCookies = allCookies;

    renderHistory();
    renderCookies();
    setStatus(`${hostname} - 共采集 ${allCookies.length} 条Cookie`);
  } catch (e) {
    setStatus("采集失败: " + e.message);
  }
}

function renderHistory() {
  const sites = Object.keys(siteHistory).sort((a, b) => {
    return new Date(siteHistory[b].grabTime) - new Date(siteHistory[a].grabTime);
  });

  const list = $("siteList");
  if (sites.length === 0) {
    list.innerHTML = '<div class="empty-tip">点击「采集」获取完整Cookie</div>';
    return;
  }

  list.innerHTML = sites.map((host) => {
    const entry = siteHistory[host];
    const isActive = host === currentSite;
    const time = formatTime(entry.grabTime);
    const count = entry.cookies.length;
    return `
      <div class="site-item${isActive ? " active" : ""}" data-site="${esc(host)}">
        <div class="site-name">${esc(host)}</div>
        <div class="site-info">
          <span>${count} 条</span>
          <span>${time}</span>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".site-item").forEach((el) => {
    el.addEventListener("click", () => {
      const host = el.dataset.site;
      currentSite = host;
      currentCookies = siteHistory[host].cookies;
      renderHistory();
      renderCookies();
    });
  });
}

function renderCookies() {
  if (!currentSite) {
    $("cookiePanel").style.display = "none";
    return;
  }

  $("cookiePanel").style.display = "";
  $("siteLabel").textContent = currentSite;
  $("countBadge").textContent = currentCookies.length;

  const filter = $("filterInput").value.toLowerCase();
  const filtered = filter
    ? currentCookies.filter(
        (c) =>
          c.name.toLowerCase().includes(filter) ||
          c.domain.toLowerCase().includes(filter) ||
          c.value.toLowerCase().includes(filter)
      )
    : currentCookies;

  const list = $("cookieList");

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty-tip">无匹配Cookie</div>';
    return;
  }

  list.innerHTML = filtered
    .map((c) => {
      const tags = [];
      if (c.secure) tags.push('<span class="tag secure">Secure</span>');
      if (c.httpOnly) tags.push('<span class="tag httponly">HttpOnly</span>');
      if (c._source === "document.cookie") tags.push('<span class="tag doc">JS</span>');

      return `
        <div class="cookie-item">
          <div class="cookie-name">${esc(c.name)} ${tags.join(" ")}</div>
          <div class="cookie-value">${esc(c.value)}</div>
          <div class="cookie-meta">
            <span>${esc(c.domain)}</span>
            <span>${c.expires === "Session" ? "Session" : formatTime(c.expires)}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function clearCurrent() {
  if (!currentSite) return;
  delete siteHistory[currentSite];
  chrome.storage.local.set({ siteHistory });
  currentSite = null;
  currentCookies = [];
  $("cookiePanel").style.display = "none";
  setStatus("已删除");
}

function exportJSON() {
  if (currentCookies.length === 0) return;
  const data = { site: currentSite, cookies: currentCookies };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  downloadBlob(blob, `cookies_${currentSite}_${timestamp()}.json`);
  setStatus("JSON 已导出");
}

function exportHeader() {
  if (currentCookies.length === 0) return;
  const header = currentCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const blob = new Blob([header], { type: "text/plain" });
  downloadBlob(blob, `cookie_${currentSite}_${timestamp()}.txt`);
  setStatus("Header 已导出");
}

async function copyHeader() {
  if (currentCookies.length === 0) return;
  const header = currentCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  try {
    await navigator.clipboard.writeText(header);
    setStatus("已复制到剪贴板");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = header;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setStatus("已复制到剪贴板");
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setStatus(msg) {
  $("statusBar").textContent = msg;
}

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function pad(n) {
  return n.toString().padStart(2, "0");
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function esc(s) {
  const div = document.createElement("div");
  div.textContent = s || "";
  return div.innerHTML;
}

document.addEventListener("DOMContentLoaded", init);
