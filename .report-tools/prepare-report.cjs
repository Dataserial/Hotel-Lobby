// เครื่องมือจัดรูปแบบและตรวจเอกสารรายงาน
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const out = path.join(root, 'docs/เอกสารรายงาน/รายงานจากระบบจริง');
const text = fs.readFileSync(path.join(out, 'เนื้อหารายงาน-Hotel-Lobby.md'), 'utf8');
const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
function thaiBreaks(s) {
  return s.replace(/[\u0E00-\u0E7F]+/g, chunk => [...segmenter.segment(chunk)].map(x => x.segment).join('\u200B'));
}
let chapters = [], preface = [], references = [], section = null, mode = '';
for (const line of text.split(/\r?\n/)) {
  if (line.startsWith('## คำนำ')) { mode = 'preface'; continue; }
  const chapter = /^## บทที่ (\d+) (.+)$/.exec(line);
  if (chapter) { chapters.push({number: Number(chapter[1]), title: chapter[2], sections: []}); mode = 'chapter'; continue; }
  if (line.startsWith('## บรรณานุกรม')) { mode = 'refs'; continue; }
  const heading = /^### (\d+\.\d+) (.+)$/.exec(line);
  if (heading) { section = {number: heading[1], title: heading[2], content: ''}; chapters.at(-1).sections.push(section); continue; }
  if (!line.trim()) continue;
  if (mode === 'preface') preface.push(line);
  if (mode === 'chapter' && section) section.content += (section.content ? '\n' : '') + line;
  if (mode === 'refs' && /^\[\d+\]/.test(line)) references.push(line);
}
const data = {
  report_title: 'รายงาน', project_name: '', project_subtitle: 'ระบบจัดการโรงแรม Hotel-Lobby',
  advisor: 'Petpring Malithong',
  members: [{name: 'นายศุภวัฒน์ ข่ายทอง', student_id: '673380062-2'}],
  year_level: 'ชั้นปีที่ 3', course_name: 'รายวิชา ........................................',
  department: 'สาขาวิทยาการคอมพิวเตอร์\nวิทยาลัยการคอมพิวเตอร์',
  university: 'มหาวิทยาลัยขอนแก่น', semester: 'ภาคเรียนที่ 1 ปีการศึกษา 2569',
  preface: preface.join('\n'), preface_date: 'ตุลาคม 2569',
  toc: [{title: 'คำนำ', page: 'ก'}, {title: 'สารบัญ', page: 'ข'},
    ...chapters.map(c => ({title: `บทที่ ${c.number} ${c.title}`, page: ''})), {title: 'บรรณานุกรม', page: ''}],
  chapters, references
};
fs.writeFileSync(path.join(out, 'report-data.json'), JSON.stringify(data, null, 2));
// ICU supplies Thai word boundaries when the optional Python tokenizer is unavailable.
fs.writeFileSync(path.join(out, 'report-data-segmented.json'), JSON.stringify(data, (key, value) => typeof value === 'string' ? thaiBreaks(value) : value, 2));
console.log(JSON.stringify({chapters:chapters.length, sections:chapters.reduce((n,c)=>n+c.sections.length,0), references:references.length}));
