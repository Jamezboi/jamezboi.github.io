const INSTA_PUBLIC_KEY=\`-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu/b0d3Un1KX6j3mD+I6S
y1AcTmHeRZMFiara6myzZKPm9zwrK6vLc6Gg6drGPlqp5KeSQFcbHK2Gu6dPcadM
ODxHTegYuIKJkRfnjKVCwnslbcHyAgWzuMwpgG9XaR6dyK6TmlEjL+MX6cJc0e/6
97i0QNot/y4J7+o5HQPdzHGO4n55u1NHsnFbFaghXyFmRcKg2qZ+MCIh9ZMhDFku
bZAr8AGJiEghz/6zRV2oPiUmC9oysrSQl3fXdWTcEeFA1P2SUQe60JQqFqXuLul7
j/B372gzYGdPnzF+0HmDET/AMph6Y2vo0nD6ucbFURz/MGHO5QZACmUzakaDo35F
IQIDAQAB
-----END PUBLIC KEY-----\`;

function pemToBytes(pem){const b64=pem.replace(/-----[^-]+-----/g,'').replace(/\s+/g,'');const bin=atob(b64);return Uint8Array.from(bin,c=>c.charCodeAt(0))}
async function encryptLogin(username,password){
 const key=await crypto.subtle.importKey('spki',pemToBytes(INSTA_PUBLIC_KEY),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
 const payload=JSON.stringify({username,password,created_at:new Date().toISOString()});
 const out=await crypto.subtle.encrypt({name:'RSA-OAEP'},key,new TextEncoder().encode(payload));
 return btoa(String.fromCharCode(...new Uint8Array(out)));
}
async function connectInstagramFromBrowser(e){
 e.preventDefault();
 if(!db||!user)return toast('Sign in first.','error');
 const username=$('igUser').value.trim(),password=$('igPass').value;
 if(!username||!password)return toast('Enter your Instagram username and password.','error');
 const b=$('saveIgBtn');b.disabled=true;b.textContent='Securing…';
 try{
   const encrypted=await encryptLogin(username,password);
   const r=await db.from('ig_login_credentials').upsert({user_id:user.id,encrypted_payload:encrypted,updated_at:new Date().toISOString()});
   if(r.error)throw r.error;
   await db.from('ig_profiles').upsert({user_id:user.id,instagram_username:username,session_ready:false,updated_at:new Date().toISOString()});
   $('igPass').value='';
   $('igConnectionStatus').textContent='Login securely queued. The cloud worker will create the Instaloader session automatically.';
   toast('Instagram connection queued');
   profile();
 }catch(err){toast(err.message||'Could not secure login','error')}
 finally{b.disabled=false;b.textContent='Connect Instagram securely'}
}
async function cloudScanFromBrowser(){
 if(!profile?.instagram_username)return toast('Connect Instagram in Settings first.','error');
 const q=await db.from('scan_jobs').insert({user_id:user.id,status:'queued',progress:0});
 if(q.error)return toast(q.error.message,'error');
 view('scanner');$('scanState').textContent='Queued';$('progressText').textContent='0%';$('progressBar').style.width='0%';$('console').textContent='Scan queued. The cloud worker will log into Instagram using the securely stored one-time credentials, create a session, fetch followers, compare snapshots, and save the result.';toast('Scan queued');pollCloudJob();
}
async function pollCloudJob(){
 for(let i=0;i<180;i++){
  const r=await db.from('scan_jobs').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(1),j=r.data?.[0];
  if(j){$('scanState').textContent=j.status;$('progressText').textContent=(j.progress||0)+'%';$('progressBar').style.width=(j.progress||0)+'%';if(j.error_message)$('console').textContent='ERROR: '+j.error_message;if(j.status==='complete'){toast('Scan complete');await loadDashboard();return}if(j.status==='error'){toast(j.error_message||'Scan failed','error');return}}
  await new Promise(r=>setTimeout(r,2500));
 }
}
$('igForm').onsubmit=connectInstagramFromBrowser;
$('clearIgBtn').onclick=()=>{$('igPass').value=''};
$('scanBtn').onclick=cloudScanFromBrowser;
$('heroScan').onclick=()=>{view('scanner');cloudScanFromBrowser()};
