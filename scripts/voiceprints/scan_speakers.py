#!/usr/bin/env python3
"""Inspect MP4 speaker labels on Congress pages. Source metadata only."""
import json,html,requests,unicodedata,re
from collections import defaultdict
from urllib.parse import urlsplit,parse_qs,urljoin
from pathlib import Path
from bs4 import BeautifulSoup

P=Path(__file__).resolve().parent
S=json.loads((P/'sources.json').read_text())
ALIASES={
 'Maribel Vaquero':['vaquero montero'],
 'Oskar Matute':['matute garcia de jalon'],
 'Gabriel Rufián':['rufian romero'],
 'Emilio Delgado':['emilio delgado'],
 'Míriam Nogueras':['nogueras i camero'],
 'Ester Muñoz':['munoz de la iglesia'],
 'Patxi López':['lopez alvarez'],
 'Pepa Millán':['rodriguez de millan'],
 'Ada Colau':['ada colau'],
 'Alberto Núñez Feijóo':['nunez feijoo'],
 'Pedro Sánchez':['sanchez perez-castejon'],
 'Santiago Abascal':['abascal conde']
}
def norm(s):
 return re.sub(r'\s+',' ',unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode().lower())
def label_is_speaker(label):
 t=norm(label).strip()
 return bool(re.match(r'^[a-z][a-z -]{1,74},\s*[a-z][a-z -]{1,65}\s+\([a-z0-9() -]+\)',t))
sources=S['seed_sources']+S['scout']
pages={}
for x in sources:
 u=x['url']
 if 'app.congreso.es' not in u:continue
 q=parse_qs(urlsplit(u).query)
 key=(q.get('codOrgano',[''])[0],q.get('codSesion',[''])[0],q.get('fechaSesion',[''])[0])
 if key not in pages or q.get('i',['0'])[0]!='0':
  pages[key]=u
print('PAGES',len(pages),flush=True)
out=defaultdict(list)
for key,url in pages.items():
 try:
  r=requests.get(url,timeout=35,headers={'User-Agent':'Mozilla/5.0'});r.raise_for_status()
  soup=BeautifulSoup(html.unescape(r.text),'html.parser')
  raw=[a for a in soup.find_all('a',href=True) if a['href'].split('?')[0].endswith('.mp4')]
  events=defaultdict(list)
  for a in raw:
   tr=a.find_parent('tr');label=tr.get_text(' ',strip=True) if tr else ''
   if not label_is_speaker(label):continue
   host=urlsplit(urljoin(url,a['href'])).hostname
   if host!='static.congreso.es':continue
   media=urljoin(url,a['href'])
   for person,aliases in ALIASES.items():
    if any(alias in norm(label) for alias in aliases):
     if media not in events[person]:events[person].append(media)
  for person,medias in events.items():
   for m in medias:
    if not any(z['url']==m for z in out[person]):out[person].append({'url':m,'label':person+' · '+str(key),'source_page':url,'meeting':list(key)})
  print('SESSION',key,'mp4_rows',len(raw),'people',json.dumps({name:len(items) for name,items in events.items()},ensure_ascii=False),flush=True)
 except Exception as e:print('SOURCE_ERROR',key,type(e).__name__,str(e)[:200],flush=True)
result={'format':1,'note':'Exact MP4 row speaker labels from official Congress. No voice samples or embeddings.', 'people':dict(out)}
(P/'speaker-index.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print('INDEX_TOTAL',sum(len(x) for x in out.values()),'counts',json.dumps({n:len(x) for n,x in out.items()},ensure_ascii=False),flush=True)
