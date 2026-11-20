#!/usr/bin/env python3
"""Pilot: fetch official clips and calculate non-biometric QA metrics only.
Never prints or writes raw samples/voice embeddings: the repo is public.
"""
import os,sys,re,html,hashlib,tempfile,subprocess,requests,json
from urllib.parse import parse_qs,urlsplit
import numpy as np
import soundfile as sf
from pathlib import Path

MODEL="https://huggingface.co/moeru-ai/sherpaw-campplus-zh-en-advanced/resolve/5fc23543ac94200ae77514cf1c40596c5d70f6e8/install/bin/wasm/preload.data"
HASH="aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2"
SOURCES=[
("Alberto Núñez Feijóo","https://app.congreso.es/AudiovisualCongreso/audiovisualdetalledisponible?codOrgano=400&codSesion=198&fechaSesion=16%2F09%2F2026&i=778482&idLegislaturaElegida=15&mp4=mp4"),
("Patxi López","https://app.congreso.es/AudiovisualCongreso/audiovisualdetalledisponible?codOrgano=400&codSesion=194&fechaSesion=03%2F09%2F2026&i=777821&idLegislaturaElegida=15&mp4=mp4"),
("Gabriel Rufián","https://app.congreso.es/AudiovisualCongreso/audiovisualdetalledisponible?codOrgano=500&codSesion=10&fechaSesion=12%2F11%2F2026&i=780063&idLegislaturaElegida=15&mp4=mp4")
]
def media(url):
 r=requests.get(url,timeout=35,headers={'User-Agent':'Mozilla/5.0'})
 r.raise_for_status()
 text=html.unescape(r.text)
 key=parse_qs(urlsplit(url).query).get('i',[''])[0]
 urls=re.findall(r'https://static\.congreso\.es/[^"\s<>]+?\.mp4',text)
 matches=[x for x in urls if re.search(r'_'+re.escape(key)+r'\.mp4,x)]
 print('MEDIA',key,'ALL',len(urls),'MATCH',len(matches),flush=True)
 i=text.find('_'+key+'.mp4')
 print('CONTEXT',re.sub(r'<[^>]+>',' ',text[max(0,i-200):i+160]).strip().replace('\n',' ')[:330])
 return matches[0] if matches else None
def extract(url,seek=5,duration=12):
 with tempfile.TemporaryDirectory() as d:
  output=d+'/sample.wav'
  cmd=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-ss',str(seek),'-i',url,'-t',str(duration),'-ac','1','-ar','16000','-y',output]
  r=subprocess.run(cmd,capture_output=True,text=True,timeout=130)
  print('FFMPEG',r.returncode,r.stderr[-450:].replace('\n',' '),flush=True)
  if r.returncode:return None
  data,rate=sf.read(output,dtype='float32')
  if len(data)<16000*6:return None
  amp=np.sqrt(np.mean(np.square(data)))
  clipped=float(np.mean(np.abs(data)>0.97))
  print('AUDIO',round(len(data)/rate,2),'s',rate,'Hz','RMS',round(float(amp),4),'clipped_pct',round(clipped*100,3),flush=True)
  return data
def main():
 import sherpa_onnx
 p=Path('/tmp/voice-model.onnx')
 if not p.exists():
  with requests.get(MODEL,stream=True,timeout=100) as r:
   print('MODEL_FETCH',r.status_code,r.headers.get('content-length'),flush=True)
   r.raise_for_status()
   with p.open('wb') as w:
    for chunk in r.iter_content(1024*1024):
     if chunk:w.write(chunk)
 digest=hashlib.sha256(p.read_bytes()).hexdigest()
 print('MODEL_SHA256',digest,'VERIFIED',digest==HASH,flush=True)
 if digest!=HASH:raise RuntimeError('Pinned browser model mismatch')
 config=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(p),num_threads=2,debug=False,provider='cpu')
 print('MODEL_VALID',config.validate(),flush=True)
 extractor=sherpa_onnx.SpeakerEmbeddingExtractor(config)
 all=[]
 for who,page in SOURCES:
  try:
   video=media(page)
   if not video:print('SKIP_MEDIA',who);continue
   print('VIDEO',video,flush=True)
   for st in [6,20]:
    audio=extract(video,seek=st)
    if audio is None:continue
    stream=extractor.create_stream()
    stream.accept_waveform(sample_rate=16000,waveform=audio)
    stream.input_finished()
    if not extractor.is_ready(stream):print('NOT_READY');continue
    v=np.asarray(extractor.compute(stream),dtype=np.float32)
    print('EMBEDDING_COMPUTED',who,'dimension',v.shape,'L2',round(float(np.linalg.norm(v)),3),'segment',st,flush=True)
    all.append((who,st,v))
  except Exception as e:print('ERROR',who,type(e).__name__,str(e)[:350],flush=True)
 for i in range(len(all)):
  for j in range(i+1,len(all)):
   w1,s1,a=all[i];w2,s2,b=all[j]
   cos=float(a@b/(np.linalg.norm(a)*np.linalg.norm(b)))
   print('COSINE_QA',w1,s1,'vs',w2,s2,round(cos,3),flush=True)
 print('PILOT_FINISHED',len(all),'embeddings computed; none persisted to repository',flush=True)
if __name__=='__main__':main()
,x)]
 print('MEDIA',key,'ALL',len(urls),'MATCH',len(matches),flush=True)
 i=text.find('_'+key+'.mp4')
 print('CONTEXT',re.sub(r'<[^>]+>',' ',text[max(0,i-200):i+160]).strip().replace('\n',' ')[:330])
 return matches[0] if matches else None
