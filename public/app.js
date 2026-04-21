const summaryNode = document.getElementById("summary");
const magicBox = document.getElementById("magic-box");
const resultsMeta = document.getElementById("results-meta");
const resultsNode = document.getElementById("results");
const paginationNode = document.getElementById("pagination");
const template = document.getElementById("job-card-template");
const panelBadge = document.getElementById("panel-badge");
const chatMessages = document.getElementById("chat-messages");
const chatRestart = document.getElementById("chat-restart");

const PAGE_SIZE = 5;

let currentJobs = [];
let currentPage = 1;
let typingRunId = 0;

const conversation = {
  mode: null,
  location: "",
  jobType: null,
  prompt: "",
};

const loadingMessages = [
  {
    title: "Смотрю вакансии",
    text: "Робот полез в hh.ru и делает очень умное лицо.",
    subtext: "Проверяю, где спрятались нормальные совпадения",
  },
  {
    title: "Подбираю точнее",
    text: "Отгоняю C# от C++ и продавцов от дизайнеров.",
    subtext: "Собираю самые близкие вакансии",
  },
  {
    title: "Колдую поиск",
    text: "ИИ шуршит шестеренками и спорит с релевантностью.",
    subtext: "Еще чуть-чуть и покажу результат",
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clearChatControls() {
  const controls = chatMessages.querySelectorAll("[data-chat-control='true']");
  controls.forEach((node) => node.remove());
}

function addMessage(role, text) {
  const node = document.createElement("div");
  node.className = `chat-message chat-message--${role}`;
  node.innerHTML = `<div class="chat-bubble">${escapeHtml(text)}</div>`;
  chatMessages.appendChild(node);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return node;
}

function addBotQuestion(question, hint = "") {
  const node = document.createElement("div");
  node.className = "chat-message chat-message--bot";
  node.dataset.chatControl = "true";
  node.innerHTML = `
    <div class="chat-bubble">
      <span class="chat-bubble__label">Вопрос</span>
      <div>${escapeHtml(question)}</div>
      ${hint ? `<div class="chat-poll__hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;
  chatMessages.appendChild(node);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return node;
}

function setOptions(question, options) {
  clearChatControls();
  const node = addBotQuestion(question, "Выберите один вариант.");
  const bubble = node.querySelector(".chat-bubble");
  const poll = document.createElement("div");
  poll.className = "chat-poll";

  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-poll__option";
    button.textContent = option.label;
    button.addEventListener("click", () => {
      addMessage("user", option.label);
      clearChatControls();
      option.onSelect();
    });
    poll.appendChild(button);
  });

  bubble.appendChild(poll);
}

function setTextInput(question, config) {
  clearChatControls();
  const node = addBotQuestion(question);
  const bubble = node.querySelector(".chat-bubble");

  const wrapper = document.createElement("div");
  wrapper.className = "chat-input-wrap";
  wrapper.dataset.chatControl = "true";
  wrapper.innerHTML = `
    <input class="chat-input" type="text" placeholder="${escapeHtml(config.placeholder || "")}" />
    <button type="button" class="cta cta--small">${escapeHtml(config.buttonLabel || "Продолжить")}</button>
  `;

  const input = wrapper.querySelector("input");
  const button = wrapper.querySelector("button");

  const submit = () => {
    const value = input.value.trim();
    if (!value) return;
    addMessage("user", value);
    clearChatControls();
    config.onSubmit(value);
  };

  button.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submit();
  });

  bubble.appendChild(wrapper);
  input.focus();
}

function setTextareaInput(question, config) {
  clearChatControls();
  const node = addBotQuestion(question, "Напишите свободно, как сказали бы человеку.");
  const bubble = node.querySelector(".chat-bubble");

  const wrapper = document.createElement("div");
  wrapper.className = "chat-input-wrap chat-input-wrap--textarea";
  wrapper.dataset.chatControl = "true";
  wrapper.innerHTML = `
    <textarea class="chat-input chat-input--textarea" rows="6" placeholder="${escapeHtml(config.placeholder || "")}"></textarea>
    <button type="button" class="cta">${escapeHtml(config.buttonLabel || "Найти")}</button>
  `;

  const textarea = wrapper.querySelector("textarea");
  const button = wrapper.querySelector("button");

  const submit = () => {
    const value = textarea.value.trim();
    if (!value) return;
    addMessage("user", value);
    clearChatControls();
    config.onSubmit(value);
  };

  button.addEventListener("click", submit);
  bubble.appendChild(wrapper);
  textarea.focus();
}

function restartConversation() {
  conversation.mode = null;
  conversation.location = "";
  conversation.jobType = null;
  conversation.prompt = "";
  chatMessages.innerHTML = "";
  clearChatControls();
  currentJobs = [];
  currentPage = 1;
  resultsNode.innerHTML = "";
  paginationNode.innerHTML = "";
  resultsMeta.textContent = "";
  summaryNode.textContent = "Пока пусто";
  panelBadge.textContent = "hh.ru";
  magicBox.innerHTML = `
    <div class="magic-box__state">
      <div class="pulse"></div>
      <p>Начнем с короткого диалога.</p>
    </div>
  `;
  askPromptFirst();
}

