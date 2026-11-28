from pathlib import Path
from base64 import b64encode
import hashlib
import os
import shutil
import subprocess
import sys
import zipfile
p=Path(__file__).resolve().parent
nm=p/'node_modules'
if not nm.exists(): nm=Path('/vercel/sandbox/node_modules')
font1=b64encode((p/'fonts/Manrope-subset.ttf').read_bytes()).decode(); font2=b64encode((p/'fonts/PlayfairItalic-subset.ttf').read_bytes()).decode()
fontcss=f'''@font-face{{font-family:"Kadr Manrope";src:url(data:font/ttf;base64,{font1}) format("truetype");font-style:normal;font-weight:200 800;font-display:swap}}@font-face{{font-family:"Kadr Playfair";src:url(data:font/ttf;base64,{font2}) format("truetype");font-style:italic;font-weight:400 900;font-display:swap}}'''
css=fontcss+(p/'styles.css').read_text(encoding='utf-8'); js=(p/'bundle.js').read_text(encoding='utf-8').replace('</script','<\\/script');demo=b64encode((p/'demo-portrait.mp4').read_bytes()).decode(); sticker=b64encode((p/'demo-sticker.png').read_bytes()).decode()
lic='''\nTHIRD-PARTY NOTICES\nLucide Icons (ISC): https://lucide.dev/license\nCopyright (c) 2026 Lucide Icons and Contributors\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.\n\nCertain Lucide icons are derived from Feather icons (MIT):\nCopyright (c) 2013-present Cole Bemis\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n\nMediabunny 1.42.0 and @mediabunny/aac-encoder 1.42.0 by Vanilagy and contributors, MPL-2.0. Unmodified source code: https://github.com/Vanilagy/mediabunny ; version 1.42.0. The AAC encoder includes an FFmpeg AAC encoder, with source and licensing information at https://ffmpeg.org/legal.html .\n'''
lic+='\nEasyReels, portions of the word grouping algorithm and design principles:\n'+(p/'notices/EasyReels-MIT.txt').read_text(encoding='utf-8')+'\n'
lic+='\nVideo-shotcraft blur-slide shot, adapted to browser Canvas (Copyright 2026 Wei Yihao; Apache-2.0): https://github.com/Vincentwei1021/video-shotcraft\n'+(p/'notices/VideoShotcraft-Apache-2.0.txt').read_text(encoding='utf-8')+'\n'
lic+='\nManrope and Playfair Display fonts are licensed under the SIL Open Font License 1.1:\n'+(p/'fonts/Manrope-OFL.txt').read_text(encoding='utf-8')+'\n'+(p/'fonts/Playfair-OFL.txt').read_text(encoding='utf-8')+'\n'
lic+='\nAutomatic captions download Transformers.js 3.7.2 (Apache-2.0) and onnx-community/whisper-small_timestamped; model information: https://huggingface.co/onnx-community/whisper-small_timestamped .\n'
lic+='\nSupertonic 3 local speech synthesis: adapted web helper code (MIT, Copyright 2025 Supertone Inc):\n'+(p/'notices/Supertonic-Code-MIT.txt').read_text(encoding='utf-8')+'\n'
lic+='\nSupertonic 3 model is downloaded separately under OpenRAIL-M, with use restrictions: https://huggingface.co/supertone-oss-archive/supertonic-3/blob/main/LICENSE . Full license:\n'+(p/'notices/Supertonic-Model-OpenRAIL-M.txt').read_text(encoding='utf-8')+'\n'
lic+='\nLocal speech synthesis downloads ONNX Runtime Web 1.22.0 (MIT): https://github.com/microsoft/onnxruntime .\n'
lic+='\nOptional local video conversion uses @ffmpeg/core 0.12.10 (GPL-2.0-or-later), based on FFmpeg 5.1.4 and external libraries. Build source for this release: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/71aa99d37c02a7b4c435275ca9ef50e612f6efa1 ; binary package: https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10 ; FFmpeg source: https://github.com/FFmpeg/FFmpeg/tree/n5.1.4 . The source archive for the build scripts is included with the site. Review all applicable licenses before redistribution.\n'+(p/'notices/FFmpeg-core-GPL-2.txt').read_text(encoding='utf-8')+'\n'
for pkg in ('react','react-dom','scheduler','react-icons','mediabunny'):
 f=nm/pkg/'LICENSE'
 if f.exists():lic+='\n'+pkg+'\n'+f.read_text(encoding='utf-8')+'\n'
