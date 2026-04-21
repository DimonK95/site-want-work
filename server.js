const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const ROLE_PATTERNS = [
  {
    id: "design",
    label: "Дизайн",
    query: "designer OR graphic designer OR ui ux designer OR бренд-дизайнер",
    words: ["дизайн", "баннер", "бренд", "лендинг", "figma", "ui", "ux", "график", "иллюстр"],
  },
  {
    id: "management",
    label: "Менеджмент",
    query: "project manager OR product manager OR team lead OR delivery manager",
    words: ["руковод", "менедж", "lead", "лид", "управ", "product", "project", "delivery"],
  },
  {
    id: "frontend",
    label: "Frontend",
    query: "frontend OR react OR javascript OR typescript",
    words: ["frontend", "react", "javascript", "typescript", "верст", "фронтенд"],
  },
  {
    id: "backend",
    label: "Backend",
    query: "backend OR node.js OR python OR golang OR java",
    words: ["backend", "node", "python", "golang", "java", "бекенд", "api", "сервер"],
  },
  {
    id: "marketing",
    label: "Маркетинг",
    query: "marketing OR performance marketing OR smm OR content manager",
    words: ["маркет", "smm", "контент", "трафик", "реклама", "brand", "seo"],
  },
  {
    id: "copywriting",
    label: "Тексты",
    query: "copywriter OR content writer OR editor",
    words: ["копирай", "редакт", "текст", "writer", "editor", "контент"],
  },
  {
    id: "analytics",
    label: "Аналитика",
    query: "analyst OR data analyst OR business analyst",
    words: ["аналит", "sql", "дашборд", "bi", "данн", "excel"],
  },
  {
    id: "sales",
    label: "Продажи",
    query: "sales manager OR account manager OR business development",
    words: ["продаж", "sales", "account", "bizdev", "аккаунт"],
  },
];

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

function safeReadJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+#./-]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function parseIntent({ prompt = "", location = "", mode = "remote", jobType = "all" }) {
  const tokens = tokenize([prompt, location].join(" "));
  const tokenText = tokens.join(" ");

  const matchedRoles = ROLE_PATTERNS.filter((role) =>
    role.words.some((word) => tokenText.includes(word))
  );

  const strongWords = unique(
    tokens.filter((token) => token.length > 3 && !["удаленно", "remote", "full", "time"].includes(token))
  );

  const skillHints = unique(
    matchedRoles.map((role) => role.label).concat(strongWords.slice(0, 6))
  ).slice(0, 6);

  const queryCore =
    matchedRoles.map((role) => role.query).join(" OR ") ||
    strongWords.slice(0, 5).join(" ");

  const queryParts = [queryCore];
  if (mode === "remote") {
    queryParts.push("удаленно remote");
  }
  if (location && mode !== "remote") {
    queryParts.push(location);
  }
  if (jobType === "project") {
    queryParts.push("проект freelance contract");
  }
  if (jobType === "fulltime") {
    queryParts.push("full time fulltime штат");
  }

  const finalQuery = queryParts.filter(Boolean).join(" ");
  const mood =
    matchedRoles[0]?.label ||
    (jobType === "project" ? "Проектная работа" : "Подходящие вакансии");

  return {
    mood,
    summary: mode === "remote" ? `Удаленно · ${mood}` : `${location || "Город"} · ${mood}`,
    roleLabels: matchedRoles.map((role) => role.label),
    skills: skillHints,
    query: finalQuery.trim(),
    originalPrompt: prompt.trim(),
    mode,
    jobType,
    location,
  };
}

