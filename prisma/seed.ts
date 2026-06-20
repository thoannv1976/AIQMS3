import path from "node:path";
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  /* env injected directly */
}

import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { embedText, chunkText } from "../src/lib/ai/embeddings";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function wipe() {
  // Children → parents. Most relations cascade, but be explicit for safety.
  const order = [
    "auditLog","aiChatMessage","aiChatSession","aiAnalysisResult","documentChunk","document",
    "surveyAnswer","surveyResponse","surveyQuestion","survey","outcomeAssessment","recommendation",
    "improvementPlan","reportSection","selfAssessmentReport","evidenceCriterionLink","evidence",
    "task","notification","approvalFlow","cloPloLink","curriculumMap","rubric","clo","courseSyllabus",
    "course","plo","accreditationCycle","criterion","standard","accreditationStandardSet",
    "programVersion","userProgramRole","program","user","department","faculty","university",
  ] as const;
  for (const model of order) {
    // @ts-expect-error dynamic model access
    await prisma[model].deleteMany({});
  }
}

async function main() {
  console.log("🌱 Seeding AIQMS3…");
  await wipe();

  const pw = await bcrypt.hash("Aiqms@123", 10);

  // ---------------- Organisation ----------------
  const university = await prisma.university.create({
    data: { code: "AIQMS", name: "Trường Đại học Demo AIQMS", address: "Hà Nội" },
  });
  const faculty = await prisma.faculty.create({
    data: { universityId: university.id, code: "CNTT", name: "Khoa Công nghệ Thông tin" },
  });
  const department = await prisma.department.create({
    data: { facultyId: faculty.id, code: "HTTT", name: "Bộ môn Hệ thống thông tin" },
  });

  // ---------------- Users ----------------
  const users = await Promise.all(
    [
      ["admin@aiqms.edu.vn", "Nguyễn Quản Trị", "ADMIN", "Quản trị hệ thống"],
      ["qa@aiqms.edu.vn", "Trần Thị Chất Lượng", "QA_OFFICE", "Trưởng phòng KT&ĐBCL"],
      ["khoa@aiqms.edu.vn", "Lê Văn Khoa", "FACULTY", "Trưởng khoa CNTT"],
      ["bomon@aiqms.edu.vn", "Phạm Bộ Môn", "DEPARTMENT", "Trưởng bộ môn HTTT"],
      ["giangvien@aiqms.edu.vn", "Hoàng Giảng Viên", "LECTURER", "Giảng viên"],
      ["daotao@aiqms.edu.vn", "Đỗ Đào Tạo", "TRAINING_OFFICE", "Phòng Đào tạo"],
      ["bgh@aiqms.edu.vn", "GS. Vũ Hiệu Trưởng", "BOARD", "Phó Hiệu trưởng"],
      ["nhansu@aiqms.edu.vn", "Ngô Nhân Sự", "HR_OFFICE", "Phòng TCNS"],
      ["thuvien@aiqms.edu.vn", "Bùi Thư Viện", "LIBRARY", "Trung tâm Thư viện"],
      ["cntt@aiqms.edu.vn", "Đặng Công Nghệ", "IT_CENTER", "Trung tâm CNTT"],
      ["ctsv@aiqms.edu.vn", "Lý Sinh Viên", "STUDENT_AFFAIRS", "Phòng CTSV"],
    ].map(([email, fullName, role, title]) =>
      prisma.user.create({
        data: {
          email,
          fullName,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          role: role as any,
          title,
          passwordHash: pw,
          departmentId: role === "LECTURER" || role === "DEPARTMENT" ? department.id : null,
          unit: title,
        },
      }),
    ),
  );
  const byRole = (r: string) => users.find((u) => u.role === r)!;
  const qa = byRole("QA_OFFICE");
  const lecturer = byRole("LECTURER");
  const facultyHead = byRole("FACULTY");

  // ---------------- Program ----------------
  const program = await prisma.program.create({
    data: {
      facultyId: faculty.id,
      code: "MIS",
      nameVi: "Hệ thống thông tin quản lý",
      nameEn: "Management Information Systems",
      degreeLevel: "BACHELOR",
      totalCredits: 130,
      objectives:
        "Đào tạo cử nhân Hệ thống thông tin quản lý có năng lực phân tích, thiết kế, triển khai và quản trị hệ thống thông tin trong doanh nghiệp; có kỹ năng phân tích dữ liệu phục vụ ra quyết định.",
      description: "Chương trình tích hợp công nghệ thông tin và quản trị kinh doanh, định hướng phân tích dữ liệu và chuyển đổi số.",
      versions: {
        create: [
          { versionLabel: "2026", year: 2026, status: "ACTIVE", summary: "Bổ sung học phần Phân tích dữ liệu & AI, điều chỉnh PLO3.", changeReason: "Phản hồi nhà tuyển dụng về kỹ năng phân tích dữ liệu.", effectiveDate: new Date("2026-08-01") },
          { versionLabel: "2022", year: 2022, status: "ARCHIVED", summary: "Phiên bản chương trình 2022." },
        ],
      },
    },
  });

  await prisma.userProgramRole.createMany({
    data: [
      { userId: qa.id, programId: program.id, role: "QA_OFFICE" },
      { userId: facultyHead.id, programId: program.id, role: "FACULTY" },
      { userId: lecturer.id, programId: program.id, role: "LECTURER" },
    ],
  });

  // ---------------- PLOs ----------------
  const ploDefs = [
    ["PLO1", "Vận dụng kiến thức nền tảng về CNTT và kinh tế trong lĩnh vực HTTT", "knowledge"],
    ["PLO2", "Phân tích và thiết kế hệ thống thông tin cho tổ chức/doanh nghiệp", "skill"],
    ["PLO3", "Phân tích dữ liệu kinh doanh và trình bày kết quả phục vụ ra quyết định", "skill"],
    ["PLO4", "Phát triển và triển khai ứng dụng phần mềm phục vụ nghiệp vụ", "skill"],
    ["PLO5", "Giao tiếp hiệu quả và làm việc nhóm trong môi trường chuyên nghiệp", "skill"],
    ["PLO6", "Thể hiện đạo đức nghề nghiệp và năng lực học tập suốt đời", "autonomy"],
    ["PLO7", "Sử dụng ngoại ngữ và công cụ số trong công việc chuyên môn", "skill"],
  ];
  const plos = await Promise.all(
    ploDefs.map(([code, description, category]) =>
      prisma.plo.create({ data: { programId: program.id, code, description, category } }),
    ),
  );
  const ploByCode = (c: string) => plos.find((p) => p.code === c)!;

  // ---------------- Courses + CLOs ----------------
  const courseDefs: Array<[string, string, number, number, string]> = [
    ["MIS101", "Nhập môn Hệ thống thông tin", 3, 1, "core"],
    ["DBS201", "Cơ sở dữ liệu", 3, 2, "core"],
    ["MIS201", "Phân tích và thiết kế HTTT", 3, 3, "core"],
    ["PRG202", "Lập trình ứng dụng", 3, 3, "core"],
    ["DAT302", "Phân tích dữ liệu kinh doanh", 3, 4, "core"],
    ["ECOM301", "Thương mại điện tử", 3, 5, "elective"],
    ["MGT101", "Quản trị học", 2, 1, "general"],
    ["ENG201", "Tiếng Anh chuyên ngành", 2, 2, "general"],
  ];
  const courses: Array<{ id: string; code: string; clos: Array<{ id: string; code: string; description: string }> }> = [];
  for (const [code, nameVi, credits, semester, type] of courseDefs) {
    const course = await prisma.course.create({
      data: {
        programId: program.id,
        code,
        nameVi,
        credits,
        semester,
        type,
        clos: {
          create: [
            { code: "CLO1", description: `Hiểu và vận dụng kiến thức cốt lõi của học phần ${code}.` },
            { code: "CLO2", description: `Vận dụng ${nameVi.toLowerCase()} để giải quyết bài toán thực tế.` },
            { code: "CLO3", description: `Trình bày và làm việc nhóm trong học phần ${code}.` },
          ],
        },
        syllabi: {
          create: {
            version: "2026.1",
            objectives: `Trang bị kiến thức và kỹ năng về ${nameVi.toLowerCase()}.`,
            content: `Nội dung chính của học phần ${nameVi}.`,
            teachingMethods: "Thuyết giảng, thảo luận, bài tập nhóm, dự án.",
            assessmentMethods: "Chuyên cần 10%, giữa kỳ 30%, dự án/bài tập lớn 20%, cuối kỳ 40%.",
            materials: "Giáo trình chính và tài liệu tham khảo cập nhật.",
            status: "APPROVED",
          },
        },
      },
      include: { clos: true },
    });
    courses.push(course);
  }
  const courseByCode = (c: string) => courses.find((x) => x.code === c)!;

  // Curriculum map (course ↔ PLO with I/R/M)
  const mapDefs: Array<[string, string, "INTRODUCED" | "REINFORCED" | "MASTERED"]> = [
    ["MIS101", "PLO1", "INTRODUCED"], ["MIS101", "PLO5", "INTRODUCED"],
    ["DBS201", "PLO1", "REINFORCED"], ["DBS201", "PLO4", "INTRODUCED"],
    ["MIS201", "PLO2", "MASTERED"], ["MIS201", "PLO5", "REINFORCED"],
    ["PRG202", "PLO4", "MASTERED"], ["PRG202", "PLO7", "REINFORCED"],
    ["DAT302", "PLO3", "MASTERED"], ["DAT302", "PLO1", "REINFORCED"],
    ["ECOM301", "PLO2", "REINFORCED"], ["ECOM301", "PLO3", "REINFORCED"],
    ["MGT101", "PLO1", "INTRODUCED"], ["MGT101", "PLO6", "INTRODUCED"],
    ["ENG201", "PLO7", "MASTERED"], ["ENG201", "PLO5", "REINFORCED"],
  ];
  await prisma.curriculumMap.createMany({
    data: mapDefs.map(([cc, pc, level]) => ({
      programId: program.id,
      courseId: courseByCode(cc).id,
      ploId: ploByCode(pc).id,
      level,
    })),
  });

  // CLO ↔ PLO links (sample)
  for (const course of courses) {
    const related = mapDefs.filter((m) => m[0] === course.code).map((m) => m[1]);
    for (const clo of course.clos) {
      const pc = related[0];
      if (pc) {
        await prisma.cloPloLink.create({
          data: { cloId: clo.id, ploId: ploByCode(pc).id, strength: "MEDIUM" },
        });
      }
    }
  }

  // ---------------- AUN-QA standard set ----------------
  const aunStandards: Array<[string, string, Array<[string, string]>]> = [
    ["1", "Kết quả học tập mong đợi (Expected Learning Outcomes)", [
      ["1.1", "Chuẩn đầu ra được xây dựng phù hợp tầm nhìn, sứ mạng"],
      ["1.2", "Chuẩn đầu ra phản ánh yêu cầu các bên liên quan"],
      ["1.3", "Chuẩn đầu ra đo lường được và bao gồm năng lực chung, chuyên ngành"],
    ]],
    ["2", "Cấu trúc và nội dung chương trình (Programme Structure and Content)", [
      ["2.1", "Cấu trúc chương trình thể hiện sự tích hợp, logic"],
      ["2.2", "Nội dung chương trình cập nhật, đáp ứng chuẩn đầu ra"],
    ]],
    ["3", "Phương pháp dạy và học (Teaching and Learning Approach)", [
      ["3.1", "Triết lý giáo dục được tuyên bố và phổ biến"],
      ["3.2", "Hoạt động dạy và học thúc đẩy đạt chuẩn đầu ra"],
    ]],
    ["4", "Đánh giá người học (Student Assessment)", [
      ["4.1", "Đánh giá người học phù hợp chuẩn đầu ra"],
      ["4.2", "Tiêu chí và rubric đánh giá rõ ràng, minh bạch"],
    ]],
    ["5", "Đội ngũ giảng viên (Academic Staff)", [
      ["5.1", "Quy hoạch và năng lực đội ngũ đáp ứng yêu cầu"],
      ["5.2", "Đội ngũ được đánh giá, bồi dưỡng thường xuyên"],
    ]],
    ["6", "Dịch vụ hỗ trợ người học (Student Support Services)", [
      ["6.1", "Hoạt động hỗ trợ và cố vấn học tập hiệu quả"],
    ]],
    ["7", "Cơ sở vật chất và hạ tầng (Facilities and Infrastructure)", [
      ["7.1", "Cơ sở vật chất, học liệu đáp ứng đào tạo"],
    ]],
    ["8", "Đầu ra và kết quả (Output and Outcomes)", [
      ["8.1", "Tỷ lệ tốt nghiệp, thôi học được theo dõi và cải tiến"],
      ["8.2", "Tỷ lệ có việc làm và phản hồi các bên liên quan"],
    ]],
  ];
  const standardSet = await prisma.accreditationStandardSet.create({
    data: { code: "AUNQA_V4", name: "AUN-QA phiên bản 4.0", description: "Bộ tiêu chuẩn đánh giá cấp chương trình của AUN-QA." },
  });
  const allCriteria: Array<{ id: string; code: string; title: string }> = [];
  let sOrder = 0;
  for (const [code, title, crits] of aunStandards) {
    const standard = await prisma.standard.create({
      data: { setId: standardSet.id, code, title, order: sOrder++ },
    });
    let cOrder = 0;
    for (const [ccode, ctitle] of crits) {
      const criterion = await prisma.criterion.create({
        data: { standardId: standard.id, code: ccode, title: ctitle, order: cOrder++ },
      });
      allCriteria.push({ id: criterion.id, code: ccode, title: ctitle });
    }
  }
  const critByCode = (c: string) => allCriteria.find((x) => x.code === c)!;

  // ---------------- Accreditation cycle ----------------
  const cycle = await prisma.accreditationCycle.create({
    data: {
      programId: program.id,
      standardSetId: standardSet.id,
      name: "Kiểm định AUN-QA chu kỳ 2026",
      year: 2026,
      startDate: new Date("2026-01-15"),
      targetDate: new Date("2026-11-30"),
      status: "SELF_ASSESSMENT",
    },
  });

  // ---------------- Evidence (+ documents for RAG) ----------------
  const evidenceDefs: Array<{
    code: string; title: string; crit: string[]; status: "APPROVED" | "SUBMITTED" | "UPLOADED" | "NEEDS_REVISION";
    provider: string; text?: string;
  }> = [
    {
      code: "E-1.1-01", title: "Quyết định ban hành chuẩn đầu ra chương trình MIS 2026",
      crit: ["1.1", "1.3"], status: "APPROVED", provider: "Phòng Đào tạo",
      text: "Quyết định ban hành chuẩn đầu ra (PLO) của chương trình Hệ thống thông tin quản lý áp dụng từ khóa 2026. Chuẩn đầu ra gồm 7 PLO bao quát kiến thức nền tảng, phân tích thiết kế hệ thống, phân tích dữ liệu, phát triển ứng dụng, kỹ năng giao tiếp làm việc nhóm, đạo đức nghề nghiệp và năng lực ngoại ngữ. Chuẩn đầu ra được Hội đồng Khoa học và Đào tạo thông qua.",
    },
    {
      code: "E-1.2-01", title: "Biên bản tọa đàm lấy ý kiến nhà tuyển dụng về chuẩn đầu ra",
      crit: ["1.2", "8.2"], status: "APPROVED", provider: "Khoa CNTT",
      text: "Biên bản tọa đàm với 12 doanh nghiệp công nghệ và ngân hàng về yêu cầu năng lực đối với sinh viên tốt nghiệp ngành Hệ thống thông tin quản lý. Các nhà tuyển dụng nhấn mạnh kỹ năng phân tích dữ liệu, giao tiếp chuyên nghiệp và sử dụng công cụ số. Kết quả tọa đàm được dùng để điều chỉnh PLO3 và bổ sung học phần Phân tích dữ liệu kinh doanh.",
    },
    {
      code: "E-2.1-01", title: "Khung chương trình đào tạo MIS phiên bản 2026",
      crit: ["2.1", "2.2"], status: "APPROVED", provider: "Phòng Đào tạo",
      text: "Khung chương trình đào tạo ngành Hệ thống thông tin quản lý gồm 130 tín chỉ, cấu trúc theo khối kiến thức giáo dục đại cương, cơ sở ngành, chuyên ngành và thực tập tốt nghiệp. Ma trận học phần - PLO bảo đảm mỗi PLO được ít nhất ba học phần hỗ trợ ở các mức Introduced, Reinforced, Mastered.",
    },
    {
      code: "E-3.2-01", title: "Báo cáo đổi mới phương pháp giảng dạy học phần DAT302",
      crit: ["3.2"], status: "SUBMITTED", provider: "Bộ môn HTTT",
      text: "Báo cáo áp dụng phương pháp học theo dự án (project-based learning) cho học phần Phân tích dữ liệu kinh doanh, sinh viên thực hiện dự án phân tích dữ liệu doanh nghiệp thực tế và thuyết trình kết quả.",
    },
    {
      code: "E-4.2-01", title: "Bộ rubric đánh giá đồ án và bài tập lớn",
      crit: ["4.1", "4.2"], status: "APPROVED", provider: "Bộ môn HTTT",
      text: "Bộ rubric đánh giá đồ án môn học và bài tập lớn với các tiêu chí: hiểu vấn đề, phương pháp, kết quả, trình bày. Mỗi tiêu chí có bốn mức điểm mô tả cụ thể, bảo đảm đánh giá phù hợp chuẩn đầu ra học phần.",
    },
    {
      code: "E-5.1-01", title: "Danh sách và lý lịch khoa học đội ngũ giảng viên",
      crit: ["5.1"], status: "UPLOADED", provider: "Phòng TCNS",
      text: "Danh sách 18 giảng viên cơ hữu của bộ môn, trong đó 2 phó giáo sư, 9 tiến sĩ, 7 thạc sĩ. Tỷ lệ giảng viên có trình độ tiến sĩ đạt 61%.",
    },
    {
      code: "E-8.2-01", title: "Báo cáo khảo sát tình hình việc làm sinh viên tốt nghiệp",
      crit: ["8.1", "8.2"], status: "SUBMITTED", provider: "Phòng CTSV",
      text: "Khảo sát 220 sinh viên tốt nghiệp khóa 2021 sau 12 tháng: tỷ lệ có việc làm đúng ngành đạt 86%, mức độ hài lòng của nhà tuyển dụng trung bình 4.1/5. Một số kỹ năng cần cải thiện gồm phân tích dữ liệu nâng cao và tiếng Anh chuyên ngành.",
    },
    {
      code: "E-6.1-01", title: "Quy định cố vấn học tập và hỗ trợ sinh viên",
      crit: ["6.1"], status: "NEEDS_REVISION", provider: "Phòng CTSV",
    },
  ];

  for (const ev of evidenceDefs) {
    const evidence = await prisma.evidence.create({
      data: {
        programId: program.id,
        cycleId: cycle.id,
        code: ev.code,
        title: ev.title,
        description: ev.text?.slice(0, 200),
        providerUnit: ev.provider,
        fileName: `${ev.code.toLowerCase()}.pdf`,
        fileType: "application/pdf",
        fileSize: 240000,
        storagePath: `local://evidence/MIS/2026/${ev.code}.pdf`,
        status: ev.status,
        confidentiality: "INTERNAL",
        uploadedById: qa.id,
        approvedById: ev.status === "APPROVED" ? facultyHead.id : null,
        approvedAt: ev.status === "APPROVED" ? new Date() : null,
        criterionLinks: {
          create: ev.crit.map((c) => ({ criterionId: critByCode(c).id })),
        },
      },
    });

    if (ev.text) {
      const document = await prisma.document.create({
        data: {
          evidenceId: evidence.id,
          programId: program.id,
          fileName: evidence.fileName!,
          fileType: evidence.fileType,
          extractedText: ev.text,
          summary: ev.text.slice(0, 160),
          language: "vi",
          status: "READY",
        },
      });
      const chunks = chunkText(ev.text);
      await prisma.documentChunk.createMany({
        data: chunks.map((content, i) => ({
          documentId: document.id,
          chunkIndex: i,
          content,
          tokenCount: content.split(/\s+/).length,
          embedding: embedText(content),
        })),
      });
    }
  }

  // ---------------- Self-assessment report ----------------
  const report = await prisma.selfAssessmentReport.create({
    data: { cycleId: cycle.id, title: "Báo cáo tự đánh giá chương trình MIS theo AUN-QA 2026", status: "IN_REVIEW" },
  });
  let order = 0;
  for (const std of aunStandards) {
    const firstCrit = critByCode(std[2][0][0]);
    await prisma.reportSection.create({
      data: {
        reportId: report.id,
        criterionId: firstCrit.id,
        title: `Tiêu chuẩn ${std[0]}: ${std[1]}`,
        content: order < 4
          ? `Chương trình đáp ứng yêu cầu của tiêu chuẩn ${std[0]} thông qua hệ thống minh chứng và quy trình rà soát định kỳ. Số liệu cụ thể được trình bày trong phần phân tích.`
          : null,
        strengths: order < 3 ? "Quy trình rõ ràng, minh chứng đầy đủ." : null,
        weaknesses: order < 3 ? "Cần bổ sung dữ liệu định lượng cập nhật." : null,
        status: order < 3 ? "DONE" : order < 5 ? "DRAFTING" : "NOT_STARTED",
        order: order++,
        assignedToId: qa.id,
        reviewerId: facultyHead.id,
      },
    });
  }

  // ---------------- Tasks ----------------
  const day = 24 * 60 * 60 * 1000;
  const taskDefs: Array<[string, string, "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE", "LOW" | "MEDIUM" | "HIGH" | "URGENT", number, string]> = [
    ["Thu thập minh chứng tiêu chí 6.1", "Phòng CTSV", "IN_PROGRESS", "HIGH", -3, "6.1"],
    ["Hoàn thiện báo cáo tự đánh giá tiêu chuẩn 4", "Phòng KT&ĐBCL", "IN_PROGRESS", "MEDIUM", 7, "4.1"],
    ["Cập nhật ma trận PLO - học phần", "Khoa CNTT", "TODO", "MEDIUM", 14, "2.1"],
    ["Bổ sung dữ liệu khảo sát nhà tuyển dụng", "Khoa CNTT", "TODO", "HIGH", -1, "8.2"],
    ["Rà soát đề cương học phần DAT302", "Bộ môn HTTT", "REVIEW", "LOW", 5, "3.2"],
    ["Hoàn thiện hồ sơ đội ngũ giảng viên", "Phòng TCNS", "DONE", "MEDIUM", -10, "5.1"],
    ["Chuẩn bị lịch làm việc đoàn đánh giá ngoài", "Phòng KT&ĐBCL", "TODO", "URGENT", 21, null as unknown as string],
  ];
  for (const [title, unit, status, priority, due, crit] of taskDefs) {
    await prisma.task.create({
      data: {
        programId: program.id,
        cycleId: cycle.id,
        criterionId: crit ? critByCode(crit).id : null,
        title,
        unit,
        status,
        priority,
        dueDate: new Date(Date.now() + due * day),
        assigneeId: qa.id,
        createdById: qa.id,
      },
    });
  }

  // ---------------- Surveys ----------------
  const employerSurvey = await prisma.survey.create({
    data: {
      programId: program.id,
      title: "Khảo sát nhà tuyển dụng về năng lực sinh viên tốt nghiệp",
      audience: "EMPLOYER",
      status: "CLOSED",
      questions: {
        create: [
          { text: "Mức độ hài lòng về năng lực chuyên môn", type: "LIKERT", order: 1 },
          { text: "Mức độ hài lòng về kỹ năng mềm", type: "LIKERT", order: 2 },
          { text: "Năng lực nào sinh viên cần cải thiện?", type: "OPEN", order: 3 },
        ],
      },
    },
    include: { questions: true },
  });
  const openFeedback = [
    "Sinh viên cần nâng cao kỹ năng phân tích dữ liệu và trực quan hóa.",
    "Khả năng giao tiếp chuyên nghiệp và thuyết trình còn hạn chế.",
    "Nên tăng cường tiếng Anh chuyên ngành và sử dụng công cụ số.",
    "Kỹ năng phân tích dữ liệu cần được rèn luyện qua dự án thực tế.",
    "Tốt về nền tảng nhưng cần thêm trải nghiệm doanh nghiệp.",
  ];
  for (let i = 0; i < 5; i++) {
    const resp = await prisma.surveyResponse.create({
      data: { surveyId: employerSurvey.id, respondent: `Doanh nghiệp ${i + 1}` },
    });
    const likert = employerSurvey.questions.filter((q) => q.type === "LIKERT");
    const open = employerSurvey.questions.find((q) => q.type === "OPEN")!;
    await prisma.surveyAnswer.createMany({
      data: [
        { responseId: resp.id, questionId: likert[0].id, valueNumber: 3 + (i % 3) * 0.5 },
        { responseId: resp.id, questionId: likert[1].id, valueNumber: 3 + (i % 2) },
        { responseId: resp.id, questionId: open.id, valueText: openFeedback[i] },
      ],
    });
  }

  await prisma.survey.create({
    data: {
      programId: program.id,
      title: "Khảo sát sự hài lòng của sinh viên về chương trình",
      audience: "STUDENT",
      status: "OPEN",
      questions: { create: [{ text: "Mức độ hài lòng tổng thể về chương trình", type: "LIKERT", order: 1 }] },
    },
  });

  // ---------------- OBE outcome assessment (multi-period for trend analysis) ----------------
  const obePeriods: Array<{ semester: string; cohort: string; rates: Record<string, number> }> = [
    { semester: "2024-1", cohort: "K2021", rates: { PLO1: 70, PLO2: 80, PLO3: 55, PLO4: 79, PLO5: 67, PLO6: 85, PLO7: 73 } },
    { semester: "2024-2", cohort: "K2021", rates: { PLO1: 76, PLO2: 78, PLO3: 58, PLO4: 79, PLO5: 70, PLO6: 86, PLO7: 69 } },
    { semester: "2025-1", cohort: "K2022", rates: { PLO1: 82, PLO2: 76, PLO3: 61, PLO4: 79, PLO5: 73, PLO6: 88, PLO7: 64 } },
  ];
  await prisma.outcomeAssessment.createMany({
    data: obePeriods.flatMap((p) =>
      Object.entries(p.rates).map(([ploCode, achievedRate]) => ({
        programId: program.id,
        ploCode,
        cohort: p.cohort,
        semester: p.semester,
        achievedRate,
        threshold: 70,
        sampleSize: 180,
      })),
    ),
  });

  // ---------------- Improvement plans (PDCA) ----------------
  await prisma.improvementPlan.createMany({
    data: [
      {
        programId: program.id, cycleId: cycle.id, criterionId: critByCode("8.2").id,
        problem: "PLO3 (phân tích dữ liệu) đạt 61%, thấp hơn ngưỡng 70%.",
        rootCause: "Hoạt động thực hành phân tích dữ liệu còn ít, rubric chưa đo đúng năng lực.",
        action: "Bổ sung dự án phân tích dữ liệu thực tế; cập nhật rubric; tăng bài tập tình huống.",
        responsibleUnit: "Bộ môn HTTT", kpi: "Tỷ lệ đạt PLO3 ≥ 75% sau 2 học kỳ", status: "DO", source: "OBE",
        dueDate: new Date(Date.now() + 120 * day),
      },
      {
        programId: program.id, cycleId: cycle.id, criterionId: critByCode("1.2").id,
        problem: "Cần định kỳ thu thập phản hồi nhà tuyển dụng.",
        rootCause: "Chưa có quy trình khảo sát nhà tuyển dụng hằng năm.",
        action: "Ban hành quy trình khảo sát nhà tuyển dụng định kỳ; tổ chức tọa đàm doanh nghiệp.",
        responsibleUnit: "Khoa CNTT", kpi: "Khảo sát nhà tuyển dụng hằng năm", status: "PLAN", source: "External review",
        dueDate: new Date(Date.now() + 90 * day),
      },
      {
        programId: program.id, cycleId: cycle.id, criterionId: critByCode("7.1").id,
        problem: "Phòng thực hành phân tích dữ liệu cần nâng cấp phần mềm.",
        action: "Trang bị phần mềm phân tích dữ liệu bản quyền; cập nhật học liệu số.",
        responsibleUnit: "Trung tâm CNTT", kpi: "100% phòng máy đủ phần mềm", status: "CHECK", source: "SAR",
        dueDate: new Date(Date.now() - 5 * day),
      },
    ],
  });

  // ---------------- External-review recommendations ----------------
  await prisma.recommendation.createMany({
    data: [
      {
        cycleId: cycle.id, criterionId: critByCode("2.1").id, assessor: "AUN-QA",
        content: "Làm rõ sự tương thích (constructive alignment) giữa CLO, phương pháp dạy-học và đánh giá ở các học phần cốt lõi.",
        priority: "HIGH", responsibleUnit: "Bộ môn HTTT", status: "PLAN",
        dueDate: new Date(Date.now() + 100 * day),
      },
      {
        cycleId: cycle.id, criterionId: critByCode("8.2").id, assessor: "AUN-QA",
        content: "Bổ sung minh chứng phản hồi của nhà tuyển dụng và tỷ lệ việc làm của người tốt nghiệp.",
        priority: "MEDIUM", responsibleUnit: "Phòng CTSV", status: "DO",
        response:
          "Đơn vị tiếp thu khuyến nghị. Đã xây dựng kế hoạch khảo sát nhà tuyển dụng và cựu sinh viên trong học kỳ tới; kết quả và biên bản sẽ được bổ sung vào hồ sơ minh chứng tiêu chí 8.2.",
        respondedAt: new Date(Date.now() - 10 * day),
        dueDate: new Date(Date.now() + 60 * day),
      },
      {
        cycleId: cycle.id, criterionId: critByCode("4.2").id, assessor: "AUN-QA",
        content: "Chuẩn hóa rubric đánh giá và công bố công khai tiêu chí chấm cho người học.",
        priority: "MEDIUM", responsibleUnit: "Bộ môn HTTT", status: "PLAN",
        dueDate: new Date(Date.now() + 80 * day),
      },
    ],
  });

  // ---------------- Audit log samples ----------------
  await prisma.auditLog.createMany({
    data: [
      { userId: qa.id, action: "CREATE", entityType: "Program", entityId: program.id, detail: { code: "MIS" } },
      { userId: qa.id, action: "UPLOAD", entityType: "Evidence", entityId: null, detail: { code: "E-1.1-01" } },
      { userId: facultyHead.id, action: "APPROVE", entityType: "Evidence", entityId: null, detail: { code: "E-1.1-01" } },
      { userId: qa.id, action: "CREATE", entityType: "SelfAssessmentReport", entityId: report.id },
    ],
  });

  console.log(`✅ Done. ${users.length} users, 1 program, ${courses.length} courses, ${allCriteria.length} criteria, ${evidenceDefs.length} evidence.`);
  console.log("   Login: admin@aiqms.edu.vn / Aiqms@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
