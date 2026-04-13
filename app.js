import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const PROFILE_ID_KEY = "class-3-2-author-id";
const PROFILE_NAME_KEY = "class-3-2-author-name";
const DEFAULT_ROOM_SLUG = "class-3-2-passion-on";
const DEFAULT_IMAGE_BUCKET = "class-chat-images";
const DEFAULT_POLL_INTERVAL = 4000;
const ADMIN_TAP_TARGET = 5;
const ADMIN_TAP_RESET_MS = 1800;
const MAX_IMAGE_DIMENSION = 1600;
const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;
const INITIAL_IMAGE_QUALITY = 0.9;
const MIN_IMAGE_QUALITY = 0.58;

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
const imageBucket = config.imageBucket || DEFAULT_IMAGE_BUCKET;
const pollIntervalMs = Number(config.pollIntervalMs) > 999 ? Number(config.pollIntervalMs) : DEFAULT_POLL_INTERVAL;
const supabase = isConfigured ? createClient(config.supabaseUrl, config.supabasePublishableKey) : null;

const messageList = document.querySelector("#messageList");
const emptyState = document.querySelector("#emptyState");
const emptyText = document.querySelector("#emptyText");
const emptyRefreshButton = document.querySelector("#emptyRefreshButton");
const composer = document.querySelector(".composer");
const messageForm = document.querySelector("#messageForm");
const messageInput = document.querySelector("#messageInput");
const senderNameInput = document.querySelector("#senderNameInput");
const senderTimeInput = document.querySelector("#senderTimeInput");
const imageInput = document.querySelector("#imageInput");
const imageButton = document.querySelector("#imageButton");
const imagePreview = document.querySelector("#imagePreview");
const imagePreviewImage = document.querySelector("#imagePreviewImage");
const imagePreviewLabel = document.querySelector("#imagePreviewLabel");
const removeImageButton = document.querySelector("#removeImageButton");
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
  editingMessageId: null,
  pendingImageFile: null,
  pendingImagePreviewUrl: "",
  pendingImageLabel: "",
  pendingImageExistingUrl: "",
  pendingImageExistingPath: "",
  pendingImageLegacyDataUrl: ""
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

function clipLabel(text) {
  if (!text) {
    return "이미지 준비됨";
  }

  return text.length > 18 ? `${text.slice(0, 17)}…` : text;
}

function revokePendingPreviewUrl() {
  if (state.pendingImagePreviewUrl.startsWith("blob:")) {
    URL.revokeObjectURL(state.pendingImagePreviewUrl);
  }
}

function updateImagePreview() {
  const hasImage = Boolean(state.pendingImagePreviewUrl);
  imagePreview.classList.toggle("hidden", !hasImage);
  imageButton.classList.toggle("active", hasImage);

  if (!hasImage) {
    imagePreviewImage.removeAttribute("src");
    imagePreviewLabel.textContent = "이미지 준비됨";
    removeImageButton.disabled = true;
    return;
  }

  imagePreviewImage.src = state.pendingImagePreviewUrl;
  imagePreviewLabel.textContent = state.pendingImageLabel || "이미지 준비됨";
  removeImageButton.disabled = !state.isAdminMode;
}

function clearPendingImage({ clearInput = true } = {}) {
  revokePendingPreviewUrl();
  state.pendingImageFile = null;
  state.pendingImagePreviewUrl = "";
  state.pendingImageLabel = "";
  state.pendingImageExistingUrl = "";
  state.pendingImageExistingPath = "";
  state.pendingImageLegacyDataUrl = "";

  if (clearInput) {
    imageInput.value = "";
  }

  updateImagePreview();
}

function setPendingStoredImage(url, path, label = "기존 이미지") {
  revokePendingPreviewUrl();
  state.pendingImageFile = null;
  state.pendingImagePreviewUrl = url || "";
  state.pendingImageLabel = clipLabel(label);
  state.pendingImageExistingUrl = url || "";
  state.pendingImageExistingPath = path || "";
  state.pendingImageLegacyDataUrl = "";
  updateImagePreview();
}