async function fetchJson(url, options = {}) {
  const defaultUserAgent =
    process.env.HH_USER_AGENT ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": defaultUserAgent,
      Accept: "application/json",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Request failed with ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function fetchText(url, options = {}) {
  const defaultUserAgent =
    process.env.HH_USER_AGENT ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": defaultUserAgent,
      Accept: "*/*",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Request failed with ${response.status}: ${errorText}`);
  }

  return response.text();
}

function normalizeSalary(from, to, currency) {
  if (!from && !to) {
    return "Не указана";
  }

  const parts = [];
  if (from) parts.push(`от ${Number(from).toLocaleString("ru-RU")}`);
  if (to) parts.push(`до ${Number(to).toLocaleString("ru-RU")}`);
  return `${parts.join(" ")} ${currency || "₽"}`.trim();
}

async function searchHeadHunter(intent) {
  const searchUrl = new URL("https://api.hh.ru/vacancies");
  searchUrl.searchParams.set("text", intent.query || "дизайнер");
  searchUrl.searchParams.set("per_page", "12");
  searchUrl.searchParams.set("order_by", "publication_time");

  const data = await fetchJson(searchUrl.toString(), {
    headers: {
      Referer: "https://hh.ru/search/vacancy",
    },
  });
  return (data.items || []).map((item) => ({
    id: `hh-${item.id}`,
    source: "hh.ru",
    title: item.name,
    company: item.employer?.name || "Компания не указана",
    location: item.area?.name || intent.location || "Не указано",
    format: item.schedule?.name || (intent.mode === "remote" ? "Удаленно" : "Формат не указан"),
    salary: normalizeSalary(item.salary?.from, item.salary?.to, item.salary?.currency),
    url: item.alternate_url,
    snippet: item.snippet?.requirement || item.snippet?.responsibility || "Описание откроется на hh.ru",
    publishedAt: item.published_at,
  }));
}

function decodeJsSingleQuotedString(input) {
  return input
    .replace(/\\\\/g, "\\")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeHtmlEntities(input) {
  return String(input || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripTags(input) {
  return decodeHtmlEntities(String(input || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseHHWidgetPayload(scriptText) {
  const match = scriptText.match(/div\.innerHTML = '([\s\S]*?)'\s*\.replace\(/);
  if (!match) {
    throw new Error("Widget payload not found");
  }

  const html = decodeJsSingleQuotedString(match[1]);
  const jobs = [];
  const vacancyRegex =
    /<div class="hh-vacancy[\s\S]*?<a class="hh-vacancy__link[\s\S]*?href="([^"]+)"[\s\S]*?data-qa="title">[\s\S]*?([^<]+?)\s*<\/a>[\s\S]*?<span class="hh-vacancy__description[\s\S]*?>([\s\S]*?)<\/span>/g;

  let currentMatch;
  while ((currentMatch = vacancyRegex.exec(html)) !== null) {
    const [, url, title, descriptionHtml] = currentMatch;
    const description = stripTags(descriptionHtml);
    const salaryMatch = description.match(/(от\s[\d\s]+[^\s,]*|до\s[\d\s]+[^\s,]*|[\d\s]+\s?[₽$€₸])/i);
    jobs.push({
      id: `hh-widget-${jobs.length + 1}`,
      source: "hh.ru",
      title: decodeHtmlEntities(title).trim(),
      company: description.split(",").map((part) => part.trim()).filter(Boolean).slice(-1)[0] || "Компания не указана",
      location: "hh.ru",
      format: "Через HH",
      salary: salaryMatch ? salaryMatch[1].trim() : "Не указана",
      url,
      snippet: description || "Открой вакансию на hh.ru",
      publishedAt: new Date().toISOString(),
    });
  }

  return jobs;
}

async function searchHeadHunterWidget(intent) {
  const fallbackQueries = unique([
    intent.originalPrompt,
    [intent.roleLabels[0], intent.location].filter(Boolean).join(" "),
    intent.skills.slice(0, 3).join(" "),
    intent.mode === "remote"
      ? `${intent.roleLabels[0] || intent.skills[0] || "дизайн"} удаленно`
      : [intent.roleLabels[0] || intent.skills[0] || "работа", intent.location].filter(Boolean).join(" "),
  ]).filter((query) => query && query.trim().length > 1);

  const batches = await Promise.allSettled(
    fallbackQueries.slice(0, 3).map(async (query) => {
      const widgetUrl = new URL("https://api.hh.ru/widgets/vacancies/search");
      widgetUrl.searchParams.set("text", query);
      widgetUrl.searchParams.set("count", "6");
      widgetUrl.searchParams.set("debug_mode", "true");

      const scriptText = await fetchText(widgetUrl.toString(), {
        headers: {
          Referer: "https://dev.hh.ru/admin/widgets/search",
        },
      });

      return parseHHWidgetPayload(scriptText);
    })
  );

  const mergedJobs = [];
  batches.forEach((result) => {
    if (result.status === "fulfilled") {
      mergedJobs.push(...result.value);
    }
  });

  return Object.values(
    mergedJobs.reduce((acc, job) => {
      acc[job.url] = acc[job.url] || job;
      return acc;
    }, {})
  );
}

function buildFallbackJobs(intent) {
  const place = intent.mode === "remote" ? "Удаленно" : intent.location || "Город";
  const query = intent.query || intent.skills.join(" ") || "работа";
  const queryUrl = new URL("https://hh.ru/search/vacancy");
  queryUrl.searchParams.set("text", query);
  const remoteUrl = new URL("https://hh.ru/search/vacancy");
  remoteUrl.searchParams.set("text", `${query} удаленно`);
  const strictUrl = new URL("https://hh.ru/search/vacancy");
  strictUrl.searchParams.set("text", `${query} ${intent.location || ""}`.trim());

  return [
    {
      id: "fallback-1",
      source: "hh search",
      title: "Открыть поиск на hh.ru",
      company: "HeadHunter",
      location: place,
      format: intent.mode === "remote" ? "Удаленно" : "По городу",
      salary: "Живые результаты",
      url: queryUrl.toString(),
      snippet: `Запрос: ${query}. Это реальный поиск на hh.ru.`,
      publishedAt: new Date().toISOString(),
    },
    {
      id: "fallback-2",
      source: "hh search",
      title: intent.mode === "remote" ? "Удаленные вакансии hh.ru" : "Уточнить поиск hh.ru",
      company: "HeadHunter",
      location: place,
      format: intent.mode === "remote" ? "Удаленно" : "Город",
      salary: "Живые результаты",
      url: intent.mode === "remote" ? remoteUrl.toString() : strictUrl.toString(),
      snippet: intent.mode === "remote"
        ? "Открывает реальный удаленный поиск на hh.ru."
        : "Открывает поиск на hh.ru с уточнением по городу.",
      publishedAt: new Date().toISOString(),
    },
    {
      id: "fallback-3",
      source: "hh search",
      title: intent.jobType === "project" ? "Проектные запросы hh.ru" : "Еще один поиск hh.ru",
      company: "HeadHunter",
      location: place,
      format: intent.jobType === "project" ? "Проекты" : "Все вакансии",
      salary: "Живые результаты",
      url: strictUrl.toString(),
      snippet: "Запасной переход в настоящий поиск HH, если API не пропускает запрос.",
      publishedAt: new Date().toISOString(),
    },
  ];
}

function scoreJob(job, intent) {
  const haystack = tokenize([job.title, job.company, job.snippet, job.location].join(" ")).join(" ");
  let score = 0;

  intent.skills.forEach((skill) => {
    if (haystack.includes(skill.toLowerCase())) {
      score += 4;
    }
  });

  intent.roleLabels.forEach((role) => {
    if (haystack.includes(role.toLowerCase())) {
      score += 6;
    }
  });

  if (intent.mode === "remote" && haystack.includes("удален")) score += 3;
  if (intent.location && haystack.includes(intent.location.toLowerCase())) score += 2;
  if (job.source === "demo") score -= 2;
  return score;
}

async function aggregateJobs(payload) {
  const intent = parseIntent(payload);
  const jobs = [];
  const sourceMeta = [];
  let primaryFailed = false;

  try {
    const apiJobs = await searchHeadHunter(intent);
    jobs.push(...apiJobs);
    sourceMeta.push({ source: "hh.ru api", ok: true, count: apiJobs.length });
  } catch (error) {
    primaryFailed = true;
    sourceMeta.push({ source: "hh.ru api", ok: false, error: error.message });
  }

  if (!jobs.length) {
    try {
      const widgetJobs = await searchHeadHunterWidget(intent);
      jobs.push(...widgetJobs);
      sourceMeta.push({ source: "hh.ru widget", ok: true, count: widgetJobs.length });
    } catch (error) {
      sourceMeta.push({ source: "hh.ru widget", ok: false, error: error.message });
    }
  }

  const deduped = Object.values(
    jobs.reduce((acc, job) => {
      const key = `${job.title}-${job.company}`.toLowerCase();
      if (!acc[key]) acc[key] = job;
      return acc;
    }, {})
  );

  const ranked = deduped
    .map((job) => ({ ...job, score: scoreJob(job, intent) }))
    .sort((a, b) => b.score - a.score || String(b.publishedAt).localeCompare(String(a.publishedAt)));

  const finalJobs = ranked.length ? ranked.slice(0, 12) : buildFallbackJobs(intent);
  const fallbackUsed = !ranked.length;

  return {
    intent,
    jobs: finalJobs,
    meta: {
      fallbackUsed,
      primaryFailed,
      sources: sourceMeta,
      generatedAt: new Date().toISOString(),
    },
  };
}

function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  const normalized = path.normalize(filePath);

  if (!normalized.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(normalized, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Server error");
      return;
    }

    const ext = path.extname(normalized).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/search") {
    try {
      const payload = await safeReadJson(req);
      const result = await aggregateJobs(payload);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        error: "Не удалось найти вакансии",
        details: error.message,
      });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, now: new Date().toISOString() });
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res, requestUrl.pathname);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Magic Jobs MVP is running on http://${HOST}:${PORT}`);
  });
}

module.exports = {
  aggregateJobs,
  parseIntent,
  buildFallbackJobs,
  server,
};
