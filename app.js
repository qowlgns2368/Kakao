const PROFILE_ID_KEY = "class-3-1-author-id";
const PROFILE_NAME_KEY = "class-3-1-author-name";
const DEFAULT_ROOM_SLUG = "class-3-1-passion-on";
const DEFAULT_POLL_INTERVAL = 4000;
const ADMIN_TAP_TARGET = 5;
const ADMIN_TAP_RESET_MS = 1800;

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
const pollIntervalMs = Number(config.pollIntervalMs) > 999 ? Number(config.pollIntervalMs) : DEFAULT_POLL_INTERVAL;

const messageList = document.querySelector("#messageList");
const emptyState = document.querySelector("#emptyState");
const emptyText = document.querySelector("#emptyText");
const emptyRefreshButton = document.querySelector("#emptyRefreshButton");
const composer = document.querySelector(".composer");
const messageForm = document.querySelector("#messageForm");
const messageInput = document.querySelector("#messageInput");
const senderNameInput = document.querySelector("#senderNameInput");
const senderTimeInput = document.querySelector("#senderTimeInput");
const authorStatus = document.querySelector("#authorStatus");
const profileButtonText = document.querySelector("#profileButtonText");
const syncStatus = document.querySelector("#syncStatus");
const adminStatus = document.querySelector("#adminStatus");
const editStatus = document.querySelector("#editStatus");
const cancelEditButton = document.querySelector("#cancelEditButton");
const sendButton = document.querySelector("#sendButton");
const emojiButton = document.querySelector("#emojiButton");
const refreshButton = document.querySelector("#refreshButton");
const adminTapTarget = document.querySelector("#adminTapTarget");
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
  lastError: "",
  isAdminMode: false,
  adminPassword: "",
  adminTapCount: 0,
  adminTapTimer: null,
  editingMessageId: null
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
}

