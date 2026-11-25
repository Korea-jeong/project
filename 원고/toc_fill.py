"""목차·표 목차·그림 목차 필드에 항목과 쪽번호를 미리 채워 넣는다(필드는 유지하여 Word에서 갱신 가능)."""
import sys, re, zipfile, shutil, subprocess, html
docx, pdf, md, out = sys.argv[1:5]

# 1. 항목 목록
toc, tot, tof = [], [], []
for ln in open(md, encoding='utf-8').read().split('\n'):
    m = re.match(r'^(#{1,2}) (.*)$', ln)
    if m and not ln.startswith('#' * 3):
        toc.append((len(m.group(1)), m.group(2).strip()))
    m = re.match(r'^@@capx ([^|]+)\|(.*)$', ln)
    if m: tot.append((1, m.group(1) + ' ' + m.group(2)))
    m = re.match(r'^@@figx [^|]+\|\d+\|\d+\|([^|]+)\|(.*)$', ln)
    if m: tof.append((1, m.group(1) + ' ' + m.group(2)))

# 2. PDF 쪽별 텍스트(공백 제거)
n = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout).group(1))
pages = [re.sub(r'\s+', '', subprocess.run(['pdftotext', '-f', str(p), '-l', str(p), pdf, '-'], capture_output=True, text=True).stdout) for p in range(1, n + 1)]
norm = lambda s: re.sub(r'\s+', '', s)
# 본문 시작 쪽(Ⅰ. 서론 제목이 처음 나오는 쪽 중 목차 이후)
start = next(i for i, t in enumerate(pages) if t.startswith('Ⅰ.서론'))
def locate(entries, from_page):
    res, p = [], from_page
    for lv, txt in entries:
        key = norm(txt)[:18]
        q = p
        while q < n and key not in pages[q]: q += 1
        if q >= n:
            q = p  # 못 찾으면 직전 쪽
        else:
            p = q
        res.append((lv, txt, q - start + 1))
    return res
toc_e, tot_e, tof_e = locate(toc, start), locate(tot, start), locate(tof, start)

# 3. XML 생성
TAB = 7482
def esc(s): return html.escape(s, quote=False)
RPR = '<w:rPr><w:rFonts w:ascii="HY신명조" w:hAnsi="HY신명조" w:eastAsia="HY신명조" w:cs="HY신명조"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
def entry_p(lv, txt, pg, prefix='', suffix=''):
    ind = '' if lv == 1 else '<w:ind w:left="440"/>'
    bold = '<w:b/>' if lv == 1 and txt[:1] in 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ' else ''
    rpr = RPR.replace('<w:sz ', bold + '<w:sz ') if bold else RPR
    return (f'<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="{TAB}"/></w:tabs>'
            f'<w:spacing w:after="0" w:line="380" w:lineRule="auto"/>{ind}</w:pPr>{prefix}'
            f'<w:r>{rpr}<w:t xml:space="preserve">{esc(txt)}</w:t></w:r><w:r>{rpr}<w:tab/></w:r>'
            f'<w:r>{rpr}<w:t>{pg}</w:t></w:r>{suffix}</w:p>')
def field_block(instr, entries):
    begin = f'<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve">{instr}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
    end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
    ps = []
    for k, (lv, txt, pg) in enumerate(entries):
        ps.append(entry_p(lv, txt, pg, prefix=begin if k == 0 else '', suffix=end if k == len(entries) - 1 else ''))
    return ''.join(ps)

z = zipfile.ZipFile(docx)
xml = z.read('word/document.xml').decode('utf-8')
blocks = {
    'TOC \\h \\o &quot;1-2&quot;': field_block('TOC \\o &quot;1-2&quot; \\h', toc_e),
    'TOC \\h \\t &quot;TableCaption,1&quot;': field_block('TOC \\h \\t &quot;TableCaption,1&quot;', tot_e),
    'TOC \\h \\t &quot;FigureCaption,1&quot;': field_block('TOC \\h \\t &quot;FigureCaption,1&quot;', tof_e),
}
cnt = 0
def repl(m):
    global cnt
    c = m.group(0)
    for k, v in blocks.items():
        if k in c:
            cnt += 1
            return re.sub(r'<w:sdtContent>.*</w:sdtContent>', lambda _: '<w:sdtContent>' + v + '</w:sdtContent>', c, flags=re.S)
    return c
xml = re.sub(r'<w:sdt>.*?</w:sdt>', repl, xml, flags=re.S)
assert cnt == 3, cnt
zo = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
for it in z.infolist():
    data = xml.encode('utf-8') if it.filename == 'word/document.xml' else z.read(it.filename)
    zo.writestr(it, data)
zo.close()
print('entries', len(toc_e), len(tot_e), len(tof_e), 'body start pdf page', start + 1)
for e in toc_e[:6] + toc_e[-4:]: print(' ', e)
