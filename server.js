const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
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
    widgetTerms: ["дизайнер", "графический дизайнер", "веб-дизайнер", "ui ux дизайнер"],
    words: ["дизайн", "баннер", "бренд", "лендинг", "figma", "ui", "ux", "график", "иллюстр"],
  },
  {
    id: "management",
    label: "Менеджмент",
    query: "project manager OR product manager OR team lead OR delivery manager",
    widgetTerms: ["project manager", "product manager", "руководитель", "тимлид"],
    words: ["руковод", "менедж", "lead", "лид", "управ", "product", "project", "delivery"],
  },
  {
    id: "frontend",
    label: "Frontend",
    query: "frontend OR react OR javascript OR typescript",
    widgetTerms: ["frontend", "react developer", "frontend developer", "javascript"],
    words: ["frontend", "react", "javascript", "typescript", "верст", "фронтенд"],
  },
  {
    id: "backend",
    label: "Backend",
    query: "backend OR node.js OR python OR golang OR java",
    widgetTerms: ["backend", "node.js", "python developer", "backend developer"],
    words: ["backend", "node", "python", "golang", "java", "бекенд", "api", "сервер"],
  },
  {
    id: "marketing",
    label: "Маркетинг",
    query: "marketing OR performance marketing OR smm OR content manager",
    widgetTerms: ["маркетолог", "performance marketing", "smm", "контент-менеджер"],
    words: ["маркет", "smm", "контент", "трафик", "реклама", "brand", "seo"],
  },
  {
    id: "copywriting",
    label: "Тексты",
    query: "copywriter OR content writer OR editor",
    widgetTerms: ["копирайтер", "редактор", "content writer", "автор"],
    words: ["копирай", "редакт", "текст", "writer", "editor", "контент"],
  },
  {
    id: "analytics",
    label: "Аналитика",
    query: "analyst OR data analyst OR business analyst",
    widgetTerms: ["аналитик", "data analyst", "business analyst", "sql analyst"],
    words: ["аналит", "sql", "дашборд", "bi", "данн", "excel"],
  },
  {
    id: "sales",
    label: "Продажи",
    query: "sales manager OR account manager OR business development",
    widgetTerms: ["менеджер по продажам", "sales manager", "account manager"],
    words: ["продаж", "sales", "account", "bizdev", "аккаунт"],
  },
];

const ROLE_BLACKLISTS = {
  design: ["продав", "sales", "кассир", "мерчендайзер", "оператор call", "кладовщик"],
  management: ["кассир", "курьер", "продав", "оператор склада"],
  frontend: ["продав", "кассир", "оператор", "менеджер по продажам"],
  backend: ["продав", "кассир", "оператор", "дизайнер"],
  marketing: ["кассир", "кладовщик", "продавец-консультант"],
  copywriting: ["продав", "кассир", "оператор склада"],
  analytics: ["продав", "кассир", "дизайнер"],
  sales: [],
};