boot='''<script>
if(location.protocol!=="file:" && window.isSecureContext){
  window.addEventListener("beforeinstallprompt",function(event){
    event.preventDefault(); window.__kadrInstallPrompt=event;
    window.dispatchEvent(new Event("kadr-install-ready"));
  });
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(function(){});
}
</script>'''
html=f'''<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#17181c"><meta name="description" content="Редактор вертикальных видео, субтитров и графики."><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Кадр"><link rel="manifest" href="./manifest.webmanifest"><link rel="icon" href="./icons/icon-192.png" sizes="192x192"><link rel="apple-touch-icon" href="./icons/apple-touch-icon.png"><title>Кадр — редактор коротких видео</title>{boot}<style>{css}</style></head><body><div id="root"></div><script>window.DEMO_VIDEO="data:video/mp4;base64,{demo}";window.DEMO_STICKER="data:image/png;base64,{sticker}";</script><script>{js}</script><!-- {lic} --></body></html>'''
(p/'kadr.html').write_text(html, encoding='utf-8')
# Кадр 3.0: отдельная студия на EDL-ядре, та же страница в корне и на сайте.
studio3=((p/'studio3.template.html').read_text(encoding='utf-8')
  .replace('__FONT__',fontcss)
  .replace('__CSS__',(p/'studio3.css').read_text(encoding='utf-8'))
  .replace('__JS__',(p/'studio3-bundle.js').read_text(encoding='utf-8').replace('</script','<\\/script')))
(p/'studio3.html').write_text(studio3,encoding='utf-8')
site=p/'site'
site.mkdir(exist_ok=True)
(site/'index.html').write_text(html,encoding='utf-8')
(site/'studio3.html').write_text(studio3,encoding='utf-8')
preview=((p/'preview.template.html').read_text(encoding='utf-8')
  .replace('__FONT__',fontcss)
  .replace('__CSS__',(p/'preview.css').read_text(encoding='utf-8'))
  .replace('__JS__',(p/'preview-bundle.js').read_text(encoding='utf-8').replace('</script','<\\/script')))
(p/'preview.html').write_text(preview,encoding='utf-8')
(site/'preview.html').write_text(preview,encoding='utf-8')
if (p/'site/preview-cover.png').is_file():
  shutil.copyfile(p/'site/preview-cover.png',p/'preview-cover.png')
shutil.copyfile(p/'manifest.webmanifest',site/'manifest.webmanifest')
(site/'.nojekyll').write_text('',encoding='utf-8')
(site/'LICENSES.txt').write_text(lic,encoding='utf-8')
shutil.copytree(p/'icons',site/'icons',dirs_exist_ok=True)
shutil.copyfile(p/'demo-portrait.mp4',site/'demo-portrait.mp4')
version=hashlib.sha256(html.encode('utf-8')).hexdigest()[:16]
(site/'sw.js').write_text((p/'sw-template.js').read_text(encoding='utf-8').replace('__VERSION__',version),encoding='utf-8')
core=nm/'@ffmpeg/core/dist/umd/ffmpeg-core.wasm'
if not core.exists():
 core=p/'vendor_src/core/package/dist/umd/ffmpeg-core.wasm'
if not core.exists():
 raise SystemExit('Для сборки конвертера выполни npm install (@ffmpeg/core 0.12.10).')
