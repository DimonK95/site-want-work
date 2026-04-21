const form = document.getElementById("search-form");
const promptInput = document.getElementById("prompt");
const locationInput = document.getElementById("location");
const locationField = document.getElementById("location-field");
const summaryNode = document.getElementById("summary");
const magicBox = document.getElementById("magic-box");
const resultsMeta = document.getElementById("results-meta");
const resultsNode = document.getElementById("results");
const paginationNode = document.getElementById("pagination");
const template = document.getElementById("job-card-template");
const panelBadge = document.getElementById("panel-badge");
const heroPreviewTitle = document.getElementById("hero-preview-title");
const heroPreviewText = document.getElementById("hero-preview-text");

let currentMode = "remote";
let currentJobType = "all";
let hhWidgetNonce = 0;
let currentJobs = [];
let currentPage = 1;
const PAGE_SIZE = 5;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function syncLocationVisibility() {
  const hidden = currentMode === "remote";
  locationField.classList.toggle("is-hidden", hidden);
  if (hidden) {
    locationInput.value = "";
  }
}

document.querySelectorAll(".segmented__option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segmented__option").forEach((node) => node.classList.remove("is-active"));
    button.classList.add("is-active");
    currentMode = button.dataset.mode;
    syncLocationVisibility();
  });
});

document.querySelectorAll(".chip").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((node) => node.classList.remove("is-active"));
    button.classList.add("is-active");
    currentJobType = button.dataset.jobType;
  });
});

function renderMagic(intent) {
  const tags = [...intent.roleLabels, ...intent.skills].slice(0, 6);
  heroPreviewTitle.textContent = tags.join(" / ") || "свободный запрос";
  heroPreviewText.textContent = intent.summary;

  magicBox.innerHTML = `
    <div class="magic-summary">
      <p class="magic-summary__headline">${escapeHtml(intent.mood)}</p>
      <p class="magic-summary__text">${escapeHtml(intent.summary)}</p>
      <div class="magic-tags">
        ${tags.map((tag) => `<span class="magic-tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderMeta(meta) {
  panelBadge.textContent = meta.fallbackUsed ? "подборка hh" : "hh.ru";
  resultsMeta.textContent = meta.fallbackUsed
    ? "Вакансии загружены через официальный виджет hh.ru."
    : "Реальные вакансии hh.ru.";
}

function renderPagination() {
  paginationNode.innerHTML = "";
  const totalPages = Math.ceil(currentJobs.length / PAGE_SIZE);

  if (totalPages <= 1) {
    return;
  }

  const prevButton = document.createElement("button");
  prevButton.className = "pagination__button";
  prevButton.textContent = "Назад";
  prevButton.disabled = currentPage === 1;
  prevButton.addEventListener("click", () => {
    currentPage -= 1;
    renderJobs(currentJobs);
  });
  paginationNode.appendChild(prevButton);

  for (let page = 1; page <= totalPages; page += 1) {
    const pageButton = document.createElement("button");
    pageButton.className = `pagination__page${page === currentPage ? " is-active" : ""}`;
    pageButton.textContent = String(page);
    pageButton.addEventListener("click", () => {
      currentPage = page;
      renderJobs(currentJobs);
    });
    paginationNode.appendChild(pageButton);
  }

  const nextButton = document.createElement("button");
  nextButton.className = "pagination__button";
  nextButton.textContent = "Дальше";
  nextButton.disabled = currentPage === totalPages;
  nextButton.addEventListener("click", () => {
    currentPage += 1;
    renderJobs(currentJobs);
  });
  paginationNode.appendChild(nextButton);

  const status = document.createElement("div");
  status.className = "pagination__status";
  status.textContent = `Страница ${currentPage} из ${totalPages}`;
  paginationNode.appendChild(status);
}

function renderJobs(jobs) {
  resultsNode.classList.remove("results-grid--widget");
  resultsNode.innerHTML = "";
  currentJobs = jobs;

  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleJobs = jobs.slice(start, start + PAGE_SIZE);

  visibleJobs.forEach((job) => {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector(".job-card__source").textContent = job.source;
    fragment.querySelector("h3").textContent = job.title;
    fragment.querySelector(".job-card__company").textContent = job.company;
    fragment.querySelector(".job-card__details").textContent = `${job.location} · ${job.format} · ${job.salary}`;
    fragment.querySelector(".job-card__snippet").innerHTML = job.snippet;
    fragment.querySelector(".job-card__score").textContent =
      typeof job.score === "number" ? `Соответствие ${Math.max(72, 72 + job.score)}%` : "Соответствие";
    fragment.querySelector(".job-card__link").href = job.url;
    resultsNode.appendChild(fragment);
  });

  renderPagination();
}

function buildWidgetQuery(intent) {
  const parts = [];

  if (intent.query) {
    parts.push(intent.query);
  } else if (promptInput.value.trim()) {
    parts.push(promptInput.value.trim());
  }

  if (currentMode === "city" && locationInput.value.trim()) {
    parts.push(locationInput.value.trim());
  }

  return parts.filter(Boolean).join(" ");
}

function renderHHWidget(intent) {
  const query = buildWidgetQuery(intent);
  const widgetUrl = new URL("https://api.hh.ru/widgets/vacancies/search");
  widgetUrl.searchParams.set("text", query || "дизайнер");
  widgetUrl.searchParams.set("debug_mode", "true");

  resultsNode.classList.add("results-grid--widget");
  resultsNode.innerHTML = '<div class="hh-widget-host" id="hh-widget-host"></div>';

  const host = document.getElementById("hh-widget-host");
  const script = document.createElement("script");
  script.className = "hh-script";
  script.async = true;
  script.dataset.widgetId = String(++hhWidgetNonce);
  script.src = widgetUrl.toString();
  host.appendChild(script);
  paginationNode.innerHTML = "";
}

function setLoadingState() {
  summaryNode.textContent = "Ищу";
  panelBadge.textContent = "поиск";
  magicBox.innerHTML = `
    <div class="magic-box__state">
      <div class="pulse"></div>
      <p>Ищу вакансии...</p>
    </div>
  `;
  resultsMeta.textContent = "";
  resultsNode.classList.remove("results-grid--widget");
  resultsNode.innerHTML = "";
  paginationNode.innerHTML = "";
  currentJobs = [];
  currentPage = 1;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoadingState();

  const payload = {
    prompt: promptInput.value.trim(),
    location: locationInput.value.trim(),
    mode: currentMode,
    jobType: currentJobType,
  };

  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Search request failed");
    }

    const data = await response.json();
    summaryNode.textContent = data.intent.summary;
    renderMagic(data.intent);
    renderMeta(data.meta);
    currentPage = 1;
    if (data.meta.fallbackUsed) {
      renderHHWidget(data.intent);
    } else {
      renderJobs(data.jobs);
    }
  } catch (error) {
    panelBadge.textContent = "ошибка";
    magicBox.innerHTML = `
      <div class="magic-box__state">
        <div class="pulse"></div>
        <p>Ошибка поиска.</p>
      </div>
    `;
    resultsMeta.textContent = "Попробуй еще раз.";
    resultsNode.classList.remove("results-grid--widget");
    resultsNode.innerHTML = "";
    paginationNode.innerHTML = "";
  }
});

syncLocationVisibility();
