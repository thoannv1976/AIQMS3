import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { reportStatus } from "@/lib/labels";
import { buildSarHtml, type SarExportSection } from "@/lib/export/sarHtml";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "doc";

  const report = await prisma.selfAssessmentReport.findUnique({
    where: { id },
    include: {
      cycle: { include: { program: true } },
      sections: { orderBy: { order: "asc" }, include: { criterion: true } },
    },
  });
  if (!report) return new Response("Không tìm thấy báo cáo.", { status: 404 });

  const criterionIds = report.sections.map((s) => s.criterionId).filter(Boolean) as string[];
  const links = criterionIds.length
    ? await prisma.evidenceCriterionLink.findMany({
        where: { criterionId: { in: criterionIds }, evidence: { programId: report.cycle.programId } },
        select: { criterionId: true, evidence: { select: { code: true, title: true } } },
      })
    : [];
  const evByCrit = new Map<string, Array<{ code: string; title: string }>>();
  for (const l of links) {
    const arr = evByCrit.get(l.criterionId) ?? [];
    arr.push(l.evidence);
    evByCrit.set(l.criterionId, arr);
  }

  const sections: SarExportSection[] = report.sections.map((s) => ({
    code: s.criterion?.code ?? null,
    title: s.criterion ? s.criterion.title : s.title,
    content: s.content,
    strengths: s.strengths,
    weaknesses: s.weaknesses,
    improvementPlan: s.improvementPlan,
    evidence: s.criterionId ? evByCrit.get(s.criterionId) ?? [] : [],
  }));

  const html = buildSarHtml({
    programCode: report.cycle.program.code,
    programName: report.cycle.program.nameVi,
    cycleName: report.cycle.name,
    reportTitle: report.title,
    statusLabel: reportStatus[report.status].label,
    generatedAt: new Date(),
    sections,
    autoPrint: format === "pdf",
  });

  const slug = `${report.cycle.program.code}-SAR`.replace(/[^a-zA-Z0-9_-]+/g, "-");

  if (format === "pdf") {
    // Printable page (browser → Save as PDF).
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return new Response(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.doc"`,
    },
  });
}
