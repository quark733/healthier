/**
 * The text of a PDF, read in the browser, row by row as it's laid out on the page: the pieces of
 * text on the same line, left to right, joined with spaces. A lab report's table comes out one
 * result a line, the shape pipeline/bloodwork.ts reads. The file never leaves the browser; only the
 * results read from it are sent.
 */
export async function pdfLines(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows: { y: number; items: { x: number; w: number; s: string }[] }[] = [];
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const [, , , , x, y] = it.transform as number[];
      // Text within a couple of points vertically is on the same row.
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) rows.push((row = { y, items: [] }));
      row.items.push({ x, w: it.width ?? 0, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      // Pieces that touch are one word ("10", "E", "9/", "L" is "10E9/L"); a gap is a space.
      let line = '';
      let end = -Infinity;
      for (const i of r.items.sort((a, b) => a.x - b.x)) {
        line += (line && i.x - end > 1.5 ? ' ' : '') + i.s;
        end = i.x + i.w;
      }
      out.push(line.replace(/\s+/g, ' ').trim());
    }
  }
  return out.join('\n');
}