function setPendingLegacyImage(dataUrl, label = "기존 이미지") {
  revokePendingPreviewUrl();
  state.pendingImageFile = null;
  state.pendingImagePreviewUrl = dataUrl || "";
  state.pendingImageLabel = clipLabel(label);
  state.pendingImageExistingUrl = "";
  state.pendingImageExistingPath = "";
  state.pendingImageLegacyDataUrl = dataUrl || "";
  updateImagePreview();
}

function setPendingPreparedFile(file, label = "새 이미지") {
  revokePendingPreviewUrl();
  state.pendingImageFile = file;
  state.pendingImagePreviewUrl = URL.createObjectURL(file);
  state.pendingImageLabel = clipLabel(label || file.name || "새 이미지");
  state.pendingImageExistingUrl = "";
  state.pendingImageExistingPath = "";
  state.pendingImageLegacyDataUrl = "";
  updateImagePreview();
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
  clearPendingImage();
  setSenderTimeNow();
  updateAuthorUI();
}

function findMessageById(messageId) {
  return state.messages.find((message) => message.id === messageId) || null;
}

function cancelEditingMessage({ resetName = true, silent = false } = {}) {
  if (!state.editingMessageId) {
    return;
  }

  state.editingMessageId = null;
  updateEditUI();
  resetComposerDraft({ resetName });
  renderMessages();

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
  imageInput.disabled = disabled;
  imageButton.disabled = disabled;
  messageInput.disabled = disabled;
  sendButton.disabled = disabled;
  emojiButton.disabled = disabled;
  removeImageButton.disabled = disabled || !state.pendingImagePreviewUrl;
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
    messageInput.placeholder = "관리자 모드에서만 메시지나 이미지를 보낼 수 있습니다";
  } else {
    messageInput.placeholder = state.editingMessageId ? "수정할 메시지나 이미지를 확인하세요" : "메시지나 이미지를 입력하세요";
  }

  updateAuthorUI();
  updateEditUI();
  updateImagePreview();
}

function beginEditingMessage(message) {
  state.editingMessageId = message.id;
  senderNameInput.value = message.authorName || state.authorName;
  senderTimeInput.value = formatDateTimeLocal(new Date(message.createdAt));
  messageInput.value = message.body || "";
  resizeTextarea();

  if (message.imagePath && message.imageUrl) {
    setPendingStoredImage(message.imageUrl, message.imagePath, "기존 이미지");
  } else if (message.imageDataUrl) {
    setPendingLegacyImage(message.imageDataUrl, "기존 이미지");
  } else {
    clearPendingImage();
  }

  updateAuthorUI();
  updateEditUI();
  renderMessages();
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

async function removeStoredImage(path) {
  if (!supabase || !path) {
    return;
  }

  const { error } = await supabase.storage.from(imageBucket).remove([path]);
  if (error) {
    throw error;
  }
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

    if (message.imagePath) {
      removeStoredImage(message.imagePath).catch((error) => {
        console.warn("이미지 파일 삭제 실패", error);
      });
    }

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

function getRenderableImageUrl(message) {
  return message.imageUrl || message.imageDataUrl || "";
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

  const imageUrl = getRenderableImageUrl(message);
  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (imageUrl) {
    bubble.classList.add("with-media");

    const image = document.createElement("img");
    image.className = "bubble-image";
    image.src = imageUrl;
    image.alt = `${message.authorName || "익명"} 이미지`;
    image.loading = "lazy";
    image.decoding = "async";
    bubble.append(image);
  }

  if (message.body) {
    const text = document.createElement("div");
    text.className = "bubble-text";
    text.textContent = message.body;
    bubble.append(text);
  }

  if (!message.body && imageUrl) {
    bubble.classList.add("media-only");
  }

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
  return JSON.stringify(
    messages.map((message) => [
      message.id,
      message.createdAt,
      message.authorName,
      message.body || "",
      message.imageUrl || "",
      message.imagePath || "",
      message.imageDataUrl ? message.imageDataUrl.length : 0
    ])
  );
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
      select: "id,author_id,author_name,body,image_url,image_path,image_data_url,created_at",
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
      body: row.body || "",
      imageUrl: row.image_url || "",
      imagePath: row.image_path || "",
      imageDataUrl: row.image_data_url || "",
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
    state.lastError = "메시지를 불러오지 못했습니다. Supabase SQL과 Storage 설정을 확인하세요.";
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
    renderMessages();
    setSyncStatus("ok", "관리자 연결됨");
    messageInput.focus();
  } catch (error) {
    console.error(error);
    setSyncStatus("error", "권한 오류");
    window.alert("관리자 인증에 실패했습니다. SQL 함수와 비밀번호 설정을 확인하세요.");
  }
}

function exitAdminMode() {
  if (state.editingMessageId) {
    cancelEditingMessage({ silent: true });
  }

  resetComposerDraft({ resetName: false });
  state.isAdminMode = false;
  state.adminPassword = "";
  updateAdminUI();
  applyComposerState();
  renderMessages();
  setSyncStatus("ok", "읽기 전용");
}

function getScaledDimensions(width, height, maxDimension) {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) {
    return { width, height };
  }

  const ratio = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 읽지 못했습니다."));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function normalizeFileBaseName(name) {
  const trimmed = (name || "image")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return trimmed || "image";
}

