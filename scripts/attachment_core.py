"""P0.4 bounded attachment text extraction. Untrusted text never becomes rules."""
from __future__ import annotations
import hashlib
import io
import json
import re
import struct
import zipfile
import zlib
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET
VERSION='0.4.0'
MAX_FILE=8_000_000
MAX_EXPANDED=24_000_000
MAX_UNITS=6000
MAX_CHARS=1_000_000
MAX_CANDIDATES=24
PROTECTED_BITS=(1<<1)|(1<<2)|(1<<4)|(1<<8)|(1<<10)
PATTERNS={
 'eligibility':r'신청\s*자격|신청\s*대상|지원\s*대상|업력|창업.{0,12}(?:년|기업)|소재|본사',
 'exclusion':r'지원\s*제외|신청\s*제외|제외\s*대상|제외.{0,12}(?:기업|대상)|결격|체납|휴.?폐업',
 'overlap':r'중복\s*(?:지원|수혜|신청|참여)|동시\s*(?:수행|참여)|기\s*수혜',
 'cofunding':r'자부담|자기\s*부담|민간\s*부담|기관\s*부담|현금\s*부담|현물',
 'amount':r'지원\s*(?:금|규모|한도)|정부\s*(?:지원|출연)|(?:최대|이내).{0,15}(?:억원|백만원|천만원|만원)',
 'documents':r'제출\s*서류|구비\s*서류|필수\s*서류|증빙\s*(?:자료|서류)',
 'deadline':r'접수\s*기간|신청\s*기간|접수\s*마감|공고\s*기간|마감\s*일'}
ERRORS={'protected_document','unsupported_format','size_limit','unsafe_archive','unsafe_xml','malformed_document','dependency_missing','parser_timeout','resource_limit','download_failed','source_not_linked','source_unavailable'}
class ExtractError(ValueError):pass

def sha(raw):return hashlib.sha256(raw).hexdigest()
def normalized(text):return re.sub(r'\s+',' ',re.sub(r'[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]','',text)).strip()
def mask_contacts(text):
 result=re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}','[연락처 생략]',text)
 result=re.sub(r'(?<!\d)\d{6}\s*-\s*[1-8]\d{6}(?!\d)','[식별번호 생략]',result)
 result=re.sub(r'(?<!\d)(?:0\d{1,2})[- .]\d{3,4}[- .]\d{4}(?!\d)','[연락처 생략]',result)
 return result,result!=text

def detect_format(raw):
 if len(raw)>MAX_FILE:raise ExtractError('size_limit')
 if raw.startswith(b'%PDF-'):return 'pdf'
 if raw.startswith(b'PK\x03\x04'):return 'hwpx'
 if raw.startswith(bytes.fromhex('d0cf11e0a1b11ae1')):return 'hwp'
 raise ExtractError('unsupported_format')
def safe_xml(raw):
 if len(raw)>4_000_000:raise ExtractError('size_limit')
 if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():raise ExtractError('unsafe_xml')
 try:return ET.fromstring(raw)
 except ET.ParseError as exc:raise ExtractError('malformed_document') from exc

def candidates(units):
 rows=[];seen=set();counts={}
 for unit in units:
  text=normalized(unit['text'])
  for category,pattern in PATTERNS.items():
   match=re.search(pattern,text)
   if not match or counts.get(category,0)>=5:continue
   start=max(0,match.start()-65);snippet,redacted=mask_contacts(text[start:start+230])
   key=(category,snippet)
   if key in seen:continue
   seen.add(key);counts[category]=counts.get(category,0)+1
   ident=sha(json.dumps([category,unit['locator'],text[start:start+230]],ensure_ascii=False).encode())[:20]
   rows.append({'id':ident,'category':category,'excerpt':snippet,'locator':unit['locator'],'status':'candidate_unverified','redacted':redacted,'context_warning':True})
   if len(rows)>=MAX_CANDIDATES:return rows
 return rows