const EXACT_TECH_RULES = [
  {
    name: "c++",
    include: ["c++", "cpp", "c plus plus", "qt", "stl", "boost"],
    strongInclude: ["c++", "cpp", "c plus plus"],
    exclude: ["c#", ".net", "asp.net", "1c", "1с", "unity"],
  },
  {
    name: "c#",
    include: ["c#", ".net", "asp.net", "dotnet"],
    strongInclude: ["c#", ".net", "asp.net", "dotnet"],
    exclude: ["c++", "cpp", "1c", "1с"],
  },
  {
    name: "1c",
    include: ["1c", "1с"],
    strongInclude: ["1c", "1с"],
    exclude: ["c++", "cpp", "c#", ".net"],
  },
  {
    name: "python",
    include: ["python", "django", "fastapi", "flask"],
    strongInclude: ["python"],
    exclude: ["1c", "1с"],
  },
  {
    name: "java",
    include: ["java", "spring"],
    strongInclude: ["java", "spring"],
    exclude: ["javascript"],
  },
  {
    name: "javascript",
    include: ["javascript", "js", "node.js", "nodejs", "react", "vue"],
    strongInclude: ["javascript", "node.js", "nodejs", "react", "vue"],
    exclude: ["java"],
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

function normalizeTechAliases(text) {
  return String(text || "")
    .replace(/[Сс](?=\+\+)/g, "C")
    .replace(/[Сс](?=#)/g, "C")
    .replace(/1[Сс]/g, "1C")
    .replace(/[Сс]\s*\+\+/g, "C++")
    .replace(/[Сс]\s*#/g, "C#")
    .replace(/джаваскрипт/gi, "javascript")
    .replace(/яваскрипт/gi, "javascript")
    .replace(/джава/gi, "java")
    .replace(/жава/gi, "java")
    .replace(/питон/gi, "python")
    .replace(/шарп/gi, "c#")
    .replace(/си плюс плюс/gi, "c++")
    .replace(/плюсы/gi, "c++");
}

function detectExactTechs(text) {
  const haystack = ` ${normalizeTechAliases(text).toLowerCase()} `;
  return EXACT_TECH_RULES.filter((rule) =>
    rule.strongInclude.some((token) => haystack.includes(` ${token} `) || haystack.includes(token))
  );
}

function parseIntent({ prompt = "", location = "", mode = "remote", jobType = "all" }) {
  const normalizedPrompt = normalizeTechAliases(prompt);
  const tokens = tokenize([normalizedPrompt, location].join(" "));
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
    exactTechs: detectExactTechs(normalizedPrompt),
    query: finalQuery.trim(),
    originalPrompt: normalizedPrompt.trim(),
    mode,
    jobType,
    location,
  };
}

async function fetchJson(url, options = {}) {
  const defaultUserAgent =
    process.env.HH_USER_AGENT ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
  const timeoutMs = options.timeoutMs || 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      "User-Agent": defaultUserAgent,
      Accept: "application/json",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      ...(options.headers || {}),
    },
  });
  clearTimeout(timeoutId);

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
  const timeoutMs = options.timeoutMs || 8000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, {
    ...options,
    signal: controller.signal,
    headers: {
      "User-Agent": defaultUserAgent,
      Accept: "*/*",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      ...(options.headers || {}),
    },
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Request failed with ${response.status}: ${errorText}`);
  }

  return response.text();
}

async function retry(operation, attempts = 3, delayMs = 500) {
  let lastError;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (index < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (index + 1)));
      }
    }
  }

  throw lastError;
}

async function enrichIntentWithAI(intent) {
  if (!process.env.OPENAI_API_KEY) {
    return intent;
  }

  const response = await retry(async () => {
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Ты разбираешь поисковый запрос для вакансий. Верни только JSON без markdown. Нужны поля: role_labels (массив строк), must_have_terms (массив строк), should_have_terms (массив строк), exclude_terms (массив строк), summary (строка). Если пользователь указал конкретный стек, например C++, Java, Python, 1C, C#, то must_have_terms должны включать только этот стек и exclude_terms должны включать близкие, но неверные стеки.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  prompt: intent.originalPrompt,
                  mode: intent.mode,
                  location: intent.location,
                  roleLabels: intent.roleLabels,
                  skills: intent.skills,
                  exactTechs: intent.exactTechs.map((rule) => rule.name),
                }),
              },
            ],
          },
        ],
      }),
    });

    if (!apiResponse.ok) {
      const text = await apiResponse.text();
      throw new Error(`OpenAI failed with ${apiResponse.status}: ${text}`);
    }

    return apiResponse.json();
  }, 2, 700);

  const outputText =
    response.output_text ||
    response.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("") ||
    "";

  try {
    const parsed = JSON.parse(outputText);
    return {
      ...intent,
      roleLabels: unique([...(intent.roleLabels || []), ...((parsed.role_labels || []).filter(Boolean))]),
      mustHaveTerms: unique(parsed.must_have_terms || []),
      shouldHaveTerms: unique(parsed.should_have_terms || []),
      excludeTerms: unique(parsed.exclude_terms || []),
      summary: parsed.summary || intent.summary,
    };
  } catch {
    return intent;
  }
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
    snippet: cleanSnippetText(
      item.snippet?.requirement || item.snippet?.responsibility || "Описание откроется на hh.ru",
      item.employer?.name || "",
      normalizeSalary(item.salary?.from, item.salary?.to, item.salary?.currency)
    ),
    requirement: item.snippet?.requirement || "",
    responsibility: item.snippet?.responsibility || "",
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

function truncateText(text, maxLength = 120) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function truncateToSentence(text, maxLength = 120) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= maxLength) return clean;

  const withinLimit = clean.slice(0, maxLength);
  const punctuationIndex = Math.max(
    withinLimit.lastIndexOf("."),
    withinLimit.lastIndexOf("!"),
    withinLimit.lastIndexOf("?")
  );

  if (punctuationIndex >= 20) {
    return withinLimit.slice(0, punctuationIndex + 1).trim();
  }

  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [];
  const firstSentence = sentences.find((sentence) => sentence.trim().length > 20);
  if (firstSentence) {
    return firstSentence.trim();
  }

  return truncateText(clean, maxLength);
}

function formatTaskSummary(text) {
  const clean = stripTags(text)
    .replace(/^требования?:?\s*/i, "")
    .replace(/^обязанности?:?\s*/i, "")
    .replace(/^задачи:?\s*/i, "")
    .trim();
  return truncateText(clean, 132);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanSnippetText(text, company = "", salary = "") {
  let clean = stripTags(text);
  if (!clean) return "";

  if (salary) {
    clean = clean.replace(new RegExp(escapeRegExp(salary), "gi"), " ");
  }

  if (company) {
    clean = clean.replace(new RegExp(escapeRegExp(company), "gi"), " ");
  }

  clean = clean
    .replace(/\b(от|до)\s*\d[\d\s.,]*[₽$€₸]?/gi, " ")
    .replace(/[\d\s]+[₽$€₸]/g, " ")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return clean;
}

function inferBusinessArea(text) {
  const haystack = normalizeTechAliases(text).toLowerCase();

  if (/(c\+\+|cpp|c#|\.net|java|spring|python|django|flask|fastapi|backend|frontend|react|node|golang|developer|разработ)/.test(haystack)) {
    return "ИТ и разработка";
  }
  if (/(designer|дизайн|ui|ux|figma|баннер|бренд|графич|иллюстр|лендинг)/.test(haystack)) {
    return "Дизайн и digital";
  }
  if (/(marketing|маркет|smm|seo|трафик|контент|brand)/.test(haystack)) {
    return "Маркетинг и продвижение";
  }
  if (/(аналит|sql|bi|data|дашборд|excel)/.test(haystack)) {
    return "Аналитика и данные";
  }
  if (/(sales|продаж|account|bizdev|аккаунт)/.test(haystack)) {
    return "Продажи и развитие";
  }
  if (/(manager|менедж|руковод|lead|product|project|delivery)/.test(haystack)) {
    return "Управление и координация";
  }
  if (/(копирай|редактор|текст|writer|editor|контент)/.test(haystack)) {
    return "Контент и тексты";
  }

  return "Команда и продукт";
}

function buildCompanyActivity({ company, title, snippet, intent }) {
  return truncateToSentence(
    inferBusinessArea([title, snippet, intent?.originalPrompt].join(" ")),
    96
  );
}

function buildTaskLine({ title, snippet }) {
  const fromSnippet = formatTaskSummary(snippet);
  if (fromSnippet) return fromSnippet;
  return truncateText(`Рабочие задачи по роли «${title}». Подробности откроются на hh.ru.`, 132);
}

function enrichJobCard(job, intent) {
  return {
    ...job,
    companyInfo: buildCompanyActivity({
      company: job.company,
      title: job.title,
      snippet: job.snippet,
      intent,
    }),
    responsibilities: buildTaskLine({
      title: job.title,
      snippet: job.responsibility || job.requirement || job.snippet,
    }),
  };
}

function buildHeuristicVacancySummary({ company, title, companyText, descriptionText, snippet }) {
  const companyLine = pickCompanyLine(companyText, company);
  const taskLine = pickTaskLine(descriptionText || snippet || "", title);

  if (companyLine && taskLine) {
    return truncateText(`${companyLine} Сейчас нужен человек, который ${taskLine.charAt(0).toLowerCase()}${taskLine.slice(1)}`, 170);
  }
  if (taskLine) {
    return truncateText(taskLine, 170);
  }
  if (companyLine) {
    return truncateText(companyLine, 170);
  }
  return "";
}

function extractVacancyId(job) {
  const fromId = String(job.id || "").match(/(\d+)/);
  if (fromId) return fromId[1];
  const fromUrl = String(job.url || "").match(/vacancy\/(\d+)/);
  return fromUrl ? fromUrl[1] : "";
}

function extractJsonLdDescription(html) {
  const scripts = String(html || "").match(/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const raw = script.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const jobPosting = items.find((item) => item && (item["@type"] === "JobPosting" || item["@type"] === "Organization"));
      if (jobPosting?.description) return stripTags(jobPosting.description);
      if (jobPosting?.hiringOrganization?.description) return stripTags(jobPosting.hiringOrganization.description);
    } catch {}
  }
  return "";
}

function extractMetaDescription(html) {
  const match = String(html || "").match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"]+)["']/i);
  return match ? stripTags(match[1]) : "";
}

function pickCompanyLine(text, company) {
  const clean = stripTags(text);
  if (!clean) return "";
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const companyPattern = new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const preferred = sentences.find((line) =>
    line.length > 30 &&
    line.length < 150 &&
    (companyPattern.test(line) || /(компан|продукт|сервис|платформ|студ|агентств|банк|маркетплейс|финтех|ритейл|команда)/i.test(line))
  );
  return truncateToSentence(preferred || "", 108);
}

function pickTaskLine(text, title) {
  const clean = stripTags(text);
  if (!clean) return "";
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const preferred = sentences.find((line) =>
    line.length > 30 &&
    line.length < 170 &&
    /(разработ|созда|поддерж|улучш|вести|проектир|аналити|рисова|верста|писат|тестир|автоматиз|коммуниц|управля|сопровож)/i.test(line)
  );
  if (preferred) return truncateText(preferred, 132);
  return buildTaskLine({ title, snippet: clean });
}

async function fetchVacancyDetails(job) {
  if (job.source !== "hh.ru" || !job.url || String(job.url).includes("/search/")) {
    return {};
  }

  const vacancyId = extractVacancyId(job);
  let descriptionText = "";
  let companyText = "";

  if (vacancyId) {
    try {
      const detail = await fetchJson(`https://api.hh.ru/vacancies/${vacancyId}`, {
        headers: {
          Referer: job.url,
        },
        timeoutMs: 8000,
      });
      descriptionText = stripTags(detail.description || "");
      companyText = stripTags(detail.employer?.description || "");
    } catch {}
  }

  if (!descriptionText || !companyText) {
    try {
      const html = await fetchText(job.url, {
        headers: {
          Referer: "https://hh.ru/search/vacancy",
        },
        timeoutMs: 8000,
      });
      descriptionText = descriptionText || extractJsonLdDescription(html) || extractMetaDescription(html);
      companyText = companyText || extractJsonLdDescription(html);
    } catch {}
  }

  return {
    descriptionText,
    companyText,
  };
}

