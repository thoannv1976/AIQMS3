// Survey templates adapted from the SBI accreditation dataset (phiếu khảo sát SV, GV, DN, cựu SV).
import type { QuestionType, SurveyAudience } from "@/generated/prisma/enums";

export interface TemplateQuestion {
  text: string;
  type: QuestionType;
  options?: string[];
}
export interface SurveyTemplate {
  key: string;
  title: string;
  audience: SurveyAudience;
  description: string;
  questions: TemplateQuestion[];
}

const L = "LIKERT" as QuestionType;
const O = "OPEN" as QuestionType;
const S = "SINGLE_CHOICE" as QuestionType;

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    key: "student",
    title: "Khảo sát sinh viên về chương trình đào tạo",
    audience: "STUDENT" as SurveyAudience,
    description: "Thang 1 = Rất không đồng ý … 5 = Rất đồng ý. Phục vụ tự đánh giá tiêu chuẩn 1–4, 6, 8.",
    questions: [
      { text: "Năm học hiện tại của bạn", type: S, options: ["Năm 1", "Năm 2", "Năm 3", "Năm 4"] },
      { text: "Mục tiêu và chuẩn đầu ra (PLO) của CTĐT được công bố rõ ràng, dễ tiếp cận", type: L },
      { text: "Chuẩn đầu ra đáp ứng yêu cầu thực tế của ngành thương mại điện tử", type: L },
      { text: "Cấu trúc chương trình hợp lý, các học phần có trình tự logic", type: L },
      { text: "Nội dung học phần được cập nhật theo xu hướng công nghệ và thị trường", type: L },
      { text: "Phương pháp giảng dạy khuyến khích học tập chủ động, làm dự án thực tế", type: L },
      { text: "Phương pháp đánh giá công bằng, có tiêu chí (rubric) rõ ràng và được phản hồi kịp thời", type: L },
      { text: "Dịch vụ hỗ trợ (cố vấn học tập, thư viện, CNTT, việc làm) đáp ứng nhu cầu", type: L },
      { text: "Mức độ hài lòng chung với chương trình đào tạo", type: L },
      { text: "Điều bạn muốn nhà trường cải tiến nhất trong chương trình là gì?", type: O },
    ],
  },
  {
    key: "lecturer",
    title: "Khảo sát giảng viên về chương trình đào tạo",
    audience: "LECTURER" as SurveyAudience,
    description: "Thang 1–5. Phục vụ tự đánh giá tiêu chuẩn 2–5 và 7.",
    questions: [
      { text: "Giảng viên được tham gia xây dựng, rà soát chuẩn đầu ra và chương trình", type: L },
      { text: "Ma trận đóng góp học phần – PLO rõ ràng, hỗ trợ thiết kế đề cương", type: L },
      { text: "Khối lượng giảng dạy, nghiên cứu được phân công hợp lý", type: L },
      { text: "Giảng viên được bồi dưỡng chuyên môn, công nghệ số và AI đáp ứng nhu cầu", type: L },
      { text: "Cơ sở vật chất, phòng máy, học liệu số đáp ứng yêu cầu giảng dạy", type: L },
      { text: "Ý kiến của giảng viên được tiếp thu để cải tiến chương trình", type: L },
      { text: "Đề xuất của thầy/cô để nâng cao chất lượng chương trình", type: O },
    ],
  },
  {
    key: "employer",
    title: "Khảo sát nhà tuyển dụng về người học tốt nghiệp",
    audience: "EMPLOYER" as SurveyAudience,
    description: "Thang 1–5. Phục vụ tiêu chí 1.5, 2.3 và 8.5 (phản hồi các bên liên quan bên ngoài).",
    questions: [
      { text: "Lĩnh vực hoạt động của doanh nghiệp", type: S, options: ["Thương mại điện tử", "Bán lẻ/FMCG", "Công nghệ/Phần mềm", "Tài chính/Ngân hàng", "Logistics", "Khác"] },
      { text: "Kiến thức chuyên môn về TMĐT, kinh doanh số của người tốt nghiệp đáp ứng yêu cầu công việc", type: L },
      { text: "Kỹ năng phân tích dữ liệu, ra quyết định", type: L },
      { text: "Kỹ năng công nghệ số và sử dụng công cụ AI", type: L },
      { text: "Kỹ năng ngoại ngữ, giao tiếp, làm việc nhóm", type: L },
      { text: "Đạo đức nghề nghiệp, tinh thần trách nhiệm", type: L },
      { text: "Mức độ hài lòng chung với người tốt nghiệp của chương trình", type: L },
      { text: "Kỹ năng/kiến thức nào nhà trường cần bổ sung cho sinh viên?", type: O },
    ],
  },
  {
    key: "alumni",
    title: "Khảo sát cựu sinh viên",
    audience: "ALUMNI" as SurveyAudience,
    description: "Thang 1–5. Phục vụ tiêu chí 8.2 (việc làm) và 8.5 (mức độ hài lòng).",
    questions: [
      { text: "Tình trạng việc làm hiện tại", type: S, options: ["Đúng chuyên ngành", "Liên quan chuyên ngành", "Trái ngành", "Tự khởi nghiệp", "Học tiếp", "Chưa có việc làm"] },
      { text: "Thời gian tìm được việc làm sau tốt nghiệp", type: S, options: ["Dưới 3 tháng", "3–6 tháng", "6–12 tháng", "Trên 12 tháng"] },
      { text: "Kiến thức, kỹ năng được đào tạo hữu ích cho công việc hiện tại", type: L },
      { text: "Chương trình giúp tôi phát triển năng lực học tập suốt đời", type: L },
      { text: "Mức độ hài lòng chung với chương trình đào tạo", type: L },
      { text: "Góp ý của anh/chị để cải tiến chương trình", type: O },
    ],
  },
];