async function compressImageFile(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 올릴 수 있습니다.");
  }

  const image = await loadImageElement(file);
  let maxDimension = MAX_IMAGE_DIMENSION;
  let quality = INITIAL_IMAGE_QUALITY;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { width, height } = getScaledDimensions(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      maxDimension
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("브라우저가 이미지 변환을 지원하지 않습니다.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!blob) {
      throw new Error("이미지를 압축하지 못했습니다.");
    }

    if (blob.size <= MAX_IMAGE_UPLOAD_BYTES) {
      const fileName = `${normalizeFileBaseName(file.name)}.jpg`;
      return new File([blob], fileName, {
        type: "image/jpeg",
        lastModified: Date.now()
      });
    }

    maxDimension = Math.max(720, Math.round(maxDimension * 0.84));
    quality = Math.max(MIN_IMAGE_QUALITY, quality - 0.08);
  }

  throw new Error("이미지가 너무 큽니다. 더 작은 이미지를 선택하세요.");
}

function buildImageObjectPath(file) {
  const day = new Date().toISOString().slice(0, 10);
  const token = Math.random().toString(36).slice(2, 10);
  const baseName = normalizeFileBaseName(file.name);
  return `${roomSlug}/${day}/${Date.now()}-${token}-${baseName}.jpg`;
}

async function uploadImageFile(file) {
  if (!supabase) {
    throw new Error("Supabase 설정이 필요합니다.");
  }

  const path = buildImageObjectPath(file);
  const { data, error } = await supabase.storage.from(imageBucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type
  });

  if (error) {
    throw error;
  }

  const { data: publicData } = supabase.storage.from(imageBucket).getPublicUrl(data.path);
  return {
    path: data.path,
    publicUrl: publicData.publicUrl
  };
}

async function prepareImageFile(file, label) {
  if (!state.isAdminMode || !isConfigured) {
    imageInput.value = "";
    return;
  }

  setSyncStatus("warn", "이미지 준비 중");

  try {
    const preparedFile = await compressImageFile(file);
    setPendingPreparedFile(preparedFile, label || file.name || "새 이미지");
    setSyncStatus("ok", "이미지 준비됨");
  } catch (error) {
    console.error(error);
    clearPendingImage();
    setSyncStatus("error", "이미지 실패");
    window.alert(error.message || "이미지를 준비하지 못했습니다.");
  } finally {
    imageInput.value = "";
  }
}

async function dataUrlToFile(dataUrl, fileName = "legacy-image.jpg") {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, {
    type: blob.type || "image/jpeg",
    lastModified: Date.now()
  });
}

async function handleImageSelection(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  await prepareImageFile(file, file.name || "새 이미지");
}

