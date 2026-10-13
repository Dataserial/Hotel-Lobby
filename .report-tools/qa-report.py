from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
from pdf2image import convert_from_path
from pypdf import PdfReader
import json
root = Path(__file__).resolve().parents[1]
qa = root / '.report-tools/qa'
poppler = r'C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
pdf = qa / 'report.pdf'
images = convert_from_path(pdf, dpi=120, poppler_path=poppler, output_folder=str(qa), fmt='png', paths_only=True)
for i, source in enumerate(images, 1):
    Path(source).replace(qa / f'page-{i}.png')
for start in range(1, len(images)+1, 4):
    canvas = Image.new('RGB', (1440, 2040), '#d4d4d4')
    for j, n in enumerate(range(start, min(start+4, len(images)+1))):
        im = Image.open(qa / f'page-{n}.png')
        im.thumbnail((700, 980))
        x = 10 + (j % 2)*720; y = 35 + (j // 2)*1020
        canvas.paste(im, (x,y))
        ImageDraw.Draw(canvas).text((x,y-22), f'Page {n}', fill='black')
    canvas.save(qa / f'sheet-{start}.png')
reader = PdfReader(pdf)
texts = [p.extract_text() for p in reader.pages]
(qa / 'extracted-text.txt').write_text('\n\n'.join(f'PAGE {i+1}\n{t}' for i,t in enumerate(texts)), encoding='utf-8')
print(json.dumps({'pages':len(reader.pages), 'page_text_lengths':[len(t) for t in texts], 'toc':texts[2]},ensure_ascii=False))
