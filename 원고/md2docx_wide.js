// Minimal academic markdown -> docx converter.
// Syntax: "# " title-level H1, "## " H2, "### " H3, "#### " H4, "- " bullet, "1) " numbered-like plain,
// "| a | b |" tables (first row header, second row separator), "> " boxed note,
// "[[fn: text]]" inline footnote, "**bold**", "---PAGE---" page break, "[[TOC]]" table of contents,
// "@@center text" centered paragraph, "@@big text" big centered title.
const fs = require('fs');
const d = require('docx');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, FootnoteReferenceRun, PageBreak, TableOfContents,
  Footer, PageNumber, Header } = d;

const [,, inFile, outFile, headerText] = process.argv;
const src = fs.readFileSync(inFile, 'utf8').split('\n');
const FONT = '바탕';
const SANS = '맑은 고딕';
const footnotes = {};
let fnId = 1;

function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\[\[fn:([\s\S]*?)\]\])/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }));
    if (m[0].startsWith('**')) out.push(new TextRun({ text: m[0].slice(2, -2), bold: true, font: FONT, ...base }));
    else {
      const id = fnId++;
      footnotes[id] = { children: [new Paragraph({ children: [new TextRun({ text: m[2].trim(), font: FONT, size: 17 })] })] };
      out.push(new FootnoteReferenceRun(id));
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...base }));
  return out;
}

const TABLE_W = 9026; // A4 text width with 1" margins (11906-2*1440)
function makeTable(rows) {
  const cells = rows.map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  const header = cells[0];
  const body = cells.slice(2);
  const n = header.length;
  // weight columns by max text length
  const lens = header.map((_, i) => Math.max(...[header, ...body].map(r => Math.min((r[i] || '').length, 60))) + 4);
  for (let k = 0; k < lens.length; k++) lens[k] = Math.max(lens[k], 14);
  const total = lens.reduce((a, b) => a + b, 0);
  let widths = lens.map(l => Math.floor(TABLE_W * l / total));
  widths[n - 1] += TABLE_W - widths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const mk = (r, isHead) => new TableRow({ tableHeader: isHead, children: r.map((c, i) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, borders,
    shading: isHead ? { fill: 'E7ECF3', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: (c || '').split('<br>').map(t => new Paragraph({ spacing: { after: 0, line: 276 },
      alignment: isHead ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: runs(t, { size: 18, bold: isHead || undefined }) })) })) });
  return new Table({ width: { size: TABLE_W, type: WidthType.DXA }, columnWidths: widths,
    rows: [mk(header, true), ...body.map(r => { while (r.length < n) r.push(''); return mk(r.slice(0, n), false); })] });
}

const children = [];
for (let i = 0; i < src.length; i++) {
  const line = src[i];
  if (line.trim() === '') continue;
  if (line.startsWith('|')) {
    const rows = [];
    while (i < src.length && src[i].startsWith('|')) rows.push(src[i++]);
    i--;
    children.push(makeTable(rows));
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    continue;
  }
  if (line.trim() === '---PAGE---') { children.push(new Paragraph({ children: [new PageBreak()] })); continue; }
  if (line.trim() === '[[TOC]]') {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: '목 차', font: SANS })] }));
    children.push(new TableOfContents('목차', { hyperlink: true, headingStyleRange: '1-3' }));
    children.push(new Paragraph({ children: [new TextRun({ text: '※ Word에서 목차 영역을 우클릭 → [필드 업데이트]를 누르면 쪽 번호가 표시됩니다.', size: 16, color: '808080', font: FONT })] }));
    continue;
  }
  let m;
  if ((m = line.match(/^@@big (.*)/))) { children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun({ text: m[1], bold: true, size: 36, font: SANS })] })); continue; }
  if ((m = line.match(/^@@center (.*)/))) { children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: runs(m[1], { size: 24 }) })); continue; }
  if ((m = line.match(/^@@right (.*)/))) { children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 120 }, children: runs(m[1], { size: 22 }) })); continue; }
  if ((m = line.match(/^(#{1,4}) (.*)/))) {
    const lvl = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][m[1].length - 1];
    children.push(new Paragraph({ heading: lvl, alignment: m[1].length === 1 ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: m[2], font: SANS })] }));
    continue;
  }
  if ((m = line.match(/^- (.*)/))) { children.push(new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 60, line: 340 }, alignment: AlignmentType.JUSTIFIED, children: runs(m[1]) })); continue; }
  if ((m = line.match(/^  - (.*)/))) { children.push(new Paragraph({ numbering: { reference: 'bul', level: 1 }, spacing: { after: 40, line: 340 }, children: runs(m[1]) })); continue; }
  if ((m = line.match(/^> (.*)/))) {
    children.push(new Paragraph({ spacing: { before: 60, after: 120, line: 320 }, indent: { left: 360, right: 360 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: '7F96B2', space: 4 }, left: { style: BorderStyle.SINGLE, size: 4, color: '7F96B2', space: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: '7F96B2', space: 4 }, right: { style: BorderStyle.SINGLE, size: 4, color: '7F96B2', space: 4 } },
      shading: { fill: 'F3F6FA', type: ShadingType.CLEAR, color: 'auto' }, children: runs(m[1], { size: 19 }) }));
    continue;
  }
  children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 120, line: 360 }, indent: { firstLine: 200 }, children: runs(line) }));
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: SANS, size: 30, bold: true }, paragraph: { spacing: { before: 360, after: 240 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: SANS, size: 25, bold: true }, paragraph: { spacing: { before: 280, after: 140 }, keepNext: true, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: SANS, size: 22, bold: true }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 2 } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: SANS, size: 21, bold: true }, paragraph: { spacing: { before: 140, after: 80 }, keepNext: true, outlineLevel: 3 } },
    ],
  },
  numbering: { config: [{ reference: 'bul', levels: [
    { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 500, hanging: 260 } } } },
    { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 900, hanging: 260 } } } } ] }] },
  footnotes,
  features: { updateFields: true },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: headerText || '', size: 16, color: '808080', font: SANS })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['- ', PageNumber.CURRENT, ' -'], size: 18 })] })] }) },
    children,
  }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(outFile, b); console.log('wrote', outFile, 'footnotes:', fnId - 1); });