async function hydrateJobs(jobs, intent) {
  const topJobs = jobs.slice(0, 6);
  const detailsByUrl = new Map();

  await Promise.allSettled(
    topJobs.map(async (job) => {
      const details = await fetchVacancyDetails(job);
      detailsByUrl.set(job.url, details);
    })
  );

  return jobs.map((job) => {
    const details = detailsByUrl.get(job.url) || {};
    const companyInfo =
      job.source === "hh.ru"
        ? truncateToSentence(
            pickCompanyLine(details.companyText || details.descriptionText || "", job.company) ||
              buildCompanyActivity({
                company: job.company,
                title: job.title,
                snippet: details.descriptionText || job.snippet,
                intent,
              }),
            72
          )
        : "";

    return {
      ...enrichJobCard(job, intent),
      companyInfo,
      responsibilities: "",
      vacancySummary: "",
      companyTag: "",
    };
  });
}

function buildWidgetQueries(intent) {
  const matchedRoles = ROLE_PATTERNS.filter((role) => intent.roleLabels.includes(role.label));
  const roleTerms = matchedRoles.flatMap((role) => role.widgetTerms || []);
  const skillTerms = intent.skills.filter((skill) => skill.length > 3);
  const exactTerms = intent.exactTechs.flatMap((rule) => rule.strongInclude.slice(0, 2));
  const mustHaveTerms = intent.mustHaveTerms || [];
  const shouldHaveTerms = intent.shouldHaveTerms || [];
  const locationSuffix = intent.mode === "remote" ? " удаленно" : intent.location ? ` ${intent.location}` : "";

  return unique([
    ...mustHaveTerms.map((term) => `${term}${locationSuffix}`.trim()),
    ...shouldHaveTerms.map((term) => `${term}${locationSuffix}`.trim()),
    ...exactTerms.map((term) => `${term}${locationSuffix}`.trim()),
    ...roleTerms.map((term) => `${term}${locationSuffix}`.trim()),
    `${(roleTerms[0] || skillTerms[0] || intent.originalPrompt || "работа").trim()}${locationSuffix}`.trim(),
    `${skillTerms.slice(0, 2).join(" ")}${locationSuffix}`.trim(),
    intent.originalPrompt,
    intent.location && intent.mode !== "remote" ? `${skillTerms[0] || roleTerms[0] || "работа"} ${intent.location}`.trim() : "",
  ]).filter((query) => query && query.trim().length > 1);
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
      format: "",
      salary: salaryMatch ? salaryMatch[1].trim() : "Не указана",
      url,
      snippet: cleanSnippetText(
        description || "Открой вакансию на hh.ru",
        description.split(",").map((part) => part.trim()).filter(Boolean).slice(-1)[0] || "",
        salaryMatch ? salaryMatch[1].trim() : ""
      ),
      requirement: "",
      responsibility: "",
      publishedAt: new Date().toISOString(),
    });
  }

  return jobs;
}

