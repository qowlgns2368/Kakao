const PROFILE_ID_KEY = "class-3-1-author-id";
const PROFILE_NAME_KEY = "class-3-1-author-name";
const DEFAULT_ROOM_SLUG = "class-3-1-passion-on";
const DEFAULT_ROOM_LABEL = "3-1반 열정 ON!";
const DEFAULT_POLL_INTERVAL = 4000;

const palette = [
  ["#f0a43e", "#db6b10"],
  ["#8db7ff", "#5076d2"],
  ["#76c4a9", "#2b8e71"],
  ["#f6a8b5", "#df6a86"],
  ["#c7a2ff", "#8461d4"]
];

const config = window.CHAT_CONFIG || {};
const isConfigured = Boolean(
  typeof config.supabaseUrl === "string" &&
  config.supabaseUrl.startsWith("https://") &&
  typeof config.supabasePublishableKey === "string" &&
  config.supabasePublishableKey &&
  !config.supabasePublishableKey.includes("YOUR_")
);

const roomSlug = config.roomSlug || DEFAULT_ROOM_SLUG;
const roomLabel = config.roomLabel || DEFAULT_ROOM_LABEL;
const pollIntervalMs = Number(config.pollIntervalMs) > 999 ? Number(config.pollIntervalMs) : DEFAULT_POLL_INTERVAL;

const messageList = document.querySelector("#messageList");
const emptyState = document.querySelector("#emptyState");
const emptyText = document.querySelector("#emptyText");
const emptyRefreshButton = document.querySelector("#emptyRefreshButton");
const roomBadge = document.querySelector("#roomBadge");
const messageForm = document.querySelector("#messageForm");
const messageInput = document.querySelector("#messageInput");
const authorStatus = document.querySelector("#authorStatus");
const profileButton = document.querySelector("#profileButton");
const profileButtonText = document.querySelector("#profileButtonText");
const syncStatus = document.querySelector("#syncStatus");
const sendButton = document.querySelector("#sendButton");
const scrollBottomButton = document.querySelector("#scrollBottomButton");
const focusInputButton = document.querySelector("#focusInputButton");
const emojiButton = document.querySelector("#emojiButton");
const menuButton = document.querySelector("#menuButton");
const menuPanel = document.querySelector("#menuPanel");
const renameButton = document.querySelector("#renameButton");
const refreshButton = document.querySelector("#refreshButton");
const statusTime = document.querySelector("#statusTime");
const chatRoom = document.querySelector("#chatRoom");
const setupBanner = document.querySelector("#setupBanner");

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit"
});

const state = {
  messages: [],
  authorId: loadAuthorId(),
  authorName: loadAuthorName(),
  fetchTimer: null,
  isFetching: false,
  lastSignature: "",
  lastError: ""
};

function createAuthorId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `author-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function loadAuthorId() {
  const saved = window.localStorage.getItem(PROFILE_ID_KEY);
  if (saved) {
    return saved;
  }

  const next = createAuthorId();
  window.localStorage.setItem(PROFILE_ID_KEY, next);
  return next;
}

function loadAuthorName() {
  const saved = window.localStorage.getItem(PROFILE_NAME_KEY);
  if (saved) {
    return saved;
  }

  const fallback = `익명${Math.floor(Math.random() * 90 + 10)}`;
  window.localStorage.setItem(PROFILE_NAME_KEY, fallback);
  return fallback;
}

function saveAuthorName(name) {
  state.authorName = name;
  window.localStorage.setItem(PROFILE_NAME_KEY, name);
  updateAuthorUI();
}

function buildHeaders(extra = {}) {
  return {
    apikey: config.supabasePublishableKey,
    Authorization: `Bearer ${config.supabasePublishableKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...options,
    headers: buildHeaders(options.headers || {})
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function getAvatarColors(author) {
  const sum = [...author].reduce((total, letter) => total + letter.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

function setSyncStatus(kind, text) {
  syncStatus.textContent = text;
  syncStatus.className = `sync-pill ${kind}`;
}

function updateAuthorUI() {
  authorStatus.textContent = state.authorName;
  profileButtonText.textContent = state.authorName.slice(0, 1);
}

function resizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 112)}px`;
}

function closeMenu() {
  menuPanel.classList.add("hidden");
  menuButton.setAttribute("aria-expanded", "false");
}

function toggleMenu() {
  const nextHidden = !menuPanel.classList.contains("hidden");
  menuPanel.classList.toggle("hidden", nextHidden);
  menuButton.setAttribute("aria-expanded", String(!nextHidden));
}

function updateStatusTime() {
  statusTime.textContent = timeFormatter.format(new Date());
}

function applyComposerState() {
  const disabled = !isConfigured;
  messageInput.disabled = disabled;
  sendButton.disabled = disabled;
  emojiButton.disabled = disabled;
  emptyRefreshButton.disabled = disabled;
  if (disabled) {
    messageInput.placeholder = "config.js와 Supabase 설정 후 사용하세요";
  }
}

function createMessageElement(message) {
  const row = document.createElement("article");
  const mine = message.authorId === state.authorId;
  row.className = `message-row ${mine ? "me" : "other"}`;

  if (!mine) {
    const avatar = document.createElement("div");
    const [start, end] = getAvatarColors(message.authorName || "익명");
    avatar.className = "avatar";
    avatar.style.background = `linear-gradient(135deg, ${start}, ${end})`;
    avatar.textContent = (message.authorName || "익명").slice(0, 1);
    row.append(avatar);
  }

  const stack = document.createElement("div");
  stack.className = "message-stack";

  if (!mine) {
    const name = document.createElement("div");
    name.className = "message-name";
    name.textContent = message.authorName || "익명";
    stack.append(name);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.body;
  stack.append(bubble);

  const time = document.createElement("div");
  time.className = "message-time";
  time.textContent = timeFormatter.format(new Date(message.createdAt));
  stack.append(time);

  row.append(stack);
  return row;
}

function renderMessages() {
  roomBadge.textContent = `${roomLabel} · 실시간 공유중`;
  messageList.innerHTML = "";

  const hasMessages = state.messages.length > 0;
  emptyState.classList.toggle("hidden", hasMessages);
  messageList.classList.toggle("hidden", !hasMessages);
  emptyText.textContent = state.lastError || (isConfigured ? "메시지가 아직 없습니다." : "Supabase 설정을 완료하면 대화가 보입니다.");

  if (!hasMessages) {
    return;
  }

  state.messages.forEach((message) => {
    messageList.append(createMessageElement(message));
  });

  requestAnimationFrame(() => {
    chatRoom.scrollTop = chatRoom.scrollHeight;
  });
}

function signatureForMessages(messages) {
  return messages.map((message) => `${message.id}:${message.createdAt}`).join("|");
}

async function fetchMessages({ silent = false } = {}) {
  if (!isConfigured || state.isFetching) {
    return;
  }

  state.isFetching = true;
  if (!silent) {
    setSyncStatus("warn", "불러오는 중");
  }

  try {
    const params = new URLSearchParams({
      select: "id,author_id,author_name,body,created_at",
      room_slug: `eq.${roomSlug}`,
      order: "created_at.asc"
    });

    const rows = await apiRequest(`/rest/v1/messages?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    const messages = rows.map((row) => ({
      id: row.id,
      authorId: row.author_id,
      authorName: row.author_name,
      body: row.body,
      createdAt: row.created_at
    }));

    const nextSignature = signatureForMessages(messages);
    const changed = nextSignature !== state.lastSignature;
    state.messages = messages;
    state.lastSignature = nextSignature;
    state.lastError = "";
    setSyncStatus("ok", `연결됨 · ${messages.length}개`);

    if (changed) {
      renderMessages();
    } else if (!silent) {
      renderMessages();
    }
  } catch (error) {
    console.error(error);
    state.lastError = "메시지를 불러오지 못했습니다. 설정과 RLS 정책을 확인하세요.";
    setSyncStatus("error", "연결 오류");
    renderMessages();
  } finally {
    state.isFetching = false;
  }
}

