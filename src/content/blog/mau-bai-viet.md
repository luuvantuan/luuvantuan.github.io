---
title: "Mẫu bài viết (bài nháp, không hiện trên web thật)"
description: "Tham khảo cách viết chữ đậm, tiêu đề, ảnh, video YouTube."
date: 2026-11-25
tags: ["Học ngoại ngữ"]
draft: true
---

Bài này có `draft: true` nên **chỉ hiện khi bạn xem trên máy** (`npm run dev`), không hiện trên luuvantuan.com. Xóa dòng đó (hoặc đổi thành `false`) là bài được đăng.

## Tiêu đề lớn trong bài

Viết đoạn văn bình thường. Cách một dòng trống là sang đoạn mới.

Chữ **đậm**, chữ *nghiêng*, và [một đường link](https://luuvantuan.com).

### Tiêu đề nhỏ hơn

- Gạch đầu dòng
- Gạch đầu dòng thứ hai

1. Danh sách có số
2. Mục thứ hai

> Một câu trích dẫn hay mà bạn muốn làm nổi bật.

## Chèn ảnh

Bỏ ảnh vào thư mục `public/images/`, rồi viết:

```
![Mô tả ảnh](/images/ten-anh.jpg)
```

## Chèn video ngắn (file mp4)

Bỏ video vào thư mục `public/videos/` (mỗi file dưới 50MB), rồi viết:

```html
<video src="/videos/ten-video.mp4" controls playsinline></video>
```

Video dài thì nên đăng lên YouTube rồi chèn như mục dưới, web sẽ nhẹ và nhanh hơn.

## Chèn video YouTube

Dán đoạn này, thay `VIDEO_ID` bằng mã video (phần sau `v=` trong link YouTube):

```html
<iframe src="https://www.youtube-nocookie.com/embed/VIDEO_ID" title="Video" allowfullscreen></iframe>
```

---

Đường kẻ ngang ở trên được tạo bằng ba dấu gạch `---`.