function buildHeaders(extra = {}) {
  return {
    apikey: config.supabasePublishableKey,
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

function rpcRequest(functionName, payload) {
  return apiRequest(`/rest/v1/rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      Accept: "application/json"
    }
  });
}

function getAvatarColors(author) {
  const sum = [...author].reduce((total, letter) => total + letter.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

function setSyncStatus(kind, text) {
  syncStatus.textContent = text;
  syncStatus.className = `sync-pill ${kind}`;
}

function getDraftAuthorName() {
  const draft = senderNameInput.value.trim().slice(0, 20);
  return draft || state.authorName;
}

function updateAuthorUI() {
  const displayName = getDraftAuthorName();
  authorStatus.textContent = displayName;
  profileButtonText.textContent = displayName.slice(0, 1);
}

function updateAdminUI() {
  adminStatus.textContent = state.isAdminMode ? "관리자 모드" : "읽기 전용";
  adminStatus.className = `sync-pill admin-pill ${state.isAdminMode ? "active" : "locked"}`;
}

function updateEditUI() {
  const isEditing = Boolean(state.editingMessageId);
  editStatus.classList.toggle("hidden", !isEditing);
  cancelEditButton.classList.toggle("hidden", !isEditing);
  sendButton.setAttribute("aria-label", isEditing ? "메시지 수정 저장" : "메시지 전송");
}

function pad(number) {
  return String(number).padStart(2, "0");
}

function formatDateTimeLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setSenderTimeNow() {
  senderTimeInput.value = formatDateTimeLocal(new Date());
}

function getSelectedCreatedAt() {
  if (!senderTimeInput.value) {
    return null;
  }

  const parsed = new Date(senderTimeInput.value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function resizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 112)}px`;
}

function resetComposerDraft({ resetName = false } = {}) {
  if (resetName) {
    senderNameInput.value = state.authorName;
  }

  messageInput.value = "";
  resizeTextarea();
  setSenderTimeNow();
  updateAuthorUI();
}

function cancelEditingMessage({ resetName = true, silent = false } = {}) {
  if (!state.editingMessageId) {
    return;
  }

  state.editingMessageId = null;
  updateEditUI();
  resetComposerDraft({ resetName });

  if (!silent && state.isAdminMode) {
    setSyncStatus("ok", "수정 취소");
  }
}

function resetAdminTapSequence() {
  state.adminTapCount = 0;

  if (state.adminTapTimer) {
    window.clearTimeout(state.adminTapTimer);
    state.adminTapTimer = null;
  }
}

function scheduleAdminTapReset() {
  if (state.adminTapTimer) {
    window.clearTimeout(state.adminTapTimer);
  }

  state.adminTapTimer = window.setTimeout(() => {
    resetAdminTapSequence();
  }, ADMIN_TAP_RESET_MS);
}

async function handleAdminTap() {
  state.adminTapCount += 1;
  scheduleAdminTapReset();

  if (state.adminTapCount < ADMIN_TAP_TARGET) {
    return;
  }

  resetAdminTapSequence();

  if (state.isAdminMode) {
    return;
  }

  await enterAdminMode();
}

function applyComposerState() {
  const disabled = !isConfigured || !state.isAdminMode;
  composer.classList.toggle("hidden", !state.isAdminMode);
  senderNameInput.disabled = disabled;
  senderTimeInput.disabled = disabled;
  messageInput.disabled = disabled;
  sendButton.disabled = disabled;
  emojiButton.disabled = disabled;
  emptyRefreshButton.disabled = !isConfigured;

  if (state.isAdminMode) {
    if (!senderNameInput.value.trim()) {
      senderNameInput.value = state.authorName;
    }

    if (!senderTimeInput.value) {
      setSenderTimeNow();
    }
  }

  if (!isConfigured) {
    messageInput.placeholder = "config.js와 supabase.sql 설정 후 사용하세요";
  } else if (!state.isAdminMode) {
    messageInput.placeholder = "관리자 모드에서만 메시지를 보낼 수 있습니다";
  } else {
    messageInput.placeholder = state.editingMessageId ? "수정할 메시지를 입력하세요" : "메시지를 입력하세요";
  }

  updateAuthorUI();
  updateEditUI();
}

function findMessageById(messageId) {
  return state.messages.find((message) => message.id === messageId) || null;
}

function beginEditingMessage(message) {
  state.editingMessageId = message.id;
  senderNameInput.value = message.authorName || state.authorName;
  senderTimeInput.value = formatDateTimeLocal(new Date(message.createdAt));
  messageInput.value = message.body;
  resizeTextarea();
  updateAuthorUI();
  updateEditUI();
  setSyncStatus("ok", "수정 준비");
  messageInput.focus();
}

function createMessageActionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `message-action-button ${className}`.trim();
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

async function deleteMessage(message) {
  if (!state.isAdminMode || !state.adminPassword) {
    return;
  }

  const ok = window.confirm("이 메시지를 삭제할까요?");
  if (!ok) {
    return;
  }

  setSyncStatus("warn", "삭제 중");

  try {
    await rpcRequest("chat_admin_delete_message", {
      p_room_slug: roomSlug,
      p_password: state.adminPassword,
      p_message_id: message.id
    });

    if (state.editingMessageId === message.id) {
      cancelEditingMessage({ silent: true });
    }

    state.lastError = "";
    await fetchMessages();
  } catch (error) {
    console.error(error);
    state.lastError = "메시지 삭제에 실패했습니다. 관리자 비밀번호 또는 SQL 함수를 확인하세요.";
    setSyncStatus("error", "삭제 실패");
    renderMessages();
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

  const name = document.createElement("div");
  name.className = "message-name";
  name.textContent = message.authorName || "익명";
  stack.append(name);

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.body;
  stack.append(bubble);

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const time = document.createElement("div");
  time.className = "message-time";
  time.textContent = timeFormatter.format(new Date(message.createdAt));
  meta.append(time);

  if (state.isAdminMode) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const isEditing = state.editingMessageId === message.id;
    const editButton = createMessageActionButton(isEditing ? "수정 중" : "수정", isEditing ? "active" : "", () => {
      beginEditingMessage(message);
    });
    editButton.disabled = isEditing;

    const deleteButton = createMessageActionButton("삭제", "danger", async () => {
      await deleteMessage(message);
    });

    actions.append(editButton, deleteButton);
    meta.append(actions);
  }

  stack.append(meta);
  row.append(stack);
  return row;
}

function renderMessages() {
  messageList.innerHTML = "";

  const hasMessages = state.messages.length > 0;
  emptyState.classList.toggle("hidden", hasMessages);
  messageList.classList.toggle("hidden", !hasMessages);

  if (state.lastError) {
    emptyText.textContent = state.lastError;
  } else if (!isConfigured) {
    emptyText.textContent = "Supabase 설정을 완료하면 대화가 보입니다.";
  } else {
    emptyText.textContent = "메시지가 아직 없습니다.";
  }

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

    if (state.editingMessageId && !messages.some((message) => message.id === state.editingMessageId)) {
      cancelEditingMessage({ silent: true });
    }

    const nextSignature = signatureForMessages(messages);
    const changed = nextSignature !== state.lastSignature;
    state.messages = messages;
    state.lastSignature = nextSignature;
    state.lastError = "";
    setSyncStatus("ok", `연결됨 · ${messages.length}개`);

    if (changed || !silent) {
      renderMessages();
    }
  } catch (error) {
    console.error(error);
    state.lastError = "메시지를 불러오지 못했습니다. Supabase 정책 설정을 확인하세요.";
    setSyncStatus("error", "연결 오류");
    renderMessages();
  } finally {
    state.isFetching = false;
  }
}

async function enterAdminMode() {
  if (!isConfigured) {
    window.alert("먼저 config.js와 supabase.sql 설정을 완료하세요.");
    return;
  }

  const input = window.prompt("관리자 비밀번호를 입력하세요.");
  if (input === null) {
    return;
  }

  const password = input.trim();
  if (!password) {
    return;
  }

  setSyncStatus("warn", "권한 확인 중");

  try {
    const ok = await rpcRequest("chat_admin_login", {
      p_room_slug: roomSlug,
      p_password: password
    });

    if (ok !== true) {
      window.alert("비밀번호가 올바르지 않습니다.");
      setSyncStatus("warn", "읽기 전용");
      return;
    }

    state.isAdminMode = true;
    state.adminPassword = password;
    senderNameInput.value = state.authorName;
    setSenderTimeNow();
    updateAdminUI();
    applyComposerState();
    setSyncStatus("ok", "관리자 연결됨");
    messageInput.focus();
  } catch (error) {
    console.error(error);
    setSyncStatus("error", "권한 오류");
    window.alert("관리자 인증에 실패했습니다. SQL 함수와 비밀번호 설정을 확인하세요.");
  }
}

function exitAdminMode() {
  cancelEditingMessage({ silent: true });
  state.isAdminMode = false;
  state.adminPassword = "";
  updateAdminUI();
  applyComposerState();
  setSyncStatus("ok", "읽기 전용");
}

async function sendMessage(text) {
  if (!isConfigured || !state.isAdminMode || !state.adminPassword) {
    return;
  }

  const customName = senderNameInput.value.trim().slice(0, 20);
  if (!customName) {
    window.alert("보낼 이름을 입력하세요.");
    senderNameInput.focus();
    return;
  }

  const createdAt = getSelectedCreatedAt();
  if (!createdAt) {
    window.alert("보낼 시간을 설정하세요.");
    senderTimeInput.focus();
    return;
  }

  const isEditing = Boolean(state.editingMessageId);
  setSyncStatus("warn", isEditing ? "수정 저장 중" : "전송 중");

  try {
    if (isEditing) {
      await rpcRequest("chat_admin_update_message", {
        p_room_slug: roomSlug,
        p_password: state.adminPassword,
        p_message_id: state.editingMessageId,
        p_author_name: customName,
        p_body: text,
        p_created_at: createdAt
      });

      cancelEditingMessage({ resetName: true, silent: true });
    } else {
      await rpcRequest("chat_admin_send_message", {
        p_room_slug: roomSlug,
        p_password: state.adminPassword,
        p_author_id: state.authorId,
        p_author_name: customName,
        p_body: text,
        p_created_at: createdAt
      });

      saveAuthorName(customName);
      senderNameInput.value = customName;
      messageInput.value = "";
      resizeTextarea();
      setSenderTimeNow();
      updateAuthorUI();
    }

    state.lastError = "";
    await fetchMessages();
    messageInput.focus();
  } catch (error) {
    console.error(error);
    state.lastError = isEditing
      ? "메시지 수정에 실패했습니다. 관리자 비밀번호 또는 SQL 함수를 확인하세요."
      : "메시지 전송에 실패했습니다. 관리자 비밀번호 또는 SQL 함수를 확인하세요.";
    setSyncStatus("error", isEditing ? "수정 실패" : "전송 실패");
    renderMessages();
  }
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
  state.lastError = "config.js와 supabase.sql 설정을 완료한 뒤 다시 열어주세요.";
  renderMessages();
}

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  await sendMessage(text);
});

senderNameInput.addEventListener("input", () => {
  updateAuthorUI();
});
messageInput.addEventListener("input", resizeTextarea);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

adminTapTarget.addEventListener("click", async () => {
  await handleAdminTap();
});
adminTapTarget.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  await handleAdminTap();
});
refreshButton.addEventListener("click", async () => {
  await fetchMessages();
});
emptyRefreshButton.addEventListener("click", async () => {
  await fetchMessages();
});
cancelEditButton.addEventListener("click", () => {
  cancelEditingMessage();
});
emojiButton.addEventListener("click", () => {
  if (messageInput.disabled) {
    return;
  }

  messageInput.value += messageInput.value ? " 🙂" : "🙂";
  resizeTextarea();
  messageInput.focus();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  resetAdminTapSequence();

  if (state.editingMessageId) {
    cancelEditingMessage();
    return;
  }

  if (state.isAdminMode) {
    exitAdminMode();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    fetchMessages({ silent: true });
  }
});

senderNameInput.value = state.authorName;
setSenderTimeNow();
updateAuthorUI();
updateAdminUI();
resizeTextarea();
applyComposerState();
showSetupState();

if (isConfigured) {
  fetchMessages();
  startPolling();
}
