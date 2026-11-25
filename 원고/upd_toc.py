import sys, subprocess, time, os, uno
from com.sun.star.beans import PropertyValue
def P(n,v):
    p=PropertyValue(); p.Name=n; p.Value=v; return p
src, pdf = sys.argv[1], sys.argv[2]
proc = subprocess.Popen(['soffice','--headless','--invisible','--norestore','--accept=socket,host=localhost,port=2099;urp;'])
ctx=None
for _ in range(60):
    try:
        local=uno.getComponentContext(); r=local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver',local)
        ctx=r.resolve('uno:socket,host=localhost,port=2099;urp;StarOffice.ComponentContext'); break
    except Exception: time.sleep(1)
desk=ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop',ctx)
doc=desk.loadComponentFromURL(uno.systemPathToFileUrl(os.path.abspath(src)),'_blank',0,(P('Hidden',True),))
idx=doc.getDocumentIndexes()
for i in range(idx.getCount()): idx.getByIndex(i).update()
doc.refresh()
for i in range(idx.getCount()): idx.getByIndex(i).update()
doc.storeToURL(uno.systemPathToFileUrl(os.path.abspath(pdf)),(P('FilterName','writer_pdf_Export'),))
print('indexes',idx.getCount())
doc.close(True); 
try: desk.terminate()
except Exception: pass
proc.wait(timeout=30)
