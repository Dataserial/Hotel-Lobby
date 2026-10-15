# สร้าง ER และ Use Case Diagram จากโครงสร้างระบบ
"""Generate editable draw.io diagrams from the current Hotel-Lobby schema."""
from pathlib import Path
import re
import html
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SCHEMA = (ROOT / 'server/prisma/schema.prisma').read_text(encoding='utf-8')
MODELS = dict(re.findall(r'model (\w+) \{(.*?)\n\}', SCHEMA, re.S))
ENUMS = dict(re.findall(r'enum (\w+) \{(.*?)\n\}', SCHEMA, re.S))

def graph(width, height):
    g = ET.Element('mxGraphModel', dx='1600', dy='1000', grid='1', gridSize='10',
                   guides='1', tooltips='1', connect='1', arrows='1', fold='1',
                   page='1', pageScale='1', pageWidth=str(width), pageHeight=str(height), math='0', shadow='0')
    r = ET.SubElement(g, 'root')
    ET.SubElement(r, 'mxCell', id='0')
    ET.SubElement(r, 'mxCell', id='1', parent='0')
    return g, r

def box(r, id, value, x, y, w, h, style):
    c = ET.SubElement(r, 'mxCell', id=id, value=value, style=style, vertex='1', parent='1')
    ET.SubElement(c, 'mxGeometry', x=str(x), y=str(y), width=str(w), height=str(h), attrib={'as': 'geometry'})
    return c

def edge(r, id, a, b, label='', style='', points=None):
    c = ET.SubElement(r, 'mxCell', id=id, value=label, source=a, target=b, edge='1', parent='1',
                      style='edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;fontSize=12;labelBackgroundColor=#ffffff;' + style)
    geo = ET.SubElement(c, 'mxGeometry', relative='1', attrib={'as': 'geometry'})
    if points:
        arr = ET.SubElement(geo, 'Array', attrib={'as': 'points'})
        for x,y in points:
            ET.SubElement(arr, 'mxPoint', x=str(x), y=str(y))

TEXT = 'text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontFamily=Tahoma;fontSize=15;'
NOTE = 'rounded=1;html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacing=14;fontFamily=Tahoma;fontSize=14;fillColor=#fff8df;strokeColor=#d6b656;'
COLORS = {'User':'#dae8fc','Session':'#dae8fc','AdminGuard':'#dae8fc',
          'RoomType':'#d5e8d4','Room':'#d5e8d4','RoomNightClaim':'#d5e8d4',
          'AdditionalService':'#e1d5e7','StayRequest':'#e1d5e7','StayRequestService':'#e1d5e7',
          'Payment':'#ffe6cc','PaymentTransaction':'#ffe6cc'}
LOGICAL_FIELDS = {'createdById','updatedById','roomTypeIds','relatedBookingId','serviceId'}

def fields(name):
    out=[]
    for line in MODELS[name].splitlines():
        m=re.match(r'\s*(\w+)\s+(\w+)(\[\]|\?)?(.*)', line)
        if not m or m[1].startswith('@@') or m[2] in MODELS: continue
        out.append((m[1],m[2]+(m[3] or ''),m[4]))
    return out

def entity(r, name, x, y, w=430, compact=False):
    fs=fields(name)
    if compact: fs=[f for f in fs if f[0] in {'id','createdById','updatedById'}]
    rows=[]
    for field,typ,attrs in fs:
        tags=[]
        if '@id' in attrs: tags.append('PK')
        if '@unique' in attrs: tags.append('UK')
        if field.endswith('Id') and field!='id' or field=='roomTypeIds':
            tags.append('REF' if field in LOGICAL_FIELDS or name=='CustomerBookingRequest' or name=='StayRequest' and field in {'roomId','roomTypeId'} else 'FK*')
        suffix=(' ['+', '.join(tags)+']') if tags else ''
        rows.append(html.escape(f'{field}: {typ}{suffix}'))
    constraints=[]
    if not compact:
        for cols in re.findall(r'@@unique\(\[([^]]+)\]\)',MODELS[name]):
            constraints.append('UK('+cols+')')
    mapping=re.search(r'@@map\("([^"]+)"\)',MODELS[name])[1]
    h=70+len(rows)*22+len(constraints)*23
    body='<b>'+name+'</b><br/><font color="#666666">collection: '+mapping+'</font><hr/>'+'<br/>'.join(rows)
    if constraints: body+='<hr/><i>'+'<br/>'.join(constraints)+'</i>'
    box(r,name,body,x,y,w,h,
        'rounded=0;html=1;whiteSpace=wrap;align=left;verticalAlign=top;spacing=12;fontFamily=Tahoma;fontSize=14;fillColor='+COLORS.get(name,'#f5f5f5')+';strokeColor=#52637a;')
    return h

