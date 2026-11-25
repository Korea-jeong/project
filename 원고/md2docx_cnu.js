// 충남대학교 대학원 국문 석사학위청구논문 서식 적용 변환기
// 판형 B5(182x257mm), 여백 위·아래 30mm 좌·우 25mm, 본문 HY신명조 11pt 줄간격 180%, 각주 9pt
const fs = require('fs');
const d = require('docx');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, LevelFormat, FootnoteReferenceRun, PageBreak, TableOfContents,
  Footer, PageNumber, NumberFormat, HeightRule, VerticalAlign } = d;

const [,, inFile, outFile, metaFile] = process.argv;
const src = fs.readFileSync(inFile, 'utf8').split('\n');
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
const FONT = 'HY신명조';
const footnotes = {};
let fnId = 1;
let absMode = false;

function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\[\[fn:([\s\S]*?)\]\])/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }));
    if (m[0].startsWith('**')) out.push(new TextRun({ text: m[0].slice(2, -2), bold: true, font: FONT, ...base }));
    else {
      const id = fnId++;
      footnotes[id] = { children: [new Paragraph({ spacing: { line: 240, lineRule: 'auto', after: 0 }, alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: m[2].trim(), font: FONT, size: 18 })] })] };
      out.push(new FootnoteReferenceRun(id));
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...base }));
  return out;
}

const TEXT_W = 10318 - 2 * 1418; // 7482 twips
function makeTable(rows) {
  const cells = rows.map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  const header = cells[0];
  const body = cells.slice(2);
  const n = header.length;
  const lens = header.map((_, i) => Math.max(...[header, ...body].map(r => Math.min((r[i] || '').length, 60))) + 4);
  for (let k = 0; k < lens.length; k++) lens[k] = Math.max(lens[k], 12);
  const total = lens.reduce((a, b) => a + b, 0);
  const widths = lens.map(l => Math.floor(TEXT_W * l / total));
  widths[n - 1] += TEXT_W - widths.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const mk = (r, isHead) => new TableRow({ tableHeader: isHead, cantSplit: true, children: r.map((c, i) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, borders,
    shading: isHead ? { fill: 'EDEDED', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 40, bottom: 40, left: 70, right: 70 },
    children: (c || '').split('<br>').map(t => new Paragraph({ spacing: { after: 0, line: 252, lineRule: 'auto' },
      alignment: isHead ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: runs(t, { size: 17, bold: isHead || undefined }) })) })) });
  return new Table({ width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: widths,
    rows: [mk(header, true), ...body.map(r => { while (r.length < n) r.push(''); return mk(r.slice(0, n), false); })] });
}

// ---------- 표지 ----------
const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NBS = { top: NB, bottom: NB, left: NB, right: NB };
function coverTable(rowsSpec) {
  return new Table({ width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W],
    borders: { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB },
    rows: rowsSpec.map(([h, lines]) => new TableRow({ height: h ? { value: h, rule: HeightRule.ATLEAST } : undefined,
      children: [new TableCell({ width: { size: TEXT_W, type: WidthType.DXA }, borders: NBS, verticalAlign: VerticalAlign.CENTER,
        children: (lines.length ? lines : [['', 22]]).map(([t, sz]) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0, line: 276, lineRule: 'auto' },
          children: [new TextRun({ text: t, font: FONT, size: sz })] })) })] })) });
}
function titleLines(tSize, sSize) {
  const out = meta.title.map(t => [t, tSize]);
  if (meta.subtitle) out.push(...meta.subtitle.map(t => [t, sSize]));
  return out;
}
const cover1 = coverTable([
  [400, []], [295, [['석 사 학 위 논 문', 24]]], [600, []],
  [1327, titleLines(44, 26)], [1300, []],
  [295, [['충남대학교 대학원', 24]]], [300, []],
  [295, [[meta.dept, 24]]], [700, []],
  [334, [[meta.name, 28]]], [900, []],
  [334, [['지도교수 ' + meta.advisor, 24]]], [1400, []],
  [0, [[meta.date_cover, 24]]],
]);
const cover2 = coverTable([
  [1000, []], [1327, titleLines(40, 26)], [500, []],
  [334, [['지도교수 ' + meta.advisor, 28]]], [1000, []],
  [884, [['이 논문을 ' + meta.degree + '학위', 32], ['청구논문으로 제출함', 32]]], [700, []],
  [334, [[meta.date_submit, 28]]], [800, []],
  [0, [['충남대학교 대 학 원', 28]]], [350, []],
  [0, [[meta.dept, 28]]], [350, []],
  [0, [[meta.name, 28]]],
]);
const cover3 = coverTable([
  [1500, []], [992, [[meta.name_plain + '의 ' + meta.degree + '학위', 36], ['청구논문을 인준함', 36]]],
  [2400, titleLines(32, 24)],
  [227, [[meta.date_approve, 28]]], [850, []],
  [283, [['논문심사위원회', 32]]], [794, []],
  [386, [['위원장                              (인)', 28]]],
  [386, [['위  원                              (인)', 28]]],
  [386, [['위  원                              (인)', 28]]],
  [850, []],
  [0, [['충 남 대 학 교 대 학 원', 32]]],
]);

// ---------- 본문 ----------
const sections = { covers: [cover1, new Paragraph({ children: [new PageBreak()] }), cover2, new Paragraph({ children: [new PageBreak()] }), cover3], front: [], body: [] };
let cur = null;
const frontTitle = t => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 360 }, children: [new TextRun({ text: t, font: FONT, size: 32, bold: true })] });
const bodyPara = (text, extra = {}) => absMode
  ? new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 0, line: 276, lineRule: 'auto' }, indent: { firstLine: 195 }, children: runs(text, { size: 20 }), ...extra })
  : new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 0, line: 432, lineRule: 'auto' }, indent: { firstLine: 225 }, children: runs(text, { size: 22 }), ...extra });

