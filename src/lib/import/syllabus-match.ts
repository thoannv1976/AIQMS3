// Match a syllabus file to a course of the program: by the course code in the file name
// (e.g. "DC_LOG101_Nhap_mon….docx"), or by the code / name written inside the document.
// Kept free of server-only imports: the bulk syllabus page runs the file-name match in the browser.

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

interface CourseLite { id: string; code: string; nameVi: string }

const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The course whose code appears in the file name; the longest code wins (LOG101 over LOG10). */
export function matchCourseByFileName<T extends CourseLite>(fileName: string, courses: T[]): T | null {
  const name = compact(fileName.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, ""));
  let best: T | null = null;
  for (const c of courses) {
    const code = compact(c.code);
    if (!code) continue;
    let at = name.indexOf(code);
    while (at >= 0) {
      const next = name[at + code.length];
      // "LOG10" must not match "LOG101": the character after the code cannot be a digit
      // when the code ends with a digit.
      if (!(next && /\d/.test(next) && /\d$/.test(code))) {
        if (!best || code.length > compact(best.code).length) best = c;
        break;
      }
      at = name.indexOf(code, at + 1);
    }
  }
  return best;
}

/** The course named inside the document: "Mã học phần: X" first, then the most frequent code near the top, then the exact course name. */
export function matchCourseInText<T extends CourseLite>(text: string, courses: T[]): T | null {
  const head = text.slice(0, 4000);
  const byCode = new Map(courses.map((c) => [compact(c.code), c]));
  const labelled = /m[aã]\s*(?:s[oố]\s*)?(?:h[oọ]c\s*ph[aầ]n|HP|m[oô]n\s*h[oọ]c)\s*[:：]?\s*([A-Za-z]{1,8}\s*-?\s*\d{2,5}[A-Za-z]?)/i.exec(head);
  if (labelled) {
    const hit = byCode.get(compact(labelled[1]));
    if (hit) return hit;
  }
  const upper = head.toUpperCase();
  let best: { c: T; n: number } | null = null;
  for (const c of courses) {
    const code = c.code.toUpperCase();
    if (!code) continue;
    const n = upper.split(code).length - 1;
    if (n && (!best || n > best.n || (n === best.n && code.length > best.c.code.length))) best = { c, n };
  }
  if (best) return best.c;
  const h = norm(head);
  return courses.find((c) => norm(c.nameVi).length > 8 && h.includes(norm(c.nameVi))) ?? null;
}
