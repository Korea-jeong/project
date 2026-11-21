import sys, zipfile, re, shutil, os
src = sys.argv[1]; tmp = src + '.tmp'
order = ['top', 'left', 'bottom', 'right', 'between', 'bar']
def fix(m):
    inner = m.group(1)
    parts = re.findall(r'<w:(\w+)\b[^>]*/>', inner)
    elems = {re.match(r'<w:(\w+)', e).group(1): e for e in re.findall(r'<w:\w+\b[^>]*/>', inner)}
    return '<w:pBdr>' + ''.join(elems[k] for k in order if k in elems) + '</w:pBdr>'
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename.endswith('/'): continue
        data = zin.read(item.filename)
        if item.filename == 'word/document.xml':
            data = re.sub(r'<w:pBdr>(.*?)</w:pBdr>', fix, data.decode()).encode()
        zout.writestr(item, data)
shutil.move(tmp, src)
