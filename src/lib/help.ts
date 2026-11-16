// In-app help: short, task-oriented steps for each screen (shown by the "?" button in the top bar).
export interface HelpEntry {
  match: RegExp;
  title: string;
  steps: string[];
  tips?: string[];
}

export const HELP: HelpEntry[] = [
  { match: /^\/dashboard/, title: "Bảng điều khiển", steps: ["Xem tiến độ các chương trình bạn được phân công: sẵn sàng kiểm định, minh chứng, báo cáo, việc quá hạn.", "Ban Giám hiệu/Phòng KT&ĐBCL: lọc theo khoa, bấm 'Bản tin lãnh đạo' để AI tóm tắt, 'Xuất báo cáo' để tải Word/PDF."], tips: ["Nhấn Ctrl+K để tìm nhanh bất kỳ minh chứng, tiêu chí hay màn hình nào."] },
  { match: /^\/my-work/, title: "Việc của tôi", steps: ["Danh sách việc, mục báo cáo cần viết/phản biện và minh chứng cần bổ sung của riêng bạn.", "Bấm vào từng dòng để mở đúng chỗ cần làm."] },
  { match: /^\/programs\/[^/]+\/import/, title: "Nhập cấu trúc chương trình từ Excel", steps: ["Tải tệp mẫu (nếu chưa có) – 4 sheet: Học phần, PLO, Ma trận, CLO.", "Chọn một hoặc nhiều tệp Excel › Xem trước.", "Đọc cảnh báo đỏ/vàng, kiểm tra bảng › Xác nhận nhập."], tips: ["Mã trùng sẽ được cập nhật; ô trống trong ma trận xóa liên kết cũ của học phần đó."] },
  { match: /^\/programs\/[^/]+\/facts/, title: "Số liệu chính", steps: ["Nhập các số liệu dùng nhiều trong SAR (tỷ lệ việc làm, số GV, tỷ lệ SV/GV…), ghi mã minh chứng nguồn.", "Hoặc bấm 'AI đề xuất từ minh chứng', tích chọn › Thêm.", "Bấm 'AI đối chiếu' để phát hiện số liệu mâu thuẫn giữa các minh chứng."] },
  { match: /^\/programs\/[^/]+/, title: "Chi tiết chương trình", steps: ["Xem thông tin, chu kỳ kiểm định, báo cáo, học phần và đội ngũ.", "Tạo chu kỳ kiểm định › Tạo báo cáo tự đánh giá (mỗi tiêu chí một mục).", "Chu kỳ tiếp theo: mở 'Sao chép sang chu kỳ mới…' trong thẻ chu kỳ.", "Nhập nhanh học phần/PLO/ma trận: nút 'Nhập Excel'."] },
  { match: /^\/programs/, title: "Chương trình đào tạo", steps: ["Danh sách chương trình bạn được xem. Nhãn 'Thực hành' là bản sao cho lớp học.", "Bấm mã chương trình để mở chi tiết."] },
  { match: /^\/outcomes/, title: "Chuẩn đầu ra & ma trận", steps: ["Chọn chương trình › xem PLO và ma trận học phần–PLO (I/R/M).", "'Chỉnh sửa PLO & ma trận' để sửa trực tiếp, hoặc 'Nhập từ Excel' để nhập hàng loạt.", "Dùng 'AI phân tích khoảng trống' để tìm PLO chưa được đo lường đủ."] },
  { match: /^\/syllabi/, title: "Đề cương học phần", steps: ["Chọn học phần › soạn 7 mục của đề cương, thêm CLO và liên kết PLO.", "Có sẵn đề cương Word: dùng 'Nhập từ Word' để tách tự động.", "Bấm 'AI rà soát đề cương' để kiểm tra CLO, đánh giá, tài liệu."] },
  { match: /^\/evidence\/bulk/, title: "Tải minh chứng hàng loạt", steps: ["Đặt tên tệp dạng MC_x.y.zz_Ten.pdf để hệ thống tự nhận mã và tiêu chí.", "Kéo thả tối đa 50 tệp › kiểm tra cột tiêu chí › Tải lên tất cả.", "Tệp trùng mã/trùng nội dung sẽ được báo – dùng 'Phiên bản tệp' nếu là bản cập nhật."] },
  { match: /^\/evidence\/matrix/, title: "Ma trận minh chứng", steps: ["Xem số minh chứng theo từng tiêu chí; ô đỏ là tiêu chí còn trống, đặc biệt tiêu chí điều kiện.", "Xuất Excel để giao việc bổ sung; 'Chuyển mã tiêu chuẩn' khi chuyển bộ tiêu chuẩn."] },
  { match: /^\/evidence\/crosswalk/, title: "Chuyển mã tiêu chuẩn", steps: ["Chọn bộ tiêu chuẩn đích và nguồn ánh xạ (tệp Excel hoặc giữ nguyên mã).", "Xem trước tiêu chí cũ → mới, mã mới (nếu đổi mã) › Áp dụng."] },
  { match: /^\/evidence\/[^/]+/, title: "Chi tiết minh chứng", steps: ["Xem tệp, nội dung trích xuất, tóm tắt AI, tiêu chí liên kết.", "Người duyệt: kiểm tra khung 'AI kiểm tra' (liên quan tiêu chí, văn bản cũ) rồi đổi trạng thái.", "Cập nhật tệp bằng 'Phiên bản tệp', khóa phiên bản khi đã chốt.", "Trao đổi với người nạp ở khung 'Trao đổi' (gõ @ để nhắc tên)."] },
  { match: /^\/evidence/, title: "Minh chứng", steps: ["Lọc theo trạng thái, hiệu lực, chưa gắn tiêu chí; tìm theo từ khóa hoặc theo ý nghĩa (AI).", "Tích chọn nhiều dòng › chọn thao tác (Duyệt, Yêu cầu bổ sung, Gán tiêu chí…) › Áp dụng.", "Cờ 'AI: …' dưới tên minh chứng là cảnh báo cần người duyệt xem kỹ.", "'Xuất hồ sơ (zip)' tải toàn bộ minh chứng đã duyệt theo cây tiêu chí."] },
  { match: /^\/reports\/[^/]+\/versions/, title: "Phiên bản báo cáo", steps: ["Xem các phiên bản đã chốt, chọn 2 phiên bản để so sánh thay đổi."] },
  { match: /^\/reports\/[^/]+/, title: "Báo cáo tự đánh giá", steps: ["QA: 'Công cụ hàng loạt' › Phân công theo tiêu chuẩn.", "Người viết: mở mục › 'AI soạn nháp' › đọc kỹ › 'Áp dụng vào báo cáo' › sửa › Lưu.", "Hoặc 'AI soạn cả báo cáo' để soạn lần lượt mọi mục (giữ trang mở).", "Người phản biện: 'AI rà soát nâng cao', kiểm tra trích dẫn [MC-…], trao đổi ở khung 'Trao đổi'.", "Chốt phiên bản trước khi gửi phê duyệt; xuất Word/PDF."] },
  { match: /^\/reports/, title: "Danh sách báo cáo", steps: ["Mở báo cáo của chương trình để soạn, rà soát, phê duyệt."] },
  { match: /^\/improvements/, title: "Cải tiến (PDCA)", steps: ["Tạo kế hoạch: vấn đề có số liệu, nguyên nhân gốc, hành động, đơn vị, KPI, hạn.", "Liên kết minh chứng 'trước cải tiến'; khi xong liên kết minh chứng 'sau cải tiến'.", "Chuyển trạng thái PLAN → DO → CHECK → ACT → COMPLETED."] },
  { match: /^\/surveys\/[^/]+/, title: "Chi tiết khảo sát", steps: ["Thêm câu hỏi (Likert, chọn một, chọn nhiều, mở) › mở khảo sát › gửi link/QR.", "Đã thu bằng Google Forms/Excel: dùng 'Nhập phản hồi từ Excel/CSV'.", "Đóng khảo sát › 'AI phân tích' › xuất Excel; chuyển phát hiện thành kế hoạch cải tiến."] },
  { match: /^\/surveys/, title: "Khảo sát các bên liên quan", steps: ["Tạo khảo sát mới từ mẫu hoặc trống; chọn đối tượng và tiêu chí liên kết."] },
  { match: /^\/external-review/, title: "Đánh giá ngoài & giải trình", steps: ["Ghi nhận khuyến nghị của đoàn đánh giá ngoài; AI soạn bản giải trình/kế hoạch khắc phục.", "Đánh giá viên ngoài chỉ xem minh chứng đã duyệt."] },
  { match: /^\/readiness/, title: "Sẵn sàng kiểm định", steps: ["Điểm sẵn sàng theo tiêu chí: độ phủ minh chứng, chất lượng SAR, PDCA.", "Bấm tiêu chí yếu để xem việc cần làm; dùng AI phân tích khoảng trống."] },
  { match: /^\/admin\/users\/import/, title: "Nhập tài khoản hàng loạt", steps: ["Tải tệp mẫu › điền danh sách › chọn chương trình mặc định › Xem trước › Xác nhận.", "Tải ngay danh sách mật khẩu tạm (.csv) – chỉ hiện một lần."] },
  { match: /^\/admin\/users/, title: "Quản trị người dùng", steps: ["Tạo tài khoản, đặt vai trò hệ thống, gán vai trò theo chương trình.", "Đánh giá viên ngoài cần ngày hết hạn.", "Nhiều người: 'Nhập hàng loạt từ Excel'."] },
  { match: /^\/admin\/classroom/, title: "Lớp thực hành", steps: ["Chọn chương trình mẫu, tên lớp, số nhóm, học viên › Tạo lớp thực hành.", "Mỗi nhóm có bản sao riêng; học viên chỉ thấy nhóm của mình.", "Sau buổi học: 'Đặt lại' để về dữ liệu mẫu, hoặc xóa."], tips: ["Lớp thực hành không tính vào bảng điều hành và đối sánh của lãnh đạo."] },
  { match: /^\/admin\/system/, title: "Tình trạng hệ thống", steps: ["Kiểm tra CSDL, kho tệp, AI (kèm lỗi gần nhất), hàng đợi xử lý minh chứng, nhắc việc, sao lưu.", "AI báo hết credit: nạp tại console.anthropic.com › Plans & Billing."] },
  { match: /^\/admin\/ai-config/, title: "Cấu hình AI", steps: ["Nhập khóa API Claude, chọn chế độ và mô hình; xem số lượt gọi và chi phí."] },
  { match: /^\/standards/, title: "Bộ tiêu chuẩn", steps: ["Xem và chỉnh sửa tiêu chuẩn/tiêu chí của các bộ TT04/2025, TT20/2026, AUN-QA."] },
  { match: /^\/ai-assistant/, title: "Trợ lý AI", steps: ["Hỏi đáp dựa trên kho minh chứng của chương trình đang chọn; câu trả lời có trích dẫn mã minh chứng."] },
];

export function helpFor(path: string): HelpEntry | null {
  return HELP.find((h) => h.match.test(path)) ?? null;
}
