#!/usr/bin/env python3
"""Automated curated CAM++ enrollment for twelve public-debate participants.

All audio and raw 192-D embeddings stay in ephemeral runner RAM.
Accepted vectors are sent only to Neon over a GitHub-OIDC-authenticated Vercel
endpoint. The public repository receives text-only metrics and source links.
No unverifiable voices are enrolled. Never invent a success count.
"""
import io,json,os,re,html,time,hashlib,subprocess,sys,unicodedata
from pathlib import Path
from urllib.parse import parse_qs,urlsplit,quote,urljoin
import requests,numpy as np,soundfile as sf,imageio_ffmpeg,sherpa_onnx
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parent
MANIFEST=json.loads((ROOT/'sources.json').read_text())
MODEL_ID=MANIFEST['model_id']
MODEL_URL='https://huggingface.co/moeru-ai/sherpaw-campplus-zh-en-advanced/resolve/5fc23543ac94200ae77514cf1c40596c5d70f6e8/install/bin/wasm/preload.data'
ENDPOINT='https://debate-monitor-live.vercel.app/api/voice-import-action'
headers={'User-Agent':'Mozilla/5.0 (compatible; SpeakerReferenceAuditor/1.0; official audiovisual archives)'}
ALIASES={
 'Maribel Vaquero':['vaquero montero','maribel vaquero'],
 'Oskar Matute':['matute garcia de jalon','oskar matute'],
 'Gabriel Rufián':['rufian romero','gabriel rufian'],
 'Emilio Delgado':['emilio delgado'],
 'Míriam Nogueras':['nogueras i camero','miriam nogueras'],
 'Ester Muñoz':['munoz de la iglesia','ester munoz'],
 'Patxi López':['lopez alvarez','patxi lopez'],
 'Pepa Millán':['rodriguez de millan','pepa millan'],
 'Ada Colau':['ada colau'],
 'Alberto Núñez Feijóo':['alberto nunez feijoo','nunez feijoo'],
 'Pedro Sánchez':['pedro sanchez','sanchez perez-castejon'],
 'Santiago Abascal':['santiago abascal','abascal conde'],
}
PRIORITY=['Maribel Vaquero','Oskar Matute','Gabriel Rufián','Emilio Delgado',
 'Míriam Nogueras','Ester Muñoz','Patxi López','Pepa Millán',
 'Ada Colau','Alberto Núñez Feijóo','Pedro Sánchez','Santiago Abascal']
session=requests.Session();session.headers.update(headers)
def norm(s):
 s=unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode('ascii').lower()
 return re.sub(r'\\s+',' ',s)
def verified(name,text):
 t=norm(text);return any(x in t for x in ALIASES[name])