async function sendMessage() {
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

  const text = messageInput.value.trim();
  let imageUrl = state.pendingImageExistingUrl || null;
  let imagePath = state.pendingImageExistingPath || null;
  let imageDataUrl = state.pendingImageLegacyDataUrl || null;

  if (!text && !imageUrl && !imageDataUrl && !state.pendingImageFile) {
    window.alert("메시지나 이미지를 선택하세요.");
    messageInput.focus();
    return;
  }

  const isEditing = Boolean(state.editingMessageId);
  const originalMessage = isEditing ? findMessageById(state.editingMessageId) : null;
  const originalImagePath = originalMessage?.imagePath || "";
  let uploadedImagePath = "";

  setSyncStatus("warn", state.pendingImageFile ? "이미지 업로드 중" : isEditing ? "수정 저장 중" : "전송 중");

  try {
    if (state.pendingImageFile) {
      const uploaded = await uploadImageFile(state.pendingImageFile);
      uploadedImagePath = uploaded.path;
      imageUrl = uploaded.publicUrl;
      imagePath = uploaded.path;
      imageDataUrl = null;
    } else if (imageDataUrl) {
      const legacyFile = await dataUrlToFile(imageDataUrl);
      const preparedLegacyFile = await compressImageFile(legacyFile);
      const uploaded = await uploadImageFile(preparedLegacyFile);
      uploadedImagePath = uploaded.path;
      imageUrl = uploaded.publicUrl;
      imagePath = uploaded.path;
      imageDataUrl = null;
    }

    if (isEditing) {
      await rpcRequest("chat_admin_update_message", {
        p_room_slug: roomSlug,
        p_password: state.adminPassword,
        p_message_id: state.editingMessageId,
        p_author_name: customName,
        p_body: text || null,
        p_image_url: imageUrl,
        p_image_path: imagePath,
        p_image_data_url: imageDataUrl,
        p_created_at: createdAt
      });
    } else {
      await rpcRequest("chat_admin_send_message", {
        p_room_slug: roomSlug,
        p_password: state.adminPassword,
        p_author_id: state.authorId,
        p_author_name: customName,
        p_body: text || null,
        p_image_url: imageUrl,
        p_image_path: imagePath,
        p_image_data_url: imageDataUrl,
        p_created_at: createdAt
      });
    }

    if (originalImagePath && originalImagePath !== imagePath) {
      removeStoredImage(originalImagePath).catch((error) => {
        console.warn("이전 이미지 파일 삭제 실패", error);
      });
    }

    saveAuthorName(customName);
    senderNameInput.value = customName;
    state.editingMessageId = null;
    updateEditUI();
    resetComposerDraft({ resetName: false });
    state.lastError = "";
    await fetchMessages();
    messageInput.focus();
  } catch (error) {
    console.error(error);

    if (uploadedImagePath) {
      removeStoredImage(uploadedImagePath).catch((cleanupError) => {
        console.warn("업로드 후 롤백 실패", cleanupError);
      });
    }

    state.lastError = isEditing
      ? "메시지 수정에 실패했습니다. Supabase SQL 또는 Storage 정책을 확인하세요."
      : "메시지 전송에 실패했습니다. Supabase SQL 또는 Storage 정책을 확인하세요.";
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
  await sendMessage();
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

messageInput.addEventListener("paste", async (event) => {
  if (!state.isAdminMode) {
    return;
  }

  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem) {
    return;
  }

  const file = imageItem.getAsFile();
  if (!file) {
    return;
  }

  event.preventDefault();
  await prepareImageFile(file, "붙여넣은 이미지");
});

imageButton.addEventListener("click", () => {
  if (imageButton.disabled) {
    return;
  }

  imageInput.click();
});

imageInput.addEventListener("change", async (event) => {
  await handleImageSelection(event);
});

removeImageButton.addEventListener("click", () => {
  clearPendingImage();
  if (state.isAdminMode) {
    setSyncStatus("ok", "이미지 제거");
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

window.addEventListener("beforeunload", () => {
  revokePendingPreviewUrl();
});

senderNameInput.value = state.authorName;
setSenderTimeNow();
updateAuthorUI();
updateAdminUI();
updateEditUI();
updateImagePreview();
resizeTextarea();
applyComposerState();
showSetupState();

if (isConfigured) {
  fetchMessages();
  startPolling();
}


