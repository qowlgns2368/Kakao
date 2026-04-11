const STORAGE_KEY = "signal-board-posts";

const samplePosts = [
  {
    id: "sample-1",
    title: "4월 서비스 점검 일정 안내",
    author: "운영팀",
    category: "공지",
    tags: ["maintenance", "infra"],
    content:
      "4월 18일 금요일 22:00부터 23:30까지 인증 서버 점검이 진행됩니다.\n점검 시간 동안 일부 기능이 지연될 수 있으니 주요 작업은 사전에 마무리해 주세요.",
    createdAt: "2026-04-10T09:30:00+09:00",
    pinned: true,
    views: 42
  },
  {
    id: "sample-2",
    title: "봄맞이 UI 업데이트 배포",
    author: "프런트엔드팀",
    category: "업데이트",
    tags: ["release", "design"],
    content:
      "대시보드 카드 레이아웃과 검색 패널 상호작용을 개선했습니다.\n모바일 화면에서 툴바가 먼저 보이도록 우선순위도 조정했습니다.",
    createdAt: "2026-04-09T14:20:00+09:00",
    pinned: false,
    views: 27
  },
  {
    id: "sample-3",
    title: "사내 해커톤 참가 팀 모집",
    author: "문화TF",
    category: "이벤트",
    tags: ["hackathon", "team"],
    content:
      "5월 첫째 주 사내 해커톤을 진행합니다.\n참가를 원하는 팀은 금요일까지 주제와 팀원 명단을 공유해 주세요.",
    createdAt: "2026-04-08T11:05:00+09:00",
    pinned: false,
    views: 18
  }
];

const form = document.querySelector("#postForm");
const postList = document.querySelector("#postList");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const categoryFilter = document.querySelector("#categoryFilter");
const sortSelect = document.querySelector("#sortSelect");
const resultCount = document.querySelector("#resultCount");
const restoreSamplesButton = document.querySelector("#restoreSamplesButton");
const resetFiltersButton = document.querySelector("#resetFiltersButton");
const exportButton = document.querySelector("#exportButton");
const tagCloud = document.querySelector("#tagCloud");
const detailModal = document.querySelector("#detailModal");
const modalBackdrop = document.querySelector("#modalBackdrop");
const closeModalButton = document.querySelector("#closeModalButton");
const modalCategory = document.querySelector("#modalCategory");
const modalTitle = document.querySelector("#modalTitle");
const modalMeta = document.querySelector("#modalMeta");
const modalTags = document.querySelector("#modalTags");
const modalContent = document.querySelector("#modalContent");

const metrics = {
  total: document.querySelector("#totalPostsMetric"),
  pinned: document.querySelector("#pinnedPostsMetric"),
  categories: document.querySelector("#categoryMetric"),
  views: document.querySelector("#viewsMetric")
};

const formatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const state = {
  posts: loadPosts()
};

function loadPosts() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return [...samplePosts];
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...samplePosts];
  } catch (error) {
    console.error("게시글 저장소를 불러오지 못했습니다.", error);
    return [...samplePosts];
  }
}

function savePosts() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.posts));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getUniqueCategories(posts) {
  return [...new Set(posts.map((post) => post.category))].sort((left, right) =>
    left.localeCompare(right, "ko")
  );
}

function getFilteredPosts() {
  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  const sort = sortSelect.value;

  let posts = state.posts.filter((post) => {
    const searchable = [post.title, post.content, post.author, ...(post.tags || [])]
      .join(" ")
      .toLowerCase();
    const matchesQuery = query ? searchable.includes(query) : true;
    const matchesCategory = category === "전체" ? true : post.category === category;
    return matchesQuery && matchesCategory;
  });

  posts = posts.sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }

    if (sort === "views") {
      return (right.views || 0) - (left.views || 0);
    }

    if (sort === "title") {
      return left.title.localeCompare(right.title, "ko");
    }

    return new Date(right.createdAt) - new Date(left.createdAt);
  });

  return posts;
}

function renderCategoryOptions() {
  const currentValue = categoryFilter.value || "전체";
  const categories = getUniqueCategories(state.posts);
  categoryFilter.innerHTML = [
    '<option value="전체">전체</option>',
    ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
  ].join("");

  categoryFilter.value = categories.includes(currentValue) || currentValue === "전체" ? currentValue : "전체";
}

function renderMetrics() {
  const categories = getUniqueCategories(state.posts);
  const totalViews = state.posts.reduce((sum, post) => sum + (post.views || 0), 0);

  metrics.total.textContent = state.posts.length.toString();
  metrics.pinned.textContent = state.posts.filter((post) => post.pinned).length.toString();
  metrics.categories.textContent = categories.length.toString();
  metrics.views.textContent = totalViews.toString();
}

