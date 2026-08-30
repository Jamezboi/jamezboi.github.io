// Session-file mode: mirrors Instaloader's load_session_from_file workflow.
const SESSION_BUCKET='instatrack-sessions';
async function uploadInstaloaderSession(e){
  e.preventDefault();
  const file=$('sessionFile')?.files?.[0], username=$('igUser')?.value?.trim();
  if(!file||!username)return toast('Choose the Instaloader .session file and enter the Instagram username.','error');
  const button=$('saveIgBtn'); button.disabled=true; button.textContent='Uploading…';
  try{
    const path=user.id+'/'+username+'.session';
    const up=await db.storage.from(SESSION_BUCKET).upload(path,file,{upsert:true,contentType:'application/octet-stream'});
    if(up.error)throw up.error;
    const r=await db.from('ig_profiles').upsert({user_id:user.id,instagram_username:username,session_ready:true,session_path:path,updated_at:new Date().toISOString()});
    if(r.error)throw r.error;
    profile={...(profile||{}),instagram_username:username,session_ready:true,session_path:path};
    $('sessionFile').value='';
    $('igConnectionStatus').textContent='Session file is securely stored and ready for the automated Instaloader worker.';
    await loadProfile(); toast('Session uploaded successfully');
  }catch(err){toast(err.message||'Upload failed','error')}finally{button.disabled=false;button.textContent='Upload & secure session'}
}
async function cloudScan(){
  if(!profile?.session_ready){toast('Upload your Instaloader session in Settings first.','error');view('settings');return}
  const latest=await db.from('scan_snapshots').select('created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(1);
  if(latest.data?.[0] && Date.now()-new Date(latest.data[0].created_at).getTime()<172800000){toast('The 48-hour scan interval has not elapsed yet.','error');return}
  const q=await db.from('scan_jobs').insert({user_id:user.id,status:'queued',progress:0});
  if(q.error)return toast(q.error.message,'error');
  view('scanner');$('scanState').textContent='Queued';$('progressText').textContent='0%';$('progressBar').style.width='0%';$('console').textContent='Scan queued. The online Instaloader runner will process it automatically.';toast('Scan queued');pollCloudJob();
}
async function pollCloudJob(){
  for(let i=0;i<180;i++){
    const r=await db.from('scan_jobs').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(1),j=r.data?.[0];
    if(j){
      $('scanState').textContent=j.status;$('progressText').textContent=(j.progress||0)+'%';$('progressBar').style.width=(j.progress||0)+'%';
      if(j.error_message)$('console').textContent='ERROR: '+j.error_message;
      if(j.status==='complete'){toast('Scan complete');await loadDashboard();return}
      if(j.status==='error'){toast(j.error_message||'Scan failed','error');return}
    }
    await new Promise(r=>setTimeout(r,2500));
  }
}
$('igForm').onsubmit=uploadInstaloaderSession;
$('clearIgBtn').onclick=()=>{if($('sessionFile'))$('sessionFile').value=''};
$('scanBtn').onclick=cloudScan;
$('heroScan').onclick=()=>{view('scanner');cloudScan()};
