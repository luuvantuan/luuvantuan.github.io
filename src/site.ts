// Thông tin chung của blog (hiển thị bằng tiếng Anh). Sửa ở đây là đổi trên toàn trang.
export const SITE = {
  title: "Lưu Văn Tuấn",
  description: "Notes from my journey learning languages, building a business, studying Eastern medicine, and training my body.",
  author: "Lưu Văn Tuấn",
  lang: "en",
  youtube: "https://www.youtube.com/@luuvantuandotcom?sub_confirmation=1",
};

// Ẩn / hiện các phần của trang.
// Đang ẩn: trang Giới thiệu và các trang Chủ đề. Muốn hiện lại: đổi thành true,
// và bỏ dấu "_" ở đầu tên file src/pages/_gioi-thieu.astro, src/pages/tag/_index.astro, src/pages/tag/_[tag].astro.
export const SHOW = { about: false, topics: false };

// Các chủ đề (tag) của blog. Bài viết chỉ được gắn các tên trong danh sách này.
// Muốn thêm chủ đề: thêm một dòng mới. Muốn đổi tên: sửa "name" và sửa luôn trong các bài đã dùng.
export const TOPICS = [
  { name: "Language Learning", description: "How I learn languages, the resources I use, and what I take away." },
  { name: "Business", description: "Lessons from running a business, selling, and building something of my own." },
  { name: "Becoming an Eastern Medicine Doctor", description: "My journey studying and practicing traditional Eastern medicine." },
  { name: "Fitness", description: "Training, eating well, and staying healthy every day." },
  { name: "Principles", description: "The principles I believe in and try to live by." },
  { name: "Book Summaries", description: "Summaries of the books I read, with takeaways I can apply." },
] as const;

export type TopicName = (typeof TOPICS)[number]["name"];
