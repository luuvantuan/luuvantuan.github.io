// Thông tin chung của blog. Sửa ở đây là đổi trên toàn trang.
export const SITE = {
  title: "Lưu Văn Tuấn",
  description: "Ghi chép trên hành trình học ngoại ngữ, kinh doanh, theo đuổi Đông y và rèn luyện cơ thể.",
  author: "Lưu Văn Tuấn",
  lang: "vi",
  youtube: "https://www.youtube.com/@luuvantuandotcom?sub_confirmation=1",
};

// Các chủ đề (tag) của blog. Bài viết chỉ được gắn các tên trong danh sách này.
// Muốn thêm chủ đề: thêm một dòng mới. Muốn đổi tên: sửa "name" và sửa luôn trong các bài đã dùng.
export const TOPICS = [
  { name: "Học ngoại ngữ", description: "Cách mình học, tài liệu, và những gì rút ra được." },
  { name: "Kinh doanh", description: "Bài học từ việc làm ăn, bán hàng, xây dựng thứ của riêng mình." },
  { name: "Trở thành bác sĩ Đông y", description: "Hành trình học và theo đuổi y học cổ truyền." },
  { name: "Rèn luyện cơ thể", description: "Tập luyện, ăn uống, giữ sức khỏe mỗi ngày." },
  { name: "Nguyên lý", description: "Những nguyên lý sống mình tin và cố gắng sống theo." },
] as const;

export type TopicName = (typeof TOPICS)[number]["name"];