def parse_pdf(raw):
 try:from pypdf import PdfReader,__version__
 except ImportError as exc:raise ExtractError('dependency_missing') from exc
 try:
  doc=PdfReader(io.BytesIO(raw),strict=False)
  if doc.is_encrypted:raise ExtractError('protected_document')
  if len(doc.pages)>160:raise ExtractError('size_limit')
  units=[];empty=0;chars=0
  for i,page in enumerate(doc.pages,1):
   text=page.extract_text() or ''
   if len(text)>100_000:raise ExtractError('size_limit')
   chars+=len(text)
   if chars>MAX_CHARS:raise ExtractError('size_limit')
   if len(normalized(text))<10:empty+=1
   for j,line in enumerate(text.splitlines(),1):
    if normalized(line):units.append({'text':line,'locator':f'PDF p.{i} / text-line {j}'})
    if len(units)>MAX_UNITS:raise ExtractError('size_limit')
  return units,{'parser':'pypdf/'+__version__,'pages':len(doc.pages),'empty_pages':empty,'partial':bool(empty),'limitations':['표 열 순서·이미지·주석의 의미는 검토하지 않았습니다.','OCR 미수행']}
 except ExtractError:raise
 except Exception as exc:raise ExtractError('malformed_document') from exc

def parse_hwpx(raw):
 try:
  with zipfile.ZipFile(io.BytesIO(raw)) as z:
   infos=z.infolist();names=[i.filename for i in infos]
   if len(infos)>512 or len(names)!=len(set(names)):raise ExtractError('unsafe_archive')
   total=0
   for i in infos:
    original=getattr(i,'orig_filename',i.filename)
    path=PurePosixPath(original)
    if path.is_absolute() or '..' in path.parts or '\\' in original or '\x00' in original:raise ExtractError('unsafe_archive')
    if i.flag_bits&1:raise ExtractError('protected_document')
    if (i.external_attr>>16)&0o170000==0o120000:raise ExtractError('unsafe_archive')
    total+=i.file_size
    if total>MAX_EXPANDED or i.file_size>8_000_000 or i.file_size>max(200_000,i.compress_size*250):raise ExtractError('size_limit')
   if 'mimetype' not in names or z.read('mimetype').strip()!=b'application/hwp+zip':raise ExtractError('unsupported_format')
   sections=sorted([n for n in names if re.fullmatch(r'Contents/section\d+\.xml',n)],key=lambda n:int(re.search(r'section(\d+)',n)[1]))
   if not sections:raise ExtractError('malformed_document')
   units=[];chars=0
   for section in sections:
    root=safe_xml(z.read(section));index=0
    for p in root.iter():
     if p.tag.rsplit('}',1)[-1]!='p':continue
     index+=1
     def text_in(node,is_root=False):
      if not is_root and node.tag.rsplit('}',1)[-1]=='p':return []
      if node.tag.rsplit('}',1)[-1]=='t':return [''.join(node.itertext())]
      return [t for child in node for t in text_in(child)]
     text=''.join(text_in(p,True));chars+=len(text)
     if chars>MAX_CHARS or len(units)>=MAX_UNITS:raise ExtractError('size_limit')
     if normalized(text):units.append({'text':text,'locator':f'{section} / paragraph {index}'})
   return units,{'parser':'hwp-body/'+VERSION,'sections':len(sections),'partial':False,'limitations':['구역·문단 위치는 실제 인쇄 쪽번호가 아닙니다.','표 셀 관계·그림·각주 의미는 미검토']}
 except ExtractError:raise
 except (zipfile.BadZipFile,RuntimeError,KeyError) as exc:raise ExtractError('malformed_document') from exc

def decompress_bounded(raw):
 d=zlib.decompressobj(-15)
 try:
  out=d.decompress(raw,MAX_EXPANDED+1)
  if len(out)>MAX_EXPANDED or d.unconsumed_tail:raise ExtractError('size_limit')
  if not d.eof:raise ExtractError('malformed_document')
  if d.unused_data:
   # Some HWP body streams append the gzip CRC32/ISIZE trailer to raw DEFLATE.
   # Accept only an exact, verified trailer; never silently discard arbitrary bytes.
   if len(d.unused_data)!=8:raise ExtractError('malformed_document')
   crc,size=struct.unpack('<II',d.unused_data)
   if crc!=(zlib.crc32(out)&0xffffffff) or size!=(len(out)&0xffffffff):raise ExtractError('malformed_document')
  return out
 except zlib.error as exc:raise ExtractError('malformed_document') from exc

def hwp_text(raw):
 if len(raw)%2:raise ExtractError('malformed_document')
 out=bytearray();i=0;extended=set(range(1,10))|{11,12}|set(range(14,24))
 while i<len(raw):
  code=struct.unpack_from('<H',raw,i)[0]
  if code in extended:
   if i+16>len(raw):raise ExtractError('malformed_document')
   out.extend(' '.encode('utf-16le'));i+=16;continue
  if code in (10,13):out.extend('\n'.encode('utf-16le'))
  elif code in (30,31):out.extend(' '.encode('utf-16le'))
  elif code==24:out.extend('-'.encode('utf-16le'))
  elif code>=32:out.extend(raw[i:i+2])
  i+=2
 return out.decode('utf-16le',errors='replace')

