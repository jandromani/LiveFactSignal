#!/usr/bin/env python3
"""Voice-source diagnostic. No voice data or credentials are collected."""
import re, sys, json, subprocess, requests
from bs4 import BeautifulSoup
SOURCES={
"Congress-Patxi":"https://app.congreso.es/AudiovisualCongreso/audiovisualdetalledisponible?codOrgano=400&codSesion=194&fechaSesion=03%2F09%2F2026&i=777821&idLegislaturaElegida=15&mp4=mp4",
"Congress-Feijoo":"https://app.congreso.es/AudiovisualCongreso/audiovisualdetalledisponible?codOrgano=400&codSesion=198&fechaSesion=16%2F09%2F2026&i=778482&idLegislaturaElegida=15&mp4=mp4",
"EuropePress-Emilio":"https://www.europapress.tv/politica/1132053/1/emilio-delgado-frente-amplio-hay-poner-riqueza-servicio-pueblo",
"Wikimedia-Ada":"https://commons.wikimedia.org/wiki/File:Diada_2015_Ada_Colau_demana_al_Govern_espanyol_que.ogv",
"PP-Feijoo":"https://ppcantabria.org/actualidad/noticias/13518-feijoo-el-presidente-de-espana-que-necesita-cantabria",
}
for name,url in SOURCES.items():
 print("\n=== SOURCE",name,flush=True)
 try:
  r=requests.get(url,timeout=25,headers={'User-Agent':'Mozilla/5.0 (compatible; ResearchAudit/1.0)'})
  print("HTTP",r.status_code,"TYPE",r.headers.get('content-type'),"LENGTH",len(r.content),flush=True)
  html=r.text if "html" in r.headers.get("content-type","") else ""
  if html:
   soup=BeautifulSoup(html,'html.parser')
   print("TITLE",soup.title.get_text(' ',strip=True)[:200] if soup.title else "none")
   media=re.findall(r'[^"\'\s<>]+(?:\.mp4|\.m3u8|\.mpd|\.webm)[^"\'\s<>]*',html,re.I)
   print("MEDIA_LINKS",json.dumps(media[:8],ensure_ascii=False)[:1200])
   from urllib.parse import parse_qs,urlsplit
   key=parse_qs(urlsplit(url).query).get('i',[''])[0]
   if key:
    matches=[a for a in soup.find_all('a',href=True) if a['href'].split('?')[0].endswith('_'+key+'.mp4')]
    print("EXACT_ANCHOR",len(matches))
    for tag in matches[:2]:
     tr=tag.find_parent('tr')
     cell=tag.find_parent('td')
     print("PUBLISHER_ROW",tr.get_text(" ",strip=True)[:700] if tr else "NONE")
     print("PUBLISHER_CELL",cell.get_text(" ",strip=True)[:250] if cell else "NONE")
     print("PREV_SIBLING",str(tr.find_previous_sibling('tr'))[:400] if tr and tr.find_previous_sibling('tr') else "NONE")
   for pattern in ['download','descargar','stream','video','speaker']:
    print("MARKER",pattern,html.lower().find(pattern))
  try:
   v=subprocess.run([sys.executable,'-m','yt_dlp','-g','--no-warnings',url],capture_output=True,text=True,timeout=45)
   print("YT_DLP",v.returncode,"URLS",v.stdout[:500],"ERROR",v.stderr[-350:],flush=True)
  except Exception as e: print("YT_DLP_ERROR",str(e),flush=True)
 except Exception as e: print("HTTP_ERROR",repr(e),flush=True)
try:
 url='https://huggingface.co/moeru-ai/sherpaw-campplus-zh-en-advanced/resolve/5fc23543ac94200ae77514cf1c40596c5d70f6e8/install/bin/wasm/preload.data'
 r=requests.get(url,stream=True,timeout=20)
 print("\nMODEL_HTTP",r.status_code,"CT",r.headers.get('content-type'),"SIZE",r.headers.get('content-length'),flush=True)
 r.close()
except Exception as e: print("MODEL_ERROR",repr(e),flush=True)
