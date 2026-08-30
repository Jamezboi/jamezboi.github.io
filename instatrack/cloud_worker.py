import os, tempfile, traceback, smtplib, time, base64, json
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
import instaloader
from supabase import create_client

SB=create_client(os.environ["SUPABASE_URL"],os.environ["SUPABASE_SERVICE_ROLE_KEY"])
BUCKET="instatrack-sessions"
LOG=[]

def log(message):
    line="{} - {}".format(datetime.now().strftime("%Y-%m-%d %H:%M:%S"),message)
    print(line,flush=True); LOG.append(line)

def send_email(subject,body):
    user=os.getenv("GMAIL_USER"); pw=os.getenv("GMAIL_APP_PASSWORD"); to=os.getenv("REPORT_TO") or user
    if not user or not pw or not to:
        log("Email skipped: Gmail secrets are not configured."); return
    msg=MIMEMultipart(); msg["From"]=user; msg["To"]=to; msg["Subject"]=subject
    msg.attach(MIMEText(body,"plain","utf-8"))
    part=MIMEApplication("\n".join(LOG).encode("utf-8"),_subtype="txt")
    part.add_header("Content-Disposition","attachment",filename="ig_tracker_log.txt"); msg.attach(part)
    try:
        with smtplib.SMTP("smtp.gmail.com",587) as server:
            server.starttls(); server.login(user,pw); server.send_message(msg)
        log("Email sent successfully.")
    except Exception as e: log("Email failed: {}".format(e))

def update_job(jid,**patch):
    SB.table("scan_jobs").update(patch).eq("id",jid).execute()

def private_key():
    raw=os.environ["INSTATrack_SESSION_PRIVATE_KEY"].replace("\\n","\n").encode()
    return serialization.load_pem_private_key(raw,password=None)

def decrypt_credentials(payload):
    encrypted=base64.b64decode(payload)
    plain=private_key().decrypt(encrypted,padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()),algorithm=hashes.SHA256(),label=None))
    return json.loads(plain.decode("utf-8"))

def provision_session(uid, username, job_id):
    row=SB.table("ig_login_credentials").select("encrypted_payload").eq("user_id",uid).maybe_single().execute().data
    if not row: raise RuntimeError("No queued Instagram login credentials were found.")
    creds=decrypt_credentials(row["encrypted_payload"])
    if creds.get("username")!=username: raise RuntimeError("Queued login username does not match the Instagram profile.")
    log("Creating Instagram session from the browser-provided login.")
    loader=instaloader.Instaloader()
    loader.login(creds["username"],creds["password"])
    with tempfile.TemporaryDirectory() as td:
        session_file=os.path.join(td,"session-{}".format(username))
        loader.save_session_to_file(username,filename=session_file)
        with open(session_file,"rb") as f: blob=f.read()
    path=uid+"/"+username+".session"
    SB.storage.from_(BUCKET).upload(path,blob,{"upsert":True,"content-type":"application/octet-stream"})
    SB.table("ig_profiles").upsert({"user_id":uid,"instagram_username":username,"session_ready":True,"session_path":path,"updated_at":datetime.now(timezone.utc).isoformat()}).execute()
    SB.table("ig_login_credentials").delete().eq("user_id",uid).execute()
    log("Instagram session created and one-time login credentials removed.")
    return path

def process(job):
    jid=job["id"]; uid=job["user_id"]
    try:
        pr=SB.table("ig_profiles").select("instagram_username,session_ready,session_path").eq("user_id",uid).single().execute().data
        if not pr or not pr.get("instagram_username"): raise RuntimeError("Instagram account is not configured.")
        username=pr["instagram_username"]
        update_job(jid,status="running",progress=5)
        session_path=pr.get("session_path")
        if not pr.get("session_ready") or not session_path:
            update_job(jid,progress=10)
            session_path=provision_session(uid,username,jid)

        last=SB.table("scan_snapshots").select("created_at").eq("user_id",uid).order("created_at",desc=True).limit(1).execute().data
        if last:
            when=datetime.fromisoformat(last[0]["created_at"].replace("Z","+00:00"))
            if datetime.now(timezone.utc)-when < timedelta(hours=48):
                update_job(jid,status="error",progress=0,error_message="48-hour scan interval has not elapsed.")
                log("Skipped: 48-hour interval has not elapsed."); return

        blob=SB.storage.from_(BUCKET).download(session_path)
        with tempfile.TemporaryDirectory() as td:
            session_file=os.path.join(td,"session-{}".format(username))
            with open(session_file,"wb") as f: f.write(blob)
            loader=instaloader.Instaloader()
            log("Loading Instaloader session file."); loader.load_session_from_file(username,filename=session_file)
            update_job(jid,progress=25)
            log("Fetching profile data..."); profile=instaloader.Profile.from_username(loader.context,username); time.sleep(2)
            update_job(jid,progress=35)
            log("Fetching current followers...")
            current=[f.username for f in profile.get_followers()]
            current=sorted(set(current))
            log("Successfully fetched {} followers.".format(len(current)))
        update_job(jid,progress=80)
        rows=SB.table("scan_snapshots").select("followers").eq("user_id",uid).order("created_at",desc=True).limit(1).execute().data
        previous=rows[0]["followers"] if rows else []
        if not previous: lost=[]; gained=[]; first=True; log("First run complete. Saving baseline.")
        else:
            old=set(previous); now=set(current); lost=sorted(old-now); gained=sorted(now-old); first=False
            log("Found {} unfollowers and {} new followers.".format(len(lost),len(gained)))
        SB.table("scan_snapshots").insert({"user_id":uid,"follower_count":len(current),"followers":current,"unfollowers":lost,"new_followers":gained,"status":"complete"}).execute()
        update_job(jid,status="complete",progress=100,finished_at=datetime.now(timezone.utc).isoformat())
        body=("Hello!\n\nHere is your bi-daily Instagram Update for @{}.\n\n".format(username)+
              "🚨 UNFOLLOWERS ({}):\n".format(len(lost))+
              ("".join(" - https://instagram.com/{}\n".format(u) for u in lost) if lost else " Nobody unfollowed you these past two days! 🎉\n")+
              "\n✨ NEW FOLLOWERS ({}):\n".format(len(gained))+
              ("".join(" - {}\n".format(u) for u in gained) if gained else " No new followers these past two days.\n")+
              "\nTotal Current Followers: {}".format(len(current)))
        send_email("✅ IG Tracker Initialized" if first else "📊 Your bi-daily Instagram Report",body)
    except Exception:
        err=traceback.format_exc(); log("FATAL SCAN ERROR"); log(err)
        update_job(jid,status="error",progress=0,error_message=err[:4000])
        send_email("💥 IG Tracker CRASH REPORT","The IG Tracker failed for user {}.\n\n{}".format(uid,err))

def main():
    LOG.clear()
    queued=SB.table("scan_jobs").select("*").eq("status","queued").order("created_at",desc=False).limit(10).execute().data or []
    if not queued: log("No queued scans.")
    for job in queued: process(job)

if __name__=="__main__": main()
