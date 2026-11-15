#!/usr/bin/env python3
"""Convert drafts/*.md (lightweight markdown) into Tistory-ready HTML with inline,
category-specific theme colors. Output: out/<name>.html

Front matter (first lines, until a blank line):
  title: ...
  category: 보안 기술 노트 | 보안 뉴스 해설 | 프로그래밍언어/Python | Linux | CTF | 리버싱
  tags: a, b, c
  schedule: 2026-11-16 19:00

Supported syntax: ## h2, ### h3, paragraphs, - / 1. lists, ```code```,
| tables |, "> " callout, "!> " warning box, **bold**, `code`.
"""
import html, re, sys, pathlib

THEMES = {
    "보안 기술 노트": "#6d28d9",      # 보라
    "보안 뉴스 해설": "#1e3a8a",      # 남색
    "프로그래밍언어/Python": "#4338ca",  # 남보라
    "Linux": "#0f766e",
    "CTF": "#b45309",
    "리버싱": "#9f1239",
}

def inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r'<code style="background:#f3f4f6;padding:1px 5px;border-radius:4px;font-size:0.92em;">\1</code>', s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    return s

def convert(text, color):
    out, lines, i = [], text.split("\n"), 0
    P = 'style="line-height:1.85;margin:0 0 14px;"'
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("```"):
            buf = []; i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i]); i += 1
            i += 1
            out.append('<pre style="background:#111827;color:#e5e7eb;padding:14px 16px;border-radius:8px;overflow-x:auto;font-size:13.5px;line-height:1.6;"><code>'
                       + html.escape("\n".join(buf)) + "</code></pre>")
            continue
        if ln.startswith("## "):
            out.append(f'<h2 style="border-left:6px solid {color};padding:6px 12px;margin:34px 0 14px;color:{color};font-size:1.35em;">{inline(ln[3:])}</h2>')
        elif ln.startswith("### "):
            out.append(f'<h3 style="color:{color};margin:22px 0 10px;font-size:1.12em;">{inline(ln[4:])}</h3>')
        elif ln.startswith("!> "):
            out.append(f'<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;margin:16px 0;line-height:1.8;">⚠️ {inline(ln[3:])}</div>')
        elif ln.startswith("> "):
            out.append(f'<div style="background:{color}0f;border-left:4px solid {color};border-radius:6px;padding:12px 16px;margin:16px 0;line-height:1.8;">💡 {inline(ln[2:])}</div>')
        elif ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                if not re.match(r"^\|[\s\-:|]+\|$", lines[i]):
                    rows.append([c.strip() for c in lines[i].strip("|").split("|")])
                i += 1
            t = ['<table style="border-collapse:collapse;width:100%;margin:14px 0;font-size:0.95em;">']
            for r, row in enumerate(rows):
                tag = "th" if r == 0 else "td"
                st = (f'background:{color};color:#fff;' if r == 0 else '') + 'border:1px solid #d1d5db;padding:8px 10px;text-align:left;'
                t.append("<tr>" + "".join(f'<{tag} style="{st}">{inline(c)}</{tag}>' for c in row) + "</tr>")
            t.append("</table>")
            out.append("".join(t)); continue
        elif re.match(r"^(- |\d+\. )", ln):
            ordered = not ln.startswith("- ")
            items = []
            while i < len(lines) and re.match(r"^(- |\d+\. )", lines[i]):
                items.append(re.sub(r"^(- |\d+\. )", "", lines[i])); i += 1
            tg = "ol" if ordered else "ul"
            out.append(f'<{tg} style="line-height:1.85;margin:0 0 14px;padding-left:24px;">' + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tg}>")
            continue
        elif ln.strip():
            buf = [ln]; i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"^(#|```|> |!> |\||- |\d+\. )", lines[i]):
                buf.append(lines[i]); i += 1
            out.append(f"<p {P}>{inline(' '.join(buf))}</p>"); continue
        i += 1
    return "\n".join(out)

def build(path):
    raw = path.read_text(encoding="utf-8")
    head, body = raw.split("\n\n", 1)
    meta = dict(l.split(": ", 1) for l in head.splitlines())
    color = THEMES[meta["category"]]
    banner = (f'<div style="background:linear-gradient(135deg,{color},{color}cc);color:#fff;border-radius:12px;padding:22px 24px;margin:0 0 24px;">'
              f'<div style="font-size:0.85em;opacity:0.85;">SecurityMax Lab · {html.escape(meta["category"])}</div>'
              f'<div style="font-size:1.4em;font-weight:700;margin-top:6px;line-height:1.4;">{html.escape(meta["title"])}</div></div>')
    footer = ('<div style="border-top:1px solid #e5e7eb;margin-top:36px;padding-top:14px;font-size:0.88em;color:#6b7280;line-height:1.7;">'
              '※ 이 글은 학습·방어 목적의 정리입니다. 점검·스캔은 반드시 본인 소유이거나 허가받은 시스템에서만 하세요. '
              '도구 옵션과 수치는 버전·환경에 따라 다를 수 있으니 공식 문서에서 현행 내용을 확인해 주세요.</div>')
    html_out = f'<div style="font-size:16px;color:#1f2937;">{banner}{convert(body, color)}{footer}</div>'
    dst = pathlib.Path("out") / (path.stem + ".html")
    dst.parent.mkdir(exist_ok=True)
    dst.write_text(html_out, encoding="utf-8")
    print(f"{dst}  [{meta['schedule']}] {meta['category']} | {meta['title']} | tags: {meta['tags']}")

if __name__ == "__main__":
    for p in sorted(pathlib.Path("drafts").glob("*.md")) if len(sys.argv) < 2 else map(pathlib.Path, sys.argv[1:]):
        build(p)
