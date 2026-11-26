# luuvantuan.com

Blog cá nhân của Lưu Văn Tuấn, làm bằng [Astro](https://astro.build), chạy trên GitHub Pages.

## Làm việc hằng ngày

| Việc | Lệnh |
|---|---|
| Xem blog trên máy (có cả bài nháp) | `npm run dev` rồi mở http://localhost:4321 |
| Tạo bài mới | `npm run new "Tiêu đề bài viết"` |
| Kiểm tra build trước khi đăng | `npm run build` |
| Đăng lên web | `git add . && git commit -m "Bài mới" && git push` |

GitHub tự dựng lại web sau khoảng 1–2 phút mỗi lần bạn `git push` (xem tiến độ ở tab **Actions** của repo).

## Viết bài

Mỗi bài là một file `.md` trong `src/content/blog/`. Tên file là đường dẫn: `di-da-lat.md` sẽ thành `luuvantuan.com/blog/di-da-lat/`.

Đầu mỗi file có phần thông tin:

```yaml
---
title: "Tiêu đề bài"
description: "Một câu tóm tắt, hiện ở danh sách bài và trên Google"
date: 2026-11-26
tags: ["Đời sống", "Đọc sách"]
draft: true   # xóa dòng này để đăng bài
---
```

Xem `src/content/blog/mau-bai-viet.md` để biết cách viết chữ đậm, chèn ảnh, chèn video YouTube.

## Ảnh và video

| Loại | Thư mục | Cách chèn vào bài |
|---|---|---|
| Ảnh | `public/images/` | `![mô tả](/images/ten-anh.jpg)` |
| Video ngắn (mp4, dưới 50MB) | `public/videos/` | `<video src="/videos/ten.mp4" controls playsinline></video>` |
| Video dài | Đăng lên YouTube | Xem `mau-bai-viet.md` |

Đặt tên file không dấu, không khoảng trắng (ví dụ `da-lat-1.jpg`). Nén ảnh dưới 500KB tại https://squoosh.app.
Có nhiều ảnh cho một bài thì tạo thư mục con: `public/images/di-da-lat/1.jpg` → `![](/images/di-da-lat/1.jpg)`.

## Chủ đề (tag)

Ghi trong dòng `tags:` của mỗi bài, ví dụ `tags: ["Đời sống", "Du lịch"]`. Chủ đề mới tự xuất hiện ở trang `/tag/` khi có bài dùng nó.
Gợi ý bộ chủ đề (viết đúng chính tả, hoa thường để không bị tách thành 2 chủ đề):

- **Đời sống**: chuyện hằng ngày
- **Suy ngẫm**: suy nghĩ, bài học
- **Đọc sách**: sách đang đọc, ghi chú sách
- **Du lịch**: những chuyến đi
- **Gia đình**
- **Công việc**
- **Hậu trường**: chuyện đằng sau các video YouTube

## Sửa thông tin chung

- Tên blog, mô tả, **link kênh YouTube**: `src/site.ts`
- Trang giới thiệu: `src/pages/gioi-thieu.astro`
- Câu chào ở trang chủ: `src/pages/index.astro`
- Màu sắc, font chữ: `src/styles/global.css` (phần `:root` ở đầu file)

## Cài đặt GitHub Pages và tên miền (làm 1 lần)

Code nằm ở repo `luuvantuan/luuvantuan.github.io`, được build bằng GitHub Actions (file `.github/workflows/deploy.yml`).

1. Trong repo trên GitHub, mở **Settings → Pages**:
   - **Source:** chọn **GitHub Actions**
   - **Custom domain:** nhập `luuvantuan.com`, bấm Save. Khi kiểm tra DNS xong thì tick **Enforce HTTPS**.
2. Ở nơi quản lý DNS của tên miền, **xóa chỗ đang chuyển hướng `luuvantuan.com` sang YouTube**, rồi thêm các bản ghi sau:
   - 4 bản ghi `A` cho `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - 1 bản ghi `CNAME` cho `www`: `luuvantuan.github.io`
3. Nếu `link.luuvantuan.com` vẫn đang trỏ về GitHub, có thể xóa bản ghi đó (trang link cũ đã được thay bằng blog).