async function searchHeadHunterWidget(intent) {
  const fallbackQueries = buildWidgetQueries(intent);

  const batches = await Promise.allSettled(
    fallbackQueries.slice(0, 4).map(async (query) => {
      const widgetUrl = new URL("https://api.hh.ru/widgets/vacancies/search");
      widgetUrl.searchParams.set("text", query);
      widgetUrl.searchParams.set("count", "6");
      widgetUrl.searchParams.set("debug_mode", "true");

      const scriptText = await retry(
        () =>
          fetchText(widgetUrl.toString(), {
            headers: {
              Referer: "https://dev.hh.ru/admin/widgets/search",
            },
            timeoutMs: 8000,
          }),
        3,
        600
      );

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
      requirement: "",
      responsibility: "",
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
      requirement: "",
      responsibility: "",
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
      requirement: "",
      responsibility: "",
      publishedAt: new Date().toISOString(),
    },
  ];
}

function scoreJob(job, intent) {
  const haystackTokens = tokenize([job.title, job.company, job.snippet, job.location].join(" "));
  const haystack = haystackTokens.join(" ");
  const titleText = tokenize(job.title).join(" ");
  const matchedRoles = ROLE_PATTERNS.filter((role) => intent.roleLabels.includes(role.label));
  let score = 0;

  intent.exactTechs.forEach((rule) => {
    const hasStrongInclude = rule.strongInclude.some((token) => haystack.includes(token));
    const hasInclude = rule.include.some((token) => haystack.includes(token));
    const hasExclude = rule.exclude.some((token) => haystack.includes(token));

    if (hasStrongInclude) score += 40;
    else if (hasInclude) score += 18;
    else score -= 35;

    if (hasExclude) score -= 45;
  });

  intent.skills.forEach((skill) => {
    if (haystack.includes(skill.toLowerCase())) {
      score += 5;
    }
  });

  matchedRoles.forEach((role) => {
    role.words.forEach((word) => {
      if (titleText.includes(word) || haystack.includes(word)) {
        score += titleText.includes(word) ? 12 : 6;
      }
    });
  });

  if (intent.mode === "remote" && haystack.includes("удален")) score += 3;
  if (intent.location && haystack.includes(intent.location.toLowerCase())) score += 2;
  if (job.source === "demo") score -= 8;

  (intent.mustHaveTerms || []).forEach((term) => {
    if (haystack.includes(term.toLowerCase())) score += 35;
    else score -= 40;
  });

  (intent.shouldHaveTerms || []).forEach((term) => {
    if (haystack.includes(term.toLowerCase())) score += 10;
  });

  (intent.excludeTerms || []).forEach((term) => {
    if (haystack.includes(term.toLowerCase())) score -= 50;
  });

  matchedRoles.forEach((role) => {
    (ROLE_BLACKLISTS[role.id] || []).forEach((blackWord) => {
      if (haystack.includes(blackWord)) {
        score -= 15;
      }
    });
  });

  if (matchedRoles.length && matchedRoles.every((role) => !role.words.some((word) => haystack.includes(word)))) {
    score -= 10;
  }

  return score;
}

async function aggregateJobs(payload) {
  const intent = await enrichIntentWithAI(parseIntent(payload));
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

  const relevantJobs = ranked.filter((job) => {
    if (intent.exactTechs.length) {
      return job.score >= 15;
    }
    if (intent.roleLabels.length) {
      return job.score >= 2;
    }
    return true;
  });
  const finalJobs = await hydrateJobs(
    relevantJobs.length ? relevantJobs.slice(0, 20) : buildFallbackJobs(intent),
    intent
  );
  const fallbackUsed = !relevantJobs.length;

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
      const result = await retry(() => aggregateJobs(payload), 2, 900);
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
