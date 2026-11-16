// Downloadable Excel templates for the import screens.
import ExcelJS from "exceljs";

type SheetSpec = { name: string; head: string[]; rows: Array<Array<string | number>>; widths?: number[] };

async function build(sheets: SheetSpec[], guide: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AIQMS3";
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    ws.addRow(s.head);
    s.rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    s.head.forEach((h, i) => (ws.getColumn(i + 1).width = s.widths?.[i] ?? Math.max(10, h.length + 4)));
  }
  const g = wb.addWorksheet("Hướng dẫn");
  g.getColumn(1).width = 120;
  guide.forEach((t) => g.addRow([t]));
  g.getRow(1).font = { bold: true, size: 13 };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function structureTemplate(): Promise<Buffer> {
  return build(
    [
      { name: "Học phần", head: ["Mã HP", "Tên học phần", "Tên tiếng Anh", "Số TC", "Học kỳ", "Loại"], widths: [12, 40, 36, 8, 8, 12], rows: [["AIKD101", "Nhập môn AI trong kinh doanh", "Introduction to AI in Business", 3, 1, "Bắt buộc"], ["AIKD305", "Tự động hóa quy trình kinh doanh", "Business Process Automation", 3, 6, "Tự chọn"]] },
      { name: "PLO", head: ["Mã", "Mô tả", "Nhóm"], widths: [10, 90, 16], rows: [["PLO1", "Vận dụng kiến thức nền tảng về kinh tế, quản trị kinh doanh…", "Kiến thức"], ["PLO2", "Phân tích dữ liệu và xây dựng mô hình hỗ trợ ra quyết định…", "Kỹ năng"]] },
      { name: "Ma trận", head: ["Mã HP", "Tên học phần", "PLO1", "PLO2"], widths: [12, 40, 8, 8], rows: [["AIKD101", "Nhập môn AI trong kinh doanh", "I", ""], ["AIKD305", "Tự động hóa quy trình kinh doanh", "R", "M"]] },
      { name: "CLO", head: ["Mã HP", "Mã CLO", "Mô tả", "PLO liên kết", "Mức đóng góp"], widths: [12, 10, 70, 16, 14], rows: [["AIKD101", "CLO1", "Giải thích các khái niệm cơ bản về AI trong doanh nghiệp", "PLO1, PLO3", "Thấp"], ["AIKD101", "CLO2", "Phân tích một tình huống ứng dụng AI", "PLO2", "Trung bình"]] },
    ],
    [
      "Hướng dẫn nhập cấu trúc chương trình (AIQMS3)",
      "• Giữ nguyên tên cột ở dòng đầu mỗi sheet. Có thể xóa sheet không dùng; có thể tách thành nhiều tệp.",
      "• Học phần: Loại = Bắt buộc / Tự chọn / Đại cương. Mã HP trùng với dữ liệu đã có sẽ được cập nhật.",
      "• PLO: Nhóm = Kiến thức / Kỹ năng / Mức tự chủ và trách nhiệm.",
      "• Ma trận: mỗi cột PLOn nhận I (giới thiệu), R (củng cố), M (thành thạo) hoặc để trống. Ô trống xóa liên kết cũ của học phần đó.",
      "• CLO: PLO liên kết ghi dạng 'PLO1, PLO3'; Mức đóng góp = Thấp / Trung bình / Cao.",
      "• Thứ tự xử lý: Học phần → PLO → Ma trận → CLO, nên có thể nhập tất cả trong một lần.",
    ],
  );
}

export function usersTemplate(): Promise<Buffer> {
  return build(
    [
      {
        name: "Tài khoản",
        head: ["Họ và tên", "Email", "Vai trò", "Chức danh", "Bộ môn", "Chương trình", "Vai trò trong chương trình", "Hết hạn"],
        widths: [28, 32, 22, 30, 30, 14, 26, 12],
        rows: [
          ["TS. Lê Thu Hà", "aikd.khoa@aiqms.edu.vn", "Khoa / Viện", "Trưởng khoa Kinh tế số", "", "AIKD", "", ""],
          ["ThS. Trần Minh Khôi", "aikd.gv01@aiqms.edu.vn", "Giảng viên", "Giảng viên", "Bộ môn Kinh doanh thông minh", "AIKD", "", ""],
          ["TS. Kiều Thanh Bình", "aikd.dgn@aiqms.edu.vn", "EXTERNAL_REVIEWER", "Đánh giá viên ngoài", "", "AIKD", "", "31/12/2026"],
        ],
      },
    ],
    [
      "Hướng dẫn nhập tài khoản hàng loạt (AIQMS3)",
      "• Vai trò: ghi tên tiếng Việt (Giảng viên, Bộ môn, Khoa / Viện, Phòng KT&ĐBCL, Phòng Đào tạo, Ban Giám hiệu, Phòng TCNS, Thư viện, Trung tâm CNTT, Phòng CTSV, Đánh giá viên ngoài, Quản trị hệ thống) hoặc mã (LECTURER, QA_OFFICE…).",
      "• Chương trình: mã chương trình (có thể nhiều, cách nhau dấu phẩy). Vai trò trong chương trình để trống = dùng vai trò hệ thống.",
      "• Bộ môn: đúng tên hoặc mã bộ môn đã khai báo ở Quản trị › Tổ chức.",
      "• Hết hạn: bắt buộc với Đánh giá viên ngoài (dd/mm/yyyy).",
      "• Email đã tồn tại: cập nhật họ tên, chức danh, bộ môn, phân công; KHÔNG đổi mật khẩu.",
      "• Tài khoản mới nhận mật khẩu tạm ngẫu nhiên – tải danh sách mật khẩu ngay sau khi nhập (chỉ hiển thị một lần).",
    ],
  );
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
