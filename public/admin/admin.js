/*
 * Trang quản trị blog luuvantuan.com
 * --------------------------------------------------------------
 * - Đăng nhập bằng GitHub token (fine-grained), lưu trên trình duyệt.
 * - Đọc / ghi bài viết trong src/content/blog/*.md qua GitHub API.
 * - Mỗi lần lưu = 1 commit lên nhánh main, GitHub Actions tự dựng lại web.
 */
(() => {
  "use strict";

  // ===== Cấu hình =====
  const OWNER = "luuvantuan";
  const REPO = "luuvantuan.github.io";
  const BRANCH = "main";
  const POSTS_DIR = "src/content/blog";
  const IMAGES_DIR = "public/images";
  const VIDEOS_DIR = "public/videos";
  const SITE_FILE = "src/site.ts";
  const SITE_URL = "https://luuvantuan.com";
  const MAX_VIDEO_MB = 25;
  const MAX_IMAGE_SIDE = 2000; // ảnh lớn hơn sẽ được thu nhỏ trước khi tải lên
  const TOKEN_KEY = "lvt-admin-token";
  const API = "https://api.github.com";

  // ===== Trạng thái =====
  const state = {
    token: null,
    user: null,
    posts: null, // [{ slug, path, sha, data, body, extra }]
    topics: [],
    filter: "all",
    search: "",
    deploy: null, // { sha, status: running|ok|fail|unknown }
  };
  const localMedia = new Map(); // "/images/x.jpg" -> blob URL (để xem trước ảnh vừa tải lên)
  let editor = null; // trạng thái trình soạn bài đang mở

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const app = $("#app");

  // ===== Tiện ích =====
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const slugify = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "");

  const today = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const fmtDate = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const textToB64 = (text) => bytesToB64(new TextEncoder().encode(text));
  const bytesToB64 = (bytes) => {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64ToText = (b64) =>
    new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, "")), (c) => c.charCodeAt(0)));

  const storage = {
    get() {
      try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
    },
    set(token, remember) {
      try {
        (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
      } catch { /* trình duyệt chặn lưu: vẫn dùng được trong phiên này */ }
    },
    clear() {
      try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch {}
    },
  };

  let toastTimer;
  function toast(msg, isError = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = ""), isError ? 6000 : 3000);
  }

  const ICONS = {
    posts: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    plus: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    web: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    out: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg>',
  };

  // ===== GitHub API =====
  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function gh(path, { method = "GET", body } = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${state.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, "Không kết nối được tới GitHub. Kiểm tra mạng rồi thử lại.");
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401) {
        storage.clear();
        state.token = null;
        renderLogin("Phiên đăng nhập đã hết hạn hoặc token không đúng. Vui lòng đăng nhập lại.");
      }
      throw new ApiError(res.status, data?.message || `Lỗi GitHub (${res.status})`);
    }
    return data;
  }

  const repoPath = (p) => `/repos/${OWNER}/${REPO}/contents/${p.split("/").map(encodeURIComponent).join("/")}`;
  const getFile = (p) => gh(`${repoPath(p)}?ref=${BRANCH}`);
  const putFile = (p, contentB64, message, sha) =>
    gh(repoPath(p), { method: "PUT", body: { message, content: contentB64, branch: BRANCH, ...(sha ? { sha } : {}) } });
  const deleteFile = (p, sha, message) => gh(repoPath(p), { method: "DELETE", body: { message, sha, branch: BRANCH } });

  async function fileExists(p) {
    try { await getFile(p); return true; } catch (e) { if (e.status === 404) return false; throw e; }
  }

  // ===== Đọc / ghi bài =====
  function parsePost(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    let fm = {};
    let body = text;
    if (m) {
      try { fm = jsyaml.load(m[1]) || {}; } catch { fm = {}; }
      body = m[2].replace(/^\r?\n/, "");
    }
    const { title = "", description = "", date = "", tags = [], draft = false, ...extra } = fm;
    const iso = date instanceof Date ? date.toISOString().slice(0, 10) : String(date || "").slice(0, 10);
    return {
      data: {
        title: String(title),
        description: String(description ?? ""),
        date: iso,
        tags: Array.isArray(tags) ? tags.map(String) : [],
        draft: draft === true,
      },
      body,
      extra,
    };
  }

  function serializePost({ data, body, extra }) {
    const q = (s) => JSON.stringify(String(s)); // chuỗi JSON cũng là chuỗi YAML hợp lệ
    const lines = ["---", `title: ${q(data.title)}`];
    if (data.description.trim()) lines.push(`description: ${q(data.description.trim())}`);
    lines.push(`date: ${data.date}`);
    lines.push(`tags: [${data.tags.map(q).join(", ")}]`);
    lines.push(`draft: ${data.draft ? "true" : "false"}`);
    if (extra && Object.keys(extra).length) lines.push(jsyaml.dump(extra, { lineWidth: -1 }).trimEnd());
    lines.push("---", "", body.replace(/\s+$/, "") + "\n");
    return lines.join("\n");
  }

  async function loadPosts() {
    const list = await gh(`${repoPath(POSTS_DIR)}?ref=${BRANCH}`).catch((e) => {
      if (e.status === 404) return [];
      throw e;
    });
    const files = list.filter((f) => f.type === "file" && /\.mdx?$/.test(f.name));
    const posts = await Promise.all(
      files.map(async (f) => {
        const file = await getFile(f.path);
        const parsed = parsePost(b64ToText(file.content));
        return { slug: f.name.replace(/\.mdx?$/, ""), path: f.path, sha: file.sha, ...parsed };
      }),
    );
    posts.sort((a, b) => (b.data.date || "").localeCompare(a.data.date || "") || a.data.title.localeCompare(b.data.title));
    state.posts = posts;
  }

  async function loadTopics() {
    try {
      const file = await getFile(SITE_FILE);
      const src = b64ToText(file.content);
      const block = src.slice(src.indexOf("TOPICS"));
      state.topics = [...block.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
    } catch {
      state.topics = [];
    }
  }

  // ===== Theo dõi cập nhật web (GitHub Actions) =====
  let deployTimer;
  function watchDeploy(commitSha) {
    state.deploy = { sha: commitSha, status: "running" };
    renderDeploy();
    clearTimeout(deployTimer);
    const started = Date.now();
    const tick = async () => {
      try {
        const data = await gh(`/repos/${OWNER}/${REPO}/actions/runs?branch=${BRANCH}&per_page=5`);
        const run = data.workflow_runs.find((r) => r.head_sha === commitSha);
        if (run && run.status === "completed") {
          state.deploy.status = run.conclusion === "success" ? "ok" : "fail";
          state.deploy.url = run.html_url;
          renderDeploy();
          return;
        }
      } catch (e) {
        if (e.status === 403 || e.status === 404) {
          state.deploy.status = "unknown";
          renderDeploy();
          return;
        }
      }
      if (Date.now() - started > 8 * 60 * 1000) {
        state.deploy.status = "unknown";
        renderDeploy();
        return;
      }
      deployTimer = setTimeout(tick, 8000);
    };
    deployTimer = setTimeout(tick, 6000);
  }

  function deployHtml() {
    const d = state.deploy;
    if (!d) return "";
    const map = {
      running: ["running", "Đang cập nhật web… (thường mất 1–2 phút)"],
      ok: ["ok", "Web đã cập nhật xong. Mở web và nhấn Ctrl+F5 nếu chưa thấy thay đổi."],
      fail: ["fail", `Cập nhật web bị lỗi. <a href="${esc(d.url)}" target="_blank" rel="noopener">Xem chi tiết</a>`],
      unknown: ["", "Đã lưu. Web sẽ tự cập nhật sau khoảng 1–2 phút."],
    };
    const [cls, msg] = map[d.status];
    return `<div class="deploy ${cls}"><span class="dot"></span><span>${msg}</span></div>`;
  }
  function renderDeploy() {
    const slot = $("#deploy-slot");
    if (slot) slot.innerHTML = deployHtml();
  }

  // ===== Đăng nhập =====
  function renderLogin(error = "") {
    editor = null;
    const tokenUrl =
      "https://github.com/settings/personal-access-tokens/new?" +
      new URLSearchParams({
        name: "Quan tri blog luuvantuan.com",
        description: "Dang bai tu trang luuvantuan.com/admin",
        target_name: OWNER,
        expires_in: "366",
        contents: "write",
        actions: "read",
      });
    app.innerHTML = `
      <div class="login">
        <form class="login-card" id="login-form">
          <div class="logo">T</div>
          <h1>Quản trị blog</h1>
          <p>Đăng nhập bằng mã truy cập GitHub để viết và quản lý bài.</p>
          <div class="field">
            <label class="label" for="token">Mã truy cập (GitHub token)</label>
            <input class="input" id="token" type="password" autocomplete="current-password" placeholder="github_pat_…" required />
          </div>
          <div class="field">
            <label class="checkbox"><input type="checkbox" id="remember" checked /> Ghi nhớ trên máy này</label>
          </div>
          ${error ? `<div class="error-text">${esc(error)}</div>` : ""}
          <div class="field"><button class="btn primary" style="width:100%" type="submit">Đăng nhập</button></div>
          <details ${error ? "open" : ""}>
            <summary>Chưa có mã? Tạo trong 1 phút</summary>
            <ol>
              <li>Mở <a href="${esc(tokenUrl)}" target="_blank" rel="noopener">trang tạo token của GitHub</a> (đăng nhập GitHub nếu được hỏi).</li>
              <li><b>Repository access</b>: chọn <i>Only select repositories</i> → <b>${esc(REPO)}</b>.</li>
              <li><b>Permissions</b>: <i>Contents</i> = <b>Read and write</b>, <i>Actions</i> = <b>Read-only</b> (để xem web đã cập nhật xong chưa).</li>
              <li>Bấm <b>Generate token</b>, copy mã bắt đầu bằng <code>github_pat_</code> rồi dán vào ô trên.</li>
            </ol>
            <p style="margin-top:10px">Không chia sẻ mã này cho ai. Nếu lỡ lộ, vào GitHub xóa token đó và tạo mã mới.</p>
          </details>
        </form>
      </div>`;
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.submitter || $("#login-form button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Đang kiểm tra…";
      const token = $("#token").value.trim();
      const remember = $("#remember").checked;
      try {
        await signIn(token);
        storage.set(token, remember);
        route();
      } catch (err) {
        renderLogin(err.message);
      }
    });
    $("#token").focus();
  }

  async function signIn(token) {
    state.token = token;
    let repo;
    try {
      repo = await gh(`/repos/${OWNER}/${REPO}`);
    } catch (e) {
      state.token = null;
      if (e.status === 401) throw new Error("Mã truy cập không đúng hoặc đã hết hạn.");
      if (e.status === 404 || e.status === 403) throw new Error(`Mã này chưa được cấp quyền vào repo ${REPO}.`);
      throw e;
    }
    if (repo.permissions && !repo.permissions.push) {
      state.token = null;
      throw new Error("Mã này chỉ có quyền đọc. Cần quyền Contents: Read and write.");
    }
    try { state.user = (await gh("/user")).login; } catch { state.user = null; }
    await Promise.all([loadPosts(), loadTopics()]);
  }

  // ===== Khung chính =====
  function shell(active, content) {
    return `
      <div class="shell">
        <aside class="sidebar">
          <a class="brand" href="#/"><div class="logo">T</div><span>Quản trị blog</span></a>
          <a class="nav ${active === "posts" ? "active" : ""}" href="#/">${ICONS.posts}Tất cả bài</a>
          <a class="nav ${active === "new" ? "active" : ""}" href="#/new">${ICONS.plus}Viết bài mới</a>
          <a class="nav" href="${SITE_URL}" target="_blank" rel="noopener">${ICONS.web}Xem web</a>
          <div class="spacer"></div>
          <button class="nav" id="logout" type="button">${ICONS.out}Đăng xuất</button>
          ${state.user ? `<div class="who">Đăng nhập: ${esc(state.user)}</div>` : ""}
        </aside>
        <main class="main">${content}</main>
      </div>`;
  }
  function bindShell() {
    $("#logout")?.addEventListener("click", () => {
      if (!confirmLeave()) return;
      storage.clear();
      Object.assign(state, { token: null, user: null, posts: null });
      editor = null;
      location.hash = "#/";
      renderLogin();
    });
  }

  // ===== Danh sách bài =====
  function renderList() {
    editor = null;
    const posts = state.posts || [];
    const counts = {
      all: posts.length,
      published: posts.filter((p) => !p.data.draft).length,
      draft: posts.filter((p) => p.data.draft).length,
    };
    app.innerHTML = shell(
      "posts",
      `
      <div id="deploy-slot">${deployHtml()}</div>
      <div class="page-head">
        <h1>Bài viết</h1>
        <a class="btn primary" href="#/new">${ICONS.plus}Viết bài mới</a>
      </div>
      <div class="toolbar-row">
        <div class="tabs" role="tablist">
          ${[["all", "Tất cả"], ["published", "Đã đăng"], ["draft", "Bản nháp"]]
            .map(
              ([k, label]) =>
                `<button class="tab ${state.filter === k ? "active" : ""}" data-filter="${k}" type="button">${label}<span class="count">(${counts[k]})</span></button>`,
            )
            .join("")}
        </div>
        <input class="input search" id="search" type="search" placeholder="Tìm bài…" value="${esc(state.search)}" />
      </div>
      <div class="card" id="post-table"></div>`,
    );
    bindShell();
    $$(".tab").forEach((b) =>
      b.addEventListener("click", () => {
        state.filter = b.dataset.filter;
        renderList();
      }),
    );
    $("#search").addEventListener("input", (e) => {
      state.search = e.target.value;
      renderTable();
    });
    renderTable();
  }

  function renderTable() {
    const q = slugify(state.search).replace(/-/g, " ");
    const rows = (state.posts || []).filter((p) => {
      if (state.filter === "published" && p.data.draft) return false;
      if (state.filter === "draft" && !p.data.draft) return false;
      if (q && !slugify(p.data.title + " " + p.data.description).replace(/-/g, " ").includes(q)) return false;
      return true;
    });
    const box = $("#post-table");
    if (!rows.length) {
      box.innerHTML = `<div class="empty">${
        state.posts?.length ? "Không có bài nào khớp." : 'Chưa có bài nào. <a href="#/new">Viết bài đầu tiên</a>.'
      }</div>`;
      return;
    }
    box.innerHTML = `
      <table class="post-table">
        <thead><tr><th>Tiêu đề</th><th>Chủ đề</th><th>Ngày đăng</th><th>Trạng thái</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (p) => `
            <tr>
              <td>
                <a class="post-title" href="#/edit/${encodeURIComponent(p.slug)}">${esc(p.data.title || "(Chưa có tiêu đề)")}</a>
                ${p.data.description ? `<div class="post-desc">${esc(p.data.description)}</div>` : ""}
                <div class="row-actions">
                  <a class="link-btn" href="#/edit/${encodeURIComponent(p.slug)}">Sửa</a>
                  ${p.data.draft ? "" : `<a class="link-btn" href="${SITE_URL}/blog/${encodeURIComponent(p.slug)}/" target="_blank" rel="noopener">Xem trên web</a>`}
                  <button class="link-btn danger" type="button" data-delete="${esc(p.slug)}">Xóa</button>
                </div>
              </td>
              <td><div class="chips">${p.data.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div></td>
              <td class="col-date">${esc(fmtDate(p.data.date))}</td>
              <td>${p.data.draft ? '<span class="pill draft">Nháp</span>' : '<span class="pill published">Đã đăng</span>'}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>`;
    $$("[data-delete]", box).forEach((b) => b.addEventListener("click", () => removePost(b.dataset.delete)));
  }

  async function removePost(slug) {
    const post = state.posts.find((p) => p.slug === slug);
    if (!post) return;
    if (!confirm(`Xóa hẳn bài "${post.data.title}"?\n\nBài sẽ bị gỡ khỏi web. (Vẫn khôi phục được từ lịch sử GitHub nếu cần.)`)) return;
    try {
      const res = await deleteFile(post.path, post.sha, `Xóa bài: ${post.data.title}`);
      state.posts = state.posts.filter((p) => p !== post);
      toast("Đã xóa bài.");
      watchDeploy(res.commit.sha);
      if (location.hash.startsWith("#/edit/")) location.hash = "#/";
      else renderList();
    } catch (e) {
      toast(e.message, true);
    }
  }

  // ===== Trình soạn bài =====
  function renderEditor(slug) {
    const existing = slug ? state.posts.find((p) => p.slug === slug) : null;
    if (slug && !existing) {
      app.innerHTML = shell("posts", `<div class="empty">Không tìm thấy bài này. <a href="#/">Về danh sách bài</a></div>`);
      bindShell();
      return;
    }
    const post = existing
      ? structuredClone({ data: existing.data, body: existing.body, extra: existing.extra })
      : { data: { title: "", description: "", date: today(), tags: [], draft: true }, body: "", extra: {} };
    editor = {
      isNew: !existing,
      original: existing,
      slug: existing?.slug || "",
      slugTouched: false,
      post,
      saved: serializePost(post),
      tab: "write",
      saving: false,
    };
    const published = existing && !existing.data.draft;
    const topics = [...new Set([...state.topics, ...post.data.tags])];

    app.innerHTML = shell(
      existing ? "posts" : "new",
      `
      <div class="editor-head">
        <a class="btn ghost small" href="#/">← Tất cả bài</a>
        <span class="pill ${published ? "published" : "draft"}">${published ? "Đã đăng" : existing ? "Nháp" : "Bài mới"}</span>
        <span class="save-state" id="save-state"></span>
        <span class="grow"></span>
        ${published ? `<a class="btn small" href="${SITE_URL}/blog/${encodeURIComponent(existing.slug)}/" target="_blank" rel="noopener">Xem trên web ↗</a>` : ""}
        ${
          published
            ? `<button class="btn" id="btn-unpublish" type="button">Chuyển về nháp</button>
               <button class="btn primary" id="btn-publish" type="button">Cập nhật</button>`
            : `<button class="btn" id="btn-draft" type="button">Lưu nháp</button>
               <button class="btn primary" id="btn-publish" type="button">Đăng bài</button>`
        }
      </div>
      <div id="deploy-slot">${deployHtml()}</div>
      <div class="editor-grid">
        <div>
          <textarea class="title-input" id="f-title" rows="1" placeholder="Tiêu đề bài viết">${esc(post.data.title)}</textarea>
          <div class="permalink" id="permalink"></div>
          <div class="card body-card">
            <div class="body-tabs">
              <button class="body-tab active" data-tab="write" type="button">Viết</button>
              <button class="body-tab" data-tab="preview" type="button">Xem trước</button>
              <span class="grow"></span>
              <span class="word-count" id="word-count"></span>
            </div>
            <div id="pane-write">
              <div class="md-toolbar">
                <button class="tb" type="button" data-md="bold" title="Chữ đậm (Ctrl+B)"><b>B</b></button>
                <button class="tb" type="button" data-md="italic" title="Chữ nghiêng (Ctrl+I)"><i>I</i></button>
                <button class="tb" type="button" data-md="h2" title="Tiêu đề lớn">H2</button>
                <button class="tb" type="button" data-md="h3" title="Tiêu đề nhỏ">H3</button>
                <span class="tb-sep"></span>
                <button class="tb" type="button" data-md="ul" title="Gạch đầu dòng">• Danh sách</button>
                <button class="tb" type="button" data-md="ol" title="Danh sách số">1.</button>
                <button class="tb" type="button" data-md="quote" title="Trích dẫn">❝</button>
                <button class="tb" type="button" data-md="link" title="Chèn link (Ctrl+K)">Link</button>
                <button class="tb" type="button" data-md="hr" title="Đường kẻ ngang">―</button>
                <span class="tb-sep"></span>
                <button class="tb media" type="button" data-md="image" title="Chèn ảnh">🖼 Ảnh</button>
                <button class="tb media" type="button" data-md="youtube" title="Chèn video YouTube (không giới hạn dung lượng)">▶ YouTube</button>
                <button class="tb media" type="button" data-md="video" title="Tải video nhỏ lên (dưới ${MAX_VIDEO_MB}MB)">🎬 Video nhỏ</button>
              </div>
              <textarea class="md-text" id="f-body" spellcheck="true" placeholder="Bắt đầu viết ở đây…&#10;&#10;Cách một dòng trống là sang đoạn mới. Dùng các nút ở trên để định dạng chữ, chèn ảnh và video.">${esc(post.body)}</textarea>
            </div>
            <div id="pane-preview" class="preview" hidden></div>
          </div>
        </div>
        <aside>
          <div class="card side-card">
            <h3>Đăng bài</h3>
            <div class="status-line"><span>Trạng thái</span>${published ? '<span class="pill published">Đã đăng</span>' : '<span class="pill draft">Nháp</span>'}</div>
            <div class="field" style="margin-top:14px">
              <label class="label" for="f-date">Ngày đăng</label>
              <input class="input" id="f-date" type="date" value="${esc(post.data.date)}" required />
            </div>
            ${existing ? `<div class="field"><button class="link-btn danger" id="btn-delete" type="button">Xóa bài này</button></div>` : ""}
          </div>
          <div class="card side-card">
            <h3>Chủ đề</h3>
            <div class="topic-list">
              ${
                topics.length
                  ? topics
                      .map(
                        (t) =>
                          `<label class="checkbox"><input type="checkbox" name="topic" value="${esc(t)}" ${post.data.tags.includes(t) ? "checked" : ""} /> ${esc(t)}</label>`,
                      )
                      .join("")
                  : '<span class="hint">Chưa có chủ đề nào trong src/site.ts.</span>'
              }
            </div>
          </div>
          <div class="card side-card">
            <h3>Mô tả ngắn <span class="char-count" id="desc-count"></span></h3>
            <textarea class="textarea" id="f-desc" rows="4" placeholder="1–2 câu tóm tắt bài.">${esc(post.data.description)}</textarea>
            <div class="hint">Hiện dưới tiêu đề trong danh sách bài và trên Google. Nên dưới 160 ký tự.</div>
          </div>
          <div class="card side-card">
            <h3>Đường dẫn</h3>
            <input class="input" id="f-slug" value="${esc(editor.slug)}" ${existing ? "readonly" : ""} placeholder="tu-dong-tao-tu-tieu-de" />
            <div class="hint">${
              existing
                ? "Không đổi được đường dẫn sau khi đã tạo bài (để link cũ không bị hỏng)."
                : "Tự tạo từ tiêu đề. Chỉ dùng chữ thường không dấu, số và dấu gạch ngang."
            }</div>
          </div>
        </aside>
      </div>`,
    );
    bindShell();
    bindEditor();
  }

  function bindEditor() {
    const title = $("#f-title");
    const body = $("#f-body");
    const desc = $("#f-desc");
    const slugInput = $("#f-slug");

    const autosize = (el) => {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    };
    autosize(title);
    autosize(body);

    const sync = () => {
      const p = editor.post;
      p.data.title = title.value.replace(/\n/g, " ");
      p.data.description = desc.value;
      p.data.date = $("#f-date").value;
      p.data.tags = $$('input[name="topic"]:checked').map((i) => i.value);
      p.body = body.value;
      if (editor.isNew && !editor.slugTouched) {
        editor.slug = slugify(p.data.title);
        slugInput.value = editor.slug;
      }
      const words = body.value.trim() ? body.value.trim().split(/\s+/).length : 0;
      $("#word-count").textContent = `${words.toLocaleString("vi-VN")} từ`;
      const len = desc.value.trim().length;
      const dc = $("#desc-count");
      dc.textContent = len ? `${len}/160` : "";
      dc.classList.toggle("over", len > 160);
      $("#permalink").innerHTML = editor.slug
        ? `Đường dẫn: ${esc(SITE_URL)}/blog/<b>${esc(editor.slug)}</b>/`
        : "Đường dẫn sẽ tự tạo từ tiêu đề.";
      const dirty = isDirty();
      const s = $("#save-state");
      s.textContent = dirty ? "● Chưa lưu" : editor.isNew ? "" : "Đã lưu";
      s.classList.toggle("dirty", dirty);
    };
    editor.sync = sync;

    title.addEventListener("input", () => { autosize(title); sync(); });
    title.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); body.focus(); } });
    body.addEventListener("input", () => { autosize(body); sync(); });
    desc.addEventListener("input", sync);
    $("#f-date").addEventListener("input", sync);
    $$('input[name="topic"]').forEach((i) => i.addEventListener("change", sync));
    slugInput.addEventListener("input", () => {
      editor.slugTouched = true;
      editor.slug = slugify(slugInput.value) || "";
      sync();
    });
    slugInput.addEventListener("blur", () => (slugInput.value = editor.slug));

    $$(".body-tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
    $$("[data-md]").forEach((b) => b.addEventListener("click", () => mdAction(b.dataset.md)));
    body.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); mdAction("bold"); }
      if (k === "i") { e.preventDefault(); mdAction("italic"); }
      if (k === "k") { e.preventDefault(); mdAction("link"); }
    });

    $("#btn-publish").addEventListener("click", () => save(false));
    $("#btn-draft")?.addEventListener("click", () => save(true));
    $("#btn-unpublish")?.addEventListener("click", () => save(true));
    $("#btn-delete")?.addEventListener("click", () => removePost(editor.original.slug));

    // Kéo thả / dán ảnh thẳng vào khung viết
    body.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
    body.addEventListener("drop", (e) => {
      const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
      if (file) { e.preventDefault(); openImageDialog(file); }
    });
    body.addEventListener("paste", (e) => {
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
      if (file) { e.preventDefault(); openImageDialog(file); }
    });

    sync();
    if (editor.isNew) title.focus();
  }

  const isDirty = () => !!editor && serializePost(editor.post) !== editor.saved;

  function setTab(tab) {
    editor.tab = tab;
    $$(".body-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("#pane-write").hidden = tab !== "write";
    $("#pane-preview").hidden = tab !== "preview";
    if (tab === "preview") renderPreview();
  }

  // ===== Xem trước =====
  const YT_RE =
    /<iframe( class="short")?(?: style="--size:([0-9.]+)")? src="https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})[^"]*"[^>]*><\/iframe>/g;

  function renderPreview() {
    const p = editor.post;
    const pane = $("#pane-preview");
    let html = marked.parse(p.body || "", { gfm: true });
    pane.innerHTML = `
      <div class="pv-inner">
        <h1 class="pv-title">${esc(p.data.title || "(Chưa có tiêu đề)")}</h1>
        ${p.data.description.trim() ? `<p class="pv-lead">${esc(p.data.description)}</p>` : ""}
        <div class="pv-body">${html}</div>
      </div>`;
    // Ảnh vừa tải lên chưa có trên web: dùng bản trên máy để xem trước
    $$("img, video", pane).forEach((el) => {
      const src = el.getAttribute("src");
      if (localMedia.has(src)) el.src = localMedia.get(src);
    });
    // Bọc video YouTube để hiện đúng tỉ lệ kích thước và nút "Sửa video"
    let i = 0;
    $$("iframe", pane).forEach((frame) => {
      if (!/youtube(-nocookie)?\.com\/embed\//.test(frame.src)) return;
      const index = i++;
      const size = parseFloat(frame.style.getPropertyValue("--size")) || 1;
      const wrap = document.createElement("div");
      wrap.className = "pv-video" + (frame.classList.contains("short") ? " short" : "");
      wrap.style.setProperty("--size", size);
      frame.replaceWith(wrap);
      frame.removeAttribute("style");
      wrap.append(frame);
      wrap.insertAdjacentHTML(
        "beforeend",
        `<span class="pv-badge">${Math.round(size * 100)}%</span><button class="pv-edit" type="button">✎ Sửa video / kích thước</button>`,
      );
      $(".pv-edit", wrap).addEventListener("click", () => editYoutubeAt(index));
    });
  }

  // ===== Định dạng chữ =====
  function insertText(text, selectFrom, selectTo) {
    const ta = $("#f-body");
    ta.focus();
    const start = ta.selectionStart;
    // execCommand giữ được Ctrl+Z; nếu trình duyệt không hỗ trợ thì dùng setRangeText
    const ok = document.execCommand && document.execCommand("insertText", false, text);
    if (!ok) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
    }
    if (selectFrom != null) ta.setSelectionRange(start + selectFrom, start + (selectTo ?? selectFrom));
  }

  function wrapSelection(before, after, placeholder) {
    const ta = $("#f-body");
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd) || placeholder;
    insertText(before + sel + after, before.length, before.length + sel.length);
  }

  function prefixLines(prefixFn) {
    const ta = $("#f-body");
    const v = ta.value;
    const lineStart = v.lastIndexOf("\n", ta.selectionStart - 1) + 1;
    let lineEnd = v.indexOf("\n", ta.selectionEnd);
    if (lineEnd === -1) lineEnd = v.length;
    const lines = v.slice(lineStart, lineEnd).split("\n");
    const out = lines.map((l, i) => prefixFn(l, i)).join("\n");
    ta.setSelectionRange(lineStart, lineEnd);
    insertText(out, out.length);
  }

  function insertBlock(block) {
    const ta = $("#f-body");
    // Chèn sau phần đang chọn, không ghi đè lên chữ
    ta.focus();
    ta.setSelectionRange(ta.selectionEnd, ta.selectionEnd);
    const v = ta.value;
    const before = v.slice(0, ta.selectionStart);
    const after = v.slice(ta.selectionEnd);
    const pre = before === "" ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const post = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
    insertText(pre + block + post, pre.length + block.length + post.length);
  }

  function mdAction(kind) {
    const toggleHeading = (level) => (l) => {
      const clean = l.replace(/^#{1,6}\s+/, "");
      const mark = "#".repeat(level) + " ";
      return l.startsWith(mark) ? clean : mark + clean;
    };
    switch (kind) {
      case "bold": return wrapSelection("**", "**", "chữ đậm");
      case "italic": return wrapSelection("*", "*", "chữ nghiêng");
      case "h2": return prefixLines(toggleHeading(2));
      case "h3": return prefixLines(toggleHeading(3));
      case "ul": return prefixLines((l) => (/^- /.test(l) ? l.slice(2) : "- " + l));
      case "ol": return prefixLines((l, i) => (/^\d+\. /.test(l) ? l.replace(/^\d+\. /, "") : `${i + 1}. ${l}`));
      case "quote": return prefixLines((l) => (/^> /.test(l) ? l.slice(2) : "> " + l));
      case "hr": return insertBlock("---");
      case "link": return openLinkDialog();
      case "image": return openImageDialog();
      case "youtube": {
        // Con trỏ đang nằm trên dòng video YouTube → sửa video đó
        const ta = $("#f-body");
        const pos = ta.selectionStart;
        let m, idx = 0;
        YT_RE.lastIndex = 0;
        while ((m = YT_RE.exec(ta.value))) {
          if (pos >= m.index && pos <= m.index + m[0].length) return editYoutubeAt(idx);
          idx++;
        }
        return openYoutubeDialog();
      }
      case "video": return openVideoDialog();
    }
  }

  // ===== Hộp thoại =====
  const dialog = $("#dialog");
  function openDialog(title, bodyHtml, footHtml) {
    dialog.innerHTML = `
      <form method="dialog" id="dlg-form">
        <div class="dlg-head"><h2>${esc(title)}</h2><button class="x-btn" value="cancel" aria-label="Đóng" formnovalidate>×</button></div>
        <div class="dlg-body">${bodyHtml}</div>
        <div class="dlg-foot">${footHtml}</div>
      </form>`;
    dialog.showModal();
    return $("#dlg-form", dialog);
  }
  const closeDialog = () => dialog.open && dialog.close();

  function openLinkDialog() {
    const ta = $("#f-body");
    const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    const form = openDialog(
      "Chèn link",
      `<div class="field"><label class="label" for="l-text">Chữ hiển thị</label><input class="input" id="l-text" value="${esc(selected)}" placeholder="Ví dụ: kênh YouTube của mình" /></div>
       <div class="field"><label class="label" for="l-url">Địa chỉ link</label><input class="input" id="l-url" type="url" required placeholder="https://…" /></div>`,
      `<button class="btn" value="cancel" formnovalidate>Hủy</button><button class="btn primary" id="l-ok" type="submit">Chèn link</button>`,
    );
    $(selected ? "#l-url" : "#l-text").focus();
    form.addEventListener("submit", (e) => {
      if (e.submitter?.value === "cancel") return;
      e.preventDefault();
      const url = $("#l-url").value.trim();
      const text = $("#l-text").value.trim() || url;
      closeDialog();
      insertText(`[${text}](${url})`, 1, 1 + text.length);
    });
  }

  // --- YouTube ---
  const youtubeId = (input) => {
    const s = String(input ?? "").trim();
    const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : "";
  };
  const YT_ATTRS =
    'title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen';
  const ytIframe = (id, short, pct) => {
    const style = pct < 100 ? ` style="--size:${pct / 100}"` : "";
    return `<iframe${short ? ' class="short"' : ""}${style} src="https://www.youtube-nocookie.com/embed/${id}" ${YT_ATTRS}></iframe>`;
  };

  function editYoutubeAt(index) {
    const ta = $("#f-body");
    YT_RE.lastIndex = 0;
    let m, i = 0;
    while ((m = YT_RE.exec(ta.value))) {
      if (i++ === index) {
        const short = !!m[1];
        openYoutubeDialog({
          url: short ? `https://youtube.com/shorts/${m[3]}` : `https://youtu.be/${m[3]}`,
          short,
          pct: m[2] ? Math.round(parseFloat(m[2]) * 100) : 100,
          range: [m.index, m.index + m[0].length],
        });
        return;
      }
    }
  }

  function openYoutubeDialog(existing) {
    const form = openDialog(
      existing ? "Sửa video YouTube" : "Chèn video YouTube",
      `<div class="field">
         <label class="label" for="yt-url">Link YouTube</label>
         <input class="input" id="yt-url" value="${esc(existing?.url || "")}" placeholder="https://youtu.be/… hoặc link Shorts" required />
         <div class="hint">Không giới hạn dung lượng: đăng video lên YouTube trước (Công khai hoặc <b>Không công khai</b>, không để Riêng tư), rồi dán link vào đây.</div>
       </div>
       <div class="field">
         <label class="checkbox"><input type="checkbox" id="yt-short" ${existing?.short ? "checked" : ""} /> Video dọc (Shorts)</label>
       </div>
       <div class="field">
         <label class="label" for="yt-size">Kích thước trên web</label>
         <div class="range-row">
           <input type="range" id="yt-size" min="30" max="100" step="5" value="${existing?.pct || 100}" />
           <output id="yt-size-out"></output>
         </div>
         <div class="size-presets">
           <button class="btn small" type="button" data-size="50">Nhỏ</button>
           <button class="btn small" type="button" data-size="75">Vừa</button>
           <button class="btn small" type="button" data-size="100">Lớn nhất</button>
         </div>
       </div>
       <div class="yt-stage"><div class="yt-box" id="yt-box"></div><div class="yt-note" id="yt-note"></div></div>
       <div class="error-text" id="yt-err" hidden>Link YouTube chưa đúng.</div>`,
      `${existing ? '<button class="btn danger" type="button" id="yt-remove" style="margin-right:auto">Xóa video</button>' : ""}
       <button class="btn" value="cancel" formnovalidate>Hủy</button>
       <button class="btn primary" type="submit">${existing ? "Cập nhật video" : "Chèn video"}</button>`,
    );
    const url = $("#yt-url");
    const size = $("#yt-size");
    const shortBox = $("#yt-short");
    const update = () => {
      if (/\/shorts\//.test(url.value)) shortBox.checked = true;
      const id = youtubeId(url.value);
      const pct = Number(size.value);
      const short = shortBox.checked;
      $("#yt-size-out").textContent = pct + "%";
      const box = $("#yt-box");
      // Khung minh họa: 100% = toàn bề ngang khung này (tương ứng ~960px trên máy tính)
      box.style.width = short ? `${(pct / 100) * 36}%` : `${pct}%`;
      box.style.aspectRatio = short ? "9 / 16" : "16 / 9";
      box.style.backgroundImage = id ? `url(https://i.ytimg.com/vi/${id}/hqdefault.jpg)` : "none";
      const px = short ? Math.round((760 * 9) / 16 * (pct / 100)) : Math.round(960 * (pct / 100));
      $("#yt-note").textContent = `Trên máy tính: rộng khoảng ${px}px · Trên điện thoại: gần hết bề ngang màn hình`;
      $("#yt-err").hidden = !url.value.trim() || !!id;
    };
    url.addEventListener("input", update);
    size.addEventListener("input", update);
    shortBox.addEventListener("change", update);
    $$("[data-size]", form).forEach((b) => b.addEventListener("click", () => { size.value = b.dataset.size; update(); }));
    update();
    if (!existing) url.focus();

    $("#yt-remove")?.addEventListener("click", () => {
      closeDialog();
      replaceRange(existing.range, "");
    });
    form.addEventListener("submit", (e) => {
      if (e.submitter?.value === "cancel") return;
      e.preventDefault();
      const id = youtubeId(url.value);
      if (!id) { $("#yt-err").hidden = false; url.focus(); return; }
      const code = ytIframe(id, shortBox.checked, Number(size.value));
      closeDialog();
      if (existing) replaceRange(existing.range, code);
      else insertBlock(code);
      if (editor.tab === "preview") renderPreview();
      toast(existing ? "Đã cập nhật video." : "Đã chèn video.");
    });
  }

  function replaceRange([from, to], text) {
    const ta = $("#f-body");
    if (editor.tab !== "write") setTab("write");
    ta.focus();
    ta.setSelectionRange(from, to);
    insertText(text);
    if (editor.tab === "preview") renderPreview();
  }

  // --- Ảnh ---
  async function shrinkImage(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { return file; }
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise((r) => canvas.toBlob(r, type, 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name, { type }) : file;
  }

  function mediaName(file) {
    const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || file.type.split("/")[1] || "bin").toLowerCase();
    const base = slugify(file.name.replace(/\.[^.]+$/, "")) || "file";
    return `${base}-${Date.now().toString(36)}.${ext === "jpeg" ? "jpg" : ext}`;
  }

  async function uploadMedia(file, dir, publicDir) {
    const name = mediaName(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const res = await putFile(`${dir}/${name}`, bytesToB64(bytes), `Tải lên: ${name}`);
    const publicPath = `${publicDir}/${name}`;
    localMedia.set(publicPath, URL.createObjectURL(file));
    return { publicPath, commit: res.commit.sha };
  }

  function pickerHtml(id, accept, text) {
    return `<label class="drop" id="${id}-drop">
        <input type="file" id="${id}-file" accept="${accept}" hidden />
        ${text}
      </label>
      <div id="${id}-picked"></div>`;
  }
  function bindPicker(id, onFile) {
    const drop = $(`#${id}-drop`);
    $(`#${id}-file`).addEventListener("change", (e) => e.target.files[0] && onFile(e.target.files[0]));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    });
  }

  function openImageDialog(initialFile) {
    let file = null;
    const form = openDialog(
      "Chèn ảnh",
      `${pickerHtml("img", "image/*", "<strong>Bấm để chọn ảnh</strong> hoặc kéo thả ảnh vào đây<br><span class='hint'>Ảnh lớn sẽ tự thu nhỏ cho web nhẹ hơn.</span>")}
       <div class="field" style="margin-top:14px">
         <label class="label" for="img-alt">Mô tả ảnh</label>
         <input class="input" id="img-alt" placeholder="Ví dụ: Bìa sách Quy luật của muôn đời" />
         <div class="hint">Giúp Google hiểu ảnh và người khiếm thị nghe được nội dung ảnh.</div>
       </div>
       <div id="img-progress"></div>`,
      `<button class="btn" value="cancel" formnovalidate>Hủy</button><button class="btn primary" type="submit" id="img-ok" disabled>Tải lên và chèn</button>`,
    );
    const setFile = async (f) => {
      if (!f.type.startsWith("image/")) return toast("File này không phải ảnh.", true);
      file = await shrinkImage(f);
      $("#img-picked").innerHTML = `<img class="thumb" src="${URL.createObjectURL(file)}" alt="" />`;
      $("#img-ok").disabled = false;
      if (!$("#img-alt").value) $("#img-alt").value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
    };
    bindPicker("img", setFile);
    if (initialFile) setFile(initialFile);
    form.addEventListener("submit", async (e) => {
      if (e.submitter?.value === "cancel") return;
      e.preventDefault();
      if (!file) return;
      const ok = $("#img-ok");
      ok.disabled = true;
      ok.textContent = "Đang tải lên…";
      $("#img-progress").innerHTML = '<div class="progress"><div></div></div>';
      try {
        const { publicPath } = await uploadMedia(file, IMAGES_DIR, "/images");
        const alt = $("#img-alt").value.trim().replace(/[\[\]]/g, "");
        closeDialog();
        insertBlock(`![${alt}](${publicPath})`);
        toast("Đã tải ảnh lên. Nhớ bấm Lưu bài.");
      } catch (err) {
        ok.disabled = false;
        ok.textContent = "Tải lên và chèn";
        $("#img-progress").innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
      }
    });
  }

  function openVideoDialog() {
    let file = null;
    const form = openDialog(
      "Tải video nhỏ lên",
      `${pickerHtml("vid", "video/mp4,video/webm", `<strong>Bấm để chọn video</strong> (mp4, dưới ${MAX_VIDEO_MB}MB)`)}
       <div class="hint" style="margin-top:10px">Video lớn hơn: đăng lên YouTube rồi dùng nút <b>▶ YouTube</b> (không giới hạn dung lượng, xem mượt hơn).</div>
       <div id="vid-progress"></div>`,
      `<button class="btn" value="cancel" formnovalidate>Hủy</button><button class="btn primary" type="submit" id="vid-ok" disabled>Tải lên và chèn</button>`,
    );
    bindPicker("vid", (f) => {
      if (f.size > MAX_VIDEO_MB * 1024 * 1024) {
        file = null;
        $("#vid-ok").disabled = true;
        $("#vid-picked").innerHTML = `<div class="error-text">Video ${(f.size / 1048576).toFixed(0)}MB, vượt quá ${MAX_VIDEO_MB}MB. Hãy đăng lên YouTube rồi chèn bằng nút YouTube.</div>`;
        return;
      }
      file = f;
      $("#vid-picked").innerHTML = `<video class="thumb" src="${URL.createObjectURL(f)}" controls muted></video>`;
      $("#vid-ok").disabled = false;
    });
    form.addEventListener("submit", async (e) => {
      if (e.submitter?.value === "cancel") return;
      e.preventDefault();
      if (!file) return;
      const ok = $("#vid-ok");
      ok.disabled = true;
      ok.textContent = "Đang tải lên… (có thể mất vài phút)";
      $("#vid-progress").innerHTML = '<div class="progress"><div></div></div>';
      try {
        const { publicPath } = await uploadMedia(file, VIDEOS_DIR, "/videos");
        closeDialog();
        insertBlock(`<video src="${publicPath}" controls playsinline></video>`);
        toast("Đã tải video lên. Nhớ bấm Lưu bài.");
      } catch (err) {
        ok.disabled = false;
        ok.textContent = "Tải lên và chèn";
        $("#vid-progress").innerHTML = `<div class="error-text">${esc(err.message)}</div>`;
      }
    });
  }

  // ===== Lưu bài =====
  async function save(asDraft) {
    if (editor.saving) return;
    editor.sync();
    const p = editor.post;
    if (!p.data.title.trim()) { toast("Bài cần có tiêu đề.", true); $("#f-title").focus(); return; }
    if (!editor.slug) { toast("Đường dẫn chưa hợp lệ.", true); $("#f-slug").focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data.date)) { toast("Hãy chọn ngày đăng.", true); $("#f-date").focus(); return; }
    if (!asDraft && !p.body.trim()) { toast("Bài chưa có nội dung.", true); return; }

    p.data.title = p.data.title.trim();
    p.data.draft = asDraft;
    const path = editor.isNew ? `${POSTS_DIR}/${editor.slug}.md` : editor.original.path;
    const btns = $$(".editor-head .btn");
    btns.forEach((b) => (b.disabled = true));
    editor.saving = true;
    const s = $("#save-state");
    s.textContent = "Đang lưu…";
    try {
      if (editor.isNew && (state.posts.some((x) => x.slug === editor.slug) || (await fileExists(path)))) {
        throw new Error("Đã có bài khác dùng đường dẫn này. Hãy đổi đường dẫn.");
      }
      const text = serializePost(p);
      const verb = editor.isNew ? "Bài mới" : asDraft ? "Lưu nháp" : "Cập nhật bài";
      const res = await putFile(path, textToB64(text), `${verb}: ${p.data.title}`, editor.original?.sha);
      const saved = { slug: editor.isNew ? editor.slug : editor.original.slug, path, sha: res.content.sha, ...structuredClone(p) };
      state.posts = [saved, ...state.posts.filter((x) => x.path !== path)].sort(
        (a, b) => (b.data.date || "").localeCompare(a.data.date || ""),
      );
      editor.saved = text;
      editor.saving = false;
      watchDeploy(res.commit.sha);
      toast(asDraft ? "Đã lưu nháp." : editor.original && !editor.original.data.draft ? "Đã cập nhật bài." : "Đã đăng bài! Web cập nhật sau 1–2 phút.");
      const tab = editor.tab;
      const hash = `#/edit/${encodeURIComponent(saved.slug)}`;
      if (location.hash !== hash) {
        skipNextRoute = true;
        location.hash = hash;
      }
      renderEditor(saved.slug);
      if (tab === "preview") setTab("preview");
    } catch (e) {
      editor.saving = false;
      btns.forEach((b) => (b.disabled = false));
      s.textContent = "● Chưa lưu";
      if (e.status === 409 || (e.status === 422 && /sha/i.test(e.message))) {
        toast("Bài đã bị sửa ở nơi khác. Tải lại trang để lấy bản mới nhất (copy nội dung của bạn trước).", true);
      } else {
        toast(e.message, true);
      }
    }
  }

  // ===== Điều hướng =====
  let skipNextRoute = false;
  let currentHash = location.hash;
  const confirmLeave = () => !isDirty() || confirm("Bài đang sửa chưa được lưu. Rời đi và bỏ thay đổi?");

  window.addEventListener("beforeunload", (e) => {
    if (isDirty()) { e.preventDefault(); e.returnValue = ""; }
  });
  window.addEventListener("hashchange", () => {
    if (skipNextRoute) { skipNextRoute = false; currentHash = location.hash; return; }
    if (editor && !confirmLeave()) {
      skipNextRoute = true;
      location.hash = currentHash;
      return;
    }
    currentHash = location.hash;
    route();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && editor) {
      e.preventDefault();
      save(editor.original ? editor.original.data.draft : true);
    }
  });

  function route() {
    if (!state.token) return renderLogin();
    closeDialog();
    const h = location.hash.replace(/^#/, "") || "/";
    if (h === "/new") return renderEditor(null);
    const m = h.match(/^\/edit\/(.+)$/);
    if (m) return renderEditor(decodeURIComponent(m[1]));
    return renderList();
  }

  // ===== Khởi động =====
  (async () => {
    const saved = storage.get();
    if (!saved) return renderLogin();
    app.innerHTML = '<div class="loading">Đang tải bài viết…</div>';
    try {
      await signIn(saved);
      route();
    } catch (e) {
      if (state.token === null && e.status !== 0) storage.clear();
      renderLogin(e.message);
    }
  })();
})();