def media(source,name):
 url=source['url'];host=urlsplit(url).hostname or ''
 if host=='app.congreso.es':
  r=session.get(url,timeout=25);r.raise_for_status()
  page=html.unescape(r.text);key=parse_qs(urlsplit(url).query).get('i',[''])[0]
  if not key:raise ValueError('No Congreso intervention ID')
  soup=BeautifulSoup(page,'html.parser')
  matches=[a for a in soup.find_all('a',href=True) if a['href'].split('?')[0].endswith('_'+key+'.mp4')]
  if not matches:raise ValueError('No exact indexed MP4 for intervention '+key)
  a=matches[0];href=urljoin(url,a['href'])
  row=a.find_parent('tr')
  line=row.get_text(' ',strip=True)[:3000] if row else ''
  if not verified(name,line):
   # Sometimes the speaker label belongs to a sibling event header, NOT the download cell.
   # Do not guess from a full session's list of speakers.
   raise ValueError('Publisher row does not explicitly name '+name+': '+line[:120])
  return href,line[:180],source.get('start')
 if 'europapress.tv' in host:
  r=session.get(url,timeout=25);r.raise_for_status()
  soup=BeautifulSoup(r.text,'html.parser');title=soup.title.get_text(' ',strip=True) if soup.title else ''
  if not verified(name,title):raise ValueError('EuropePress title does not label speaker')
  links=re.findall(r'https://video\\d+\\.europapress\\.net/[^"\\s<>]+?\\.mp4',html.unescape(r.text))
  if not links:raise ValueError('No EuropePress MP4')
  return links[0],title[:180],source.get('start')
 if 'wikimedia.org' in host:
  r=session.get(url,timeout=25);r.raise_for_status()
  soup=BeautifulSoup(r.text,'html.parser');title=soup.title.get_text(' ',strip=True) if soup.title else ''
  if not verified(name,title):raise ValueError('Wikimedia title does not label person')
  p=subprocess.run([sys.executable,'-m','yt_dlp','-g','--no-warnings',url],capture_output=True,text=True,timeout=35)
  if p.returncode:raise ValueError('No retrievable Wikimedia media')
  return p.stdout.splitlines()[0].strip(),title[:180],source.get('start')
 if 'rtve.es' in host:
  r=session.get(url,timeout=25);r.raise_for_status()
  soup=BeautifulSoup(r.text,'html.parser');title=soup.title.get_text(' ',strip=True) if soup.title else ''
  if not verified(name,title):raise ValueError('RTVE title mismatch')
  p=subprocess.run([sys.executable,'-m','yt_dlp','-g','--no-warnings',url],capture_output=True,text=True,timeout=35)
  if p.returncode:raise ValueError('RTVE remote access restricted')
  return p.stdout.splitlines()[0].strip(),title[:180],source.get('start')
 raise ValueError('Unapproved source type: '+host)
def sample(media_url,start):
 cmd=[imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-nostdin',
  '-rw_timeout','13000000','-ss',str(start),'-i',media_url,'-t','12',
  '-vn','-ac','1','-ar','16000','-f','wav','pipe:1']
 try:p=subprocess.run(cmd,capture_output=True,timeout=32)
 except subprocess.TimeoutExpired:raise ValueError('Media response timeout')
 if p.returncode:raise ValueError('ffmpeg: '+p.stderr[-120:].decode('utf8','ignore'))
 try:audio,rate=sf.read(io.BytesIO(p.stdout),dtype='float32')
 except Exception:raise ValueError('Invalid decoded audio')
 if audio.ndim!=1 or rate!=16000 or len(audio)<8*16000:raise ValueError('Insufficient speech')
 audio=np.ascontiguousarray(audio,dtype='float32')
 rms=float(np.sqrt(np.mean(audio*audio)))
 clipping=float(np.mean(np.abs(audio)>.975))
 if rms<.004 or clipping>.01:raise ValueError('Silence/clipping failed')
 frames=audio[:len(audio)//320*320].reshape(-1,320)
 env=np.sqrt(np.mean(frames*frames,axis=1))
 speech=float(np.mean(env>max(.008,np.median(env)*.32)))
 if speech<.70:raise ValueError('Low speech fraction')
 return audio,rms,clipping
def model():
 path=Path('/tmp/lfs-campplus-pinned.onnx')
 if not path.exists():
  with session.get(MODEL_URL,stream=True,timeout=60) as r:
   r.raise_for_status()
   with path.open('wb') as fh:
    for chunk in r.iter_content(1024*1024):
     if chunk:fh.write(chunk)
 sha=hashlib.sha256(path.read_bytes()).hexdigest()
 if sha!=MANIFEST['model_sha256']:raise RuntimeError('CAM++ SHA mismatch')
 config=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(path),num_threads=2,debug=False,provider='cpu')
 if not config.validate():raise RuntimeError('Invalid pinned CAM++ model')
 print('MODEL_VERIFIED',sha,flush=True)
 return sherpa_onnx.SpeakerEmbeddingExtractor(config)
def embed(extractor,audio):
 s=extractor.create_stream()
 s.accept_waveform(sample_rate=16000,waveform=audio)
 s.input_finished()
 if not extractor.is_ready(s):raise ValueError('CAM++ cannot embed this clip')
 v=np.asarray(extractor.compute(s),dtype=np.float32)
 if v.shape!=(192,) or not np.isfinite(v).all():raise ValueError('Bad embedding')
 return v.tolist()