g,r=graph(2500,2530)
box(r,'title','<b>Hotel-Lobby — ER Diagram (14 models)</b>',45,25,1800,45,TEXT+'fontSize=26;')
box(r,'legend','PK = primary key | UK = unique | ? = nullable | [] = array<br/>เส้นทึบ / FK* = Prisma @relation; เส้นประ / REF = อ้างอิง ID โดย application<br/>MongoDB ไม่มี relational foreign-key constraints; 0..* คือศูนย์ถึงหลายรายการ; audit REF ดูหน้าถัดไป',45,80,2350,90,NOTE)
positions={
 'Session':(45,210), 'User':(630,210), 'Guest':(1215,210), 'CustomerBookingRequest':(1800,210),
 'RoomType':(45,760), 'Room':(630,760), 'Booking':(1215,760), 'Payment':(1800,760),
 'AdditionalService':(45,1460), 'StayRequest':(630,1460), 'StayRequestService':(1215,1460), 'PaymentTransaction':(1800,1460),
 'AdminGuard':(45,2100), 'RoomNightClaim':(1215,2100)}
for name,pos in positions.items(): entity(r,name,*pos)
# source endpoint cardinality, target endpoint cardinality; all reflect schema optionality.
relations=[
 ('User','Session','1','0..*','userId',False),
 ('User','Guest','0..1','0..*','customerId',False),
 ('User','Booking','0..1','0..*','customerId',False),
 ('User','Booking','1','0..*','createdById',False),
 ('User','Booking','1','0..*','updatedById',False),
 ('User','Payment','1','0..*','recordedById',False),
 ('User','PaymentTransaction','1','0..*','recordedById',False),
 ('User','StayRequest','1','0..*','memberId',False),
 ('RoomType','Room','0..1','0..*','roomTypeId',False),
 ('Guest','Booking','1','0..*','guestId',False),
 ('Room','Booking','1','0..*','roomId',False),
 ('Booking','Payment','1','0..1','bookingId (UK)',False),
 ('Payment','PaymentTransaction','1','0..*','paymentId',False),
 ('PaymentTransaction','PaymentTransaction','0..1','0..*','receiptId → รายการรับเงินต้นทาง',False),
 ('Room','RoomNightClaim','1','0..*','roomId',False),
 ('Booking','RoomNightClaim','1','0..*','bookingId',False),
 ('StayRequest','StayRequestService','1','0..*','requestId',False),
 ('RoomType','StayRequest','1','0..*','roomTypeId [REF]',True),
 ('Room','StayRequest','0..1','0..*','roomId [REF]',True),
 ('Booking','StayRequest','0..1','0..*','relatedBookingId [REF / reserved]',True),
 ('AdditionalService','StayRequestService','1','0..*','serviceId [REF / snapshot]',True),
 ('RoomType','AdditionalService','0..*','0..*','roomTypeIds[] [REF / allowed types]',True),
 ('User','CustomerBookingRequest','1','0..*','customerId [REF]',True),
 ('Booking','CustomerBookingRequest','1','0..*','bookingId [REF]',True)]
for i,(a,b,ca,cb,label,logical) in enumerate(relations):
    style='startArrow='+('ERzeroToOne' if ca=='0..1' else 'ERmany' if ca=='0..*' else 'ERone')+';endArrow='+('ERzeroToOne' if cb=='0..1' else 'ERmany')+';startFill=0;endFill=0;strokeColor='+('#8e659b;dashed=1;' if logical else '#52637a;')
    if a=='User' and b=='Booking':
        port={'customerId':.25,'createdById':.5,'updatedById':.75}[label]
        style+=f'exitX=1;exitY={port};entryX=0;entryY={port};'
    edge(r,'er'+str(i),a,b,f'{ca} — {cb}: {label}',style)