def parse_hwp_records(raw,section):
 at=0;index=0;units=[]
 while at<len(raw):
  if at+4>len(raw):raise ExtractError('malformed_document')
  header=struct.unpack_from('<I',raw,at)[0];at+=4;tag=header&0x3ff;size=header>>20
  if size==4095:
   if at+4>len(raw):raise ExtractError('malformed_document')
   size=struct.unpack_from('<I',raw,at)[0];at+=4
  if size>MAX_EXPANDED or at+size>len(raw):raise ExtractError('malformed_document')
  index+=1
  if index>100_000:raise ExtractError('size_limit')
  if tag==67:
   text=hwp_text(raw[at:at+size])
   if normalized(text):units.append({'text':text,'locator':f'{section} / record {index} (PARA_TEXT)'})
   if len(units)>MAX_UNITS:raise ExtractError('size_limit')
  at+=size
 return units

def parse_hwp(raw):
 try:import olefile
 except ImportError as exc:raise ExtractError('dependency_missing') from exc
 try:
  with olefile.OleFileIO(io.BytesIO(raw),raise_defects=olefile.DEFECT_INCORRECT) as doc:
   if not doc.exists('FileHeader'):raise ExtractError('unsupported_format')
   header=doc.openstream('FileHeader').read(257)
   if len(header)!=256 or not header.startswith(b'HWP Document File\x00'):raise ExtractError('malformed_document')
   if header[35]!=5:raise ExtractError('unsupported_format')
   flags=struct.unpack_from('<I',header,36)[0]
   if flags&PROTECTED_BITS:raise ExtractError('protected_document')
   sections=sorted([x for x in doc.listdir() if len(x)==2 and x[0]=='BodyText' and re.fullmatch(r'Section\d+',x[1])],key=lambda x:int(x[1][7:]))
   if not sections:raise ExtractError('malformed_document')
   if len(sections)>160:raise ExtractError('size_limit')
   units=[];total=0
   for section in sections:
    if doc.get_size(section)>MAX_FILE:raise ExtractError('size_limit')
    data=doc.openstream(section).read(MAX_FILE+1)
    if flags&1:data=decompress_bounded(data)
    total+=len(data)
    if total>MAX_EXPANDED:raise ExtractError('size_limit')
    units.extend(parse_hwp_records(data,'/'.join(section)))
    if len(units)>MAX_UNITS:raise ExtractError('size_limit')
   return units,{'parser':'olefile/'+olefile.__version__+'+hwp-body/'+VERSION,'sections':len(sections),'partial':False,'limitations':['구역·레코드 위치는 실제 인쇄 쪽번호가 아닙니다.','표·그림·각주 의미와 문서의 모든 제외조건은 미검토']}
 except ExtractError:raise
 except Exception as exc:raise ExtractError('malformed_document') from exc

