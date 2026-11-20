#!/usr/bin/env python3
"""Read-only audit of publisher speaker labels for all 24 original references."""
import json,re,html,requests,unicodedata
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import urlsplit,parse_qs,urljoin
root=Path(__file__).resolve().parent
sources=json.loads((root/'sources.json').read_text())['seed_sources']
names={
 'Maribel Vaquero':['vaquero montero'],'Oskar Matute':['matute garcia de jalon'],
 'Gabriel Rufián':['rufian romero'],'Emilio Delgado':['emilio delgado'],
 'Míriam Nogueras':['nogueras i camero'],'Ester Muñoz':['munoz de la iglesia'],
 'Patxi López':['lopez alvarez'],'Pepa Millán':['rodriguez de millan'],
 'Ada Colau':['ada colau'],'Alberto Núñez Feijóo':['nunez feijoo'],
 'Pedro Sánchez':['sanchez perez-castejon','pedro sanchez'],
 'Santiago Abascal':['abascal conde']
}
cache={}
def norm(s):
 return re.sub(r'\s+',' ',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode('ascii').lower())
counts={'exact':0,'wrong':0,'unchecked_external':0,'broken':0}
for s in sources:
 person,url=s['person'],s['url']
 host=urlsplit(url).hostname or ''
 if host!='app.congreso.es':
  counts['unchecked_external']+=1
  print('EXTERNAL_LABEL','person='+person,'url='+url[:115])
  continue
 try:
  if url not in cache:
   r=requests.get(url,timeout=30,headers={'User-Agent':'Mozilla/5.0'})
   r.raise_for_status()
   cache[url]=BeautifulSoup(html.unescape(r.text),'html.parser')
  soup=cache[url];i=parse_qs(urlsplit(url).query).get('i',[''])[0]
  links=[a for a in soup.find_all('a',href=True) if a['href'].split('?')[0].endswith('_'+i+'.mp4')]
  if not links:counts['broken']+=1;print('MISSING_MP4',person,i);continue
  tr=links[0].find_parent('tr')
  label=tr.get_text(' ',strip=True) if tr else ''
  ok=any(n in norm(label) for n in names[person])
  counts['exact' if ok else 'wrong']+=1
  print('EXACT_MATCH' if ok else 'WRONG_LABEL','person='+person,'i='+i,'publisher='+repr(label[:110]))
 except Exception as e:
  counts['broken']+=1;print('SOURCE_ERROR',person,type(e).__name__,str(e)[:80])
print('SUMMARY',json.dumps(counts),flush=True)
