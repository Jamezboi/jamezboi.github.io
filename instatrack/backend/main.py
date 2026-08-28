import os, uuid, tempfile, pathlib, base64, threading
from datetime import datetime, timezone
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client
import instaloader
from cryptography.fernet import Fernet
URL=os.environ['SUPABASE_URL']; KEY=os.environ['SUPABASE_SERVICE_ROLE_KEY']; FKEY=os.environ['SESSION_ENCRYPTION_KEY']
sb=create_client(URL,KEY); cipher=Fernet(FKEY.encode()); app=FastAPI(title='InstaTrack Worker')
app.add_middleware(CORSMiddleware,allow_origins=os.getenv('ALLOWED_ORIGINS','https://jamezboi.github.io').split(','),allow_credentials=True,allow_methods=['*'],allow_headers=['*'])
class Connect(BaseModel): username:str; password:str
class Empty(BaseModel): pass
def auth(h):
 if not h or not h.startswith('Bearer '): raise HTTPException(401,'Missing authentication')
 r=sb.auth.get_user(h[7:])
 if not r.user: raise HTTPException(401,'Invalid authentication')
 return str(r.user.id)
def sess(uid):
 r=sb.table('ig_secrets').select('session_blob').eq('user_id',uid).maybe_single().execute()
 if not r.data: raise HTTPException(400,'Instagram session is not configured')
 return cipher.decrypt(r.data['session_blob'].encode())
def upd(j,u,**kw): sb.table('scan_jobs').update(kw).eq('id',j).eq('user_id',u).execute()
def worker(u,j):
 try:
  raw=sess(u); name,blob=raw.split(b'|',1); name=name.decode(); upd(j,u,status='running',progress=10)
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td)/f'{name}.session'; p.write_bytes(blob); L=instaloader.Instaloader(quiet=True); L.load_session_from_file(name,str(p)); upd(j,u,progress=25); prof=instaloader.Profile.from_username(L.context,name); upd(j,u,progress=40); cur=sorted({x.username for x in prof.get_followers()}); upd(j,u,progress=80)
  r=sb.table('scan_snapshots').select('followers').eq('user_id',u).order('created_at',desc=True).limit(1).execute(); prev=r.data[0]['followers'] if r.data else []; old=set(prev); now=set(cur)
  lost=sorted(old-now) if prev else []; gained=sorted(now-old) if prev else []
  sb.table('scan_snapshots').insert({'user_id':u,'follower_count':len(cur),'followers':cur,'unfollowers':lost,'new_followers':gained,'status':'complete'}).execute(); upd(j,u,status='complete',progress=100,finished_at=datetime.now(timezone.utc).isoformat())
 except Exception as e: upd(j,u,status='error',progress=0,error_message=str(e))
@app.get('/health')
def health(): return {'ok':True,'service':'instatrack-worker'}
@app.post('/api/instagram/connect')
def connect(x:Connect,authorization:str|None=Header(default=None)):
 u=auth(authorization)
 try:
  L=instaloader.Instaloader(quiet=True); L.login(x.username,x.password)
  with tempfile.TemporaryDirectory() as td:
   p=pathlib.Path(td)/f'{x.username}.session'; L.save_session_to_file(str(p)); s=p.read_bytes()
  blob=base64.urlsafe_b64encode(cipher.encrypt(x.username.encode()+b'|'+s)).decode(); now=datetime.now(timezone.utc).isoformat()
  sb.table('ig_secrets').upsert({'user_id':u,'session_blob':blob,'updated_at':now}).execute(); sb.table('ig_profiles').upsert({'user_id':u,'instagram_username':x.username,'session_ready':True,'updated_at':now}).execute(); return {'ok':True,'message':'Encrypted Instagram session created.'}
 except Exception as e: raise HTTPException(400,'Instagram login failed: '+str(e))
@app.post('/api/scan')
def scan(_:Empty,authorization:str|None=Header(default=None)):
 u=auth(authorization); j=str(uuid.uuid4()); sb.table('scan_jobs').insert({'id':j,'user_id':u,'status':'queued','progress':0}).execute(); threading.Thread(target=worker,args=(u,j),daemon=True).start(); return {'job_id':j,'status':'queued'}
@app.get('/api/jobs/{j}')
def job(j:str,authorization:str|None=Header(default=None)):
 u=auth(authorization); r=sb.table('scan_jobs').select('*').eq('id',j).eq('user_id',u).maybe_single().execute()
 if not r.data: raise HTTPException(404,'Job not found')
 x=r.data; return {'job_id':j,'status':x['status'],'progress':x['progress'],'error':x.get('error_message')}
