// Tạo bài viết mới:  npm run new "Tiêu đề bài viết"
import { existsSync, writeFileSync } from "node:fs";

const title = process.argv.slice(2).join(" ").trim();
if (!title) {
  console.error('Cách dùng: npm run new "Tiêu đề bài viết"');
  process.exit(1);
}

const slug = title
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/đ/g, "d")
  .replace(/Đ/g, "D")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const file = `src/content/blog/${slug}.md`;

if (existsSync(file)) {
  console.error(`Đã có bài này rồi: ${file}`);
  process.exit(1);
}

writeFileSync(
  file,
  `---
title: ${JSON.stringify(title)}
description: ""
date: ${today}
tags: []   # chọn trong: "Học ngoại ngữ", "Kinh doanh", "Trở thành bác sĩ Đông y", "Rèn luyện cơ thể"
draft: true
---

Viết nội dung ở đây.
`,
);

console.log(`Đã tạo: ${file}`);
console.log("Viết xong thì xóa dòng 'draft: true' để đăng bài.");
