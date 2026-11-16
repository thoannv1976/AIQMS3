// Copy a program's content into another program: used for classroom sandboxes ("chế độ lớp học"),
// resetting a sandbox, and duplicating a program/cycle. Evidence files are NOT copied in storage:
// the copy points at the same stored object (deleting a program never deletes stored files).
import { prisma } from "@/lib/db";
import { EvidenceStatus, ReportSectionStatus, Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { isInstitutionWide } from "@/lib/rbac";
import { pgVectorEnabled, indexDocumentVectors } from "@/lib/ai/vector";

export interface CloneOptions {
  /** Copy evidence (metadata, criterion links, extracted text, RAG chunks). */
  evidence: boolean;
  /** Status given to copied evidence: keep the template's, or start everything as "uploaded" for review practice. */
  evidenceStatus: "keep" | "uploaded";
  /** Copy SAR text of the latest report (otherwise sections start empty). */
  sarText: boolean;
  /** Copy key facts and surveys (questions only). */
  extras: boolean;
}

export const DEFAULT_CLONE: CloneOptions = { evidence: true, evidenceStatus: "uploaded", sarText: false, extras: true };

/** Remove everything inside a program but keep the program row and its members (used before re-cloning). */
export async function wipeProgramContent(programId: string): Promise<void> {
  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { programId } }),
    prisma.task.deleteMany({ where: { programId } }),
    prisma.improvementPlan.deleteMany({ where: { programId } }),
    prisma.survey.deleteMany({ where: { programId } }),
    prisma.outcomeAssessment.deleteMany({ where: { programId } }),
    prisma.programFact.deleteMany({ where: { programId } }),
    prisma.document.deleteMany({ where: { programId, evidenceId: null } }),
    prisma.evidence.deleteMany({ where: { programId } }), // cascades links, document, chunks, versions
    prisma.accreditationCycle.deleteMany({ where: { programId } }), // cascades reports, sections
    prisma.curriculumMap.deleteMany({ where: { programId } }),
    prisma.course.deleteMany({ where: { programId } }), // cascades CLOs, syllabi, rubrics
    prisma.plo.deleteMany({ where: { programId } }),
    prisma.programVersion.deleteMany({ where: { programId } }),
  ]);
}

