const postFiles = [
  "posts/bai-1.html"
];

const list = document.getElementById("post-list");

postFiles.forEach(file => {
  fetch(file)
    .then(res => res.text())
    .then(html => {
      const temp = document.createElement("div");
      temp.innerHTML = html;

      const article = temp.querySelector("article");

      const title = article.dataset.title;
      const date = article.dataset.date;
      const desc = article.dataset.desc;

      const item = document.createElement("div");
      item.className = "post";

      item.innerHTML = `
        <h2>
          <a href="post.html?file=${file}">
            ${title}
          </a>
        </h2>
        <small>${date}</small>
        <p>${desc}</p>
      `;

      list.appendChild(item);
    });
});