function askPromptFirst() {
  setTextareaInput("Что вы умеете лучше всего?", {
    placeholder: "Например: программирую на С++, делаю backend, люблю сложную логику",
    buttonLabel: "Продолжить",
    onSubmit: (value) => {
      conversation.prompt = value;
      askMode();
    },
  });
}

function askMode() {
  setOptions("Где хотите работать?", [
    {
      label: "Удаленно",
      onSelect: () => {
        conversation.mode = "remote";
        askJobType();
      },
    },
    {
      label: "В моем городе",
      onSelect: () => {
        conversation.mode = "city";
        askLocation();
      },
    },
  ]);
}

function askLocation() {
  setTextInput("Напишите ваш город.", {
    placeholder: "Москва",
    buttonLabel: "Продолжить",
    onSubmit: (value) => {
      conversation.location = value;
      askJobType();
    },
  });
}

function askJobType() {
  setOptions("Какой тип работы вам нужен?", [
    {
      label: "Любой формат",
      onSelect: () => {
        conversation.jobType = "all";
        runSearch();
      },
    },
    {
      label: "Проекты",
      onSelect: () => {
        conversation.jobType = "project";
        runSearch();
      },
    },
    {
      label: "Full-time",
      onSelect: () => {
        conversation.jobType = "fulltime";
        runSearch();
      },
    },
  ]);
}

function renderMeta(meta) {
  panelBadge.textContent = meta.fallbackUsed ? "поиск hh" : "hh.ru";
  resultsMeta.textContent = meta.fallbackUsed
    ? "Точных карточек не хватило, показаны прямые переходы в поиск hh.ru."
    : "Реальные вакансии hh.ru, отсортированные по близости.";
}

function renderPagination() {
  paginationNode.innerHTML = "";
  const totalPages = Math.ceil(currentJobs.length / PAGE_SIZE);
  if (totalPages <= 1) return;

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

async function typeText(node, text, speed = 18) {
  const runId = ++typingRunId;
  node.textContent = "";
  for (const char of text) {
    if (runId !== typingRunId) return;
    node.textContent += char;
    await new Promise((resolve) => setTimeout(resolve, speed));
  }
}

async function renderMagic(intent) {
  const tags = [...intent.roleLabels, ...intent.skills].slice(0, 6);
  magicBox.innerHTML = `
    <div class="magic-summary">
      <p class="magic-summary__headline">${escapeHtml(intent.mood)}</p>
      <p class="magic-summary__text">${escapeHtml(intent.summary)}</p>
      <div class="magic-tags" id="magic-tags"></div>
    </div>
  `;

  const tagsNode = document.getElementById("magic-tags");
  tagsNode.innerHTML = tags.map((tag) => `<span class="magic-tag">${escapeHtml(tag)}</span>`).join("");
}

function setLoadingState() {
  const loadingState = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
  summaryNode.textContent = "Подходящие вакансии";
  panelBadge.textContent = "поиск";
  resultsMeta.textContent = "";
  resultsNode.innerHTML = "";
  paginationNode.innerHTML = "";
  currentJobs = [];
  currentPage = 1;
  typingRunId += 1;
  magicBox.innerHTML = `
    <div class="magic-box__state magic-box__state--loading">
      <div class="loader-bot" aria-hidden="true">
        <div class="loader-bot__eyes">
          <span class="loader-bot__eye"></span>
          <span class="loader-bot__eye"></span>
        </div>
        <div class="loader-bot__mouth"></div>
      </div>
      <div class="loader-copy">
        <p class="loader-copy__title">${escapeHtml(loadingState.title)}</p>
        <p>${escapeHtml(loadingState.text)}</p>
        <p class="loader-copy__sub">${escapeHtml(loadingState.subtext)}<span class="loading-dots"><span></span><span></span><span></span></span></p>
      </div>
    </div>
  `;
}

async function fetchSearch(payload, attempts = 2) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error("Search request failed");
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

async function runSearch() {
  setLoadingState();

  const payload = {
    prompt: conversation.prompt,
    location: conversation.location,
    mode: conversation.mode,
    jobType: conversation.jobType,
  };

  try {
    const data = await fetchSearch(payload, 3);
    summaryNode.textContent = "Подходящие вакансии";
    renderMeta(data.meta);
    currentPage = 1;
    await renderMagic(data.intent);
    renderJobs(data.jobs);
    addMessage("bot", "Готово. Ниже показал самые близкие вакансии.");
  } catch (error) {
    panelBadge.textContent = "ошибка";
    magicBox.innerHTML = `
      <div class="magic-box__state">
        <div class="pulse"></div>
        <p>Поиск временно не ответил. Попробуй еще раз.</p>
      </div>
    `;
    resultsMeta.textContent = "Источник не ответил вовремя.";
    resultsNode.innerHTML = "";
    paginationNode.innerHTML = "";
    addMessage("bot", "Не получилось получить вакансии. Нажми «Начать заново» и попробуем еще раз.");
  }
}

chatRestart.addEventListener("click", restartConversation);

restartConversation();
