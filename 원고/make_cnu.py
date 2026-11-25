import re, sys, json
src, dst = sys.argv[1], sys.argv[2]
t = open(src, encoding='utf-8').read()
ROM = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ']
GA = '가나다라마바사아자차카타파하'

# 1. 앞부분(표지·개고 안내·국문초록·목차) 제거
t = t[t.index('# 제1장 서론'):]

# 2. 부록을 참고문헌 뒤, ABSTRACT 앞으로 이동
ia = t.index('# Abstract'); ib = t.index('# 부록 1.')
abstract_block = t[ia:ib]
appendix = t[ib:]
t = t[:ia] + appendix.rstrip('\n') + '\n---PAGE---\n' + '@@ABSTRACT@@\n'

# 3. 표·그림 번호(장별) 부여
lines = t.split('\n')
chap = 0; tno = {}; fno = {}; cap_label = {}; fig_label = {}; out = []
appendix_mode = False; app_t = 0
for ln in lines:
    m = re.match(r'^# 제(\d)장 ', ln)
    if m: chap = int(m.group(1))
    if ln.startswith('# 참고문헌') or ln.startswith('# 부록'):
        appendix_mode = ln.startswith('# 부록')
    if ln.startswith('@@cap '):
        title = ln[6:]
        if appendix_mode:
            app_t += 1; lab = f'[부표 {app_t}]'
        else:
            tno[chap] = tno.get(chap, 0) + 1; lab = f'[표 {chap}-{tno[chap]}]'
        cap_label[title] = lab
        out.append(f'@@capx {lab}|{title}'); continue
    if ln.startswith('@@fig '):
        p, w, h, cap = ln[6:].split('|', 3)
        fno[chap] = fno.get(chap, 0) + 1; lab = f'[그림 {chap}-{fno[chap]}]'
        fig_label[len(fig_label) + 1] = lab
        w2 = 480; h2 = round(int(h) * w2 / int(w))
        out.append(f'@@figx {p}|{w2}|{h2}|{lab}|{cap}'); continue
    out.append(ln)
t = '\n'.join(out)

# 본문 속 〈표 n〉·〈그림 n〉 참조를 새 번호로 (원래 번호 = 캡션 순서)
orig_caps = re.findall(r'^@@capx [^|]+\|(.*)$', t, re.M)
t = re.sub(r'〈표 (\d+)〉', lambda m: cap_label[orig_caps[int(m.group(1)) - 1]], t)
t = re.sub(r'〈그림 (\d+)〉', lambda m: fig_label[int(m.group(1))], t)

# 4. 제목 번호 체계: Ⅰ. → 1. → 가. → 1)
def head(m):
    lv, txt = m.group(1), m.group(2)
    if lv == '#':
        mm = re.match(r'제(\d)장 (.*)', txt)
        return f'# {ROM[int(mm.group(1))]}. {mm.group(2)}' if mm else m.group(0)
    if lv == '##':
        mm = re.match(r'제(\d)절 (.*)', txt)
        return f'## {mm.group(1)}. {mm.group(2)}' if mm else m.group(0)
    if lv == '###':
        mm = re.match(r'(\d+)\. (.*)', txt)
        return f'### {GA[int(mm.group(1)) - 1]}. {mm.group(2)}' if mm else m.group(0)
    if lv == '####':
        mm = re.match(r'([가-하])\. (.*)', txt)
        return f'#### {GA.index(mm.group(1)) + 1}) {mm.group(2)}' if mm else m.group(0)
    return m.group(0)
t = re.sub(r'^(#{1,4}) (.*)$', head, t, flags=re.M)

# 5. 상호참조: 제N장 제M절 → Ⅳ장 M절 (형법 '제2편 제2장' 등 법령 표기는 제외)
t = re.sub(r'(?<!편 )(?<!편)제(\d)장 제(\d)절', lambda m: f'{ROM[int(m.group(1))]}장 {m.group(2)}절', t)
t = re.sub(r'(?<!편 )(?<!편)제(\d)장', lambda m: f'{ROM[int(m.group(1))]}장', t)
t = re.sub(r'(?<![장편] )제(\d)절', lambda m: f'{m.group(1)}절', t)

# 6. ABSTRACT 블록(서식 5. 영문초록)
abs_lines = [l for l in abstract_block.split('\n')[1:] if l.strip() and l.strip() != '---PAGE---']
title_line = abs_lines[0].strip('*')
body = [l for l in abs_lines[1:] if not l.startswith('**Keywords**')]
kw = [l for l in abs_lines if l.startswith('**Keywords**')][0].replace('**Keywords** ', '')
body[-1] = ("The study also applies the framework to the three cases as reported, cross-checks it against published Supreme Court and appellate judgments, "
            "and proposes an evidence mapping table, a forensic procedure for locating drones within protection zones, an initial-response checklist allocated by investigative authority, "
            "draft amendments to Article 99 of the Criminal Act and to the Military Base Act including a new offense of photography for the purpose of military intelligence collection, "
            "three practical forms, and a phased implementation plan.")
title_a, title_b = title_line.split(': ', 1)
absblock = ['# ABSTRACT', '@@abs', '@@absc ', '@@absc ' + title_a + ':', '@@absc ' + title_b, '@@absc ',
            '@@absc [영문 성명(성을 뒤로)]', '@@absc ',
            '@@absc Department of [학과 영문명], Graduate School', '@@absc Chungnam National University', '@@absc Daejeon, Korea', '@@absc ',
            '@@absc (Supervised by Professor [지도교수 영문 성명])', '@@absc ']
absblock += body + ['@@absc ', '**Keywords :** ' + kw]
t = t.replace('@@ABSTRACT@@', '\n'.join(absblock))

# 7. 표지·목차·구역 표시
t = '@@covers\n@@section front\n@@toc\n@@tot\n@@tof\n@@section body\n' + t
open(dst, 'w', encoding='utf-8').write(t)
print('tables', sum(1 for l in t.split('\n') if l.startswith('@@capx')), 'figs', len(fig_label))