box(r,'er-notes','<b>ข้อจำกัดที่มีผลต่อการอ่าน ER</b><br/>• AdditionalService.roomTypeIds ว่าง = ใช้ได้กับทุกประเภทห้อง; ไม่ใช่ตาราง junction<br/>• StayRequest / StayRequestService เก็บชื่อและราคาขณะส่งคำขอ (snapshot)<br/>• relatedBookingId มีใน schema แต่ API ปัจจุบันยังไม่เชื่อมคำขอเป็น Booking อัตโนมัติ<br/>• Booking หนึ่งรายการมี Payment ได้ 0..1 ตาม schema; flow สร้างการจองปัจจุบันสร้าง Payment ด้วย<br/>• receiptId ใช้อ้างรายการรับเงินเมื่อคืนเงิน; AdminGuard เป็นเอกสารควบคุม concurrency ไม่มี relation',630,2340,1770,155,NOTE)
er=g

g,r=graph(2200,1450)
box(r,'audit-title','<b>ER supplement — Audit references and enum values</b>',40,25,2000,45,TEXT+'fontSize=25;')
entity(r,'User',860,105,450,True)
audit_names=['User','RoomType','AdditionalService','Room','Guest']
for i,name in enumerate(audit_names):
    if name!='User': entity(r,name,60+(i-1)*530,440,430,True)
    for j,field in enumerate(['createdById','updatedById']):
        edge(r,f'audit-{name}-{field}','User',name,f'0..1 — 0..*: {field} [REF]',
             f'startArrow=ERzeroToOne;endArrow=ERmany;startFill=0;endFill=0;dashed=1;strokeColor=#8e659b;exitX={.25+j*.5};exitY=1;entryX={.25+j*.5};entryY=0;')