class OIDC:
 def __init__(self):self.token='';self.expiry=0
 def token_now(self):
  if time.time()<self.expiry-45:return self.token
  base=os.getenv('ACTIONS_ID_TOKEN_REQUEST_URL')
  secret=os.getenv('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
  if not base or not secret:raise RuntimeError('GitHub OIDC unavailable - cannot export biometric data')
  separator='&' if '?' in base else '?'
  r=session.get(base+separator+'audience='+quote(ENDPOINT,safe=''),headers={'Authorization':'Bearer '+secret},timeout=15)
  r.raise_for_status()
  self.token=r.json()['value']
  middle=self.token.split('.')[1];import base64
  payload=json.loads(base64.urlsafe_b64decode(middle+'='*(-len(middle)%4)))
  self.expiry=int(payload['exp']);return self.token
def group_sources():
 out={n:[] for n in PRIORITY};seen={n:set() for n in PRIORITY}
 # Diverse providers/events first, and seed-referenced segments second.
 for source in MANIFEST.get('scout',[])+MANIFEST.get('seed_sources',[]):
  name=source.get('person')
  if name not in out:continue
  url=source.get('url')
  if url not in seen[name]:
   out[name].append({'url':url,'start':float(source.get('start') or 0)})
   seen[name].add(url)
 return out
def main():
 output={'model_id':MODEL_ID,'goal_each':10,'initial_references_each':2,'people':{},'accepted':0,'rejected':0,'failures':{}}
 ext=model();auth=OIDC();sources=group_sources()
 for name in PRIORITY:
  print('CANDIDATE',name,'SOURCES',len(sources[name]),flush=True)
  target=8;accepted=0,  # placeholder deliberately overwritten in next statement
  accepted=0;attempts=0;used_events=set()
  for source in sources[name]:
   if accepted>=target:break
   try:url,label,base=media(source,name)
   except Exception as e:
    output['failures'][name+' @ '+source['url'][:75]]=str(e)[:180];print('SOURCE_REJECT',name,str(e)[:160],flush=True);continue
   used_events.add(source['url'])
   offsets=[float(base)+18,float(base)+36,float(base)+54] if base and float(base)>15 else [6,22,38,54]
   if 'rtve.es' in source['url'] and 'la-revuelta' in source['url']:offsets=[70,120,180]
   for start in offsets:
    if accepted>=target:break
    attempts+=1
    try:
     a,rms,clipping=sample(url,start)
     fingerprint=embed(ext,a)
     auth_header={'Authorization':'Bearer '+auth.token_now()}
     request={
      'person_name':name,'model_id':MODEL_ID,'embedding':fingerprint,
      'start_s':round(start,2),'end_s':round(start+len(a)/16000,2),
      'duration_ms':round(len(a)/16),'rms':rms,'clipping':clipping,
      'source_url':url,'publisher_label':label,'publisher_speaker_confirmed':True,
      'audio_sha256':hashlib.sha256(a.tobytes()).hexdigest()
     }
     result=session.post(ENDPOINT,headers=auth_header,json=request,timeout=20)
     payload=result.json()
     if result.status_code==200 and payload.get('added')==1:
      accepted+=1;output['accepted']+=1
      print('SAVED',name,accepted,'from',source['url'][:60],
       'self',payload.get('score'),'gap',payload.get('margin'),flush=True)
     else:
      output['rejected']+=1
      print('REJECTED',name,'at',start,'HTTP',result.status_code,'cause',payload.get('error'),flush=True)
      if payload.get('error')=='Target already met':accepted=8;break
    except Exception as e:
     output['rejected']+=1
     print('FAILED_CLIP',name,round(start,1),str(e)[:180],flush=True)
  output['people'][name]={'added':accepted,'expected_total':accepted+2,'source_pages_attempted':len(used_events),'clip_attempts':attempts,'meets_ten':accepted>=8}
  print('CANDIDATE_RESULT',name,accepted+2,'/ 10 total (including baseline)',flush=True)
 (ROOT/'batch-report.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
 print('COMPLETE',output['accepted'],'new verified references across',len(PRIORITY),'people',flush=True)
if __name__=='__main__':main()