def extract(url,seek=5,duration=12):
 with tempfile.TemporaryDirectory() as d:
  output=d+'/sample.wav'
  cmd=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-ss',str(seek),'-i',url,'-t',str(duration),'-ac','1','-ar','16000','-y',output]
  r=subprocess.run(cmd,capture_output=True,text=True,timeout=130)
  print('FFMPEG',r.returncode,r.stderr[-450:].replace('\n',' '),flush=True)
  if r.returncode:return None
  data,rate=sf.read(output,dtype='float32')
  if len(data)<16000*6:return None
  amp=np.sqrt(np.mean(np.square(data)))
  clipped=float(np.mean(np.abs(data)>0.97))
  print('AUDIO',round(len(data)/rate,2),'s',rate,'Hz','RMS',round(float(amp),4),'clipped_pct',round(clipped*100,3),flush=True)
  return data
def main():
 import sherpa_onnx
 p=Path('/tmp/voice-model.onnx')
 if not p.exists():
  with requests.get(MODEL,stream=True,timeout=100) as r:
   print('MODEL_FETCH',r.status_code,r.headers.get('content-length'),flush=True)
   r.raise_for_status()
   with p.open('wb') as w:
    for chunk in r.iter_content(1024*1024):
     if chunk:w.write(chunk)
 digest=hashlib.sha256(p.read_bytes()).hexdigest()
 print('MODEL_SHA256',digest,'VERIFIED',digest==HASH,flush=True)
 if digest!=HASH:raise RuntimeError('Pinned browser model mismatch')
 config=sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(p),num_threads=2,debug=False,provider='cpu')
 print('MODEL_VALID',config.validate(),flush=True)
 extractor=sherpa_onnx.SpeakerEmbeddingExtractor(config)
 all=[]
 for who,page in SOURCES:
  try:
   video=media(page)
   if not video:print('SKIP_MEDIA',who);continue
   print('VIDEO',video,flush=True)
   for st in [6,20]:
    audio=extract(video,seek=st)
    if audio is None:continue
    stream=extractor.create_stream()
    stream.accept_waveform(sample_rate=16000,waveform=audio)
    stream.input_finished()
    if not extractor.is_ready(stream):print('NOT_READY');continue
    v=np.asarray(extractor.compute(stream),dtype=np.float32)
    print('EMBEDDING_COMPUTED',who,'dimension',v.shape,'L2',round(float(np.linalg.norm(v)),3),'segment',st,flush=True)
    all.append((who,st,v))
  except Exception as e:print('ERROR',who,type(e).__name__,str(e)[:350],flush=True)
 for i in range(len(all)):
  for j in range(i+1,len(all)):
   w1,s1,a=all[i];w2,s2,b=all[j]
   cos=float(a@b/(np.linalg.norm(a)*np.linalg.norm(b)))
   print('COSINE_QA',w1,s1,'vs',w2,s2,round(cos,3),flush=True)
 print('PILOT_FINISHED',len(all),'embeddings computed; none persisted to repository',flush=True)
if __name__=='__main__':main()