/** Copy the template's content into `targetId` (which should be empty). Returns counts. */
export async function cloneProgramContent(templateId: string, targetId: string, opts: CloneOptions = DEFAULT_CLONE) {
  const t = await prisma.program.findUniqueOrThrow({
    where: { id: templateId },
    include: {
      versions: true,
      plos: true,
      courses: { include: { clos: { include: { ploLinks: true } }, syllabi: { orderBy: { updatedAt: "desc" }, take: 1 } } },
      curriculumMaps: true,
      cycles: { orderBy: [{ year: "desc" }, { createdAt: "desc" }], take: 1, include: { reports: { orderBy: { createdAt: "desc" }, take: 1, include: { sections: true } } } },
      facts: true,
    },
  });
  const counts = { plos: 0, courses: 0, clos: 0, matrix: 0, evidence: 0, sections: 0, facts: 0, surveys: 0 };

  for (const v of t.versions) {
    await prisma.programVersion.create({ data: { programId: targetId, versionLabel: v.versionLabel, year: v.year, status: v.status, summary: v.summary, changeReason: v.changeReason, effectiveDate: v.effectiveDate } });
  }
  const ploMap = new Map<string, string>();
  for (const p of t.plos) {
    const n = await prisma.plo.create({ data: { programId: targetId, code: p.code, description: p.description, category: p.category } });
    ploMap.set(p.id, n.id);
    counts.plos++;
  }
  const courseMap = new Map<string, string>();
  for (const c of t.courses) {
    const n = await prisma.course.create({ data: { programId: targetId, code: c.code, nameVi: c.nameVi, nameEn: c.nameEn, credits: c.credits, semester: c.semester, type: c.type } });
    courseMap.set(c.id, n.id);
    counts.courses++;
    for (const s of c.syllabi) {
      await prisma.courseSyllabus.create({ data: { courseId: n.id, version: s.version, objectives: s.objectives, content: s.content, teachingMethods: s.teachingMethods, assessmentMethods: s.assessmentMethods, materials: s.materials, schedule: s.schedule, requirements: s.requirements, status: s.status } });
    }
    for (const k of c.clos) {
      const clo = await prisma.clo.create({ data: { courseId: n.id, code: k.code, description: k.description } });
      counts.clos++;
      for (const l of k.ploLinks) {
        const pid = ploMap.get(l.ploId);
        if (pid) await prisma.cloPloLink.create({ data: { cloId: clo.id, ploId: pid, strength: l.strength } });
      }
    }
  }
  for (const m of t.curriculumMaps) {
    const cid = courseMap.get(m.courseId), pid = ploMap.get(m.ploId);
    if (cid && pid) {
      await prisma.curriculumMap.create({ data: { programId: targetId, courseId: cid, ploId: pid, level: m.level } });
      counts.matrix++;
    }
  }

  // Latest cycle + report (sections keep the same criteria; text only if asked).
  const cyc = t.cycles[0];
  let newCycleId: string | null = null;
  if (cyc) {
    const nc = await prisma.accreditationCycle.create({ data: { programId: targetId, standardSetId: cyc.standardSetId, name: cyc.name, year: cyc.year, startDate: cyc.startDate, targetDate: cyc.targetDate, status: cyc.status } });
    newCycleId = nc.id;
    const rep = cyc.reports[0];
    if (rep) {
      const nr = await prisma.selfAssessmentReport.create({ data: { cycleId: nc.id, title: rep.title } });
      await prisma.reportSection.createMany({
        data: rep.sections.map((s) => ({
          reportId: nr.id, standardId: s.standardId, criterionId: s.criterionId, title: s.title, order: s.order,
          content: opts.sarText ? s.content : null, strengths: opts.sarText ? s.strengths : null, weaknesses: opts.sarText ? s.weaknesses : null, improvementPlan: opts.sarText ? s.improvementPlan : null,
          status: opts.sarText ? s.status : ReportSectionStatus.NOT_STARTED,
        })),
      });
      counts.sections = rep.sections.length;
    }
  }

  if (opts.evidence) {
    const evs = await prisma.evidence.findMany({
      where: { programId: templateId },
      include: { criterionLinks: true, document: { include: { chunks: true } } },
      orderBy: { code: "asc" },
    });
    for (const e of evs) {
      const status = opts.evidenceStatus === "keep" ? e.status : EvidenceStatus.UPLOADED;
      const ne = await prisma.evidence.create({
        data: {
          programId: targetId, cycleId: newCycleId, code: e.code, title: e.title, description: e.description, providerUnit: e.providerUnit,
          fileName: e.fileName, fileType: e.fileType, fileSize: e.fileSize, storagePath: e.storagePath, checksum: e.checksum, version: e.version,
          status, confidentiality: e.confidentiality, issuedAt: e.issuedAt, validUntil: e.validUntil,
          approvedAt: status === EvidenceStatus.UPLOADED ? null : e.approvedAt,
          aiCheck: (e.aiCheck ?? undefined) as Prisma.InputJsonValue | undefined, aiCheckedAt: e.aiCheckedAt,
        },
      });
      if (e.criterionLinks.length) {
        await prisma.evidenceCriterionLink.createMany({ data: e.criterionLinks.map((l) => ({ evidenceId: ne.id, criterionId: l.criterionId, note: l.note, suggestedByAi: l.suggestedByAi })) });
      }
      if (e.document) {
        const d = e.document;
        const nd = await prisma.document.create({ data: { evidenceId: ne.id, programId: targetId, fileName: d.fileName, fileType: d.fileType, extractedText: d.extractedText, summary: d.summary, language: d.language, status: d.status } });
        if (d.chunks.length) {
          await prisma.documentChunk.createMany({ data: d.chunks.map((c) => ({ documentId: nd.id, chunkIndex: c.chunkIndex, content: c.content, tokenCount: c.tokenCount, pageNumber: c.pageNumber, sectionTitle: c.sectionTitle, embedding: c.embedding })) });
          if (pgVectorEnabled()) await indexDocumentVectors(nd.id).catch(() => {});
        }
      }
      counts.evidence++;
    }
  }

  if (opts.extras) {
    for (const f of t.facts) {
      await prisma.programFact.create({ data: { programId: targetId, groupName: f.groupName, label: f.label, value: f.value, unit: f.unit, period: f.period, sourceCode: f.sourceCode, note: f.note, order: f.order } });
      counts.facts++;
    }
    const surveys = await prisma.survey.findMany({ where: { programId: templateId }, include: { questions: true } });
    for (const s of surveys) {
      await prisma.survey.create({
        data: {
          programId: targetId, title: s.title, audience: s.audience, description: s.description, criterionId: s.criterionId,
          questions: { create: s.questions.map((q) => ({ text: q.text, type: q.type, order: q.order, options: (q.options ?? undefined) as Prisma.InputJsonValue | undefined })) },
        },
      });
      counts.surveys++;
    }
  }
  return counts;
}

/** Give each member a program-scoped role equal to their system role (institution-wide roles need none). */
export async function addMembers(programId: string, userIds: string[]): Promise<number> {
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, role: true } });
  let n = 0;
  for (const u of users) {
    if (isInstitutionWide(u.role) && u.role !== Role.EXTERNAL_REVIEWER) continue;
    await prisma.userProgramRole.upsert({ where: { userId_programId_role: { userId: u.id, programId, role: u.role } }, update: {}, create: { userId: u.id, programId, role: u.role } });
    n++;
  }
  return n;
}