function renderTagCloud() {
  const counts = new Map();

  state.posts.forEach((post) => {
    (post.tags || []).forEach((tag) => {
      const key = tag.trim();
      if (!key) {
        return;
      }
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  const topTags = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ko"))
    .slice(0, 8);

  if (topTags.length === 0) {
    tagCloud.innerHTML = '<span class="meta-chip">아직 태그가 없습니다.</span>';
    return;
  }

  tagCloud.innerHTML = topTags
    .map(([tag, count]) => `<button class="tag-pill" type="button" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)} <span>${count}</span></button>`)
    .join("");

  tagCloud.querySelectorAll("[data-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      searchInput.value = button.dataset.tag || "";
      renderBoard();
    });
  });
}

function renderBoard() {
  const filteredPosts = getFilteredPosts();
  resultCount.textContent = `${filteredPosts.length}건`;
  postList.innerHTML = "";

  emptyState.classList.toggle("hidden", filteredPosts.length > 0);

  filteredPosts.forEach((post, index) => {
    const article = document.createElement("article");
    article.className = "post-card";
    article.style.animationDelay = `${index * 45}ms`;
    article.dataset.id = post.id;

    const tagsMarkup = (post.tags || [])
      .map((tag) => `<span class="tag-pill">#${escapeHtml(tag)}</span>`)
      .join("");

    article.innerHTML = `
      <div class="post-topline">
        <span class="badge">${escapeHtml(post.category)}</span>
        ${post.pinned ? '<span class="badge badge-pin">Pinned</span>' : ""}
      </div>
      <h3 class="post-title">${escapeHtml(post.title)}</h3>
      <div class="post-meta">
        <span class="meta-chip">${escapeHtml(post.author)}</span>
        <span class="meta-chip">${formatter.format(new Date(post.createdAt))}</span>
      </div>
      <p class="post-excerpt">${escapeHtml(post.content.slice(0, 110))}${post.content.length > 110 ? "..." : ""}</p>
      <div class="post-tags">${tagsMarkup}</div>
      <div class="post-footer">
        <span>조회 ${post.views || 0}</span>
        <button class="button post-delete" data-delete-id="${escapeHtml(post.id)}" type="button">삭제</button>
      </div>
    `;

    article.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("[data-delete-id]")) {
        return;
      }
      openModal(post.id);
    });

    const deleteButton = article.querySelector("[data-delete-id]");
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deletePost(post.id);
    });

    postList.append(article);
  });
}

function openModal(postId) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) {
    return;
  }

  post.views = (post.views || 0) + 1;
  savePosts();
  renderMetrics();
  renderBoard();

  modalCategory.textContent = post.category;
  modalTitle.textContent = post.title;
  modalMeta.innerHTML = [
    `<span class="meta-chip">${escapeHtml(post.author)}</span>`,
    `<span class="meta-chip">${formatter.format(new Date(post.createdAt))}</span>`,
    `<span class="meta-chip">조회 ${post.views}</span>`
  ].join("");
  modalTags.innerHTML = (post.tags || [])
    .map((tag) => `<span class="tag-pill">#${escapeHtml(tag)}</span>`)
    .join("");
  modalContent.textContent = post.content;
  detailModal.classList.remove("hidden");
  detailModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  detailModal.classList.add("hidden");
  detailModal.setAttribute("aria-hidden", "true");
}

function deletePost(postId) {
  state.posts = state.posts.filter((post) => post.id !== postId);
  savePosts();
  renderAll();
}

function normalizeTags(rawTags) {
  return rawTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function renderAll() {
  renderCategoryOptions();
  renderMetrics();
  renderTagCloud();
  renderBoard();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const title = String(formData.get("title") || "").trim();
  const author = String(formData.get("author") || "").trim();
  const category = String(formData.get("category") || "일반").trim();
  const tags = normalizeTags(String(formData.get("tags") || ""));
  const content = String(formData.get("content") || "").trim();
  const pinned = formData.get("pin") === "on";

  if (!title || !author || !content) {
    return;
  }

  state.posts.unshift({
    id: `${Date.now()}`,
    title,
    author,
    category,
    tags,
    content,
    createdAt: new Date().toISOString(),
    pinned,
    views: 0
  });

  savePosts();
  form.reset();
  renderAll();
});

searchInput.addEventListener("input", renderBoard);
categoryFilter.addEventListener("change", renderBoard);
sortSelect.addEventListener("change", renderBoard);

resetFiltersButton.addEventListener("click", () => {
  searchInput.value = "";
  categoryFilter.value = "전체";
  sortSelect.value = "recent";
  renderBoard();
});

restoreSamplesButton.addEventListener("click", () => {
  state.posts = [...samplePosts];
  savePosts();
  renderAll();
});

exportButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state.posts, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "signal-board-posts.json";
  link.click();
  URL.revokeObjectURL(url);
});

closeModalButton.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});

renderAll();