async function sendMessage(text) {
  if (!isConfigured) {
    return;
  }

  setSyncStatus("warn", "전송 중");

  try {
    await apiRequest("/rest/v1/messages", {
      method: "POST",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify([
        {
          room_slug: roomSlug,
          author_id: state.authorId,
          author_name: state.authorName,
          body: text
        }
      ])
    });

    messageInput.value = "";
    resizeTextarea();
    await fetchMessages();
  } catch (error) {
    console.error(error);
    state.lastError = "메시지 전송에 실패했습니다. config.js와 supabase.sql 설정을 확인하세요.";
    setSyncStatus("error", "전송 실패");
    renderMessages();
  }
}

function promptForName() {
  const next = window.prompt("표시할 이름을 입력하세요.", state.authorName);
  if (!next) {
    return;
  }

  const trimmed = next.trim().slice(0, 20);
  if (!trimmed) {
    return;
  }

  saveAuthorName(trimmed);
  closeMenu();
}

function startPolling() {
  if (!isConfigured) {
    return;
  }

  if (state.fetchTimer) {
    window.clearInterval(state.fetchTimer);
  }

  state.fetchTimer = window.setInterval(() => {
    fetchMessages({ silent: true });
  }, pollIntervalMs);
}

function showSetupState() {
  setupBanner.classList.toggle("hidden", isConfigured);
  if (isConfigured) {
    return;
  }

  setSyncStatus("warn", "설정 필요");
  state.lastError = "config.js에 Supabase URL과 anon key를 넣은 뒤 다시 열어주세요.";
  renderMessages();
}

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  await sendMessage(text);
  messageInput.focus();
});

messageInput.addEventListener("input", resizeTextarea);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

profileButton.addEventListener("click", promptForName);
renameButton.addEventListener("click", promptForName);
refreshButton.addEventListener("click", async () => {
  closeMenu();
  await fetchMessages();
});
emptyRefreshButton.addEventListener("click", async () => {
  await fetchMessages();
});
scrollBottomButton.addEventListener("click", () => {
  chatRoom.scrollTo({ top: chatRoom.scrollHeight, behavior: "smooth" });
});
focusInputButton.addEventListener("click", () => {
  messageInput.focus();
  closeMenu();
});
emojiButton.addEventListener("click", () => {
  messageInput.value += messageInput.value ? " 🙂" : "🙂";
  resizeTextarea();
  messageInput.focus();
});
menuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMenu();
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLElement)) {
    return;
  }

  if (!event.target.closest("#menuPanel") && !event.target.closest("#menuButton")) {
    closeMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    fetchMessages({ silent: true });
  }
});

updateStatusTime();
updateAuthorUI();
resizeTextarea();
applyComposerState();
showSetupState();
window.setInterval(updateStatusTime, 60_000);

if (isConfigured) {
  fetchMessages();
  startPolling();
}

