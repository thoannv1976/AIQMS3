// Load a self-assessment report and render it with buildSarHtml (shared by the SAR export and the dossier zip).
import { prisma } from "@/lib/db";
import { reportStatus } from "@/lib/labels";
import { buildSarHtml, type SarExportSection } from "./sarHtml";

export async function renderReportHtml(reportId: string, opts: { autoPrint?: boolean } = {}) {
  const report = await prisma.selfAssessmentReport.findUnique({
    where: { id: reportId },
    include: { cycle: { include: { program: true } }, sections: { orderBy: { order: "asc" }, include: { criterion: true } } },
  });
  if (!report) return null;
  const criterionIds = report.sections.map((s) => s.criterionId).filter(Boolean) as string[];
  const links = criterionIds.length
    ? await prisma.evidenceCriterionLink.findMany({
        where: { criterionId: { in: criterionIds }, evidence: { programId: report.cycle.programId } },
        select: { criterionId: true, evidence: { select: { code: true, title: true } } },
      })
    : [];
  const evByCrit = new Map<string, Array<{ code: string; title: string }>>();
  for (const l of links) evByCrit.set(l.criterionId, [...(evByCrit.get(l.criterionId) ?? []), l.evidence]);
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
    autoPrint: opts.autoPrint,
  });
  return { html, programId: report.cycle.programId, slug: `${report.cycle.program.code}-SAR`.replace(/[^a-zA-Z0-9_-]+/g, "-") };
}