wasm=core.read_bytes()
if hashlib.sha256(wasm).hexdigest()!='9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7':
 raise SystemExit('Неожиданная версия файла ffmpeg-core.wasm.')
parts=site/'converter';parts.mkdir(exist_ok=True)
chunk=8*1024*1024
for i in range(4):
 (parts/f'ffmpeg-core.part{i+1}').write_bytes(wasm[i*chunk:(i+1)*chunk])
# Public source and notices accompany the GPL-enabled optional converter.
# The allow-list excludes build logs, users' projects, sample recordings and node_modules.
source_dir=site/'source';source_dir.mkdir(exist_ok=True)
upstream=p/'upstream/ffmpeg-wasm-71aa99d-source.tar.gz'
if not upstream.exists():
 raise SystemExit('Не найден архив исходников сборки FFmpeg.wasm в upstream/.')
shutil.copyfile(upstream,source_dir/'ffmpeg-wasm-source.tar.gz')
(source_dir/'README.txt').write_text("""Кадр 1.1 — исходники и сторонние компоненты

В kadr-source.zip находятся исходники редактора, его сборочные файлы, тесты и уведомления.
В ffmpeg-wasm-source.tar.gz — исходники сборочных скриптов ffmpeg.wasm для @ffmpeg/core 0.12.10 (commit 71aa99d37c02a7b4c435275ca9ef50e612f6efa1). Они также доступны по адресу https://github.com/ffmpegwasm/ffmpeg.wasm/tree/71aa99d37c02a7b4c435275ca9ef50e612f6efa1 .
Исходный FFmpeg 5.1.4: https://github.com/FFmpeg/FFmpeg/tree/n5.1.4 . Сборка использует дополнительные внешние зависимости, указанные в её скриптах.
Лицензии и ссылки на остальные компоненты — в ../LICENSES.txt и notices внутри архива. Перед публичным распространением проверь применимые условия.
""",encoding='utf-8')
source_files=['README.md','package.json','app.jsx','asr.js','beat.js','build.py','director.js',
 'quality.js','visuals.js','voice.js','local-tts.js','supertonic-helper.txt','project.js',
 'converter.js','converter-worker.txt','ffmpeg-core.txt','styles.css','manifest.webmanifest',
 'edl.js','frame.js','ghost.js','takes.js','snap.js','silence.js','templates.js','project3.js','approval.js','hyper-adapter.js','icons.js','THIRD_PARTY.md',
 'studio3.jsx','studio3.css','studio3.template.html','preview.jsx','preview.css','preview.template.html','preview-cover.png','tools/render-edl.mjs','tools/export-hyper.mjs','tools/make-cover.mjs',
 'sw-template.js','demo-portrait.mp4','demo-sticker.png','test-beat.cjs','test-motion.cjs',
 'test-project.cjs','test-quality.cjs','test-voice-unit.cjs','test-edl.mjs','test-frame.mjs','test-templates.mjs','test-project3.mjs','test-approval.mjs','test-snap.mjs','test-hyper.mjs','test-silence.mjs']
source_files += [str(x.relative_to(p)) for folder in ('icons','fonts','notices','upstream')
                 for x in sorted((p/folder).iterdir()) if x.is_file()]
with zipfile.ZipFile(source_dir/'kadr-source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for name in source_files:
  f=p/name
  if not f.is_file():raise SystemExit('Нет файла исходников: '+name)
  z.write(f,arcname='Кадр-исходники/'+name)
if sys.platform.startswith('win') and os.environ.get('KADR_SKIP_DESKTOP') != '1':
 try:
  subprocess.run([sys.executable,str(p/'desktop/build-desktop.py')],check=False)
  dz=p/'desktop/kadr-desktop.zip'
  if dz.is_file():
   (site/'desktop').mkdir(exist_ok=True);shutil.copyfile(dz,site/'desktop/kadr-desktop.zip')
 except Exception:
  pass
print('HTML generated, bytes:',len(html.encode()),'PWA cache:',version,'converter:',len(wasm))