def extract(raw):
 fmt=detect_format(raw);units,info={'pdf':parse_pdf,'hwp':parse_hwp,'hwpx':parse_hwpx}[fmt](raw)
 chars=sum(len(normalized(u['text'])) for u in units)
 if chars>MAX_CHARS:raise ExtractError('size_limit')
 quality='text_extracted' if chars>=10 else 'no_text'
 if info['partial'] and quality=='text_extracted':quality='partial_text'
 if sum(u['text'].count('\ufffd') for u in units)>max(5,chars//100):quality='partial_text'
 return {'format':fmt,'parser':info['parser'],'sha256':sha(raw),'bytes':len(raw),'status':quality,'text_characters':chars,'units':len(units),'text_sha256':sha('\n'.join(normalized(u['text']) for u in units).encode()),'pages':info.get('pages'),'sections':info.get('sections'),'empty_pages':info.get('empty_pages',0),'candidate_facts':candidates(units),'coverage':'body_text_only_unreviewed','attachments_reviewed':False,'limitations':info['limitations']}

OFFICIAL_HOSTS=('bizinfo.go.kr','mss.go.kr','k-startup.go.kr','nipa.kr','kocca.kr','iris.go.kr','kosmes.or.kr','kdata.or.kr','culture.go.kr','korea.kr','work24.go.kr','nts.go.kr','rnd.or.kr','koita.or.kr','seoul.rnbd.kr')
def approved_url(url):
 from urllib.parse import urlparse,parse_qsl
 if not isinstance(url,str) or len(url)>2500 or any(ord(c)<32 for c in url):return False
 try:
  u=urlparse(url);host=(u.hostname or '').lower()
  return u.scheme=='https' and u.port in (None,443) and not u.username and not u.password and any(host==h or host.endswith('.'+h) for h in OFFICIAL_HOSTS) and not any(k.casefold() in {'crtfckey','servicekey','api_key','token','access_token','password','secret'} for k,v in parse_qsl(u.query))
 except ValueError:return False

def validate_transport_fields(value):
 status=value.get('http_status');kind=value.get('failure_kind')
 if status is not None and (type(status) is not int or not 400<=status<=599):raise ValueError('http_status')
 if kind not in {None,'http_error','network_error','document_or_policy','unclassified'}:raise ValueError('failure_kind')
 if status is not None and kind!='http_error':raise ValueError('failure_kind_mismatch')
 if 'retryable' in value and type(value['retryable']) is not bool:raise ValueError('retryable')
 if status in (401,403) and value.get('retryable'):raise ValueError('access_denial_retry')
 return True

def validate_public(data):
 if data.get('schema')!='public-funding-attachments/v1':raise ValueError('attachments_schema')
 if set(data)-{'schema','version','generated_at','run','records','programs'}:raise ValueError('unexpected_root_field')
 if not isinstance(data['records'],dict) or not isinstance(data['programs'],dict):raise ValueError('records')
 record_keys={'id','program_id','notice_source','url','name','status','last_attempt_at','last_success_at','last_error','observed_sha256','sha256','previous_sha256','review_required','content_changed_at','extraction','history','http_status','failure_kind','retryable'}
 extract_keys={'format','parser','sha256','bytes','status','text_characters','units','text_sha256','pages','sections','empty_pages','candidate_facts','coverage','attachments_reviewed','limitations'}
 program_keys={'notice_source','last_notice_attempt_at','last_notice_success_at','notice_status','manifest_sha256','document_ids','review_required','last_error','previous_manifest_sha256'}
 run_keys={'at','notice_success','notice_failed','attempted','text_extracted','partial_or_no_text','blocked_or_unsupported','failed','changed','manifest_changed','queued_total','scope'}
 if set(data.get('run',{}))-run_keys:raise ValueError('run_fields')
 for p in data['programs'].values():
  if set(p)-program_keys or not approved_url(p.get('notice_source')):raise ValueError('manifest_fields')
  if any(i not in data['records'] for i in p.get('document_ids',[])):raise ValueError('missing_document')
 for key,r in data['records'].items():
  if key!=r.get('id') or set(r)-record_keys:raise ValueError('record_fields')
  if not approved_url(r.get('url')) or not approved_url(r.get('notice_source')):raise ValueError('unapproved_url')
  if len(r.get('history',[]))>8:raise ValueError('history_limit')
  for event in r.get('history',[]):
   if not {'at','status','observed_sha256'}<=set(event) or set(event)-{'at','status','observed_sha256','http_status','failure_kind'}:raise ValueError('history_fields')
   validate_transport_fields(event)
  for field in ('sha256','observed_sha256','previous_sha256'):
   if r.get(field) and not re.fullmatch(r'[a-f0-9]{64}',r[field]):raise ValueError('hash_format')
  validate_transport_fields(r)
  ex=r.get('extraction')
  if not ex:continue
  if set(ex)!=extract_keys or ex['attachments_reviewed'] is not False:raise ValueError('extraction_fields')
  if ex['sha256']!=r.get('sha256'):raise ValueError('unbound_extraction')
  if ex['coverage']!='body_text_only_unreviewed':raise ValueError('unreviewed_coverage')
  if len(ex['candidate_facts'])>MAX_CANDIDATES:raise ValueError('candidate_limit')
  for c in ex['candidate_facts']:
   if set(c)!={'id','category','excerpt','locator','status','redacted','context_warning'}:raise ValueError('candidate_fields')
   if c['status']!='candidate_unverified' or c['context_warning'] is not True:raise ValueError('unsafe_candidate')
   if len(c['excerpt'])>260 or c['category'] not in PATTERNS or not c['locator']:raise ValueError('candidate_bounds')
 return True
