import os, tempfile, traceback, smtplib, time
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
import instaloader
from supabase import create_client

SB=create_client(os.environ["SUPABASE_URL"],os.environ["SUPABASE_SERVICE_ROLE_KEY"])
BUCKET="instatrack-sessions"
LOG=[]

def log(message):
    line="{} - {}".format(datetime.now().strftime("%Y-%m-%d %H:%M:%S"), message)
    print(line,flush=True)
    LOG.append(line)

def send_email(subject,body):
    user=os.getenv("GMAIL_USER")
    pw=os.getenv("GMAIL_APP_PASSWORD")
    to=os.getenv("REPORT_TO") or user
    if not user or not pw or not to:
        log("Email skipped: Gmail secrets are not configured.")
        return
    msg=MIMEMultipart()
    msg["From"]=user
    msg["To"]=to
    msg["Subject"]=subject
    msg.attach(MIMEText(body,"plain","utf-8"))
    part=MIMEApplication("\n".join(LOG).encode("utf-8"),_subtype="txt")
    part.add_header("Content-Disposition","attachment",filename="ig_tracker_log.txt")
    msg.attach(part)
    try:
        with smtplib.SMTP("smtp.gmail.com",587) as server:
            server.starttls()
            server.login(user,pw)
            server.send_message(msg)
        log("Email sent successfully.")
    except Exception as e:
        log("Email failed: {}".format(e))

def update_job(jid,**patch):
    SB.table("scan_jobs").update(patch).eq("id",jid).execute()

def process(job):
    jid=job["id"]
    uid=job["user_id"]
    try:
        pr=SB.table("ig_profiles").select("instagram_username,session_ready,session_path").eq("user_id",uid).single().execute().data
        if not pr or not pr.get("session_ready") or not pr.get("session_path"):
            raise RuntimeError("Instagram session is not configured.")
        username=pr["instagram_username"]
        session_path=pr["session_path"]

        last=SB.table("scan_snapshots").select("created_at").eq("user_id",uid).order("created_at",desc=True).limit(1).execute().data
        if last:
            when=datetime.fromisoformat(last[0]["created_at"].replace("Z","+00:00"))
            if datetime.now(timezone.utc)-when < timedelta(hours=48):
                update_job(jid,status="error",progress=0,error_message="48-hour scan interval has not elapsed.")
                log("Skipped: 48-hour interval has not elapsed.")
                return

        update_job(jid,status="running",progress=5)
        log("Starting automated scan for @{}.".format(username))

        blob=SB.storage.from_(BUCKET).download(session_path)
        with tempfile.TemporaryDirectory() as td:
            session_file=os.path.join(td,"session-{}".format(username))
            with open(session_file,"wb") as f:
                f.write(blob)
            loader=instaloader.Instaloader()
            log("Loading Instaloader session file.")
            loader.load_session_from_file(username,filename=session_file)
            log("Session loaded successfully.")
            update_job(jid,progress=20)

            log("Fetching profile data...")
            profile=instaloader.Profile.from_username(loader.context,username)
            time.sleep(2)
            update_job(jid,progress=35)

            log("Fetching current followers...")
            current=[]
            for follower in profile.get_followers():
                current.append(follower.username)
            current=sorted(set(current))
            log("Successfully fetched {} followers.".format(len(current)))

        update_job(jid,progress=80)

        previous_rows=SB.table("scan_snapshots").select("followers").eq("user_id",uid).order("created_at",desc=True).limit(1).execute().data
        previous=previous_rows[0]["followers"] if previous_rows else []

        if not previous:
            lost=[]
            gained=[]
            first=True
            log("First run complete. Saving baseline.")
        else:
            old=set(previous)
            now=set(current)
            lost=sorted(old-now)
            gained=sorted(now-old)
            first=False
            log("Found {} unfollowers and {} new followers.".format(len(lost),len(gained)))

        result=SB.table("scan_snapshots").insert({
            "user_id":uid,
            "follower_count":len(current),
            "followers":current,
            "unfollowers":lost,
            "new_followers":gained,
            "status":"complete"
        }).execute()
        if getattr(result,"error",None):
            raise RuntimeError(result.error)

        update_job(jid,status="complete",progress=100,finished_at=datetime.now(timezone.utc).isoformat())

        body=("Hello!\n\n"
              "Here is your bi-daily Instagram Update for @{}.\n\n".format(username) +
              "🚨 UNFOLLOWERS ({}):\n".format(len(lost)) +
              ("".join(" - https://instagram.com/{}\n".format(u) for u in lost)
               if lost else " Nobody unfollowed you these past two days! 🎉\n") +
              "\n✨ NEW FOLLOWERS ({}):\n".format(len(gained)) +
              ("".join(" - {}\n".format(u) for u in gained)
               if gained else " No new followers these past two days.\n") +
              "\nTotal Current Followers: {}".format(len(current)))

        send_email("✅ IG Tracker Initialized" if first else "📊 Your bi-daily Instagram Report",body)

    except Exception:
        err=traceback.format_exc()
        log("FATAL SCAN ERROR")
        log(err)
        update_job(jid,status="error",progress=0,error_message=err[:4000])
        send_email("💥 IG Tracker CRASH REPORT","The IG Tracker failed for user {}.\n\n{}".format(uid,err))

def main():
    LOG.clear()
    queued=SB.table("scan_jobs").select("*").eq("status","queued").order("created_at",desc=False).limit(10).execute().data or []
    if not queued:
        log("No queued scans.")
    for job in queued:
        process(job)

if __name__=="__main__":
    main()
