import { notFound } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, Badge, PageHeader } from "@/components/ui";

export default async function StandardSetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const set = await prisma.accreditationStandardSet.findUnique({
    where: { id },
    include: {
      standards: {
        orderBy: { order: "asc" },
        include: {
          criteria: {
            orderBy: { order: "asc" },
            include: { _count: { select: { evidenceLinks: true } } },
          },
        },
      },
    },
  });
  if (!set) notFound();

  return (
    <div>
      <PageHeader title={set.name} description={set.description ?? undefined} />

      <div className="space-y-5">
        {set.standards.map((std) => (
          <Card key={std.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Badge color="blue">Tiêu chuẩn {std.code}</Badge>
                <span>{std.title}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {std.criteria.map((c) => {
                const has = c._count.evidenceLinks > 0;
                return (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                    <div className="flex items-start gap-2">
                      {has ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      )}
                      <div>
                        <span className="text-sm font-medium text-slate-800">{c.code}</span>{" "}
                        <span className="text-sm text-slate-600">{c.title}</span>
                      </div>
                    </div>
                    <Badge color={has ? "green" : "amber"}>{c._count.evidenceLinks} minh chứng</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
