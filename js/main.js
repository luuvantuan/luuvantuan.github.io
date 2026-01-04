document.addEventListener("DOMContentLoaded", async () => {
  const list = document.getElementById("post-list");
  if (!list) return;

  const res = await fetch("posts/index.json");
  const index = await res.json();

  const posts = [];

  for (const item of index) {
    const html = await fetch(`posts/${item.file}`).then(r => r.text());
    const temp = document.createElement("div");
    temp.innerHTML = html;

    const article = temp.querySelector("article");

    posts.push({
      file: item.file,
      date: item.date,
      title: article.dataset.title,
      desc: article.dataset.desc
    });
  }

  posts
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach(p => {
      const el = document.createElement("div");
      el.className = "post";
      el.innerHTML = `
        <h2>
          <a href="post.html?file=posts/${p.file}">
            ${p.title}
          </a>
        </h2>
        <small>${p.date}</small>
        <p>${p.desc}</p>
      `;
      list.appendChild(el);
    });
});