box(r,'audit-note','createdById / updatedById ใน 5 โมเดลด้านบนเป็น String? @db.ObjectId ไม่มี @relation<br/>Booking.createdById / updatedById และ Payment / PaymentTransaction.recordedById เป็น @relation บังคับและแสดงใน ER หลักแล้ว<br/>ลูกค้าเองอาจเป็น createdBy / recordedBy เมื่อจองผ่านเว็บ จึงเชื่อมกับ User ไม่จำกัดเฉพาะพนักงาน',60,720,2010,110,NOTE)
for i,(name,body) in enumerate(ENUMS.items()):
    vals=' | '.join(body.split())
    box(r,'enum-'+name,f'<b>{name}</b><br/>{vals}',60+(i%2)*1040,885+(i//2)*110,990,85,NOTE)
audit=g

g,r=graph(2200,2100)
box(r,'uc-title','<b>Hotel-Lobby — Use Case Diagram</b>',40,25,1900,45,TEXT+'fontSize=26;')
box(r,'system','ระบบจัดการโรงแรม Hotel-Lobby',230,90,1460,1860,
    'swimlane;html=1;startSize=50;horizontal=1;fillColor=#ffffff;swimlaneFillColor=#ffffff;strokeColor=#52637a;fontFamily=Tahoma;fontSize=22;')
actors=[('visitor','ผู้เยี่ยมชม',60,190),('customer','ลูกค้า / สมาชิก',60,920),
        ('staff','พนักงานโรงแรม\n{abstract}',1830,760),('reception','พนักงานต้อนรับ',2000,480),('admin','ผู้ดูแลระบบ',1830,1530)]
for id,label,x,y in actors:
    box(r,id,label,x,y,125,120,'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;fontFamily=Tahoma;fontSize=16;')
edge(r,'inherit-rec','reception','staff','', 'endArrow=block;endFill=0;strokeWidth=2;')
edge(r,'inherit-admin','admin','staff','', 'endArrow=block;endFill=0;strokeWidth=2;')
usecases=[
 ('public_info','ดูข้อมูลโรงแรม / ช่องทางติดต่อ',285,180,'public'),
 ('public_rooms','ดูประเภทห้อง / ราคา / สิ่งอำนวยความสะดวก',285,295,'public'),
 ('availability','ค้นหาห้องว่างตามวันที่ / จำนวนผู้เข้าพัก',285,410,'public'),
 ('public_services','ดูบริการเสริมที่เปิดใช้งาน',285,525,'public'),
 ('register','สมัครสมาชิก',285,640,'public'),
 ('login','เข้าสู่ระบบ',285,755,'shared'),
 ('account','ดูบัญชีผู้ใช้ปัจจุบัน',285,870,'shared'),
 ('logout','ออกจากระบบ',285,985,'shared'),
 ('profile','แก้ไขชื่อ / อีเมลของตนเอง',285,1100,'customer'),
 ('customer_book','ยืนยันจองห้องผ่านเว็บ\n(ชำระที่โรงแรม)',285,1215,'customer'),
 ('my_bookings','ดูรายการจอง / สถานะชำระเงินของตน',285,1330,'customer'),
 ('request','ส่งคำขอเข้าพักพร้อมบริการเสริม',285,1445,'customer'),
 ('my_requests','ดูคำขอเข้าพัก / สถานะของตน',285,1560,'customer'),
 ('dashboard','ดู Dashboard ห้องว่าง / ผู้เข้าพัก / เข้า–ออก',755,180,'staff'),
 ('view_rooms','ดูข้อมูลห้อง / ประเภทห้อง / บริการเสริม',755,295,'staff'),
 ('guests','จัดการข้อมูลผู้เข้าพัก\n(เพิ่ม / ค้นหา / แก้ไข / ลบหรือปิดใช้งาน)',755,410,'staff'),
 ('bookings','ค้นหา / ดูรายละเอียดการจอง',755,525,'staff'),
 ('create_booking','สร้างการจองให้ผู้เข้าพัก',755,640,'staff'),
 ('edit_booking','แก้ไขการจอง',755,755,'staff'),
 ('cancel','ยกเลิกการจอง',755,870,'staff'),
 ('payments','ดูยอดชำระ / ประวัติรายการรับ–คืนเงิน',755,985,'staff'),
 ('receive','บันทึกรับชำระเงิน\n(เงินสด / โอน / บัตร)',755,1100,'staff'),
 ('refund','บันทึกคืนเงินพร้อมเหตุผล\nและอ้างรายการรับเงินต้นทาง',755,1215,'staff'),
 ('checkin','เช็คอินผู้เข้าพัก',755,1330,'staff'),
 ('checkout','เช็คเอาต์ผู้เข้าพัก',755,1445,'staff'),
 ('manage_request','ดูคำขอทั้งหมด / เปลี่ยนสถานะคำขอ\nnew / read / processed / rejected',755,1560,'staff'),
 ('manage_users','จัดการบัญชีผู้ใช้ / บทบาท\nเพิ่ม / แก้ไข / ปิดใช้งาน',1240,180,'admin'),
 ('manage_rooms','จัดการห้องพัก / สถานะห้อง\nเพิ่ม / แก้ไข / ลบหรือปิดใช้งาน',1240,340,'admin'),
 ('manage_types','จัดการประเภทห้อง / ราคา / ความจุ\nเพิ่ม / แก้ไข / ลบหรือปิดใช้งาน',1240,500,'admin'),
 ('manage_services','จัดการบริการเสริม / ราคา / เงื่อนไข\nเพิ่ม / แก้ไข / เปิด–ปิดใช้งาน',1240,660,'admin'),
 ('report','ดูรายงานยอดรับ / คืน / สุทธิ\nและจำนวน Payment ที่ยังไม่ reconcile',1240,820,'admin'),
 ('check_available','ตรวจสอบห้องว่าง / ป้องกันจองซ้ำ',285,1775,'internal'),
 ('estimate','ตรวจบริการที่เลือก / คำนวณยอดประมาณ',755,1775,'internal'),
 ('check_balance','ตรวจสอบยอดสุทธิชำระครบ',1240,1775,'internal')]
for id,label,x,y,group in usecases:
    fill={'public':'#d5e8d4','shared':'#dae8fc','customer':'#dae8fc','staff':'#fff2cc','admin':'#e1d5e7','internal':'#f5f5f5'}[group]
    box(r,id,label.replace('\n','<br/>'),x,y,350 if x<1240 else 380,80,
        'ellipse;html=1;whiteSpace=wrap;fontFamily=Tahoma;fontSize=14;fillColor='+fill+';strokeColor=#52637a;')
for id,_,_,_,group in usecases:
    allowed={'public':['visitor','customer','staff'] if id!='register' else ['visitor'],
             'shared':['customer','staff'],'customer':['customer'],'staff':['staff'],'admin':['admin'],'internal':[]}[group]
    for actor in allowed:
        edge(r,'assoc-'+actor+'-'+id,actor,id,'','endArrow=none;startArrow=none;strokeColor=#7b8794;opacity=70;')
for a,b in [('customer_book','check_available'),('create_booking','check_available'),('edit_booking','check_available'),('request','estimate'),('checkout','check_balance')]:
    edge(r,'include-'+a+'-'+b,a,b,'«include»','dashed=1;endArrow=open;endFill=0;strokeColor=#325ca8;fontColor=#325ca8;')
box(r,'uc-notes','<b>อ่านแผนภาพ</b><br/>ผู้ดูแลระบบและพนักงานต้อนรับสืบทอด use case ของพนักงานโรงแรม (ลูกศรสามเหลี่ยมโปร่ง)<br/>«include» ชี้จากงานหลักไปยังงานย่อยที่ต้องทำ; งานที่ใช้สิทธิ์ต้องมี session ที่เข้าสู่ระบบแล้ว<br/>การส่งคำขอเข้าพักแยกจากการจองโดยตรง; API ปัจจุบันยังไม่มีแปลงคำขอเป็น Booking อัตโนมัติหรือให้ลูกค้ายกเลิกเอง<br/>การรับเงินเป็นการบันทึกหลักฐานโดยพนักงาน; ไม่มี payment gateway ในโค้ดปัจจุบัน',230,1980,1460,110,NOTE)
uc=g

pages=[('ER - All Models',er),('ER - Audit and Enums',audit),('Use Case - All Roles',uc)]
mxfile=ET.Element('mxfile',host='app.diagrams.net',agent='Hotel-Lobby diagram generator',version='24.7.17',pages=str(len(pages)))
for i,(title,model) in enumerate(pages):
    diagram=ET.SubElement(mxfile,'diagram',id=f'hotel-page-{i+1}',name=title)
    diagram.append(model)
ET.indent(mxfile)
ET.ElementTree(mxfile).write(HERE/'hotel-lobby.drawio',encoding='utf-8',xml_declaration=True)
for filename,model in [('er-diagram.xml',er),('er-audit.xml',audit),('usecase-diagram.xml',uc)]:
    ET.indent(model)
    ET.ElementTree(model).write(HERE/filename,encoding='utf-8',xml_declaration=True)

# A pasteable Mermaid ER alternative, including every stored scalar field.
mermaid=['erDiagram']
for a,b,ca,cb,label,logical in relations:
    left={'1':'||','0..1':'|o','0..*':'}o'}[ca]
    right={'1':'||','0..1':'o|','0..*':'o{'}[cb]
    label=label.replace('→','to').replace(' / ','_').replace(' ','_')
    mermaid.append(f'    {a} {left}{".." if logical else "--"}{right} {b} : "{label}"')
for name in MODELS:
    mermaid.append(f'    {name} {{')
    for field,typ,attrs in fields(name):
        typ=typ.replace('[]','Array').replace('?','')
        key=' PK' if '@id' in attrs else ' UK' if '@unique' in attrs else ''
        mermaid.append(f'        {typ} {field}{key}')
    mermaid.append('    }')
(HERE/'er-diagram.mmd').write_text('\n'.join(mermaid)+'\n',encoding='utf-8')

# Verify actual source coverage and native graph integrity.
assert len(MODELS)==14
for title,model in pages:
    cells=model.findall('./root/mxCell')
    ids=[c.get('id') for c in cells]
    assert len(ids)==len(set(ids)),title
    for c in cells:
        if c.get('edge')=='1':
            assert c.get('source') in ids and c.get('target') in ids,(title,c.get('id'))
    if title=='ER - All Models': assert set(MODELS).issubset(ids)
for path in HERE.glob('*.xml'): ET.parse(path)
ET.parse(HERE/'hotel-lobby.drawio')
print(f'Generated 3 pages, {len(MODELS)} models, {len(relations)} ER relations, 10 audit references, {len(usecases)} use cases; XML checks passed.')
