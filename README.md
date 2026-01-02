# luuvantuan.github.io

Trang này đã được chuyển sang cấu trúc Jekyll tối thiểu để dễ quản lý bài viết và tích hợp Netlify CMS.

Cách chạy cục bộ:

1. Cài đặt Ruby và Bundler (tham khảo tài liệu Ruby nếu cần).
2. Trong thư mục dự án, chạy (nếu có Gemfile) `bundle install`.
3. Chạy:

```
jekyll serve --livereload
```

Sau đó mở `http://127.0.0.1:4000`.

Ghi chú:
- Thư mục `admin/` hiện có cấu hình Netlify CMS; nếu bạn muốn chỉnh sửa nội dung trực tiếp từ trình duyệt, hosting trên Netlify và bật Identity + Git Gateway sẽ hoạt động tốt.
- Nếu bạn muốn mình tạo thêm Gemfile/Github Actions để build, nói mình biết.
