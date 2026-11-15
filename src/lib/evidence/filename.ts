// Guess evidence code / criterion / title from a file name, e.g.
//   "MC_1.1.01_QD_2586_Mo_nganh_SBI.docx" -> code "MC-1.1.01", criterion "1.1", title "QD 2586 Mo nganh SBI"
//   "E-2.3-04 Bien ban hop.pdf"          -> code "E-2.3-04",  criterion "2.3"
//   "H1.01.02.03-quyet-dinh.pdf"         -> code "H1.01.02.03", criterion "1.2" (AUN/MOET box style)
export interface ParsedEvidenceName {
  code: string;
  criterionCode: string | null;
  title: string;
}

function tidy(s: string): string {
  return s
    .replace(/[_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–.]+|[\s\-–.]+$/g, "")
    .trim();
}

export function parseEvidenceFilename(fileName: string): ParsedEvidenceName {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "");

  // MC_1.1.01_xxx  /  MC-1.1.01 xxx  /  MC 1.2.02b xxx
  let m = base.match(/^(MC|E)[\s_\-]*(\d{1,2})\.(\d{1,2})[.\-_](\d{1,3}[a-z]?)(.*)$/i);
  if (m) {
    const code = `${m[1].toUpperCase()}-${m[2]}.${m[3]}.${m[4]}`;
    return { code, criterionCode: `${Number(m[2])}.${Number(m[3])}`, title: tidy(m[5]) || code };
  }
  // E-2.3-04 xxx
  m = base.match(/^([A-Z]{1,3})[\s_\-]*(\d{1,2})\.(\d{1,2})[\s_\-]+(\d{1,3})(.*)$/i);
  if (m) {
    const code = `${m[1].toUpperCase()}-${m[2]}.${m[3]}-${m[4]}`;
    return { code, criterionCode: `${Number(m[2])}.${Number(m[3])}`, title: tidy(m[5]) || code };
  }
  // H1.01.02.03 xxx  (hộp.tiêu chuẩn.tiêu chí.số)
  m = base.match(/^(H\d+)\.(\d{1,2})\.(\d{1,2})\.(\d{1,3})(.*)$/i);
  if (m) {
    const code = `${m[1].toUpperCase()}.${m[2]}.${m[3]}.${m[4]}`;
    return { code, criterionCode: `${Number(m[2])}.${Number(m[3])}`, title: tidy(m[5]) || code };
  }
  const title = tidy(base);
  return { code: title.slice(0, 24).replace(/\s+/g, "-").toUpperCase(), criterionCode: null, title };
}