for (let i = 0; i < src.length; i++) {
  const line = src[i];
  if (line.trim() === '') continue;
  let m;
  if ((m = line.match(/^@@section (\w+)/))) { cur = sections[m[1]]; continue; }
  if (line.trim() === '@@covers') continue;
  if (line.trim() === '@@toc') { cur.push(frontTitle('목    차')); cur.push(new TableOfContents('목차', { hyperlink: true, headingStyleRange: '1-2' })); cur.push(new Paragraph({ children: [new PageBreak()] })); continue; }
  if (line.trim() === '@@tot') { cur.push(frontTitle('표 목 차')); cur.push(new TableOfContents('표 목차', { hyperlink: true, stylesWithLevels: [new d.StyleLevel('TableCaption', 1)] })); cur.push(new Paragraph({ children: [new PageBreak()] })); continue; }
  if (line.trim() === '@@tof') { cur.push(frontTitle('그 림 목 차')); cur.push(new TableOfContents('그림 목차', { hyperlink: true, stylesWithLevels: [new d.StyleLevel('FigureCaption', 1)] })); continue; }
  if (line.trim() === '@@abs') { absMode = true; continue; }
  if ((m = line.match(/^@@absc ?(.*)/))) { cur.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0, line: 276, lineRule: 'auto' }, children: runs(m[1] || '', { size: 20 }) })); continue; }
  if (line.startsWith('|')) {
    const rows = [];
    while (i < src.length && src[i].startsWith('|')) rows.push(src[i++]);
    i--;
    cur.push(makeTable(rows));
    cur.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
    continue;
  }
  if (line.trim() === '---PAGE---') {
    if (cur.length && !(cur[cur.length - 1] && cur[cur.length - 1].__pb)) { const p = new Paragraph({ children: [new PageBreak()] }); p.__pb = true; cur.push(p); }
    continue;
  }
  if ((m = line.match(/^@@capx ([^|]+)\|(.*)/))) {
    cur.push(new Paragraph({ style: 'TableCaption', alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 200, after: 80, line: 276, lineRule: 'auto' }, children: [new TextRun({ text: m[1] + ' ' + m[2], font: FONT, size: 20, bold: true })] }));
    continue;
  }
  if ((m = line.match(/^@@figx ([^|]+)\|(\d+)\|(\d+)\|([^|]+)\|(.*)/))) {
    const buf = fs.readFileSync(m[1].trim());
    cur.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 60 }, children: [new d.ImageRun({ type: 'png', data: buf, transformation: { width: parseInt(m[2]), height: parseInt(m[3]) } })] }));
    cur.push(new Paragraph({ style: 'FigureCaption', alignment: AlignmentType.CENTER, spacing: { before: 40, after: 240, line: 276, lineRule: 'auto' }, children: [new TextRun({ text: m[4] + ' ' + m[5], font: FONT, size: 20, bold: true })] }));
    continue;
  }
  if ((m = line.match(/^@@src (.*)/))) { cur.pop(); cur.push(new Paragraph({ spacing: { before: 40, after: 200, line: 252, lineRule: 'auto' }, children: runs(m[1], { size: 16 }) })); continue; }
  if ((m = line.match(/^(#{1,4}) (.*)/))) {
    const L = m[1].length;
    const lvl = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][L - 1];
    const isAbs = L === 1 && m[2] === 'ABSTRACT';
    cur.push(new Paragraph({ heading: lvl, alignment: L === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text: m[2], font: FONT, size: isAbs ? 28 : undefined, bold: isAbs ? false : undefined })] }));
    continue;
  }
  if ((m = line.match(/^- (.*)/))) { cur.push(new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 0, line: 432, lineRule: 'auto' }, alignment: AlignmentType.JUSTIFIED, children: runs(m[1], { size: 22 }) })); continue; }
  if ((m = line.match(/^  - (.*)/))) { cur.push(new Paragraph({ numbering: { reference: 'bul', level: 1 }, spacing: { after: 0, line: 432, lineRule: 'auto' }, children: runs(m[1], { size: 22 }) })); continue; }
  cur.push(bodyPara(line));
}

const footer = fmt => new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })] })] });
const page = { size: { width: 10318, height: 14570 }, margin: { top: 1701, bottom: 1701, left: 1418, right: 1418, header: 851, footer: 992 } };
const doc = new Document({
  styles: {
    default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { after: 0 } } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 32, bold: true }, paragraph: { spacing: { before: 0, after: 480, line: 276, lineRule: 'auto' }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28 }, paragraph: { spacing: { before: 360, after: 180, line: 276, lineRule: 'auto' }, keepNext: true, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 22, bold: true }, paragraph: { spacing: { before: 240, after: 80, line: 276, lineRule: 'auto' }, keepNext: true, outlineLevel: 2 } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 22 }, paragraph: { spacing: { before: 160, after: 60, line: 276, lineRule: 'auto' }, keepNext: true, outlineLevel: 3 } },
      { id: 'TableCaption', name: 'TableCaption', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 20, bold: true } },
      { id: 'FigureCaption', name: 'FigureCaption', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 20, bold: true } },
    ],
  },
  numbering: { config: [{ reference: 'bul', levels: [
    { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 450, hanging: 225 } } } },
    { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 800, hanging: 225 } } } } ] }] },
  footnotes,
  features: { updateFields: true },
  sections: [
    { properties: { page }, children: sections.covers },
    { properties: { page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } }, footers: { default: footer() }, children: sections.front },
    { properties: { page: { ...page, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } }, footers: { default: footer() }, children: sections.body },
  ],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(outFile, b); console.log('wrote', outFile, 'footnotes:', fnId - 1); });
