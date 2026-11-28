from pathlib import Path
from base64 import b64encode
import hashlib
import shutil

p = Path(__file__).resolve().parent
font1 = b64encode((p/'fonts/Manrope-subset.ttf').read_bytes()).decode()
fontcss = f'''@font-face{{font-family:"Kadr Manrope";src:url(data:font/ttf;base64,{font1}) format("truetype");font-style:normal;font-weight:200 800;font-display:swap}}'''


def page(template, css_file, bundle_file):
    css = fontcss + (p/css_file).read_text(encoding='utf-8')
    js = (p/bundle_file).read_text(encoding='utf-8').replace('</script', '<\\/script')
    return (p/template).read_text(encoding='utf-8').replace('__FONT__', fontcss).replace('__CSS__', css).replace('__JS__', js)

studio3 = page('studio3.template.html', 'studio3.css', 'studio3-bundle.js')
preview = page('preview.template.html', 'preview.css', 'preview-bundle.js')

(p/'studio3.html').write_text(studio3, encoding='utf-8')
(p/'preview.html').write_text(preview, encoding='utf-8')

site = p/'site'
site.mkdir(exist_ok=True)
(site/'index.html').write_text(studio3, encoding='utf-8')
(site/'studio3.html').write_text(studio3, encoding='utf-8')
(site/'preview.html').write_text(preview, encoding='utf-8')
shutil.copyfile(p/'preview-cover.png', site/'preview-cover.png')
shutil.copyfile(p/'demo-portrait.mp4', site/'demo-portrait.mp4')
shutil.copyfile(p/'manifest.webmanifest', site/'manifest.webmanifest')
(site/'.nojekyll').write_text('', encoding='utf-8')
shutil.copytree(p/'icons', site/'icons', dirs_exist_ok=True)

version = hashlib.sha256(studio3.encode()).hexdigest()[:16]
(site/'sw.js').write_text(
    (p/'sw-template.js').read_text(encoding='utf-8').replace('__VERSION__', version),
    encoding='utf-8')

# Удаляем всё, что осталось от старой версии.
for old in ['kadr.html', 'LICENSES.txt']:
    target = site/old
    if target.exists():
        target.unlink()
for folder in ['converter', 'source', 'desktop']:
    target = site/folder
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)

print('site ready: index.html = studio3, bytes:', len(studio3.encode()), 'cache:', version)
