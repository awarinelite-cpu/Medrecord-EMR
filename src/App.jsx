import { useState, useEffect, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, serverTimestamp, query, orderBy, getDocs, addDoc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD91f4UJKPXZEpfXV_QoggsZq1R_9WcC4s",
  authDomain: "the-elites-nurses.firebaseapp.com",
  projectId: "the-elites-nurses",
  storageBucket: "the-elites-nurses.firebasestorage.app",
  messagingSenderId: "44425476386",
  appId: "1:44425476386:web:98be1e3e6a34c403eccd7b",
  measurementId: "G-T4BELKJMZR"
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const FB = {
  register: async (email, password, profile) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), { ...profile, uid: cred.user.uid, email, createdAt: serverTimestamp() });
    return { uid: cred.user.uid, email, ...profile };
  },
  login: (e, p) => signInWithEmailAndPassword(auth, e, p),
  logout: () => signOut(auth),
  forgotPassword: (e) => sendPasswordResetEmail(auth, e),
  onAuth: (cb) => onAuthStateChanged(auth, cb),
  getProfile: async (uid) => { const s = await getDoc(doc(db, "users", uid)); return s.exists() ? s.data() : null; },
  getUsers: async () => { const s = await getDocs(collection(db, "users")); return s.docs.map(d => d.data()); },
  savePatient: async (p) => { await setDoc(doc(db, "patients", p.id), { ...p, updatedAt: serverTimestamp() }); },
  onPatients: (cb) => { const q = query(collection(db, "patients"), orderBy("createdAt", "desc")); return onSnapshot(q, s => cb(s.docs.map(d => d.data()))); },
  saveSettings: async (key, data) => { await setDoc(doc(db, "settings", key), { ...data, updatedAt: serverTimestamp() }); },
  onSettings: (key, cb) => onSnapshot(doc(db, "settings", key), s => cb(s.exists() ? s.data() : null)),
  // 24hr ward reports
  saveWardReport: async (data) => {
    const id = data.id || ("WR-" + Math.random().toString(36).slice(2,10));
    await setDoc(doc(db, "wardReports", id), { ...data, id, updatedAt: serverTimestamp() });
    return id;
  },
  onWardReports: (cb) => {
    const q = query(collection(db, "wardReports"), orderBy("date", "desc"));
    return onSnapshot(q, s => cb(s.docs.map(d => d.data())));
  },
  save24hrArchive: async (data) => {
    const id = data.id || ("AR-" + Math.random().toString(36).slice(2,10));
    await setDoc(doc(db, "shiftArchives", id), { ...data, id, archivedAt: serverTimestamp() });
    return id;
  },
  on24hrArchives: (cb) => {
    const q = query(collection(db, "shiftArchives"), orderBy("archivedAt", "desc"));
    return onSnapshot(q, s => cb(s.docs.map(d => d.data())));
  },
  updateUserRole: async (uid, role) => { await updateDoc(doc(db, "users", uid), { role }); },
  deactivateUser: async (uid) => { await setDoc(doc(db, "users", uid), { deleted: true, deletedAt: serverTimestamp() }, { merge: true }); },
  saveAnnouncement: async (data) => {
    const id = data.id || ("ANN-" + Math.random().toString(36).slice(2,10));
    await setDoc(doc(db, "announcements", id), { ...data, id, createdAt: serverTimestamp() });
  },
  onAnnouncements: (cb) => {
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
    return onSnapshot(q, s => cb(s.docs.map(d => d.data())));
  },
  deleteAnnouncement: async (id) => { await setDoc(doc(db, "announcements", id), { deleted: true }, { merge: true }); },
  saveSystemLog: async (action, detail) => {
    const id = "LOG-" + Math.random().toString(36).slice(2,10);
    await setDoc(doc(db, "systemLogs", id), { id, action, detail, by: "admin@gmail.com", ts: serverTimestamp() });
  },
  onSystemLogs: (cb) => {
    const q = query(collection(db, "systemLogs"), orderBy("ts", "desc"));
    return onSnapshot(q, s => cb(s.docs.map(d => d.data())));
  },
  deletePatient: async (id) => { await setDoc(doc(db, "patients", id), { deleted: true, deletedAt: serverTimestamp() }, { merge: true }); },
};

const WARDS = ["Ward A – General Medicine","Ward B – Surgical","Ward C – Pediatrics","Ward D – Cardiology","Ward E – Orthopedics","Ward F – ICU","Ward G – Maternity","Ward H – Oncology"];
const ROLES = [
  { value:"nurse", label:"Ward Nurse" },
  { value:"supervisor", label:"Supervisor / Overall Nurse" },
  { value:"wardmaster", label:"Ward Master" },
  { value:"physician", label:"Physician / Doctor" },
  { value:"laboratory", label:"Laboratory Scientist" },
  { value:"radiology", label:"Radiologist / Radiographer" },
  { value:"pharmacy", label:"Pharmacist" },
  { value:"physiotherapy", label:"Physiotherapist" },
  { value:"dietitian", label:"Dietitian / Nutritionist" },
  { value:"ent", label:"ENT Specialist" },
  { value:"dental", label:"Dental Officer" },
  { value:"publichealth", label:"Public Health Officer" },
  { value:"dot", label:"DOT / TB Officer" },
];
const SHIFTS = ["Morning (07:00–15:00)","Afternoon (15:00–23:00)","Night (23:00–07:00)"];
const PAIN_SCALE = [0,1,2,3,4,5,6,7,8,9,10];
const today = () => new Date().toISOString().split("T")[0];
const nowTime = () => new Date().toTimeString().slice(0,5);
const uid = () => Math.random().toString(36).slice(2,10);

// ─── ADMIN CREDENTIALS ────────────────────────────────────────────────────────
const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD = "admin123";

function checkVitalAlerts(v) {
  if (!v) return [];
  const a = [];
  if (v.spo2 && +v.spo2 < 94) a.push({ level:"critical", msg:`SpO₂ critically low: ${v.spo2}%` });
  if (v.hr && (+v.hr > 120 || +v.hr < 50)) a.push({ level:"warning", msg:`Heart rate abnormal: ${v.hr} bpm` });
  if (v.temp && (+v.temp > 38.5 || +v.temp < 35.5)) a.push({ level:"warning", msg:`Temperature abnormal: ${v.temp}°C` });
  const [sys] = (v.bp||"").split("/");
  if (sys && (+sys > 180 || +sys < 80)) a.push({ level:"critical", msg:`Blood pressure abnormal: ${v.bp} mmHg` });
  if (v.rr && (+v.rr > 25 || +v.rr < 10)) a.push({ level:"warning", msg:`Respiratory rate abnormal: ${v.rr}/min` });
  return a;
}

const AI = {
  async call(system, user, maxTokens=800) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:maxTokens, system, messages:[{role:"user",content:user}] })
    });
    if (!res.ok) throw new Error("API error " + res.status);
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return d.content.map(c => c.type==="text" ? c.text : "").join("");
  },
  summarize: (p) => AI.call("You are a clinical AI assistant for nurses. Write a concise professional patient handover summary in plain text under 200 words.", JSON.stringify({ name:p.name, diagnosis:p.diagnosis, ward:p.ward, status:p.status, allergies:p.allergies, physician:p.physician, admission:p.admission, latestVitals:p.vitals?.[0]||null, medications:(p.prescriptions||[]).map(m=>m.drug+" "+m.dosage) })),
  careSuggestions: (p) => AI.call("You are a senior nurse AI advisor. Suggest top 5 prioritized nursing care actions for the current shift. Plain text, numbered, under 200 words.", `Patient: ${p.name} | Diagnosis: ${p.diagnosis||"N/A"} | Allergies: ${p.allergies||"none"} | Status: ${p.status} | Ward: ${p.ward||"unknown"} | Latest vitals: ${JSON.stringify(p.vitals?.[0]||{})}`),
  checkInteractions: (meds) => AI.call("You are a clinical pharmacist AI. Check for drug-drug interactions. Plain text, flag High/Medium/Low risk, under 150 words.", "Medications: "+meds.map(m=>`${m.drug} ${m.dosage} (${m.route})`).join(", ")),
  analyzeVitals: (v, name, dx) => AI.call("You are a clinical nurse AI. Analyze vitals for abnormalities. Flag concerns, suggest actions. Plain text, under 100 words.", `Patient: ${name} | Diagnosis: ${dx||"unknown"}\nBP=${v.bp}, HR=${v.hr}bpm, Temp=${v.temp}°C, RR=${v.rr}/min, SpO2=${v.spo2}%`),
  shiftHandover: (patients, shift, nurse) => AI.call("You are a senior nurse AI. Write a professional end-of-shift handover report covering each active patient briefly. Plain text, structured, under 400 words.", `Shift: ${shift} | Outgoing nurse: ${nurse}\nPatients: ${JSON.stringify(patients.map(p=>({ name:p.name, ward:p.ward, diagnosis:p.diagnosis, status:p.status, latestVitals:p.vitals?.[0]||null, recentMeds:(p.medAdminLogs||[]).slice(0,2) })))}`),
  chat: (msg) => AI.call("You are Claude, an AI clinical assistant for nurses. Give concise, evidence-based, practical answers. Plain text. Always advise consulting a physician for clinical decisions.", msg, 800),
};

const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/* ══════════════════════════════════════════════════════
   THEME 1 — LIGHT  (default — .app, no extra class)
   Sidebar: navy blue | Main: soft white #F8FAFC
   Text: near-black — clearly visible on white
   ══════════════════════════════════════════════════════ */
:root,
.app{
  /* sidebar */
  --sb-bg:linear-gradient(180deg,#071540 0%,#0a1c4e 45%,#0d2460 100%);
  --sb-border:#1a3a7c;
  --sb-txt:rgba(255,255,255,0.68);
  --sb-txt-act:#7dd3fc;
  --sb-act-bg:rgba(77,166,224,0.18);
  --sb-act-bdr:rgba(77,166,224,0.30);
  --sb-hover:rgba(255,255,255,0.08);
  --sb-section:rgba(160,210,255,0.50);
  --sb-name:#ffffff;
  --sb-role:#7db8e8;
  --sb-divider:rgba(255,255,255,0.10);
  /* main area */
  --bg:#F8FAFC;
  --bg2:#f0f4fa;
  --bg3:#eaeff8;
  --card:#ffffff;
  --card2:#f4f7ff;
  /* text — dark on white */
  --t1:#0a1628;
  --t2:#1e3a5f;
  --t3:#4a6a8a;
  /* accents */
  --accent:#0a1c4e;
  --accent-fg:#ffffff;
  --accent3:rgba(10,28,78,0.08);
  /* status */
  --success:#0d6b3a;
  --warning:#7a5000;
  --danger:#b91c1c;
  --purple:#3a3a9e;
  /* borders/shadow */
  --border:rgba(10,28,78,0.16);
  --border2:rgba(10,28,78,0.09);
  --shadow:0 4px 20px rgba(10,28,78,0.09);
  /* component-specific */
  --topbar:#ffffff;
  --topbar-bdr:#dce6f5;
  --input-bg:#f8fafc;
  --search-bg:#f0f4fa;
  --tab-bar:#eef3ff;
  --th-bg:#eef3ff;
  --td-hover:#f4f8ff;
  --modal:#ffffff;
  --modal-ov:rgba(10,28,78,0.55);
  --toast:#ffffff;
  --notif:#ffffff;
  --pt-panel:#ffffff;
  --pt-hdr:#f7f9ff;
  --chip-bg:#F8FAFC;
  --ward-card:#ffffff;
  --shift-bg:#F8FAFC;
  --shift-bdr:#0a1c4e;
  --ai-bar:#eef3ff;
  --r:12px;--r-sm:8px;--r-lg:18px;
  --font:"Times New Roman",Times,serif;
  --mono:'DM Mono',monospace;
}

/* ══════════════════════════════════════════════════════
   THEME 2 — DIM BLUE
   Sidebar: very dark navy | Main: deep blue-grey
   Text: bright white/blue — clearly visible on dark blue
   ══════════════════════════════════════════════════════ */
.app.theme-dim{
  --sb-bg:linear-gradient(180deg,#020b22 0%,#050f30 45%,#071540 100%);
  --sb-border:#0d2460;
  --sb-txt:rgba(160,200,255,0.72);
  --sb-txt-act:#93c5fd;
  --sb-act-bg:rgba(59,130,246,0.22);
  --sb-act-bdr:rgba(59,130,246,0.40);
  --sb-hover:rgba(255,255,255,0.06);
  --sb-section:rgba(100,160,255,0.40);
  --sb-name:#c8dcff;
  --sb-role:#5a90cc;
  --sb-divider:rgba(255,255,255,0.07);
  --bg:#0d1e40;
  --bg2:#091630;
  --bg3:#0a1a38;
  --card:#152248;
  --card2:#1a2a55;
  --t1:#e0ecff;
  --t2:#8ab4e8;
  --t3:#4a78b0;
  --accent:#60a5fa;
  --accent-fg:#000000;
  --accent3:rgba(96,165,250,0.14);
  --success:#34d399;
  --warning:#fbbf24;
  --danger:#f87171;
  --purple:#a78bfa;
  --border:rgba(96,165,250,0.20);
  --border2:rgba(96,165,250,0.12);
  --shadow:0 4px 24px rgba(0,0,0,0.40);
  --topbar:#091630;
  --topbar-bdr:rgba(96,165,250,0.16);
  --input-bg:#091630;
  --search-bg:#091630;
  --tab-bar:#091630;
  --th-bg:#091630;
  --td-hover:rgba(96,165,250,0.06);
  --modal:#152248;
  --modal-ov:rgba(0,0,0,0.72);
  --toast:#152248;
  --notif:#091630;
  --pt-panel:#091630;
  --pt-hdr:#070f24;
  --chip-bg:#091630;
  --ward-card:#152248;
  --shift-bg:#091630;
  --shift-bdr:#60a5fa;
  --ai-bar:#091630;
}

/* ══════════════════════════════════════════════════════
   THEME 3 — BLACK DARK
   Sidebar: pitch black | Main: dark charcoal
   Text: white/light grey — clearly visible on black
   ══════════════════════════════════════════════════════ */
.app.theme-dark{
  --sb-bg:linear-gradient(180deg,#000000 0%,#080808 50%,#101010 100%);
  --sb-border:#1e1e1e;
  --sb-txt:rgba(210,210,210,0.72);
  --sb-txt-act:#ffffff;
  --sb-act-bg:rgba(255,255,255,0.10);
  --sb-act-bdr:rgba(255,255,255,0.22);
  --sb-hover:rgba(255,255,255,0.06);
  --sb-section:rgba(160,160,160,0.40);
  --sb-name:#ffffff;
  --sb-role:#888888;
  --sb-divider:rgba(255,255,255,0.07);
  --bg:#111111;
  --bg2:#0a0a0a;
  --bg3:#1a1a1a;
  --card:#1e1e1e;
  --card2:#252525;
  --t1:#f0f0f0;
  --t2:#c0c0c0;
  --t3:#888888;
  --accent:#d4d4d4;
  --accent-fg:#000000;
  --accent3:rgba(255,255,255,0.07);
  --success:#4ade80;
  --warning:#facc15;
  --danger:#f87171;
  --purple:#c4b5fd;
  --border:rgba(255,255,255,0.11);
  --border2:rgba(255,255,255,0.07);
  --shadow:0 4px 24px rgba(0,0,0,0.65);
  --topbar:#0a0a0a;
  --topbar-bdr:rgba(255,255,255,0.09);
  --input-bg:#1a1a1a;
  --search-bg:#1a1a1a;
  --tab-bar:#1a1a1a;
  --th-bg:#1a1a1a;
  --td-hover:rgba(255,255,255,0.04);
  --modal:#1e1e1e;
  --modal-ov:rgba(0,0,0,0.85);
  --toast:#1e1e1e;
  --notif:#0a0a0a;
  --pt-panel:#0a0a0a;
  --pt-hdr:#141414;
  --chip-bg:#1a1a1a;
  --ward-card:#1e1e1e;
  --shift-bg:#1a1a1a;
  --shift-bdr:#888888;
  --ai-bar:#1a1a1a;
}

/* ══════════════════════════════════════════
   BASE STYLES — all use CSS variables
   ══════════════════════════════════════════ */
html,body{font-family:"Times New Roman",Times,serif;font-weight:700;background:var(--bg);color:var(--t1);min-height:100vh;overflow-x:auto;}
input,select,textarea,button{font-family:"Times New Roman",Times,serif;font-weight:700;}
input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}

.app{display:flex;min-height:100vh;min-width:0;background:var(--bg);}
.mobile-back-btn{display:none}.hamburger{display:none}
.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:299}

/* ─── SIDEBAR ─── */
.sidebar{width:220px;min-height:100vh;background:var(--sb-bg);border-right:3px solid var(--sb-border);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:100;overflow-y:auto;}
.main{flex:1;margin-left:220px;display:flex;flex-direction:column;min-height:100vh;background:var(--bg);transition:transform .25s,margin-left .25s;}

/* ─── TOPBAR ─── */
.topbar{height:58px;background:var(--topbar);border-bottom:2px solid var(--topbar-bdr);display:flex;align-items:center;justify-content:space-between;padding:0 20px;position:sticky;top:0;z-index:50;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,0.08);}
.content{flex:1;display:flex;overflow:hidden;height:calc(100vh - 58px)}

/* ─── SIDEBAR BRAND ─── */
.sb-logo{padding:16px 14px;border-bottom:1px solid var(--sb-divider);flex-shrink:0}
.sb-logo-mark{display:flex;align-items:center;gap:9px}
.sb-icon{width:32px;height:32px;background:linear-gradient(135deg,#4da6e0,#2980b9);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
.sb-name{font-family:"Times New Roman",Times,serif;font-size:16px;font-weight:900;color:var(--sb-name);}
.sb-sub{font-size:9px;color:var(--sb-section);letter-spacing:.5px;text-transform:uppercase}
.sb-user{padding:10px 12px;border-bottom:1px solid var(--sb-divider);display:flex;align-items:center;gap:9px;flex-shrink:0;}
.sb-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#4da6e0,#7aa8d4);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;flex-shrink:0;color:#fff;}
.sb-uname{font-size:11px;font-weight:900;color:var(--sb-name);font-family:"Times New Roman",serif;}
.sb-urole{font-size:10px;color:var(--sb-role);font-weight:700;}
.sb-nav{flex:1;padding:8px 6px}
.nav-section{font-size:9px;font-weight:900;color:var(--sb-section);text-transform:uppercase;letter-spacing:1.2px;padding:10px 8px 4px;font-family:"Times New Roman",serif;}
.nav-btn{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:none;border-radius:var(--r-sm);background:none;color:var(--sb-txt);font-size:13px;font-weight:700;font-family:"Times New Roman",Times,serif;cursor:pointer;transition:all .15s;margin-bottom:2px;text-align:left;position:relative;}
.nav-btn:hover{background:var(--sb-hover);color:var(--sb-name);}
.nav-btn.active{background:var(--sb-act-bg);color:var(--sb-txt-act);border:1px solid var(--sb-act-bdr);}
.nav-btn .ni{font-size:14px;width:17px;text-align:center}
.sb-footer{padding:10px 8px;border-top:1px solid var(--sb-divider);flex-shrink:0;}

/* ─── TOPBAR ELEMENTS ─── */
.tb-title{font-family:"Times New Roman",Times,serif;font-size:17px;font-weight:900;color:var(--t1);}
.tb-sub{font-size:11px;color:var(--t2);margin-top:1px;font-weight:700;}
.tb-right{display:flex;align-items:center;gap:7px;flex-shrink:0}
.tb-search{display:flex;align-items:center;gap:7px;background:var(--search-bg);border:1.5px solid var(--border2);border-radius:var(--r-sm);padding:6px 11px;flex:1;max-width:320px;position:relative;}
.tb-search input{background:none;border:none;outline:none;color:var(--t1);font-size:13px;width:100%;font-family:"Times New Roman",serif;font-weight:700;}
.tb-search input::placeholder{color:var(--t3);font-weight:400;}
.badge-live{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:900;background:rgba(13,107,58,0.12);color:var(--success);border:1px solid rgba(13,107,58,0.22);white-space:nowrap;font-family:"Times New Roman",serif;}
.badge-dot{width:6px;height:6px;border-radius:50%;background:var(--success);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* ─── BUTTONS ─── */
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:var(--r-sm);border:none;font-size:12px;font-weight:900;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:"Times New Roman",Times,serif;}
.btn-primary{background:var(--accent);color:var(--accent-fg);}
.btn-primary:hover{opacity:.86;transform:translateY(-1px)}
.btn-secondary{background:var(--accent3);color:var(--t1);border:1px solid var(--border);}
.btn-secondary:hover{opacity:.85;}
.btn-danger{background:rgba(185,28,28,0.09);color:var(--danger);border:1px solid rgba(185,28,28,0.22);}
.app.theme-dim .btn-danger,.app.theme-dark .btn-danger{background:rgba(248,113,113,0.10);border-color:rgba(248,113,113,0.25);}
.btn-danger:hover{opacity:.85;}
.btn-ghost{background:var(--accent3);color:var(--t2);border:1px solid var(--border2);}
.btn-ghost:hover{color:var(--t1);border-color:var(--border);}
.btn-lg{padding:11px 18px;font-size:14px;border-radius:var(--r);width:100%;justify-content:center;}
.btn-sm{padding:4px 9px;font-size:11px;}
.btn:disabled{opacity:.5;cursor:wait;}

/* ─── FORMS ─── */
.form-group{margin-bottom:13px}
.form-label{display:block;font-size:10px;font-weight:900;color:var(--t2);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;font-family:"Times New Roman",serif;}
.form-input,.form-select,.form-textarea{width:100%;padding:9px 13px;background:var(--input-bg);border:1.5px solid var(--border2);border-radius:var(--r-sm);color:var(--t1);font-size:13px;font-weight:700;outline:none;transition:border-color .15s;font-family:"Times New Roman",Times,serif;-webkit-appearance:none;appearance:none;}
.form-input:focus,.form-select:focus,.form-textarea:focus{border-color:var(--accent);}
.form-input::placeholder,.form-textarea::placeholder{color:var(--t3);font-weight:400;}
.form-textarea{resize:vertical;min-height:80px;}
.form-select option{background:var(--card);}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.form-error{font-size:12px;color:var(--danger);font-weight:700;margin-top:5px;padding:8px 11px;background:rgba(185,28,28,0.08);border-radius:var(--r-sm);border:1px solid rgba(185,28,28,0.22);}
.form-success{font-size:12px;color:var(--success);font-weight:700;margin-top:5px;padding:8px 11px;background:rgba(13,107,58,0.08);border-radius:var(--r-sm);}

/* ─── CARDS ─── */
.card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r-lg);box-shadow:var(--shadow);}

/* ─── PATIENT PANEL ─── */
.pt-panel{width:250px;background:var(--pt-panel);border-right:2px solid var(--border2);display:flex;flex-direction:column;flex-shrink:0;overflow:hidden;}
.pt-panel-header{padding:12px 10px;border-bottom:2px solid var(--border2);flex-shrink:0;background:var(--pt-hdr);}
.pt-panel-title{font-size:13px;font-weight:900;margin-bottom:7px;color:var(--t1);font-family:"Times New Roman",serif;}
.filter-tabs{display:flex;gap:3px;margin-bottom:7px}
.filter-tab{flex:1;padding:5px;border:none;border-radius:var(--r-sm);background:var(--bg3);color:var(--t2);font-size:10px;font-weight:900;cursor:pointer;font-family:"Times New Roman",serif;transition:all .15s;}
.filter-tab.active{background:var(--accent);color:var(--accent-fg);}
.pt-list{flex:1;overflow-y:auto;padding:5px}
.pt-card{padding:9px 10px;border-radius:var(--r-sm);cursor:pointer;border:1px solid transparent;transition:all .15s;margin-bottom:2px;background:var(--card);}
.pt-card:hover{background:var(--bg3);border-color:var(--border2);}
.pt-card.active{background:var(--bg3);border-color:var(--accent);}
.pt-name{font-size:12px;font-weight:900;margin-bottom:2px;color:var(--t1);font-family:"Times New Roman",serif;}
.pt-meta{font-size:10px;color:var(--t2);display:flex;gap:5px;align-items:center;flex-wrap:wrap;font-weight:700;}
.pt-detail{flex:1;overflow-y:auto;padding:18px;background:var(--bg);}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--t3);text-align:center;padding:40px;}
.empty-icon{font-size:46px;opacity:.25;margin-bottom:11px;}
.empty-text{font-size:15px;font-weight:900;color:var(--t2);margin-bottom:5px;font-family:"Times New Roman",serif;}
.empty-sub{font-size:12px;font-weight:700;color:var(--t3);}

/* ─── PATIENT HEADER ─── */
.pt-header{background:var(--card);border:1.5px solid var(--border2);border-left:4px solid var(--accent);border-radius:var(--r-lg);padding:16px 20px;margin-bottom:12px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;box-shadow:var(--shadow);}
.pt-header-info h2{font-family:"Times New Roman",Times,serif;font-size:19px;font-weight:900;color:var(--t1);}
.pt-header-meta{font-size:11px;color:var(--t2);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;font-weight:700;}
.pt-header-actions{display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;}

/* ─── AI BAR ─── */
.ai-bar{background:var(--ai-bar);border:1px solid var(--border2);border-radius:var(--r);padding:9px 13px;margin-bottom:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.ai-bar-label{font-size:11px;font-weight:900;color:var(--t1);margin-right:3px;white-space:nowrap;font-family:"Times New Roman",serif;}
.ai-btn{padding:4px 10px;border:1px solid var(--border);border-radius:20px;background:var(--card);color:var(--t1);font-size:11px;font-weight:900;cursor:pointer;font-family:"Times New Roman",serif;transition:all .15s;}
.ai-btn:hover{background:var(--accent);color:var(--accent-fg);}
.ai-btn:disabled{opacity:.5;cursor:wait;}

/* ─── STAT CARDS ─── */
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:9px;margin-bottom:12px}
.stat-card{background:var(--card);border:1px solid var(--border2);border-top:3px solid var(--accent);border-radius:var(--r);padding:11px 13px;box-shadow:var(--shadow);}
.stat-icon{font-size:15px;margin-bottom:4px;}
.stat-label{font-size:9px;color:var(--t2);font-weight:900;text-transform:uppercase;letter-spacing:.5px;font-family:"Times New Roman",serif;}
.stat-value{font-family:var(--mono);font-size:17px;font-weight:700;color:var(--t1);margin:2px 0;}
.stat-unit{font-size:9px;color:var(--t3);font-weight:700;}

/* ─── QUICK ACTIONS ─── */
.quick-actions{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin-bottom:12px}
.quick-btn{display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--card);border:1.5px solid var(--border2);border-radius:var(--r-sm);cursor:pointer;font-size:11px;font-weight:900;color:var(--t2);font-family:"Times New Roman",serif;transition:all .15s;text-align:left;}
.quick-btn:hover{border-color:var(--accent);color:var(--t1);background:var(--bg3);}

/* ─── TABS ─── */
.tabs-bar{display:flex;gap:2px;background:var(--tab-bar);border:1.5px solid var(--border2);border-radius:var(--r);padding:3px;margin-bottom:12px;overflow-x:auto;flex-shrink:0;}
.tab-btn{padding:5px 11px;border:none;border-radius:var(--r-sm);background:none;color:var(--t2);font-size:11px;font-weight:900;cursor:pointer;font-family:"Times New Roman",serif;transition:all .15s;white-space:nowrap;}
.tab-btn.active{background:var(--accent);color:var(--accent-fg);}

/* ─── TABLE ─── */
.table-wrap{overflow-x:auto;border-radius:var(--r);border:1.5px solid var(--border2);}
table{width:100%;border-collapse:collapse}
th{padding:9px 11px;text-align:left;font-size:10px;font-weight:900;color:var(--t1);text-transform:uppercase;letter-spacing:.6px;background:var(--th-bg);border-bottom:2px solid var(--border2);white-space:nowrap;font-family:"Times New Roman",serif;}
td{padding:9px 11px;font-size:12px;border-bottom:1px solid var(--border2);color:var(--t1);font-weight:700;font-family:"Times New Roman",serif;}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--td-hover);}

/* ─── BADGES ─── */
.badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:900;font-family:"Times New Roman",serif;}
.badge-active{background:rgba(13,107,58,0.14);color:var(--success);}
.badge-discharged{background:rgba(185,28,28,0.12);color:var(--danger);}
.badge-given{background:rgba(13,107,58,0.14);color:var(--success);}
.badge-missed,.badge-refused,.badge-withheld{background:rgba(185,28,28,0.12);color:var(--danger);}
.badge-held{background:rgba(138,92,0,0.12);color:var(--warning);}
.badge-critical{background:rgba(185,28,28,0.12);color:var(--danger);border:1px solid rgba(185,28,28,0.28);}
.badge-warning{background:rgba(138,92,0,0.12);color:var(--warning);border:1px solid rgba(138,92,0,0.28);}
.badge-normal,.badge-High,.badge-Low{background:rgba(13,107,58,0.12);color:var(--success);}

/* ─── MODALS ─── */
.modal-overlay{position:fixed;inset:0;background:var(--modal-ov);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);}
.modal{background:var(--modal);border:2px solid var(--border2);border-radius:var(--r-lg);width:100%;max-width:520px;max-height:92vh;overflow-y:auto;position:relative;box-shadow:var(--shadow);}
.modal-lg{max-width:680px}.modal-xl{max-width:900px}
.modal-header{padding:15px 18px;border-bottom:2px solid var(--border2);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--modal);z-index:1;border-radius:var(--r-lg) var(--r-lg) 0 0;}
.modal-title{font-family:"Times New Roman",Times,serif;font-size:15px;font-weight:900;color:var(--t1);}
.modal-close{background:none;border:none;color:var(--t2);font-size:18px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:6px;}
.modal-close:hover{color:var(--t1);background:var(--bg3);}
.modal-body{padding:16px 18px;}
.modal-footer{padding:11px 18px;border-top:2px solid var(--border2);display:flex;gap:7px;justify-content:flex-end;}

/* ─── LOGIN ─── */
.login-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#071540 0%,#0a1c4e 50%,#050e2a 100%);padding:20px;}
.login-box{width:100%;max-width:400px;background:#ffffff;border-radius:var(--r-lg);padding:36px 32px;box-shadow:0 30px 80px rgba(0,0,0,0.4);border-top:4px solid #0a1c4e;}
.login-logo{text-align:center;margin-bottom:24px;}
.login-icon{width:48px;height:48px;background:linear-gradient(135deg,#0a1c4e,#1a3a7c);border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:21px;margin:0 auto 9px;}
.login-title{font-family:"Times New Roman",Times,serif;font-size:21px;font-weight:900;color:#0a1628;}
.login-sub{font-size:12px;color:#3d6080;margin-top:3px;font-weight:700;}
.tab-switcher{display:flex;background:#f0f4fa;border-radius:var(--r-sm);padding:3px;margin-bottom:18px;}
.tab-switch-btn{flex:1;padding:7px;border:none;border-radius:var(--r-sm);background:none;color:#3d6080;font-size:11px;font-weight:900;cursor:pointer;font-family:"Times New Roman",serif;transition:all .2s;}
.tab-switch-btn.active{background:#0a1c4e;color:#ffffff;}

/* ─── INFO CARDS ─── */
.info-card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r-lg);padding:15px 17px;margin-bottom:11px;box-shadow:var(--shadow);}
.info-card h4{font-size:11px;font-weight:900;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:11px;font-family:"Times New Roman",serif;}
.profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.profile-item label{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:2px;font-weight:900;}
.profile-item span{font-size:13px;font-weight:900;color:var(--t1);}

/* ─── VITALS ─── */
.vitals-row{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:9px}
.vital-chip{background:var(--chip-bg);border:1.5px solid var(--border2);border-radius:var(--r-sm);padding:8px 6px;text-align:center;}
.vital-chip label{font-size:9px;color:var(--t2);text-transform:uppercase;display:block;margin-bottom:2px;letter-spacing:.5px;font-weight:900;}
.vital-chip span{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--t1);}

/* ─── FLUID BALANCE ─── */
.fluid-balance{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:11px}
.fluid-stat{background:var(--chip-bg);border:1px solid var(--border2);border-radius:var(--r-sm);padding:11px;text-align:center;}
.fluid-stat label{font-size:10px;color:var(--t2);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px;font-weight:900;}
.fluid-stat span{font-family:var(--mono);font-size:16px;font-weight:700;color:var(--t1);}

/* ─── AI CHAT ─── */
.ai-chat-msg{padding:10px 13px;border-radius:12px;font-size:13px;line-height:1.6;max-width:86%;}
.ai-chat-msg.user{background:var(--bg3);border:1px solid var(--border2);border-radius:12px 12px 4px 12px;margin-left:auto;color:var(--t1);}
.ai-chat-msg.assistant{background:var(--card);border:1.5px solid var(--border2);border-radius:12px 12px 12px 4px;color:var(--t1);}
.ai-spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--border2);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ─── TOAST ─── */
.toast{position:fixed;bottom:22px;right:22px;background:var(--toast);border:1.5px solid var(--border2);border-radius:var(--r);padding:10px 15px;font-size:13px;font-weight:900;color:var(--t1);box-shadow:var(--shadow);z-index:9999;transform:translateY(20px);opacity:0;transition:all .25s;pointer-events:none;max-width:300px;font-family:"Times New Roman",serif;}
.toast.show{transform:translateY(0);opacity:1;}
.toast-success{border-color:rgba(13,107,58,0.40);color:var(--success);}
.toast-error{border-color:rgba(185,28,28,0.40);color:var(--danger);}
.toast-warning{border-color:rgba(138,92,0,0.40);color:var(--warning);}

/* ─── ALERTS ─── */
.alert-banner{padding:9px 13px;border-radius:var(--r-sm);margin-bottom:7px;display:flex;align-items:center;gap:7px;font-size:12px;font-weight:900;font-family:"Times New Roman",serif;}
.alert-critical{background:rgba(185,28,28,0.09);border:1px solid rgba(185,28,28,0.24);color:var(--danger);}
.alert-warning{background:rgba(138,92,0,0.09);border:1px solid rgba(138,92,0,0.24);color:var(--warning);}
.app.theme-dim .alert-critical,.app.theme-dark .alert-critical{background:rgba(248,113,113,0.12);border-color:rgba(248,113,113,0.28);}
.app.theme-dim .alert-warning,.app.theme-dark .alert-warning{background:rgba(251,191,36,0.12);border-color:rgba(251,191,36,0.28);}

/* ─── PAIN SCALE ─── */
.pain-scale{display:flex;gap:4px;flex-wrap:wrap}
.pain-btn{width:32px;height:32px;border-radius:var(--r-sm);border:1.5px solid var(--border2);background:var(--card);color:var(--t2);font-size:12px;font-weight:900;cursor:pointer;font-family:var(--mono);transition:all .15s;}
.pain-btn:hover{border-color:var(--accent);color:var(--t1);}
.pain-btn.selected{background:var(--accent);border-color:var(--accent);color:var(--accent-fg);}

/* ─── WARD OVERVIEW ─── */
.ward-overview{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:13px;padding:18px;overflow-y:auto;flex:1;background:var(--bg);}
.ward-card{background:var(--ward-card);border:1px solid var(--border2);border-radius:var(--r-lg);padding:15px;box-shadow:var(--shadow);}
.ward-card-title{font-family:"Times New Roman",Times,serif;font-size:14px;font-weight:900;color:var(--t1);margin-bottom:11px;display:flex;justify-content:space-between;align-items:center;}

/* ─── NOTIFICATIONS ─── */
.notif-panel{position:fixed;top:58px;right:0;width:330px;height:calc(100vh - 58px);background:var(--notif);border-left:2px solid var(--border2);z-index:200;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .25s;box-shadow:-4px 0 20px rgba(0,0,0,0.14);}
.notif-panel.open{transform:translateX(0)}
.notif-item{padding:11px 15px;border-bottom:1px solid var(--border2);cursor:pointer;transition:background .15s;}
.notif-item:hover{background:var(--bg3);}
.notif-item.unread{border-left:3px solid var(--accent);}
.notif-item.critical-item{border-left:3px solid var(--danger);}

/* ─── SEARCH DROPDOWN ─── */
.search-dropdown{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--card);border:1.5px solid var(--border2);border-radius:var(--r-sm);box-shadow:var(--shadow);z-index:200;max-height:300px;overflow-y:auto;}
.search-result-item{padding:9px 13px;cursor:pointer;border-bottom:1px solid var(--border2);transition:background .15s;}
.search-result-item:hover{background:var(--bg3);}
.search-result-item:last-child{border-bottom:none;}

/* ─── OVERALL ROW ─── */
.overall-row{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);margin-bottom:12px;}
.overall-dot{width:8px;height:8px;border-radius:50%;background:var(--t3);flex-shrink:0;}
.overall-dot.on{background:var(--success);box-shadow:0 0 6px var(--success);animation:pulse 2s infinite;}

/* ─── WARD REPORTS ─── */
.ward-report-card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r);padding:14px 16px;margin-bottom:10px;}
.ward-report-card.submitted{border-color:rgba(13,107,58,0.35);}
.ward-report-card.missing{border-color:rgba(138,92,0,0.30);}
.ward-report-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.ward-report-name{font-weight:900;font-size:13px;color:var(--t1);font-family:"Times New Roman",serif;}
.ward-report-meta{font-size:11px;color:var(--t2);margin-top:2px;font-weight:700;}
.ward-report-body{font-size:12px;color:var(--t1);line-height:1.6;white-space:pre-wrap;background:var(--bg3);border-radius:var(--r-sm);padding:10px 12px;margin-top:8px;border:1px solid var(--border2);font-weight:700;}

/* ─── COLLATION / ARCHIVE ─── */
.collation-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-bottom:20px;}
.archive-card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r);padding:14px 16px;margin-bottom:10px;}
.archive-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;gap:10px;}
.archive-title{font-family:"Times New Roman",Times,serif;font-size:14px;font-weight:900;color:var(--t1);}
.archive-meta{font-size:11px;color:var(--t2);margin-top:2px;font-weight:700;}
.archive-note{background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r-sm);padding:10px 12px;font-size:12px;color:var(--t1);line-height:1.6;margin-top:8px;font-weight:700;}
.supervisor-note-box{background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);padding:16px;margin-top:16px;}
.section-title{font-family:"Times New Roman",Times,serif;font-size:16px;font-weight:900;color:var(--t1);margin-bottom:4px;}
.section-sub{font-size:12px;color:var(--t2);margin-bottom:16px;font-weight:700;}
.all-wards-header{background:var(--card);border:1.5px solid var(--border2);border-left:4px solid var(--accent);border-radius:var(--r-lg);padding:16px 20px;margin-bottom:18px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;}
.ward-block{background:var(--ward-card);border:1px solid var(--border2);border-radius:var(--r-lg);margin-bottom:14px;overflow:hidden;}
.ward-block-header{padding:13px 16px;border-bottom:2px solid var(--border2);display:flex;align-items:center;justify-content:space-between;background:var(--bg2);}
.ward-block-title{font-weight:900;font-size:14px;display:flex;align-items:center;gap:8px;color:var(--t1);font-family:"Times New Roman",serif;}
.ward-block-body{padding:14px 16px;background:var(--ward-card);}
.shift-report-item{padding:10px 12px;background:var(--shift-bg);border-radius:var(--r-sm);margin-bottom:8px;border-left:3px solid var(--shift-bdr);}
.shift-report-item:last-child{margin-bottom:0;}
.shift-label{font-size:10px;font-weight:900;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;font-family:"Times New Roman",serif;}
.shift-report-text{font-size:12px;color:var(--t1);line-height:1.65;white-space:pre-wrap;font-weight:700;}
.ward-empty{padding:14px;font-size:12px;color:var(--t3);font-style:italic;text-align:center;font-weight:700;}

/* ─── PRINT ─── */
@media print{
  .sidebar,.topbar,.ai-bar,.quick-actions,.tabs-bar,.notif-panel,.no-print{display:none!important}
  .main{margin-left:0!important}.pt-detail{padding:0!important}
  .print-only{display:block!important}
  body{background:#fff!important;color:#000!important}
}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
`;

// ─── UTILITY ──────────────────────────────────────────────────────────────────

// ── New FB methods for restructured features ──────────────────────────────────
const FBX = {
  // Departments
  saveDepartment: async (d) => {
    const id = d.id || ("DEPT-" + Math.random().toString(36).slice(2,10));
    await setDoc(doc(db,"departments",id),{...d,id,updatedAt:serverTimestamp()});
    return id;
  },
  onDepartments: (cb) => {
    const q = query(collection(db,"departments"),orderBy("createdAt","desc"));
    return onSnapshot(q,s=>cb(s.docs.map(d=>d.data())));
  },
  deleteDepartment: async (id) => {
    await setDoc(doc(db,"departments",id),{deleted:true,deletedAt:serverTimestamp()},{merge:true});
  },
  // Drug Database
  saveDrug: async (d) => {
    const id = d.id || ("DRG-" + Math.random().toString(36).slice(2,10));
    await setDoc(doc(db,"drugDatabase",id),{...d,id,updatedAt:serverTimestamp()});
    return id;
  },
  onDrugs: (cb) => {
    const q = query(collection(db,"drugDatabase"),orderBy("name","asc"));
    return onSnapshot(q,s=>cb(s.docs.map(d=>d.data())));
  },
  deleteDrug: async (id) => {
    await setDoc(doc(db,"drugDatabase",id),{deleted:true},{merge:true});
  },
  // Lab Tests
  saveLabTest: async (d) => {
    const id = d.id || ("LAB-" + Math.random().toString(36).slice(2,10));
    await setDoc(doc(db,"labTests",id),{...d,id,updatedAt:serverTimestamp()});
    return id;
  },
  onLabTests: (cb) => {
    const q = query(collection(db,"labTests"),orderBy("name","asc"));
    return onSnapshot(q,s=>cb(s.docs.map(d=>d.data())));
  },
  deleteLabTest: async (id) => {
    await setDoc(doc(db,"labTests",id),{deleted:true},{merge:true});
  },
  // Clinical Templates
  saveTemplate: async (d) => {
    const id = d.id || ("TPL-" + Math.random().toString(36).slice(2,10));
    await setDoc(doc(db,"clinicalTemplates",id),{...d,id,updatedAt:serverTimestamp()});
    return id;
  },
  onTemplates: (cb) => {
    const q = query(collection(db,"clinicalTemplates"),orderBy("updatedAt","desc"));
    return onSnapshot(q,s=>cb(s.docs.map(d=>d.data())));
  },
  deleteTemplate: async (id) => {
    await setDoc(doc(db,"clinicalTemplates",id),{deleted:true},{merge:true});
  },
  // Billing
  saveBill: async (d) => {
    const id = d.id || ("BILL-" + Math.random().toString(36).slice(2,10));
    await setDoc(doc(db,"billing",id),{...d,id,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    return id;
  },
  onBills: (cb) => {
    const q = query(collection(db,"billing"),orderBy("createdAt","desc"));
    return onSnapshot(q,s=>cb(s.docs.map(d=>d.data())));
  },
  updateBill: async (id,data) => {
    await updateDoc(doc(db,"billing",id),{...data,updatedAt:serverTimestamp()});
  },
  // Suspend / Activate user
  suspendUser: async (uid) => {
    await setDoc(doc(db,"users",uid),{suspended:true,suspendedAt:serverTimestamp()},{merge:true});
  },
  activateUser: async (uid) => {
    await updateDoc(doc(db,"users",uid),{suspended:false,suspendedAt:null});
  },
  // OTP / Email 2FA
  getEmailJSConfig: async () => {
    const s = await getDoc(doc(db,"settings","emailjs"));
    return s.exists() ? s.data() : null;
  },
  saveEmailJSConfig: async (cfg) => {
    await setDoc(doc(db,"settings","emailjs"),{...cfg,updatedAt:serverTimestamp()});
  },
  get2FAEnabled: async () => {
    const s = await getDoc(doc(db,"settings","2fa"));
    return s.exists() ? (s.data().enabled === true) : false;
  },
  set2FAEnabled: async (enabled) => {
    await setDoc(doc(db,"settings","2fa"),{enabled,updatedAt:serverTimestamp()});
  },
  // Write OTP session to Firestore (expires in 10 min)
  createOTPSession: async (email, otp) => {
    const sessionId = "OTP-" + Math.random().toString(36).slice(2,12);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await setDoc(doc(db,"otpSessions",sessionId),{
      email, otp: String(otp), expiresAt, attempts: 0,
      createdAt: serverTimestamp(),
    });
    return sessionId;
  },
  // Validate OTP — returns {ok, error}
  verifyOTP: async (sessionId, inputCode) => {
    const ref = doc(db,"otpSessions",sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok:false, error:"Session expired or not found." };
    const data = snap.data();
    if (new Date(data.expiresAt) < new Date()) {
      await setDoc(ref,{deleted:true},{merge:true});
      return { ok:false, error:"Code expired. Please request a new one." };
    }
    if (data.attempts >= 5) return { ok:false, error:"Too many incorrect attempts. Please log in again." };
    if (String(data.otp).trim() !== String(inputCode).trim()) {
      await updateDoc(ref,{ attempts: (data.attempts||0)+1 });
      return { ok:false, error:`Incorrect code. ${4 - (data.attempts||0)} attempt(s) remaining.` };
    }
    // Valid — delete session
    await setDoc(ref,{deleted:true,usedAt:serverTimestamp()},{merge:true});
    return { ok:true };
  },
};
function Spinner() { return <span className="ai-spinner" />; }

function Modal({ open, onClose, title, children, size="" }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size}`}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ msg, type }) {
  return <div className={`toast ${msg ? "show" : ""} toast-${type || "success"}`}>{msg}</div>;
}

function useToast() {
  const [state, setState] = useState({ msg: "", type: "success" });
  const show = useCallback((msg, type = "success") => {
    setState({ msg, type });
    setTimeout(() => setState(s => s.msg === msg ? { ...s, msg: "" } : s), 3500);
  }, []);
  return [state, show];
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
function useNotifications(patients) {
  const [notifs, setNotifs] = useState([]);
  const prevLen = useRef(0);
  useEffect(() => {
    const n = [];
    patients.forEach(p => {
      const v = p.vitals?.[0];
      if (v) checkVitalAlerts(v).forEach(a => n.push({ id: uid(), patientId: p.id, patientName: p.name, ward: p.ward, ...a, time: v.recordedAt || new Date().toISOString(), read: false }));
      const td = today();
      (p.prescriptions || []).forEach(med => {
        const done = (p.medAdminLogs || []).some(l => l.date === td && l.drug === med.drug && l.status === "Given");
        if (!done && med.drug) n.push({ id: uid(), patientId: p.id, patientName: p.name, ward: p.ward, level: "warning", msg: `Medication due: ${med.drug} ${med.dosage || ""}`, time: new Date().toISOString(), read: false });
      });
    });
    setNotifs(n.slice(0, 25));
    prevLen.current = n.length;
  }, [patients]);
  const unread = notifs.filter(n => !n.read).length;
  const markRead = () => setNotifs(n => n.map(x => ({ ...x, read: true })));
  return { notifs, unread, markRead };
}

function NotifPanel({ open, notifs, unread, onMarkRead, onClose, onSelectPatient }) {
  return (
    <div className={`notif-panel ${open ? "open" : ""}`}>
      <div style={{ padding: "13px 15px", borderBottom: "1px solid var(--border2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>
          🔔 Alerts {unread > 0 && <span style={{ background: "var(--danger)", color: "#fff", fontSize: 10, padding: "1px 5px", borderRadius: 10, marginLeft: 5 }}>{unread}</span>}
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={onMarkRead}>Mark all read</button>}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {notifs.length === 0
          ? <div style={{ padding: 24, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>No alerts</div>
          : notifs.map(n => (
            <div key={n.id} className={`notif-item ${n.read ? "" : "unread"} ${n.level === "critical" ? "critical-item" : ""}`} onClick={() => { onSelectPatient(n.patientId); onClose(); }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span className={`badge badge-${n.level}`}>{n.level}</span>
                <span style={{ fontSize: 10, color: "var(--t3)" }}>{new Date(n.time).toLocaleTimeString()}</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{n.patientName}</div>
              <div style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>{n.msg}</div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>{n.ward}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── GLOBAL SEARCH ────────────────────────────────────────────────────────────
function GlobalSearch({ patients, onSelect }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const results = q.length > 1
    ? patients.filter(p =>
      p.name?.toLowerCase().includes(q.toLowerCase()) ||
      p.emr?.toLowerCase().includes(q.toLowerCase()) ||
      p.diagnosis?.toLowerCase().includes(q.toLowerCase()) ||
      p.ward?.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 8) : [];
  return (
    <div ref={ref} className="tb-search">
      <span style={{ color: "var(--t3)", fontSize: 14, flexShrink: 0 }}>🔍</span>
      <input placeholder="Search by name, EMR, diagnosis, ward…" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {q && <button onClick={() => { setQ(""); setOpen(false); }} style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 14 }}>✕</button>}
      {open && q.length > 1 && (
        <div className="search-dropdown">
          {results.length === 0
            ? <div style={{ padding: "12px 14px", color: "var(--t3)", fontSize: 13 }}>No results for "{q}"</div>
            : results.map(p => (
              <div key={p.id} className="search-result-item" onClick={() => { onSelect(p.id); setQ(""); setOpen(false); }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--t2)", marginTop: 2 }}>EMR: {p.emr || "—"} &nbsp;•&nbsp; {p.ward || "—"} &nbsp;•&nbsp; {p.diagnosis || "No diagnosis"}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function AddPatientModal({ open, onClose, onSave, user }) {
  const blank = { name: "", emr: "", dob: "", gender: "Male", ward: "", physician: "", admission: today(), diagnosis: "", allergies: "" };
  const [d, setD] = useState(blank);
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  const save = () => {
    if (!d.name || !d.emr || !d.ward) { alert("Name, EMR, and Ward are required."); return; }
    onSave({ ...d, createdBy: user?.name || "—" }); setD(blank); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="➕ Add New Patient">
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={d.name} onChange={e => set("name", e.target.value)} placeholder="Patient full name" /></div>
          <div className="form-group"><label className="form-label">EMR Number *</label><input className="form-input" value={d.emr} onChange={e => set("emr", e.target.value)} placeholder="EMR / MRN" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date of Birth</label><input className="form-input" type="date" value={d.dob} onChange={e => set("dob", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Gender</label><select className="form-select" value={d.gender} onChange={e => set("gender", e.target.value)}><option>Male</option><option>Female</option><option>Other</option></select></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Ward *</label><select className="form-select" value={d.ward} onChange={e => set("ward", e.target.value)}><option value="">Select ward</option>{WARDS.map(w => <option key={w}>{w}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Attending Physician</label><input className="form-input" value={d.physician} onChange={e => set("physician", e.target.value)} placeholder="Physician name" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Admission Date</label><input className="form-input" type="date" value={d.admission} onChange={e => set("admission", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Primary Diagnosis</label><input className="form-input" value={d.diagnosis} onChange={e => set("diagnosis", e.target.value)} placeholder="e.g. Hypertension" /></div>
        </div>
        <div className="form-group"><label className="form-label">Known Allergies</label><input className="form-input" value={d.allergies} onChange={e => set("allergies", e.target.value)} placeholder="e.g. Penicillin, Sulfa — or NKDA" /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>✚ Add Patient</button></div>
    </Modal>
  );
}

function VitalsModal({ open, onClose, onSave, nurse }) {
  const blank = { date: today(), time: nowTime(), bp: "", hr: "", temp: "", rr: "", spo2: "", notes: "" };
  const [d, setD] = useState(blank);
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="💓 Record Vital Signs">
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Time</label><input className="form-input" type="time" value={d.time} onChange={e => set("time", e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Blood Pressure (mmHg)</label><input className="form-input" value={d.bp} onChange={e => set("bp", e.target.value)} placeholder="120/80" /></div>
          <div className="form-group"><label className="form-label">Heart Rate (bpm)</label><input className="form-input" type="number" value={d.hr} onChange={e => set("hr", e.target.value)} placeholder="72" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Temperature (°C)</label><input className="form-input" type="number" step="0.1" value={d.temp} onChange={e => set("temp", e.target.value)} placeholder="36.6" /></div>
          <div className="form-group"><label className="form-label">Resp. Rate (/min)</label><input className="form-input" type="number" value={d.rr} onChange={e => set("rr", e.target.value)} placeholder="16" /></div>
        </div>
        <div className="form-group"><label className="form-label">SpO₂ (%)</label><input className="form-input" type="number" value={d.spo2} onChange={e => set("spo2", e.target.value)} placeholder="98" /></div>
        <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e => set("notes", e.target.value)} placeholder="Additional observations…" /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onSave({ ...d, nurse: nurse || "—" }); setD(blank); onClose(); }}>💾 Save Vitals</button></div>
    </Modal>
  );
}

function GlucoseModal({ open, onClose, onSave, nurse }) {
  const blank = { date: today(), fasting: "", postbf: "", prelunch: "", postlunch: "", predinner: "", bedtime: "", notes: "" };
  const [d, setD] = useState(blank);
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  const F = (label, key) => <div className="form-group"><label className="form-label">{label}</label><input className="form-input" type="number" step="0.1" value={d[key]} onChange={e => set(key, e.target.value)} placeholder="mmol/L" /></div>;
  return (
    <Modal open={open} onClose={onClose} title="🩸 Blood Glucose Reading">
      <div className="modal-body">
        <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} /></div>
        <div className="form-row">{F("Fasting", "fasting")}{F("Post-Breakfast", "postbf")}</div>
        <div className="form-row">{F("Pre-Lunch", "prelunch")}{F("Post-Lunch", "postlunch")}</div>
        <div className="form-row">{F("Pre-Dinner", "predinner")}{F("Bedtime", "bedtime")}</div>
        <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e => set("notes", e.target.value)} /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onSave({ ...d, nurse: nurse || "—" }); setD(blank); onClose(); }}>💾 Save Reading</button></div>
    </Modal>
  );
}

function FluidModal({ open, onClose, onSave, nurse }) {
  const blank = { date: today(), time: nowTime(), oral: "", iv: "", urine: "", other: "", notes: "" };
  const [d, setD] = useState(blank);
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="💧 Fluid Intake & Output">
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Time</label><input className="form-input" type="time" value={d.time} onChange={e => set("time", e.target.value)} /></div>
        </div>
        <p style={{ fontSize: 11, color: "var(--success)", fontWeight: 600, marginBottom: 7 }}>↑ Intake (mL)</p>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Oral</label><input className="form-input" type="number" value={d.oral} onChange={e => set("oral", e.target.value)} placeholder="0" /></div>
          <div className="form-group"><label className="form-label">IV / NG Tube</label><input className="form-input" type="number" value={d.iv} onChange={e => set("iv", e.target.value)} placeholder="0" /></div>
        </div>
        <p style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600, marginBottom: 7 }}>↓ Output (mL)</p>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Urine</label><input className="form-input" type="number" value={d.urine} onChange={e => set("urine", e.target.value)} placeholder="0" /></div>
          <div className="form-group"><label className="form-label">Other (Drain/Vomit)</label><input className="form-input" type="number" value={d.other} onChange={e => set("other", e.target.value)} placeholder="0" /></div>
        </div>
        <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e => set("notes", e.target.value)} /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onSave({ ...d, nurse: nurse || "—" }); setD(blank); onClose(); }}>💾 Save Entry</button></div>
    </Modal>
  );
}

function PrescriptionModal({ open, onClose, patient, onSave }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { if (open) setRows(patient?.prescriptions || []); }, [open, patient]);
  const addRow = () => setRows(r => [...r, { id: uid(), drug: "", dosage: "", route: "PO", freq: "", start: today(), end: "", instructions: "" }]);
  const setRow = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  return (
    <Modal open={open} onClose={onClose} title="📝 Medication Prescription Plan" size="modal-xl">
      <div className="modal-body">
        <div style={{ marginBottom: 10 }}><button className="btn btn-secondary" onClick={addRow}>+ Add Medication</button></div>
        {rows.length === 0 && <div style={{ textAlign: "center", padding: 18, color: "var(--t3)" }}>No medications. Click + Add Medication to start.</div>}
        {rows.map((r, i) => (
          <div key={r.id} style={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: "var(--r-sm)", padding: 10, marginBottom: 7 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr auto", gap: 7, alignItems: "end" }}>
              <div><label className="form-label">Drug</label><input className="form-input" value={r.drug} onChange={e => setRow(i, "drug", e.target.value)} placeholder="Drug name" /></div>
              <div><label className="form-label">Dosage</label><input className="form-input" value={r.dosage} onChange={e => setRow(i, "dosage", e.target.value)} placeholder="500mg" /></div>
              <div><label className="form-label">Route</label><select className="form-select" value={r.route} onChange={e => setRow(i, "route", e.target.value)}><option>PO</option><option>IV</option><option>IM</option><option>SC</option><option>SL</option><option>Topical</option><option>Inhaled</option></select></div>
              <div><label className="form-label">Frequency</label><input className="form-input" value={r.freq} onChange={e => setRow(i, "freq", e.target.value)} placeholder="BD, TID…" /></div>
              <div><label className="form-label">Start</label><input className="form-input" type="date" value={r.start} onChange={e => setRow(i, "start", e.target.value)} /></div>
              <div><label className="form-label">End</label><input className="form-input" type="date" value={r.end} onChange={e => setRow(i, "end", e.target.value)} /></div>
              <div style={{ paddingTop: 16 }}><button className="btn btn-danger btn-sm" onClick={() => setRows(r => r.filter((_, j) => j !== i))}>✕</button></div>
            </div>
            <div style={{ marginTop: 6 }}><label className="form-label">Instructions</label><input className="form-input" value={r.instructions} onChange={e => setRow(i, "instructions", e.target.value)} placeholder="e.g. Take with food, avoid dairy" /></div>
          </div>
        ))}
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onSave(rows); onClose(); }}>💾 Save Plan</button></div>
    </Modal>
  );
}

function MedAdminModal({ open, onClose, nurse, onSave }) {
  const blank = { date: today(), time: nowTime(), drug: "", dosage: "", route: "PO (Oral)", status: "Given", notes: "" };
  const [d, setD] = useState(blank);
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="💊 Medication Administration" size="modal-lg">
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Time</label><input className="form-input" type="time" value={d.time} onChange={e => set("time", e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Drug Name</label><input className="form-input" value={d.drug} onChange={e => set("drug", e.target.value)} placeholder="Drug name" /></div>
          <div className="form-group"><label className="form-label">Dosage Given</label><input className="form-input" value={d.dosage} onChange={e => set("dosage", e.target.value)} placeholder="500mg" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Route</label><select className="form-select" value={d.route} onChange={e => set("route", e.target.value)}><option>PO (Oral)</option><option>IV</option><option>IM</option><option>SC</option><option>Topical</option><option>Inhalation</option></select></div>
          <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={d.status} onChange={e => set("status", e.target.value)}><option>Given</option><option>Missed</option><option>Refused</option><option>Held</option><option>Withheld</option></select></div>
        </div>
        <div className="form-group"><label className="form-label">Notes / Reason</label><textarea className="form-textarea" value={d.notes} onChange={e => set("notes", e.target.value)} placeholder="Any notes or reason for hold/miss…" /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onSave({ ...d, nurse: nurse || "—" }); setD(blank); onClose(); }}>💾 Record</button></div>
    </Modal>
  );
}

function NursingReportModal({ open, onClose, nurse, onSave }) {
  const [d, setD] = useState({ date: today(), shift: SHIFTS[0], report: "", nurseOnDuty: "" });
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  useEffect(() => { if (open) setD(x => ({ ...x, nurseOnDuty: nurse || "" })); }, [open, nurse]);
  const save = () => {
    if (!d.report.trim()) { alert("Report content is required."); return; }
    onSave(d); setD({ date: today(), shift: SHIFTS[0], report: "", nurseOnDuty: nurse || "" }); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="📝 Nursing Report">
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Shift</label><select className="form-select" value={d.shift} onChange={e => set("shift", e.target.value)}>{SHIFTS.map(s => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div className="form-group"><label className="form-label">Nurse on Duty</label><input className="form-input" value={d.nurseOnDuty} onChange={e => set("nurseOnDuty", e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Report *</label><textarea className="form-textarea" style={{ minHeight: 120 }} value={d.report} onChange={e => set("report", e.target.value)} placeholder="Enter nursing report for this shift…" /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>💾 Save Report</button></div>
    </Modal>
  );
}

function WoundCareModal({ open, onClose, nurse, onSave }) {
  const blank = { date: today(), site: "", size: "", depth: "", appearance: "", dressing: "", pain: 0, notes: "" };
  const [d, setD] = useState(blank);
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="🩹 Wound Care Record" size="modal-lg">
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Wound Site</label><input className="form-input" value={d.site} onChange={e => set("site", e.target.value)} placeholder="e.g. Left leg, sacrum" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Size (cm)</label><input className="form-input" value={d.size} onChange={e => set("size", e.target.value)} placeholder="e.g. 3×2cm" /></div>
          <div className="form-group"><label className="form-label">Depth</label><select className="form-select" value={d.depth} onChange={e => set("depth", e.target.value)}><option value="">Select</option><option>Superficial</option><option>Partial thickness</option><option>Full thickness</option><option>Deep tissue</option></select></div>
        </div>
        <div className="form-group"><label className="form-label">Wound Appearance</label><select className="form-select" value={d.appearance} onChange={e => set("appearance", e.target.value)}><option value="">Select</option><option>Clean / Granulating</option><option>Sloughy</option><option>Necrotic</option><option>Infected</option><option>Healing well</option></select></div>
        <div className="form-group"><label className="form-label">Dressing Applied</label><input className="form-input" value={d.dressing} onChange={e => set("dressing", e.target.value)} placeholder="e.g. Hydrocolloid, Foam, Gauze" /></div>
        <div className="form-group">
          <label className="form-label">Pain Score (0–10)</label>
          <div className="pain-scale">{PAIN_SCALE.map(n => <button key={n} className={`pain-btn ${d.pain === n ? "selected" : ""}`} onClick={() => set("pain", n)}>{n}</button>)}</div>
        </div>
        <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e => set("notes", e.target.value)} /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onSave({ ...d, nurse: nurse || "—" }); setD(blank); onClose(); }}>💾 Save Wound Record</button></div>
    </Modal>
  );
}

function LabResultModal({ open, onClose, nurse, onSave }) {
  const blank = { date: today(), testName: "", result: "", unit: "", refRange: "", status: "Normal", notes: "" };
  const [d, setD] = useState(blank);
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="🧪 Add Lab Result">
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Test Name</label><input className="form-input" value={d.testName} onChange={e => set("testName", e.target.value)} placeholder="e.g. FBC, LFT, HbA1c" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Result Value</label><input className="form-input" value={d.result} onChange={e => set("result", e.target.value)} placeholder="e.g. 7.2" /></div>
          <div className="form-group"><label className="form-label">Unit</label><input className="form-input" value={d.unit} onChange={e => set("unit", e.target.value)} placeholder="mmol/L, g/dL…" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Reference Range</label><input className="form-input" value={d.refRange} onChange={e => set("refRange", e.target.value)} placeholder="4.0–6.0" /></div>
          <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={d.status} onChange={e => set("status", e.target.value)}><option>Normal</option><option>High</option><option>Low</option><option>Critical High</option><option>Critical Low</option></select></div>
        </div>
        <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e => set("notes", e.target.value)} /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onSave({ ...d, nurse: nurse || "—" }); setD(blank); onClose(); }}>💾 Save</button></div>
    </Modal>
  );
}

function DoctorOrderModal({ open, onClose, nurse, onSave }) {
  const blank = { date: today(), time: nowTime(), doctor: "", order: "", priority: "Routine", acknowledged: false, notes: "" };
  const [d, setD] = useState(blank);
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="📋 Doctor's Order">
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Time</label><input className="form-input" type="time" value={d.time} onChange={e => set("time", e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Ordering Physician</label><input className="form-input" value={d.doctor} onChange={e => set("doctor", e.target.value)} placeholder="Doctor's name" /></div>
          <div className="form-group"><label className="form-label">Priority</label><select className="form-select" value={d.priority} onChange={e => set("priority", e.target.value)}><option>Routine</option><option>Urgent</option><option>STAT</option></select></div>
        </div>
        <div className="form-group"><label className="form-label">Order *</label><textarea className="form-textarea" style={{ minHeight: 100 }} value={d.order} onChange={e => set("order", e.target.value)} placeholder="Enter doctor's order…" /></div>
        <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e => set("notes", e.target.value)} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <input type="checkbox" id="ack-cb" checked={d.acknowledged} onChange={e => set("acknowledged", e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
          <label htmlFor="ack-cb" style={{ fontSize: 13, cursor: "pointer" }}>I acknowledge this order as nurse on duty</label>
        </div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { if (!d.order.trim()) { alert("Order content required."); return; } onSave({ ...d, nurse: nurse || "—" }); setD(blank); onClose(); }}>💾 Save Order</button></div>
    </Modal>
  );
}

function TransfusionModal({ open, onClose, nurse, onSave }) {
  const [d, setD] = useState({ date: today(), bloodType: "", units: "", notes: "" });
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="🩸 Transfusion Record">
      <div className="modal-body">
        <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} /></div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Blood Type</label><input className="form-input" value={d.bloodType} onChange={e => set("bloodType", e.target.value)} placeholder="A+, O−…" /></div>
          <div className="form-group"><label className="form-label">Units</label><input className="form-input" type="number" value={d.units} onChange={e => set("units", e.target.value)} placeholder="1" /></div>
        </div>
        <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e => set("notes", e.target.value)} /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onSave({ ...d, nurse: nurse || "—" }); setD({ date: today(), bloodType: "", units: "", notes: "" }); onClose(); }}>💾 Save</button></div>
    </Modal>
  );
}

function StatusModal({ open, onClose, onSave }) {
  const [d, setD] = useState({ action: "transfer", ward: WARDS[0], notes: "", date: today() });
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title="⇄ Transfer / Discharge">
      <div className="modal-body">
        <div className="form-group"><label className="form-label">Action</label><select className="form-select" value={d.action} onChange={e => set("action", e.target.value)}><option value="transfer">Transfer to Another Ward</option><option value="discharge">Discharge Patient</option><option value="active">Reactivate Patient</option></select></div>
        {d.action === "transfer" && <div className="form-group"><label className="form-label">Transfer to Ward</label><select className="form-select" value={d.ward} onChange={e => set("ward", e.target.value)}>{WARDS.map(w => <option key={w}>{w}</option>)}</select></div>}
        <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e => set("notes", e.target.value)} /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => { onSave(d.action, d.ward, d.notes, d.date); onClose(); }}>Apply</button></div>
    </Modal>
  );
}

function OverallNurseModal({ open, onClose, users, overallNurse, onAssign, onEnd }) {
  const [sel, setSel] = useState("");
  const nurseOnly = users.filter(u => u.role === "nurse");
  return (
    <Modal open={open} onClose={onClose} title="👑 Overall Nurse of the Day">
      <div className="modal-body">
        <div className="overall-row">
          <div className={`overall-dot ${overallNurse ? "on" : ""}`} />
          <div><div style={{ fontSize: 13, fontWeight: 700 }}>{overallNurse || "No overall nurse assigned"}</div><div style={{ fontSize: 11, color: "var(--t2)" }}>{overallNurse ? "Currently on duty" : "Shift not started"}</div></div>
        </div>
        <div className="form-group"><label className="form-label">Assign Nurse</label>
          <select className="form-select" value={sel} onChange={e => setSel(e.target.value)}>
            <option value="">— Select nurse —</option>
            {nurseOnly.map(u => <option key={u.uid || u.id} value={u.uid || u.id}>{u.name}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
            if (sel) {
              const picked = nurseOnly.find(u => (u.uid || u.id) === sel);
              if (picked) { onAssign({ name: picked.name, uid: picked.uid || picked.id }); setSel(""); }
            }
          }}>✅ Assign</button>
          <button className="btn btn-danger" style={{ flex: 1 }} onClick={onEnd}>End Shift</button>
        </div>
      </div>
    </Modal>
  );
}

function UserMgmtModal({ open, onClose, users, currentUser }) {
  return (
    <Modal open={open} onClose={onClose} title="👥 User Management" size="modal-lg">
      <div className="modal-body">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Ward</th></tr></thead>
            <tbody>{users.map(u => (
              <tr key={u.uid || u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}{u.uid === currentUser.uid && <span style={{ fontSize: 10, color: "var(--accent)", marginLeft: 6 }}>(you)</span>}</td>
                <td style={{ color: "var(--t2)" }}>{u.email}</td>
                <td><span className="badge badge-active" style={{ textTransform: "capitalize" }}>{u.role}</span></td>
                <td style={{ color: "var(--t2)" }}>{u.ward || "All wards"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

function AIChatModal({ open, onClose }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", text: "👋 Hello! I'm your AI clinical assistant.\n\nI can help with drug information, vitals interpretation, nursing care plans, clinical protocols, and any medical question.\n\n⚠️ Always verify with clinical protocols and consult a physician for clinical decisions." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef();
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  const send = async (text) => {
    const q = text || input.trim(); if (!q || busy) return;
    setInput(""); setMsgs(m => [...m, { role: "user", text: q }]); setBusy(true);
    try { const r = await AI.chat(q); setMsgs(m => [...m, { role: "assistant", text: r }]); }
    catch (e) { setMsgs(m => [...m, { role: "assistant", text: "Error: " + e.message }]); }
    setBusy(false);
  };
  const quickQ = ["Nursing priorities for diabetic patient?", "Signs of sepsis?", "How to interpret SpO2?", "Pressure sore staging?", "Medication safety 5 rights?"];
  return (
    <Modal open={open} onClose={onClose} title="🤖 Claude AI Clinical Assistant" size="modal-lg">
      <div style={{ display: "flex", flexDirection: "column", height: "60vh" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "11px 15px", display: "flex", flexDirection: "column", gap: 8 }}>
          {msgs.map((m, i) => <div key={i} className={`ai-chat-msg ${m.role}`}><pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>{m.text}</pre></div>)}
          {busy && <div className="ai-chat-msg assistant"><Spinner /> &nbsp;Thinking…</div>}
          <div ref={bottomRef} />
        </div>
        <div style={{ padding: "9px 13px", borderTop: "1px solid var(--border2)" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
            {quickQ.map((q, i) => <button key={i} className="ai-btn" onClick={() => send(q)}>{q}</button>)}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Ask any clinical question… (Enter to send)" style={{ flex: 1, background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: "var(--r-sm)", padding: "8px 11px", color: "var(--t1)", fontSize: 13, fontFamily: "var(--font)", resize: "none", outline: "none", minHeight: 38, maxHeight: 100 }} />
            <button onClick={() => send()} disabled={busy} style={{ width: 38, height: 38, borderRadius: "var(--r-sm)", background: "linear-gradient(135deg,var(--accent),var(--accent2))", border: "none", color: "#000", fontSize: 16, cursor: "pointer", flexShrink: 0, alignSelf: "flex-end" }}>➤</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AIResultModal({ open, onClose, title, content, loading }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="modal-lg">
      <div className="modal-body">
        {loading
          ? <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--accent)", padding: "20px 0" }}><Spinner /> Analyzing with AI…</div>
          : <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font)", fontSize: 13, lineHeight: 1.7, color: "var(--t1)" }}>{content}</pre>}
      </div>
      <div className="modal-footer">
        {!loading && <button className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(content)}>📋 Copy</button>}
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

// ─── PATIENT TABS ─────────────────────────────────────────────────────────────

// ─── UNIFIED LOGIN PAGE WITH EMAIL OTP 2FA ────────────────────────────────────
// OTP is sent via EmailJS (browser SDK, no backend needed).
// Admin login bypasses OTP — OTP only applies to staff accounts.
// EmailJS credentials are configured by admin in System Settings.

// Helper: load EmailJS SDK from CDN lazily
let _emailjs = null;
async function loadEmailJS() {
  if (_emailjs) return _emailjs;
  await new Promise((res, rej) => {
    if (document.getElementById("emailjs-sdk")) { res(); return; }
    const s = document.createElement("script");
    s.id = "emailjs-sdk";
    s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  _emailjs = window.emailjs;
  return _emailjs;
}

// Send OTP email — returns { ok, error }
async function sendOTPEmail(toEmail, toName, otp, ejsCfg) {
  try {
    const ejs = await loadEmailJS();
    ejs.init({ publicKey: ejsCfg.publicKey });
    await ejs.send(ejsCfg.serviceId, ejsCfg.templateId, {
      to_email: toEmail,
      to_name: toName || toEmail,
      otp_code: String(otp),
      app_name: "MedRecord",
      valid_minutes: "10",
    });
    return { ok: true };
  } catch(e) {
    return { ok: false, error: e?.text || e?.message || "Email sending failed." };
  }
}

function LoginPage({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [regData, setRegData] = useState({ name:"",email:"",password:"",confirmPassword:"",role:"",ward:"" });
  const [fpEmail, setFpEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // OTP screen state
  const [otp, setOtp] = useState({
    active: false,
    sessionId: null,
    inputCode: "",
    pendingUser: null,
    sentTo: "",
    resendCooldown: 0,
    sending: false,
  });

  const showMsg = (text, type="error") => setMsg({ text, type });
  const switchTab = (t) => { setTab(t); setMsg(null); };

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (otp.resendCooldown <= 0) return;
    const t = setTimeout(() => setOtp(x => ({ ...x, resendCooldown: x.resendCooldown - 1 })), 1000);
    return () => clearTimeout(t);
  }, [otp.resendCooldown]);

  // Core: generate + send OTP, store session in Firestore
  const dispatchOTP = async (userProfile, ejsCfg) => {
    const code = Math.floor(100000 + Math.random() * 900000); // 6-digit
    const sessionId = await FBX.createOTPSession(userProfile.email, code);
    const result = await sendOTPEmail(userProfile.email, userProfile.name, code, ejsCfg);
    if (!result.ok) {
      showMsg("Could not send verification email: " + result.error);
      return false;
    }
    setOtp({
      active: true,
      sessionId,
      inputCode: "",
      pendingUser: userProfile,
      sentTo: userProfile.email,
      resendCooldown: 60,
      sending: false,
    });
    setMsg({ text: `A 6-digit code was sent to ${userProfile.email}. Check your inbox.`, type:"success" });
    return true;
  };

  const doLogin = async () => {
    if (!loginData.email || !loginData.password) { showMsg("Enter your email and password."); return; }
    setBusy(true); setMsg(null);
    try {
      // Admin bypasses OTP entirely
      if (loginData.email.trim().toLowerCase() === ADMIN_EMAIL && loginData.password === ADMIN_PASSWORD) {
        onLogin("__ADMIN__"); return;
      }
      // Staff login via Firebase Auth
      const cred = await FB.login(loginData.email, loginData.password);
      const profile = await FB.getProfile(cred.user.uid);
      if (!profile) { showMsg("Account found but no profile. Contact administrator."); setBusy(false); return; }
      if (profile.deleted) { showMsg("This account has been deactivated. Contact administrator."); setBusy(false); return; }
      if (profile.suspended) { showMsg("This account has been suspended. Contact administrator."); setBusy(false); return; }

      // Check if 2FA is enabled
      const twoFAEnabled = await FBX.get2FAEnabled();
      if (!twoFAEnabled) {
        // 2FA off — proceed directly
        onLogin({ uid: cred.user.uid, email: cred.user.email, ...profile });
        return;
      }

      // Load EmailJS config
      const ejsCfg = await FBX.getEmailJSConfig();
      if (!ejsCfg || !ejsCfg.serviceId || !ejsCfg.templateId || !ejsCfg.publicKey) {
        showMsg("2FA is enabled but email service is not configured. Contact administrator.");
        setBusy(false); return;
      }

      const userProfile = { uid: cred.user.uid, email: cred.user.email, ...profile };
      setBusy(false);
      await dispatchOTP(userProfile, ejsCfg);
    } catch(e) {
      showMsg(e.code==="auth/invalid-credential" ? "Incorrect email or password." : e.message);
    }
    setBusy(false);
  };

  const doVerifyOTP = async () => {
    if (!otp.inputCode.trim()) { showMsg("Enter the 6-digit code from your email."); return; }
    setMsg(null);
    setOtp(x => ({ ...x, sending: true }));
    try {
      const result = await FBX.verifyOTP(otp.sessionId, otp.inputCode.trim());
      if (!result.ok) {
        setMsg({ text: result.error, type:"error" });
        setOtp(x => ({ ...x, sending: false, inputCode: "" }));
        return;
      }
      onLogin(otp.pendingUser);
    } catch(e) {
      setMsg({ text: e.message, type:"error" });
      setOtp(x => ({ ...x, sending: false }));
    }
  };

  const doResendOTP = async () => {
    if (otp.resendCooldown > 0 || otp.sending) return;
    setOtp(x => ({ ...x, sending: true })); setMsg(null);
    try {
      const ejsCfg = await FBX.getEmailJSConfig();
      await dispatchOTP(otp.pendingUser, ejsCfg);
    } catch(e) { showMsg("Resend failed: " + e.message); }
    setOtp(x => ({ ...x, sending: false }));
  };

  const doRegister = async () => {
    if (!regData.name||!regData.email||!regData.password||!regData.role) { showMsg("Fill in all required fields."); return; }
    if (regData.password !== regData.confirmPassword) { showMsg("Passwords do not match."); return; }
    if (regData.password.length < 6) { showMsg("Password must be at least 6 characters."); return; }
    setBusy(true);
    try {
      await FB.register(regData.email, regData.password, { name:regData.name, role:regData.role, ward:regData.ward||"" });
      showMsg("Account created! You can now sign in.", "success");
      switchTab("login"); setLoginData({ email:regData.email, password:"" });
    } catch(e) { showMsg(e.code==="auth/email-already-in-use" ? "Email already registered." : e.message); }
    setBusy(false);
  };

  const doForgotPassword = async () => {
    if (!fpEmail) { showMsg("Enter your email address."); return; }
    setBusy(true);
    try {
      await FB.forgotPassword(fpEmail);
      showMsg("Reset link sent! Check your inbox.", "success");
      setFpEmail(""); setTimeout(() => switchTab("login"), 3000);
    } catch(e) { showMsg(e.code==="auth/user-not-found" ? "No account found with that email." : e.message); }
    setBusy(false);
  };

  // ── OTP Verification Screen ──────────────────────────────────────────────────
  if (otp.active) {
    return (
      <div className="login-page">
        <div className="login-box">
          <div className="login-logo">
            <div className="login-icon">📧</div>
            <div className="login-title">Email Verification</div>
            <div className="login-sub">Two-factor authentication</div>
          </div>

          <div style={{ background:"rgba(13,43,107,0.05)", border:"1px solid rgba(13,43,107,0.12)", borderRadius:10, padding:"12px 16px", marginBottom:18, fontSize:13, color:"#1a3460", lineHeight:1.6 }}>
            <div style={{ fontWeight:700, marginBottom:4 }}>📬 Code sent to:</div>
            <div style={{ fontFamily:"monospace", fontWeight:900, fontSize:14 }}>{otp.sentTo}</div>
            <div style={{ fontSize:11, color:"#5a7399", marginTop:4 }}>Valid for 10 minutes · Check your spam folder if not received</div>
          </div>

          <div className="form-group">
            <label className="form-label">6-Digit Verification Code</label>
            <input
              className="form-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp.inputCode}
              onChange={e => setOtp(x => ({ ...x, inputCode: e.target.value.replace(/\D/g,"") }))}
              onKeyDown={e => e.key==="Enter" && doVerifyOTP()}
              style={{ textAlign:"center", fontSize:26, letterSpacing:8, fontFamily:"monospace", fontWeight:900 }}
              autoFocus
            />
          </div>

          {msg && <div className={msg.type==="error" ? "form-error" : "form-success"}>{msg.text}</div>}

          <button
            className="btn btn-primary btn-lg"
            style={{ marginTop:10 }}
            onClick={doVerifyOTP}
            disabled={otp.sending || !otp.inputCode}
          >
            {otp.sending ? <Spinner/> : "✓ Verify & Sign In"}
          </button>

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14 }}>
            <button
              onClick={() => { setOtp({ active:false, sessionId:null, inputCode:"", pendingUser:null, sentTo:"", resendCooldown:0, sending:false }); setMsg(null); }}
              style={{ background:"none", border:"none", color:"var(--t2)", fontSize:12, cursor:"pointer", textDecoration:"underline" }}
            >
              ← Back to Sign In
            </button>
            <button
              onClick={doResendOTP}
              disabled={otp.resendCooldown > 0 || otp.sending}
              style={{ background:"none", border:"none", color: otp.resendCooldown > 0 ? "var(--t2)" : "var(--accent)", fontSize:12, cursor: otp.resendCooldown > 0 ? "default" : "pointer", textDecoration: otp.resendCooldown > 0 ? "none" : "underline", fontWeight:600 }}
            >
              {otp.resendCooldown > 0 ? `Resend in ${otp.resendCooldown}s` : "↺ Resend Code"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Login / Register / Forgot Screen ───────────────────────────────────
  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-logo">
          <div className="login-icon">⚕️</div>
          <div className="login-title">MedRecord</div>
          <div className="login-sub">Hospital Electronic Medical Records</div>
        </div>
        <div className="tab-switcher">
          <button className={`tab-switch-btn ${tab==="login"?"active":""}`} onClick={()=>switchTab("login")}>Sign In</button>
          <button className={`tab-switch-btn ${tab==="register"?"active":""}`} onClick={()=>switchTab("register")}>Register</button>
          <button className={`tab-switch-btn ${tab==="forgot"?"active":""}`} onClick={()=>switchTab("forgot")}>Forgot</button>
        </div>
        {tab==="login" && <>
          <div className="form-group"><label className="form-label">Email Address</label><input className="form-input" type="email" placeholder="your@email.com" value={loginData.email} onChange={e=>setLoginData(d=>({...d,email:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&doLogin()} /></div>
          <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" placeholder="Enter password" value={loginData.password} onChange={e=>setLoginData(d=>({...d,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&doLogin()} /></div>
          {msg && <div className={msg.type==="error"?"form-error":"form-success"}>{msg.text}</div>}
          <button className="btn btn-primary btn-lg" style={{marginTop:13}} onClick={doLogin} disabled={busy}>{busy?<Spinner/>:"Sign In"}</button>
          <div style={{textAlign:"center",marginTop:10}}><button onClick={()=>switchTab("forgot")} style={{background:"none",border:"none",color:"var(--accent)",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>Forgot password?</button></div>
        </>}
        {tab==="forgot" && <>
          <p style={{fontSize:13,color:"var(--t2)",marginBottom:13}}>Enter your email and we'll send a reset link.</p>
          <div className="form-group"><label className="form-label">Email Address</label><input className="form-input" type="email" placeholder="your@email.com" value={fpEmail} onChange={e=>setFpEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doForgotPassword()} /></div>
          {msg && <div className={msg.type==="error"?"form-error":"form-success"}>{msg.text}</div>}
          <button className="btn btn-primary btn-lg" style={{marginTop:8}} onClick={doForgotPassword} disabled={busy}>{busy?<Spinner/>:"Send Reset Link"}</button>
          <div style={{textAlign:"center",marginTop:10}}><button onClick={()=>switchTab("login")} style={{background:"none",border:"none",color:"var(--t2)",fontSize:12,cursor:"pointer",textDecoration:"underline"}}>← Back to Sign In</button></div>
        </>}
        {tab==="register" && <>
          <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" placeholder="Your full name" value={regData.name} onChange={e=>setRegData(d=>({...d,name:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Email Address *</label><input className="form-input" type="email" placeholder="your@email.com" value={regData.email} onChange={e=>setRegData(d=>({...d,email:e.target.value}))} /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Password *</label><input className="form-input" type="password" placeholder="Min 6 characters" value={regData.password} onChange={e=>setRegData(d=>({...d,password:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Confirm *</label><input className="form-input" type="password" placeholder="Repeat password" value={regData.confirmPassword} onChange={e=>setRegData(d=>({...d,confirmPassword:e.target.value}))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Role *</label><select className="form-select" value={regData.role} onChange={e=>setRegData(d=>({...d,role:e.target.value}))}><option value="">Select role</option>{ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
          {regData.role && regData.role!=="supervisor" && <div className="form-group"><label className="form-label">Ward</label><select className="form-select" value={regData.ward} onChange={e=>setRegData(d=>({...d,ward:e.target.value}))}><option value="">Select ward</option>{WARDS.map(w=><option key={w}>{w}</option>)}</select></div>}
          {msg && <div className={msg.type==="error"?"form-error":"form-success"}>{msg.text}</div>}
          <button className="btn btn-primary btn-lg" style={{marginTop:8}} onClick={doRegister} disabled={busy}>{busy?<Spinner/>:"Create Account"}</button>
        </>}
      </div>
    </div>
  );
}
function VisitTab({ patient }) {
  const v = patient.vitals?.[0] || {};
  const alerts = checkVitalAlerts(v);
  return (
    <div>
      {alerts.map((a, i) => <div key={i} className={`alert-banner alert-${a.level}`}>⚠️ {a.msg}</div>)}
      <div className="info-card">
        <h4>Patient Profile</h4>
        <div style={{ display: "flex", gap: 14, marginBottom: 13, paddingBottom: 13, borderBottom: "1px solid var(--border2)" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,var(--accent),var(--purple))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, border: "3px solid var(--accent)" }}>👤</div>
          <div>
            <div style={{ fontFamily: "var(--display)", fontSize: 17, fontWeight: 700 }}>{patient.name}</div>
            <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 2 }}>EMR: {patient.emr || "—"}</div>
            <div style={{ fontSize: 11, color: "var(--t2)", marginTop: 1 }}>{patient.ward || "No ward assigned"}</div>
            <div style={{ marginTop: 5 }}><span className={`badge badge-${patient.status || "active"}`}>{patient.status || "Active"}</span></div>
          </div>
        </div>
        <div className="profile-grid">
          <div className="profile-item"><label>Date of Birth</label><span>{patient.dob || "—"}</span></div>
          <div className="profile-item"><label>Gender</label><span>{patient.gender || "—"}</span></div>
          <div className="profile-item"><label>Attending Physician</label><span>{patient.physician || "—"}</span></div>
          <div className="profile-item"><label>Admission Date</label><span>{patient.admission || "—"}</span></div>
          <div className="profile-item" style={{ gridColumn: "1/-1" }}><label>Primary Diagnosis</label><span>{patient.diagnosis || "—"}</span></div>
          <div className="profile-item" style={{ gridColumn: "1/-1" }}><label>Known Allergies</label><span style={{ color: patient.allergies ? "var(--danger)" : "var(--t2)" }}>⚠️ {patient.allergies || "No known allergies"}</span></div>
        </div>
        {patient.vitals?.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 11, marginBottom: 6 }}>Latest Vitals</div>
            <div className="vitals-row">
              {[["BP", v.bp, "mmHg"], ["HR", v.hr, "bpm"], ["Temp", v.temp, "°C"], ["RR", v.rr, "/min"], ["SpO₂", v.spo2, "%"]].map(([l, val, u]) => (
                <div className="vital-chip" key={l}><label>{l}</label><span>{val || "—"}{val && <small style={{ fontSize: 8, color: "var(--t3)" }}>{u}</small>}</span></div>
              ))}
            </div>
          </>
        )}
      </div>
      {patient.statusHistory?.length > 0 && (
        <div className="info-card"><h4>Status History</h4>
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Action</th><th>Ward</th><th>Notes</th></tr></thead>
            <tbody>{patient.statusHistory.map(h => <tr key={h.id}><td>{h.date}</td><td style={{ textTransform: "capitalize" }}>{h.action}</td><td>{h.toWard || "—"}</td><td>{h.notes || "—"}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

function VitalsTab({ patient }) {
  const rows = patient.vitals || [];
  return (
    <div className="info-card"><h4>Vital Signs Log ({rows.length} records)</h4>
      {rows.length === 0 ? <div className="empty-state" style={{ padding: 20 }}><div className="empty-icon">💓</div><div className="empty-text">No vitals recorded</div></div> : (
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Time</th><th>BP</th><th>HR</th><th>Temp</th><th>RR</th><th>SpO₂</th><th>Nurse</th><th>Notes</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}>
            <td>{r.date}</td><td>{r.time}</td>
            <td style={{ fontFamily: "var(--mono)" }}>{r.bp || "—"}</td>
            <td style={{ fontFamily: "var(--mono)", color: r.hr && (+r.hr > 120 || +r.hr < 50) ? "var(--danger)" : "inherit" }}>{r.hr || "—"}</td>
            <td style={{ fontFamily: "var(--mono)", color: r.temp && (+r.temp > 38.5 || +r.temp < 35.5) ? "var(--warning)" : "inherit" }}>{r.temp || "—"}</td>
            <td style={{ fontFamily: "var(--mono)" }}>{r.rr || "—"}</td>
            <td style={{ fontFamily: "var(--mono)", color: r.spo2 && +r.spo2 < 94 ? "var(--danger)" : "inherit" }}>{r.spo2 || "—"}</td>
            <td>{r.nurse}</td><td>{r.notes || "—"}</td>
          </tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

function PrescriptionTab({ patient }) {
  const rows = patient.prescriptions || [];
  return (
    <div className="info-card"><h4>Prescription Plan ({rows.length} medications)</h4>
      {rows.length === 0 ? <div className="empty-state" style={{ padding: 20 }}><div className="empty-icon">📝</div><div className="empty-text">No prescriptions</div></div> : (
        <div className="table-wrap"><table><thead><tr><th>Drug</th><th>Dosage</th><th>Route</th><th>Frequency</th><th>Start</th><th>End</th><th>Instructions</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}><td style={{ fontWeight: 600 }}>{r.drug}</td><td>{r.dosage}</td><td>{r.route}</td><td>{r.freq}</td><td>{r.start}</td><td>{r.end || "Ongoing"}</td><td>{r.instructions || "—"}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

function MedAdminTab({ patient }) {
  const rows = patient.medAdminLogs || [];
  return (
    <div className="info-card"><h4>Medication Administration ({rows.length} records)</h4>
      {rows.length === 0 ? <div className="empty-state" style={{ padding: 20 }}><div className="empty-icon">💊</div><div className="empty-text">No records</div></div> : (
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Time</th><th>Drug</th><th>Dosage</th><th>Route</th><th>Status</th><th>Nurse</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td>{r.date}</td><td>{r.time}</td><td style={{ fontWeight: 600 }}>{r.drug}</td><td>{r.dosage}</td><td>{r.route}</td><td><span className={`badge badge-${(r.status || "given").toLowerCase()}`}>{r.status}</span></td><td>{r.nurse}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

function GlycemicTab({ patient }) {
  const rows = patient.glucoseReadings || [];
  const fields = ["fasting", "postbf", "prelunch", "postlunch", "predinner", "bedtime"];
  const labels = ["Fasting", "Post-BF", "Pre-Lunch", "Post-Lunch", "Pre-Dinner", "Bedtime"];
  return (
    <div className="info-card"><h4>Blood Glucose Log ({rows.length} records)</h4>
      {rows.length === 0 ? <div className="empty-state" style={{ padding: 20 }}><div className="empty-icon">🩸</div><div className="empty-text">No glucose readings</div></div> : (
        <div className="table-wrap"><table><thead><tr><th>Date</th>{labels.map(l => <th key={l}>{l}</th>)}<th>Nurse</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td>{r.date}</td>{fields.map(f => <td key={f} style={{ fontFamily: "var(--mono)" }}>{r[f] || "—"}</td>)}<td>{r.nurse}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

function FluidTab({ patient }) {
  const rows = patient.fluidEntries || [];
  let totalIn = 0, totalOut = 0;
  rows.forEach(r => { totalIn += (+r.oral || 0) + (+r.iv || 0); totalOut += (+r.urine || 0) + (+r.other || 0); });
  const bal = totalIn - totalOut;
  return (
    <div>
      <div className="fluid-balance">
        <div className="fluid-stat"><label>Total Intake</label><span style={{ color: "var(--success)" }}>{totalIn} mL</span></div>
        <div className="fluid-stat"><label>Total Output</label><span style={{ color: "var(--danger)" }}>{totalOut} mL</span></div>
        <div className="fluid-stat"><label>Net Balance</label><span style={{ color: bal >= 0 ? "var(--success)" : "var(--danger)" }}>{bal >= 0 ? "+" : ""}{bal} mL</span></div>
      </div>
      <div className="info-card"><h4>Fluid I/O Log ({rows.length} entries)</h4>
        {rows.length === 0 ? <div className="empty-state" style={{ padding: 20 }}><div className="empty-icon">💧</div><div className="empty-text">No entries</div></div> : (
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Time</th><th>Oral (mL)</th><th>IV (mL)</th><th>Urine (mL)</th><th>Other (mL)</th><th>Nurse</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.id}><td>{r.date}</td><td>{r.time}</td><td>{r.oral || 0}</td><td>{r.iv || 0}</td><td>{r.urine || 0}</td><td>{r.other || 0}</td><td>{r.nurse}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function NursingTab({ patient }) {
  const rows = patient.nursingReports || [];
  return (
    <div className="info-card"><h4>Nursing Reports ({rows.length})</h4>
      {rows.length === 0 ? <div className="empty-state" style={{ padding: 20 }}><div className="empty-icon">📋</div><div className="empty-text">No reports</div></div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(r => (
            <div key={r.id} style={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: "var(--r-sm)", padding: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 5 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>{r.date}</span>
                  <span style={{ fontSize: 10, background: "var(--accent3)", color: "var(--accent)", padding: "2px 6px", borderRadius: 20 }}>{r.shift}</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--t2)" }}>👤 {r.nurseOnDuty || r.nurse || "—"}</span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6 }}>{r.report}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WoundTab({ patient }) {
  const rows = patient.woundRecords || [];
  return (
    <div className="info-card"><h4>Wound Care Records ({rows.length})</h4>
      {rows.length === 0 ? <div className="empty-state" style={{ padding: 20 }}><div className="empty-icon">🩹</div><div className="empty-text">No wound care records</div></div> : (
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Site</th><th>Size</th><th>Appearance</th><th>Dressing</th><th>Pain</th><th>Nurse</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td>{r.date}</td><td>{r.site}</td><td>{r.size}</td><td>{r.appearance}</td><td>{r.dressing}</td><td style={{ fontFamily: "var(--mono)", color: r.pain >= 7 ? "var(--danger)" : r.pain >= 4 ? "var(--warning)" : "var(--success)" }}>{r.pain}/10</td><td>{r.nurse}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

function LabTab({ patient }) {
  const rows = patient.labResults || [];
  return (
    <div className="info-card"><h4>Lab Results ({rows.length})</h4>
      {rows.length === 0 ? <div className="empty-state" style={{ padding: 20 }}><div className="empty-icon">🧪</div><div className="empty-text">No lab results</div></div> : (
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Test</th><th>Result</th><th>Unit</th><th>Ref Range</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td>{r.date}</td><td style={{ fontWeight: 600 }}>{r.testName}</td><td style={{ fontFamily: "var(--mono)" }}>{r.result}</td><td>{r.unit}</td><td style={{ color: "var(--t2)" }}>{r.refRange}</td><td><span className={`badge ${r.status?.includes("Critical") ? "badge-critical" : r.status === "Normal" ? "badge-active" : "badge-warning"}`}>{r.status}</span></td><td>{r.notes || "—"}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

function OrdersTab({ patient, nurse, onUpdate }) {
  const rows = patient.doctorOrders || [];
  const toggleAck = async (orderId) => {
    const updated = { ...patient, doctorOrders: rows.map(o => o.id === orderId ? { ...o, acknowledged: true, acknowledgedBy: nurse, acknowledgedAt: new Date().toISOString() } : o) };
    await FB.savePatient(updated); onUpdate(updated);
  };
  return (
    <div className="info-card"><h4>Doctor's Orders ({rows.length})</h4>
      {rows.length === 0 ? <div className="empty-state" style={{ padding: 20 }}><div className="empty-icon">📋</div><div className="empty-text">No orders</div></div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(r => (
            <div key={r.id} style={{ background: "var(--bg3)", border: `1px solid ${r.priority === "STAT" ? "var(--danger)" : r.priority === "Urgent" ? "var(--warning)" : "var(--border2)"}`, borderRadius: "var(--r-sm)", padding: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 5 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>{r.date} {r.time}</span>
                  <span className={`badge ${r.priority === "STAT" ? "badge-critical" : r.priority === "Urgent" ? "badge-warning" : "badge-active"}`}>{r.priority}</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--t2)" }}>Dr. {r.doctor || "—"}</span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 7 }}>{r.order}</p>
              {r.acknowledged
                ? <div style={{ fontSize: 11, color: "var(--success)" }}>✅ Acknowledged by {r.acknowledgedBy} at {r.acknowledgedAt ? new Date(r.acknowledgedAt).toLocaleTimeString() : "—"}</div>
                : <button className="btn btn-secondary btn-sm" onClick={() => toggleAck(r.id)}>✋ Acknowledge Order</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TransfusionTab({ patient }) {
  const rows = patient.transfusions || [];
  return (
    <div className="info-card"><h4>Blood Transfusion Records ({rows.length})</h4>
      {rows.length === 0 ? <div className="empty-state" style={{ padding: 20 }}><div className="empty-icon">🩸</div><div className="empty-text">No transfusion records</div></div> : (
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Blood Type</th><th>Units</th><th>Nurse</th><th>Notes</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td>{r.date}</td><td style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{r.bloodType}</td><td>{r.units}</td><td>{r.nurse}</td><td>{r.notes || "—"}</td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

// ─── PATIENT DETAIL ───────────────────────────────────────────────────────────
function PatientDetail({ patient, user, onUpdate, toast }) {
  const [activeTab, setActiveTab] = useState("visit");
  const [modals, setModals] = useState({});
  const [aiResult, setAiResult] = useState({ open: false, title: "", content: "", loading: false });
  const openM = (m) => setModals(x => ({ ...x, [m]: true }));
  const closeM = (m) => setModals(x => ({ ...x, [m]: false }));
  const refresh = (updated) => onUpdate(updated);

  const runAI = async (title, fn) => {
    setAiResult({ open: true, title, content: "", loading: true });
    try { const r = await fn(); setAiResult({ open: true, title, content: r, loading: false }); }
    catch (e) { setAiResult({ open: true, title: "Error", content: e.message, loading: false }); }
  };

  const save = async (field, entry) => {
    const updated = { ...patient, [field]: [entry, ...(patient[field] || [])] };
    await FB.savePatient(updated); refresh(updated);
  };
  const saveArr = async (field, arr) => {
    const updated = { ...patient, [field]: arr };
    await FB.savePatient(updated); refresh(updated);
  };

  const latestV = patient.vitals?.[0] || {};
  const tabs = [
    ["visit", "📋 Visit"], ["vitals", "💓 Vitals"], ["prescription", "📝 Prescription"],
    ["medadmin", "💊 Med Admin"], ["orders", "📋 Orders"], ["glycemic", "🩸 Glycemic"],
    ["fluid", "💧 Fluid"], ["nursing", "📝 Nursing"], ["wound", "🩹 Wounds"],
    ["lab", "🧪 Labs"], ["transfusion", "🩸 Transfusion"],
  ];

  const exportRecord = () => {
    const txt = [
      `PATIENT RECORD — ${new Date().toLocaleDateString()}`,
      "=".repeat(50),
      `Name: ${patient.name}  |  EMR: ${patient.emr || "—"}`,
      `DOB: ${patient.dob || "—"}  |  Gender: ${patient.gender || "—"}`,
      `Ward: ${patient.ward || "—"}  |  Status: ${patient.status || "active"}`,
      `Physician: ${patient.physician || "—"}  |  Admitted: ${patient.admission || "—"}`,
      `Diagnosis: ${patient.diagnosis || "—"}`,
      `Allergies: ${patient.allergies || "NKDA"}`,
      "",
      "LATEST VITALS",
      `BP: ${latestV.bp || "—"}  HR: ${latestV.hr || "—"} bpm  Temp: ${latestV.temp || "—"}°C  SpO2: ${latestV.spo2 || "—"}%`,
      "",
      `PRESCRIPTIONS (${(patient.prescriptions || []).length})`,
      ...(patient.prescriptions || []).map(m => `  • ${m.drug} ${m.dosage} ${m.route} ${m.freq}`),
      "",
      `NURSING REPORTS (${(patient.nursingReports || []).length})`,
      ...(patient.nursingReports || []).slice(0, 5).map(r => `  [${r.date} ${r.shift}]\n  ${r.report}`),
    ].join("\n");
    const a = document.createElement("a"); a.href = "data:text/plain;charset=utf-8," + encodeURIComponent(txt);
    a.download = `${patient.name.replace(/\s+/g, "_")}_record.txt`; a.click();
  };

  return (
    <div className="pt-detail">
      <div className="pt-header">
        <div className="pt-header-info">
          <h2>{patient.name}</h2>
          <div className="pt-header-meta">
            <span>EMR: {patient.emr || "—"}</span><span>•</span>
            <span>{patient.ward || "—"}</span><span>•</span>
            <span className={`badge badge-${patient.status || "active"}`}>{patient.status || "Active"}</span>
            {patient.diagnosis && <><span>•</span><span>{patient.diagnosis}</span></>}
          </div>
          {patient.allergies && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 3 }}>⚠️ Allergy: {patient.allergies}</div>}
        </div>
        <div className="pt-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => openM("status")}>⇄ Transfer/D/C</button>
          <button className="btn btn-ghost btn-sm" onClick={exportRecord}>📄 Export</button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>🖨️ Print</button>
        </div>
      </div>

      <div className="ai-bar">
        <span className="ai-bar-label">🤖 AI</span>
        <button className="ai-btn" onClick={() => runAI("📋 Patient Summary", () => AI.summarize(patient))}>Summarize</button>
        <button className="ai-btn" onClick={() => runAI("🧠 Care Plan", () => AI.careSuggestions(patient))}>Care Plan</button>
        <button className="ai-btn" onClick={() => { if (!(patient.prescriptions?.length)) { toast("Add medications first.", "error"); return; } runAI("⚠️ Drug Interactions", () => AI.checkInteractions(patient.prescriptions)); }}>Drug Interactions</button>
        <button className="ai-btn" onClick={() => { if (!patient.vitals?.length) { toast("Record vitals first.", "error"); return; } runAI("🔍 Vitals Analysis", () => AI.analyzeVitals(latestV, patient.name, patient.diagnosis)); }}>Analyze Vitals</button>
      </div>

      <div className="stats-row">
        {[["🩺", "BP", latestV.bp || "—", "mmHg"], ["💓", "HR", latestV.hr || "—", "bpm"], ["🌡️", "Temp", latestV.temp || "—", "°C"], ["💨", "SpO₂", latestV.spo2 || "—", "%"], ["💊", "Meds", (patient.prescriptions || []).length, "active"]].map(([icon, label, val, unit]) => (
          <div className="stat-card" key={label}><div className="stat-icon">{icon}</div><div className="stat-label">{label}</div><div className="stat-value">{val}</div><div className="stat-unit">{unit}</div></div>
        ))}
      </div>

      <div className="quick-actions">
        {[
          ["💓", "Add Vitals", () => openM("vitals")], ["💊", "Med Admin", () => openM("medAdmin")],
          ["📝", "Prescription", () => openM("prescription")], ["📋", "Doctor Order", () => openM("doctorOrder")],
          ["🩸", "Glucose", () => openM("glucose")], ["💧", "Fluid I/O", () => openM("fluid")],
          ["📝", "Nursing Report", () => openM("nursing")], ["🩹", "Wound Care", () => openM("wound")],
          ["🧪", "Lab Result", () => openM("lab")], ["🩸", "Transfusion", () => openM("transfusion")],
        ].map(([icon, label, fn]) => (
          <button key={label} className="quick-btn" onClick={fn}><span>{icon}</span>{label}</button>
        ))}
      </div>

      <div className="tabs-bar">
        {tabs.map(([k, l]) => <button key={k} className={`tab-btn ${activeTab === k ? "active" : ""}`} onClick={() => setActiveTab(k)}>{l}</button>)}
      </div>

      {activeTab === "visit" && <VisitTab patient={patient} />}
      {activeTab === "vitals" && <VitalsTab patient={patient} />}
      {activeTab === "prescription" && <PrescriptionTab patient={patient} />}
      {activeTab === "medadmin" && <MedAdminTab patient={patient} />}
      {activeTab === "orders" && <OrdersTab patient={patient} nurse={user?.name} onUpdate={refresh} />}
      {activeTab === "glycemic" && <GlycemicTab patient={patient} />}
      {activeTab === "fluid" && <FluidTab patient={patient} />}
      {activeTab === "nursing" && <NursingTab patient={patient} />}
      {activeTab === "wound" && <WoundTab patient={patient} />}
      {activeTab === "lab" && <LabTab patient={patient} />}
      {activeTab === "transfusion" && <TransfusionTab patient={patient} />}

      <VitalsModal open={!!modals.vitals} onClose={() => closeM("vitals")} nurse={user?.name} onSave={async v => { const entry = { ...v, id: uid(), recordedAt: new Date().toISOString() }; await save("vitals", entry); toast("Vital signs saved."); const a = checkVitalAlerts(v); if (a.some(x => x.level === "critical")) toast("⚠️ Critical vitals detected!", "warning"); }} />
      <GlucoseModal open={!!modals.glucose} onClose={() => closeM("glucose")} nurse={user?.name} onSave={async g => { await save("glucoseReadings", { ...g, id: uid() }); toast("Glucose saved."); }} />
      <FluidModal open={!!modals.fluid} onClose={() => closeM("fluid")} nurse={user?.name} onSave={async f => { await save("fluidEntries", { ...f, id: uid() }); toast("Fluid entry saved."); }} />
      <MedAdminModal open={!!modals.medAdmin} onClose={() => closeM("medAdmin")} nurse={user?.name} onSave={async e => { await save("medAdminLogs", { ...e, id: uid() }); toast("Administration recorded."); }} />
      <PrescriptionModal open={!!modals.prescription} onClose={() => closeM("prescription")} patient={patient} onSave={async list => { await saveArr("prescriptions", list); toast("Prescriptions saved."); }} />
      <NursingReportModal open={!!modals.nursing} onClose={() => closeM("nursing")} nurse={user?.name} onSave={async rp => { await save("nursingReports", { ...rp, id: uid() }); toast("Nursing report saved."); }} />
      <WoundCareModal open={!!modals.wound} onClose={() => closeM("wound")} nurse={user?.name} onSave={async w => { await save("woundRecords", { ...w, id: uid() }); toast("Wound record saved."); }} />
      <LabResultModal open={!!modals.lab} onClose={() => closeM("lab")} nurse={user?.name} onSave={async l => { await save("labResults", { ...l, id: uid() }); toast("Lab result saved."); }} />
      <DoctorOrderModal open={!!modals.doctorOrder} onClose={() => closeM("doctorOrder")} nurse={user?.name} onSave={async o => { await save("doctorOrders", { ...o, id: uid() }); toast("Order saved."); }} />
      <TransfusionModal open={!!modals.transfusion} onClose={() => closeM("transfusion")} nurse={user?.name} onSave={async t => { await save("transfusions", { ...t, id: uid() }); toast("Transfusion saved."); }} />
      <StatusModal open={!!modals.status} onClose={() => closeM("status")} onSave={async (action, ward, notes, date) => {
        const entry = { action, date, notes, id: uid(), ...(action === "transfer" && ward ? { toWard: ward } : {}) };
        const newStatus = action === "discharge" ? "discharged" : action === "active" ? "active" : patient.status;
        const updated = { ...patient, status: newStatus, ...(action === "transfer" && ward ? { ward } : {}), statusHistory: [...(patient.statusHistory || []), entry] };
        await FB.savePatient(updated); refresh(updated); toast("Status updated.");
      }} />
      <AIResultModal open={aiResult.open} onClose={() => setAiResult(x => ({ ...x, open: false }))} title={aiResult.title} content={aiResult.content} loading={aiResult.loading} />
    </div>
  );
}

// ─── WARD OVERVIEW ────────────────────────────────────────────────────────────
function WardOverview({ patients, onSelectPatient }) {
  const active = patients.filter(p => (p.status || "active") === "active");
  return (
    <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 700 }}>Ward Overview</div>
          <div style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>{active.length} active patients across {WARDS.length} wards</div></div>
      </div>
      <div className="ward-overview">
        {WARDS.map(ward => {
          const wPts = active.filter(p => p.ward === ward);
          const criticals = wPts.filter(p => checkVitalAlerts(p.vitals?.[0] || {}).some(a => a.level === "critical"));
          return (
            <div key={ward} className="ward-card">
              <div className="ward-card-title">
                <span style={{ fontSize: 13 }}>{ward}</span>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  {criticals.length > 0 && <span className="badge badge-critical">⚠️ {criticals.length}</span>}
                  <span className="badge badge-active">{wPts.length}</span>
                </div>
              </div>
              {wPts.length === 0
                ? <div style={{ fontSize: 12, color: "var(--t3)", paddingTop: 4 }}>No active patients</div>
                : wPts.map(p => (
                  <div key={p.id} onClick={() => onSelectPatient(p.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border2)", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.75"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: "var(--t2)" }}>{p.diagnosis || "No diagnosis"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {p.vitals?.[0] && <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--accent)" }}>{p.vitals[0].bp || ""}</div>}
                      {checkVitalAlerts(p.vitals?.[0] || {}).some(a => a.level === "critical") && <span style={{ fontSize: 11, color: "var(--danger)" }}>⚠️</span>}
                    </div>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── REPORTS ──────────────────────────────────────────────────────────────────
function ReportsSection({ patients, user }) {
  const [handover, setHandover] = useState({ open: false, content: "", loading: false });
  const allReports = patients.flatMap(p => (p.nursingReports || []).map(r => ({ ...r, patientName: p.name, ward: p.ward }))).sort((a, b) => b.date.localeCompare(a.date));

  const exportCSV = () => {
    const rows = [
      ["Patient", "EMR", "Ward", "Status", "Diagnosis", "Admission", "Vitals", "Meds", "Reports", "Labs"],
      ...patients.map(p => [p.name, p.emr || "", p.ward || "", p.status || "active", p.diagnosis || "", p.admission || "", (p.vitals || []).length, (p.prescriptions || []).length, (p.nursingReports || []).length, (p.labResults || []).length])
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv); a.download = "medrecord_report.csv"; a.click();
  };

  const genHandover = async () => {
    setHandover({ open: true, content: "", loading: true });
    try {
      const r = await AI.shiftHandover(patients.filter(p => (p.status || "active") === "active"), SHIFTS[0], user?.name || "Nurse");
      setHandover({ open: true, content: r, loading: false });
    } catch (e) { setHandover({ open: true, content: "Error: " + e.message, loading: false }); }
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div><div style={{ fontFamily: "var(--display)", fontSize: 16, fontWeight: 700 }}>Reports Dashboard</div>
          <div style={{ fontSize: 12, color: "var(--t2)", marginTop: 2 }}>{patients.length} patients · {allReports.length} nursing reports</div></div>
        <div style={{ display: "flex", gap: 7 }}>
          <button className="btn btn-secondary btn-sm" onClick={genHandover}>🤖 AI Shift Handover</button>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}>📊 Export CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>🖨️ Print</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 18 }}>
        {[["Total Patients", patients.length, "👥"], ["Active", patients.filter(p => (p.status || "active") === "active").length, "🏥"], ["Discharged", patients.filter(p => p.status === "discharged").length, "🚪"], ["Reports", allReports.length, "📋"]].map(([l, v, icon]) => (
          <div key={l} className="stat-card"><div className="stat-icon">{icon}</div><div className="stat-label">{l}</div><div className="stat-value">{v}</div></div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10, marginBottom: 18 }}>
        {patients.map(p => (
          <div key={p.id} className="card" style={{ padding: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 9 }}>
              <div><div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div><div style={{ fontSize: 11, color: "var(--t2)" }}>{p.ward || "—"}</div></div>
              <span className={`badge badge-${p.status || "active"}`}>{p.status || "active"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
              {[["Vitals", (p.vitals || []).length], ["Meds", (p.prescriptions || []).length], ["Reports", (p.nursingReports || []).length], ["Labs", (p.labResults || []).length]].map(([l, n]) => (
                <div key={l} style={{ background: "var(--bg3)", borderRadius: "var(--r-sm)", padding: "5px 7px", textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 500 }}>{n}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {allReports.length > 0 && (
        <div className="info-card"><h4>All Nursing Reports</h4>
          <div className="table-wrap"><table><thead><tr><th>Date</th><th>Patient</th><th>Ward</th><th>Shift</th><th>Report</th><th>Nurse</th></tr></thead>
            <tbody>{allReports.slice(0, 50).map(r => <tr key={r.id}><td style={{ fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>{r.date}</td><td style={{ fontWeight: 600 }}>{r.patientName}</td><td>{r.ward}</td><td>{r.shift}</td><td style={{ maxWidth: 260 }}>{r.report}</td><td>{r.nurseOnDuty || r.nurse || "—"}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
      <AIResultModal open={handover.open} onClose={() => setHandover(x => ({ ...x, open: false }))} title="🤖 AI Shift Handover Report" content={handover.content} loading={handover.loading} />
    </div>
  );
}

// ─── ALL WARDS 24HR REPORT (Overall Nurse view) ───────────────────────────────
// ─── PRINTABLE WARD REPORT (matches docx format) ─────────────────────────────
function PrintableReport({ date, reportsByWard, overallNote, user }) {
  const dateObj = new Date(date + "T00:00:00");
  const fmt = d => d.toLocaleDateString("en-GB", { day:"2-digit", month:"2-digit", year:"2-digit" });
  const timeRange = `0800hrs of ${fmt(dateObj)}  to  0800hrs of ${fmt(new Date(dateObj.getTime() + 86400000))}`;
  const SHIFT_COLS = ["Shift","Beds","OCC","VAC","ADM","Disch","DAMA","Transfer INT","Transfer OUT","Transfer EXT","S/C","USIC","ABSC","B/D"];
  const getShiftKey = s => s.startsWith("Morning") ? "AM" : s.startsWith("Afternoon") ? "PM" : "Night";
  const STAT_KEYS = ["beds","occ","vac","adm","disch","dama","transferInt","transferOut","transferExt","sc","usic","absc","bd"];

  return (
    <div className="print-report-wrap" style={{ display:"none" }}>
      <div className="print-report-title">24 Hours Ward Report</div>
      <div className="print-report-subtitle">{timeRange}</div>
      <div className="print-report-subtitle" style={{ marginTop:-6, marginBottom:14, fontSize:"9pt", color:"#555" }}>
        Overall Nurse: {user.name}&nbsp;&nbsp;|&nbsp;&nbsp;Generated: {new Date().toLocaleString()}
      </div>

      {WARDS.slice().sort().map(ward => {
        const reports = reportsByWard[ward] || [];
        return (
          <div key={ward} className="print-ward-section">
            <div className="print-ward-name">{ward}</div>

            {/* Shift statistics table */}
            <table className="print-shift-table">
              <thead>
                <tr>{SHIFT_COLS.map(h => <th key={h}>{h}</th>)}<th>Nurses on Duty</th></tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr><td colSpan={15} className="print-no-report">No report submitted for this ward on {date}</td></tr>
                ) : (
                  <>
                    {reports.map(r => (
                      <tr key={r.id}>
                        <td style={{fontWeight:"bold"}}>{getShiftKey(r.shift)}</td>
                        {STAT_KEYS.map(k => <td key={k}>{r[k] ?? "—"}</td>)}
                        <td className="nurses-col">{r.nurse}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight:"bold", background:"var(--th-bg)" }}>
                      <td>Total</td>
                      {STAT_KEYS.map(k => {
                        const nums = reports.map(r => parseFloat(r[k])).filter(n => !isNaN(n));
                        return <td key={k}>{nums.length ? nums.reduce((a,b)=>a+b,0) : "—"}</td>;
                      })}
                      <td className="nurses-col">{[...new Set(reports.map(r=>r.nurse).filter(Boolean))].join(", ")}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            {/* Narrative report table */}
            {reports.some(r => r.report?.trim()) && (
              <table className="print-shift-table" style={{ marginTop:4 }}>
                <thead>
                  <tr>
                    <th style={{ width:"8%", textAlign:"left" }}>Shift</th>
                    <th style={{ width:"14%", textAlign:"left" }}>Nurse</th>
                    <th style={{ textAlign:"left" }}>Ward Report / Patient Details</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.filter(r => r.report?.trim()).map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight:"bold", verticalAlign:"top", whiteSpace:"nowrap" }}>{getShiftKey(r.shift)}</td>
                      <td style={{ verticalAlign:"top", fontSize:"7pt" }}>{r.nurse}</td>
                      <td className="report-col">{r.report}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {overallNote.trim() && (
        <div className="print-overall-note">
          <div className="print-overall-note-label">Overall Nurse Note — {user.name}</div>
          <div className="print-overall-note-text">{overallNote}</div>
        </div>
      )}
      <div className="print-footer">Printed on {new Date().toLocaleString()} &nbsp;·&nbsp; MedRecord EMR</div>
    </div>
  );
}

function AllWardsReportSection({ wardReports, archives, user, showToast }) {
  const [date, setDate] = useState(today());
  const [overallNote, setOverallNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("report");
  const [shareOpen, setShareOpen] = useState(false);

  const reportsByWard = WARDS.slice().sort().reduce((acc, ward) => {
    acc[ward] = wardReports
      .filter(r => r.ward === ward && r.date === date)
      .sort((a, b) => a.shift.localeCompare(b.shift));
    return acc;
  }, {});

  const totalSubmitted = Object.values(reportsByWard).filter(r => r.length > 0).length;
  const totalReports   = Object.values(reportsByWard).reduce((s, r) => s + r.length, 0);
  const shiftColor = s => s.startsWith("Morning") ? "#fbbf24" : s.startsWith("Afternoon") ? "#2dd4bf" : "#818cf8";
  const shiftIcon  = s => s.startsWith("Morning") ? "🌅" : s.startsWith("Afternoon") ? "☀️" : "🌙";

  const buildReportText = () => {
    const lines = ["══════════════════════════════════════","   24-HOUR NURSES REPORT",`   Date: ${date}`,`   Overall Nurse: ${user.name}`,`   Generated: ${new Date().toLocaleString()}`,"══════════════════════════════════════\n"];
    if (overallNote.trim()) { lines.push("OVERALL NURSE NOTE:"); lines.push(overallNote.trim()); lines.push(""); }
    WARDS.slice().sort().forEach(ward => {
      const reports = reportsByWard[ward] || [];
      lines.push("──────────────────────────────────────"); lines.push(`🏥 ${ward}`);
      if (!reports.length) { lines.push("   ⏳ No report submitted"); }
      else reports.forEach(r => { lines.push(`\n   ${shiftIcon(r.shift)} ${r.shift}`); lines.push(`   By: ${r.nurse}`); lines.push(`   ${r.report}`); });
      lines.push("");
    });
    lines.push("══════════════════════════════════════");
    return lines.join("\n");
  };

  const handleArchive = async () => {
    if (!overallNote.trim()) { showToast("Please write your overall note before archiving.", "error"); return; }
    setSaving(true);
    try {
      await FB.save24hrArchive({ id:"AR-"+Math.random().toString(36).slice(2,10), date, type:"overall-nurse", overallNurseName:user.name, overallNurseId:user.uid, overallNote:overallNote.trim(), wardReports:Object.values(reportsByWard).flat(), totalWards:WARDS.length, submittedWards:totalSubmitted, totalReports, archivedAt:new Date().toISOString() });
      showToast("Report archived successfully. ✅"); setOverallNote("");
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setSaving(false);
  };
  const handlePrint = () => window.print();
  const handleNativeShare = async () => {
    const text = buildReportText();
    if (navigator.share) { try { await navigator.share({ title:`24-Hour Nurses Report – ${date}`, text }); } catch(e) { if (e.name!=="AbortError") showToast("Share failed: "+e.message,"error"); } }
    else setShareOpen(true);
  };
  const handleCopy = () => navigator.clipboard.writeText(buildReportText()).then(()=>showToast("Copied to clipboard! Paste into WhatsApp, email, or any app.")).catch(()=>showToast("Copy failed.","error"));
  const handleEmail = () => { const s=encodeURIComponent(`24-Hour Nurses Report – ${date}`),b=encodeURIComponent(buildReportText()); window.open(`mailto:?subject=${s}&body=${b}`); };
  const handleWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(buildReportText())}`);
  const handleDownload = () => { const blob=new Blob([buildReportText()],{type:"text/plain"}),a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`24hr-nurses-report-${date}.txt`; a.click(); URL.revokeObjectURL(a.href); };

  const myArchives = archives.filter(a => a.type === "overall-nurse").slice(0, 30);

  return (
    <div style={{ flex:1, overflowY:"auto", padding:18 }}>
      {/* Hidden print layout */}
      <PrintableReport date={date} reportsByWard={reportsByWard} overallNote={overallNote} user={user} />

      {/* Screen UI */}
      <div className="no-print">
        <div className="all-wards-header">
          <div>
            <div style={{ fontFamily:"var(--display)", fontSize:18, fontWeight:700, marginBottom:4 }}>📋 24-Hour Nurses Report</div>
            <div style={{ fontSize:12, color:"var(--t2)" }}>All ward reports · Overall Nurse view only</div>
          </div>
          <div>
            <div style={{ fontSize:9, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:".5px", marginBottom:3 }}>Date</div>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width:148, padding:"6px 10px" }} />
          </div>
        </div>

        <div className="tabs-bar">
          <button className={`tab-btn ${tab==="report"?"active":""}`} onClick={()=>setTab("report")}>📋 Report</button>
          <button className={`tab-btn ${tab==="archive"?"active":""}`} onClick={()=>setTab("archive")}>🗄️ Archive ({myArchives.length})</button>
        </div>

        {tab === "report" && <>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))", gap:9, marginBottom:16 }}>
            {[["Total Wards",WARDS.length,"🏥"],["Reported",totalSubmitted,"✅"],["Pending",WARDS.length-totalSubmitted,"⏳"],["Reports",totalReports,"📝"]].map(([l,v,icon])=>(
              <div key={l} className="stat-card"><div className="stat-icon">{icon}</div><div className="stat-label">{l}</div><div className="stat-value" style={{color:l==="Pending"&&v>0?"var(--warning)":"var(--t1)"}}>{v}</div></div>
            ))}
          </div>

          {WARDS.slice().sort().map(ward => {
            const reports = reportsByWard[ward]||[];
            const has = reports.length > 0;
            return (
              <div key={ward} className="ward-block">
                <div className="ward-block-header">
                  <div className="ward-block-title"><span style={{fontSize:16}}>🏥</span><span>{ward}</span></div>
                  <span className={`badge ${has?"badge-active":"badge-held"}`}>{has?`✅ ${reports.length} report${reports.length>1?"s":""}` : "⏳ No report"}</span>
                </div>
                <div className="ward-block-body">
                  {has ? reports.map(r=>(
                    <div key={r.id} className="shift-report-item" style={{borderLeftColor:shiftColor(r.shift)}}>
                      <div className="shift-label">
                        <span>{shiftIcon(r.shift)} {r.shift}</span>
                        <span style={{color:"var(--t3)",fontWeight:400,fontSize:10}}>By {r.nurse} · {r.submittedAt?new Date(r.submittedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"—"}</span>
                      </div>
                      <div className="shift-report-text">{r.report}</div>
                    </div>
                  )) : <div className="ward-empty">No report submitted for {date}</div>}
                </div>
              </div>
            );
          })}

          <div className="supervisor-note-box">
            <div style={{fontWeight:700,fontSize:13,color:"var(--warning)",marginBottom:4}}>👑 Overall Nurse Note</div>
            <div style={{fontSize:11,color:"var(--t2)",marginBottom:10}}>Write a short summary covering the overall status of all wards for this shift. This note will appear on the printed report.</div>
            <textarea className="form-textarea" style={{minHeight:110,marginBottom:12}} value={overallNote} onChange={e=>setOverallNote(e.target.value)}
              placeholder="e.g. All wards reviewed. General condition satisfactory. Two critical patients in ICU are stable. No major incidents. Handover completed smoothly…" />
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <button className="btn btn-primary" onClick={handleArchive} disabled={saving}>{saving?"Saving…":"🗄️ Save to Archive"}</button>
              <button className="btn btn-ghost btn-sm" onClick={handlePrint}>🖨️ Print</button>
              <button className="btn btn-ghost btn-sm" onClick={handleNativeShare}>📤 Share</button>
              <div style={{position:"relative"}}>
                <button className="btn btn-secondary btn-sm" onClick={()=>setShareOpen(o=>!o)}>⋯ More Options</button>
                {shareOpen && (
                  <div style={{position:"absolute",bottom:"calc(100% + 8px)",left:0,background:"var(--card2)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:6,minWidth:190,zIndex:200,boxShadow:"var(--shadow)"}}>
                    {[["📧 Send via Email",handleEmail],["💬 Send via WhatsApp",handleWhatsApp],["📋 Copy to Clipboard",handleCopy],["💾 Download as .txt",handleDownload]].map(([label,fn])=>(
                      <button key={label} className="btn btn-ghost" style={{width:"100%",justifyContent:"flex-start",fontSize:12,marginBottom:2}} onClick={()=>{fn();setShareOpen(false);}}>{label}</button>
                    ))}
                    <button className="btn btn-ghost" style={{width:"100%",justifyContent:"flex-start",fontSize:12,color:"var(--t3)"}} onClick={()=>setShareOpen(false)}>✕ Close</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>}

        {tab === "archive" && (
          <div>
            {myArchives.length === 0 ? (
              <div className="card" style={{padding:40,textAlign:"center",color:"var(--t3)"}}>
                <div style={{fontSize:32,marginBottom:10,opacity:0.3}}>🗄️</div>
                <div style={{fontSize:14,fontWeight:600,color:"var(--t2)",marginBottom:4}}>No archives yet</div>
                <div style={{fontSize:12}}>Saved collations will appear here.</div>
              </div>
            ) : myArchives.map(a => (
              <div key={a.id} className="archive-card">
                <div className="archive-header">
                  <div><div className="archive-title">📅 {a.date}</div><div className="archive-meta">By {a.overallNurseName} · {a.submittedWards}/{a.totalWards} wards · {new Date(a.archivedAt).toLocaleString()}</div></div>
                  <span className="badge badge-active" style={{flexShrink:0}}>✅ Archived</span>
                </div>
                <div className="archive-note">
                  <div style={{fontSize:10,fontWeight:700,color:"var(--warning)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>Overall Nurse Note</div>
                  {a.overallNote}
                </div>
                {a.wardReports?.length > 0 && (
                  <details style={{marginTop:10}}>
                    <summary style={{fontSize:12,color:"var(--t2)",cursor:"pointer",padding:"4px 0"}}>📋 View {a.wardReports.length} ward reports</summary>
                    <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:8}}>
                      {a.wardReports.map(r=>(
                        <div key={r.id} style={{background:"var(--bg3)",borderRadius:"var(--r-sm)",padding:"10px 12px",borderLeft:`3px solid ${shiftColor(r.shift)}`}}>
                          <div style={{fontWeight:700,fontSize:12,marginBottom:1}}>{r.ward}</div>
                          <div style={{fontSize:11,color:"var(--t2)",marginBottom:5}}>{shiftIcon(r.shift)} {r.shift} · {r.nurse}</div>
                          <div style={{fontSize:12,whiteSpace:"pre-wrap",lineHeight:1.55}}>{r.report}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// ─── WARD 24HR REPORT (Ward Nurse view) ──────────────────────────────────────
function WardReportSection({ user, wardReports, onSave, showToast }) {
  const myWard = user.ward || "";
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState(SHIFTS[0]);
  const [report, setReport] = useState("");
  const [saving, setSaving] = useState(false);
  const STAT_FIELDS = [
    { key:"beds", label:"Beds" },
    { key:"occ",  label:"OCC" },
    { key:"vac",  label:"VAC" },
    { key:"adm",  label:"ADM" },
    { key:"disch",label:"Disch" },
    { key:"dama", label:"DAMA" },
    { key:"transferInt", label:"Transfer INT" },
    { key:"transferOut", label:"Transfer OUT" },
    { key:"transferExt", label:"Transfer EXT" },
    { key:"sc",   label:"S/C" },
    { key:"usic", label:"USIC" },
    { key:"absc", label:"ABSC" },
    { key:"bd",   label:"B/D" },
  ];
  const emptyStats = () => STAT_FIELDS.reduce((o,f) => ({ ...o, [f.key]:"" }), {});
  const [stats, setStats] = useState(emptyStats());
  const setStat = (k, v) => setStats(s => ({ ...s, [k]: v }));

  const existing = wardReports.find(r => r.ward === myWard && r.date === date && r.shift === shift);

  useEffect(() => {
    if (existing) {
      setReport(existing.report || "");
      setStats(STAT_FIELDS.reduce((o,f) => ({ ...o, [f.key]: existing[f.key] ?? "" }), {}));
    } else {
      setReport("");
      setStats(emptyStats());
    }
  }, [existing?.id, date, shift]);

  const handleSave = async () => {
    if (!report.trim()) { showToast("Report content is required.", "error"); return; }
    setSaving(true);
    try {
      const data = {
        id: existing?.id || ("WR-" + Math.random().toString(36).slice(2,10)),
        ward: myWard, date, shift,
        report: report.trim(),
        nurse: user.name,
        nurseId: user.uid,
        submittedAt: new Date().toISOString(),
        ...stats,
      };
      await FB.saveWardReport(data);
      showToast("Ward report saved successfully.");
    } catch(e) { showToast("Error: " + e.message, "error"); }
    setSaving(false);
  };

  const myHistory = wardReports.filter(r => r.ward === myWard).slice(0, 20);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
      <div className="section-title">📝 Ward Shift Report</div>
      <div className="section-sub">{myWard || "No ward assigned"} · Write your shift report below</div>

      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <div className="form-row" style={{ marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Shift</label>
            <select className="form-select" value={shift} onChange={e => setShift(e.target.value)}>
              {SHIFTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {existing && (
          <div style={{ fontSize: 11, color: "var(--success)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <span>✅</span> Report already submitted for this shift — editing will update it.
          </div>
        )}

        {/* Ward statistics — matches the docx table columns */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>Ward Statistics (for 24hr Report Table)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 7 }}>
            {STAT_FIELDS.map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 9, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", display: "block", marginBottom: 2 }}>{f.label}</label>
                <input className="form-input" type="number" min="0" value={stats[f.key]} onChange={e => setStat(f.key, e.target.value)}
                  placeholder="—" style={{ padding: "5px 7px", textAlign: "center", fontSize: 12 }} />
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Shift Report *</label>
          <textarea
            className="form-textarea"
            style={{ minHeight: 160 }}
            value={report}
            onChange={e => setReport(e.target.value)}
            placeholder={`Write your ${shift} report for ${myWard}…\n\nInclude: patient status updates, incidents, medications given, observations, handover notes…`}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setReport("")}>🗑️ Clear</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : existing ? "✏️ Update Report" : "💾 Submit Report"}
          </button>
        </div>
      </div>

      {myHistory.length > 0 && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "var(--t2)" }}>📚 My Past Reports</div>
          {myHistory.map(r => (
            <div key={r.id} className="ward-report-card submitted">
              <div className="ward-report-header">
                <div>
                  <div className="ward-report-name">{r.shift}</div>
                  <div className="ward-report-meta">{r.date} · {r.nurse}</div>
                </div>
                <span className="badge badge-active">Submitted</span>
              </div>
              <div className="ward-report-body">{r.report}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── SUPERVISOR 24HR COLLATION ────────────────────────────────────────────────
function SupervisorCollationSection({ user, wardReports, archives, showToast }) {
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState("All Shifts");
  const [supervisorNote, setSupervisorNote] = useState("");
  const [archiveTab, setArchiveTab] = useState("collation");
  const [saving, setSaving] = useState(false);

  const shiftOptions = ["All Shifts", ...SHIFTS];

  // filter reports by date (and optionally shift)
  const filtered = wardReports.filter(r => {
    const dateMatch = r.date === date;
    const shiftMatch = shift === "All Shifts" || r.shift === shift;
    return dateMatch && shiftMatch;
  });

  // build ward status: which wards submitted vs missing
  const submittedWards = new Set(filtered.map(r => r.ward));
  const missingWards = WARDS.filter(w => !submittedWards.has(w));

  const handleArchive = async () => {
    if (!supervisorNote.trim()) { showToast("Please write a supervisor note before archiving.", "error"); return; }
    setSaving(true);
    try {
      const archiveData = {
        id: "AR-" + Math.random().toString(36).slice(2,10),
        date, shift,
        supervisorName: user.name,
        supervisorId: user.uid,
        supervisorNote: supervisorNote.trim(),
        wardReports: filtered,
        totalWards: WARDS.length,
        submittedWards: filtered.length,
        missingWards: missingWards,
        archivedAt: new Date().toISOString(),
      };
      await FB.save24hrArchive(archiveData);
      showToast("Shift collation archived successfully. ✅");
      setSupervisorNote("");
    } catch(e) { showToast("Error: " + e.message, "error"); }
    setSaving(false);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div className="section-title">👑 24-Hour Ward Collation</div>
          <div className="section-sub">Review all ward reports and archive at end of shift</div>
        </div>
        <div className="tabs-bar" style={{ marginBottom: 0 }}>
          <button className={`tab-btn ${archiveTab === "collation" ? "active" : ""}`} onClick={() => setArchiveTab("collation")}>📋 Collation</button>
          <button className={`tab-btn ${archiveTab === "archive" ? "active" : ""}`} onClick={() => setArchiveTab("archive")}>🗄️ Archive</button>
        </div>
      </div>

      {archiveTab === "collation" && (
        <>
          {/* Filters */}
          <div className="card" style={{ padding: 14, marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
              <label className="form-label">Shift Filter</label>
              <select className="form-select" value={shift} onChange={e => setShift(e.target.value)}>
                {shiftOptions.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Summary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 9, marginBottom: 16 }}>
            {[
              ["Total Wards", WARDS.length, "🏥"],
              ["Submitted", filtered.length, "✅"],
              ["Missing", missingWards.length, "⚠️"],
            ].map(([l, v, icon]) => (
              <div key={l} className="stat-card">
                <div className="stat-icon">{icon}</div>
                <div className="stat-label">{l}</div>
                <div className="stat-value">{v}</div>
              </div>
            ))}
          </div>

          {/* Missing wards alert */}
          {missingWards.length > 0 && (
            <div style={{ background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.25)", borderRadius: "var(--r)", padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "var(--warning)" }}>
              ⚠️ <strong>Missing reports:</strong> {missingWards.map(w => w.split("–")[0].trim()).join(", ")}
            </div>
          )}

          {/* Ward reports grid */}
          {filtered.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.3 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t2)", marginBottom: 4 }}>No ward reports yet</div>
              <div style={{ fontSize: 12 }}>Ward nurses have not submitted reports for {date}</div>
            </div>
          ) : (
            <div className="collation-grid">
              {filtered.map(r => (
                <div key={r.id} className="ward-report-card submitted">
                  <div className="ward-report-header">
                    <div>
                      <div className="ward-report-name">{r.ward}</div>
                      <div className="ward-report-meta">{r.shift} · {r.nurse} · {r.date}</div>
                    </div>
                    <span className="badge badge-active">✅ Submitted</span>
                  </div>
                  <div className="ward-report-body">{r.report}</div>
                </div>
              ))}
              {missingWards.map(w => (
                <div key={w} className="ward-report-card missing">
                  <div className="ward-report-header">
                    <div>
                      <div className="ward-report-name">{w}</div>
                      <div className="ward-report-meta">No report submitted</div>
                    </div>
                    <span className="badge badge-held">⏳ Pending</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--t3)", fontStyle: "italic", marginTop: 8 }}>Ward nurse has not submitted a report for this shift.</div>
                </div>
              ))}
            </div>
          )}

          {/* Supervisor note & archive */}
          <div className="supervisor-note-box">
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: "var(--accent)" }}>👑 Supervisor Review Note</div>
            <div style={{ fontSize: 11, color: "var(--t2)", marginBottom: 10 }}>
              Write your end-of-shift note covering overall ward performance, key observations, and satisfaction status.
            </div>
            <textarea
              className="form-textarea"
              style={{ minHeight: 120, marginBottom: 10 }}
              value={supervisorNote}
              onChange={e => setSupervisorNote(e.target.value)}
              placeholder="e.g. All wards performed satisfactorily during the morning shift. Ward F ICU reported one critical patient stabilised. Ward G Maternity had 2 deliveries. Overall shift handover was smooth. No major incidents recorded…"
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={handleArchive} disabled={saving || filtered.length === 0}>
                {saving ? "Archiving…" : "🗄️ Save to Archive"}
              </button>
            </div>
          </div>
        </>
      )}

      {archiveTab === "archive" && (
        <>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "var(--t2)" }}>
            🗄️ Archived Shift Reports ({archives.length})
          </div>
          {archives.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.3 }}>🗄️</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t2)", marginBottom: 4 }}>No archives yet</div>
              <div style={{ fontSize: 12 }}>Archived collations will appear here after you save them.</div>
            </div>
          ) : archives.map(a => (
            <div key={a.id} className="archive-card">
              <div className="archive-header">
                <div>
                  <div className="archive-title">📅 {a.date} — {a.shift}</div>
                  <div className="archive-meta">
                    Archived by {a.supervisorName} · {a.submittedWards} of {a.totalWards} wards reported
                    {a.missingWards?.length > 0 && <span style={{ color: "var(--warning)" }}> · Missing: {a.missingWards.map(w => w.split("–")[0].trim()).join(", ")}</span>}
                  </div>
                </div>
                <span className="badge badge-active" style={{ flexShrink: 0 }}>✅ Archived</span>
              </div>
              <div className="archive-note">
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 5 }}>Supervisor Note</div>
                {a.supervisorNote}
              </div>
              {a.wardReports?.length > 0 && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ fontSize: 12, color: "var(--t2)", cursor: "pointer", padding: "4px 0" }}>
                    📋 View {a.wardReports.length} ward reports
                  </summary>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    {a.wardReports.map(r => (
                      <div key={r.id} style={{ background: "var(--bg3)", borderRadius: "var(--r-sm)", padding: "10px 12px" }}>
                        <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{r.ward}</div>
                        <div style={{ fontSize: 11, color: "var(--t2)", marginBottom: 6 }}>{r.shift} · {r.nurse}</div>
                        <div style={{ fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{r.report}</div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function MainApp({ user, onLogout }) {
  const [patients, setPatients] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("active");
  const [section, setSection] = useState("patients");
  const [overallNurse, setOverallNurse] = useState(null);       // { name, uid } | null
  const [allUsers, setAllUsers] = useState([]);
  const [wardReports, setWardReports] = useState([]);
  const [archives, setArchives] = useState([]);
  const [theme, setTheme] = useState("light"); // "light" | "dim" | "dark"
  const cycleTheme = () => setTheme(t => t === "light" ? "dim" : t === "dim" ? "dark" : "light");
  const [loading, setLoading] = useState(true);
  const [modals, setModals] = useState({});
  const [notifOpen, setNotifOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toastState, showToast] = useToast();
  const { notifs, unread, markRead } = useNotifications(patients);
  const openM = (m) => setModals(x => ({ ...x, [m]: true }));
  const closeM = (m) => setModals(x => ({ ...x, [m]: false }));

  useEffect(() => {
    const unsubPt = FB.onPatients(pts => { setPatients(pts); setLoading(false); });
    const unsubNurse = FB.onSettings("overallNurse", d => setOverallNurse(d?.name ? { name: d.name, uid: d.uid || null } : null));
    const unsubWR = FB.onWardReports(setWardReports);
    const unsubAR = FB.on24hrArchives(setArchives);
    FB.getUsers().then(setAllUsers).catch(() => {});
    return () => { unsubPt(); unsubNurse(); unsubWR(); unsubAR(); };
  }, []);

  const filtered = patients.filter(p => {
    if (filter === "active") return (p.status || "active") === "active";
    if (filter === "discharged") return p.status === "discharged";
    return true;
  });
  const selected = patients.find(p => p.id === selectedId) || null;
  const roleLabel = user.role === "wardmaster" ? "Ward Master" : user.role === "supervisor" ? "Supervisor" : "Ward Nurse";
  // true when the currently logged-in user is the assigned overall nurse of the day
  const isOverallNurse = !!(overallNurse?.uid && overallNurse.uid === user.uid);

  const handleAddPatient = async (data) => {
    const patient = {
      id: "PT-" + uid(), status: "active", createdAt: new Date().toISOString(),
      vitals: [], medAdminLogs: [], glucoseReadings: [], fluidEntries: [],
      prescriptions: [], nursingReports: [], statusHistory: [], transfusions: [],
      woundRecords: [], labResults: [], doctorOrders: [], ...data,
    };
    try { await FB.savePatient(patient); setSelectedId(patient.id); showToast("Patient added."); }
    catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const handleUpdatePatient = (updated) => {
    setPatients(ps => ps.map(p => p.id === updated.id ? updated : p));
  };

  const handleSelectPatient = (id) => { setSelectedId(id); setSection("patients"); };

  return (
    <div className={`app${theme === "dim" ? " theme-dim" : theme === "dark" ? " theme-dark" : ""}`}>
      <style>{css}</style>
      <Toast msg={toastState.msg} type={toastState.type} />
      <NotifPanel open={notifOpen} notifs={notifs} unread={unread} onMarkRead={markRead} onClose={() => setNotifOpen(false)} onSelectPatient={handleSelectPatient} />

      {/* Sidebar */}
      <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      <nav className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sb-logo">
          <div className="sb-logo-mark">
            <div className="sb-icon">⚕️</div>
            <div><div className="sb-name">MedRecord</div><div className="sb-sub">EMR System</div></div>
          </div>
        </div>
        <div className="sb-user">
          <div className="sb-avatar">{(user.name || "N").charAt(0).toUpperCase()}</div>
          <div><div className="sb-uname">{user.name}</div><div className="sb-urole">{roleLabel}</div></div>
        </div>
        <div className="sb-nav">
          <div className="nav-section">Clinical</div>
          <button className={`nav-btn ${section === "patients" ? "active" : ""}`} onClick={() => { setSection("patients"); setSidebarOpen(false); }}><span className="ni">🏥</span>Patients</button>
          {(user.role === "supervisor" || user.role === "wardmaster") && <button className={`nav-btn ${section === "overview" ? "active" : ""}`} onClick={() => { setSection("overview"); setSidebarOpen(false); }}><span className="ni">🗺️</span>Ward Overview</button>}
          {(user.role === "supervisor" || user.role === "wardmaster") && <button className={`nav-btn ${section === "reports" ? "active" : ""}`} onClick={() => { setSection("reports"); setSidebarOpen(false); }}><span className="ni">📊</span>Reports</button>}
          {user.role === "nurse" && <button className={`nav-btn ${section === "wardreport" ? "active" : ""}`} onClick={() => { setSection("wardreport"); setSidebarOpen(false); }}><span className="ni">📝</span>Ward Report</button>}
          {isOverallNurse && (
            <button className={`nav-btn ${section === "allwardsreport" ? "active" : ""}`} onClick={() => { setSection("allwardsreport"); setSidebarOpen(false); }} style={{ color: "var(--warning)" }}>
              <span className="ni">📋</span>24hr Nurses Report
              <span style={{ marginLeft: "auto", background: "var(--warning)", color: "#000", fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "1px 5px" }}>ALL</span>
            </button>
          )}
          {(user.role === "supervisor" || user.role === "wardmaster") && <button className={`nav-btn ${section === "collation" ? "active" : ""}`} onClick={() => { setSection("collation"); setSidebarOpen(false); }}><span className="ni">👑</span>24hr Collation</button>}
          <button className="nav-btn" onClick={() => openM("overallNurse")}><span className="ni">👑</span>Overall Nurse</button>
          {(user.role === "nurse" || user.role === "supervisor" || user.role === "wardmaster") && (
            <button className={`nav-btn ${section === "triage" ? "active" : ""}`} onClick={() => { setSection("triage"); setSidebarOpen(false); }}><span className="ni">🚨</span>Patient Triage</button>
          )}
          {(user.role === "nurse" || user.role === "supervisor" || user.role === "wardmaster") && (
            <button className={`nav-btn ${section === "careplans" ? "active" : ""}`} onClick={() => { setSection("careplans"); setSidebarOpen(false); }}><span className="ni">📋</span>Nursing Care Plan</button>
          )}
          {(user.role === "nurse" || user.role === "supervisor" || user.role === "wardmaster") && (
            <button className={`nav-btn ${section === "sendphysician" ? "active" : ""}`} onClick={() => { setSection("sendphysician"); setSidebarOpen(false); }} style={{ color: "var(--purple)" }}><span className="ni">↗️</span>Send to Physician</button>
          )}
          <div className="nav-section">AI Tools</div>
          <button className="nav-btn" onClick={() => openM("aiChat")} style={{ color: "var(--purple)" }}><span className="ni">🤖</span>Ask Claude AI</button>
          <div className="nav-section">Settings</div>
          {(user.role === "supervisor" || user.role === "wardmaster") && <button className="nav-btn" onClick={() => openM("userMgmt")}><span className="ni">👥</span>User Management</button>}
          <button className="nav-btn" onClick={cycleTheme}>
            <span className="ni">{theme === "light" ? "🌙" : theme === "dim" ? "⬛" : "☀️"}</span>
            {theme === "light" ? "Dim Blue" : theme === "dim" ? "Black Dark" : "Light Mode"}
          </button>
          <button className="nav-btn" onClick={onLogout} style={{ color: "var(--danger)" }}><span className="ni">🚪</span>Logout</button>
        </div>
        {overallNurse && (
          <div className="sb-footer">
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 6px var(--success)", animation: "pulse 2s infinite" }} />
              <span style={{ fontWeight: 600, color: "var(--success)" }}>{overallNurse?.name}</span>
              <span style={{ color: "var(--t3)" }}>on duty</span>
            </div>
          </div>
        )}
      </nav>

      {/* Main */}
      <div className={`main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(o => !o)}>☰</button>
          <div style={{ flexShrink: 0 }}>
            <div className="tb-title">{section === "overview" ? "Ward Overview" : section === "reports" ? "Reports" : section === "wardreport" ? "Ward Report" : section === "collation" ? "24hr Collation" : section === "allwardsreport" ? "24hr Nurses Report" : "Patients"}</div>
            <div className="tb-sub">
              {section === "patients" ? `${filtered.length} ${filter} patient${filtered.length !== 1 ? "s" : ""}` : section === "overview" ? `${patients.filter(p => (p.status || "active") === "active").length} active` : section === "wardreport" ? (user.ward || "No ward") : section === "collation" ? `${wardReports.filter(r => r.date === new Date().toISOString().split("T")[0]).length} reports today` : section === "allwardsreport" ? `${WARDS.length} wards · Overall Nurse view` : `${patients.length} total`}
            </div>
          </div>
          <GlobalSearch patients={patients} onSelect={handleSelectPatient} />
          <div className="tb-right">
            <span className="badge-live"><span className="badge-dot" />Live</span>
            <button className="btn btn-ghost btn-sm" style={{ position: "relative" }} onClick={() => { setNotifOpen(o => !o); markRead(); }}>
              🔔{unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "var(--danger)", color: "#fff", fontSize: 9, width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{unread}</span>}
            </button>
          </div>
        </div>

        <div className="content">
          {section === "overview" && <WardOverview patients={patients} onSelectPatient={handleSelectPatient} />}
          {section === "reports" && <ReportsSection patients={patients} user={user} />}
          {section === "wardreport" && <WardReportSection user={user} wardReports={wardReports} showToast={showToast} />}
          {section === "allwardsreport" && <AllWardsReportSection wardReports={wardReports} archives={archives} user={user} showToast={showToast} />}
          {section === "collation" && <SupervisorCollationSection user={user} wardReports={wardReports} archives={archives} showToast={showToast} />}
          {section === "triage" && <NurseTriageSection patients={patients} user={user} showToast={showToast} onRefresh={(updated)=>setPatients(ps=>ps.map(p=>p.id===updated.id?updated:p))} />}
          {section === "careplans" && <NurseCarePlanSection patients={patients} user={user} showToast={showToast} onRefresh={(updated)=>setPatients(ps=>ps.map(p=>p.id===updated.id?updated:p))} />}
          {section === "sendphysician" && <SendToPhysicianSection patients={patients} user={user} showToast={showToast} onRefresh={(updated)=>setPatients(ps=>ps.map(p=>p.id===updated.id?updated:p))} />}
          {section === "patients" && <>
            <div className={`pt-panel ${selected ? "hidden" : ""}`}>
              <div className="pt-panel-header">
                <div className="pt-panel-title">Patient List</div>
                <div className="filter-tabs">
                  {[["active", "Active"], ["all", "All"], ["discharged", "D/C"]].map(([f, l]) => (
                    <button key={f} className={`filter-tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{l}</button>
                  ))}
                </div>
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 12, marginTop: 4 }} onClick={() => openM("addPatient")}>+ Add New Patient</button>
              </div>
              <div className="pt-list">
                {loading
                  ? <div style={{ textAlign: "center", padding: 20, color: "var(--t3)" }}>Loading patients…</div>
                  : filtered.length === 0
                    ? <div style={{ textAlign: "center", padding: "26px 10px", color: "var(--t3)", fontSize: 12 }}><div style={{ fontSize: 22, marginBottom: 5, opacity: 0.3 }}>📋</div>{filter === "active" ? "No active patients." : "No patients found."}</div>
                    : filtered.map(p => {
                      const hasCritical = checkVitalAlerts(p.vitals?.[0] || {}).some(a => a.level === "critical");
                      return (
                        <div key={p.id} className={`pt-card ${selectedId === p.id ? "active" : ""}`} onClick={() => setSelectedId(p.id)}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div className="pt-name">{p.name}</div>
                            {hasCritical && <span style={{ fontSize: 12, color: "var(--danger)" }}>⚠️</span>}
                          </div>
                          <div className="pt-meta">
                            <span>{p.ward?.split("–")[0]?.trim() || "—"}</span>
                            <span className={`badge badge-${p.status || "active"}`}>{p.status || "Active"}</span>
                          </div>
                          <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>EMR: {p.emr || "—"} · {p.diagnosis || "No diagnosis"}</div>
                        </div>
                      );
                    })}
              </div>
            </div>
            {selected
              ? <><button onClick={() => setSelectedId(null)} className="mobile-back-btn">← Back to list</button><PatientDetail key={selected.id} patient={selected} user={user} onUpdate={handleUpdatePatient} toast={showToast} /></>
              : <div className="pt-detail"><div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">No Patient Selected</div><div className="empty-sub">Select a patient from the list or add a new one.</div></div></div>}
          </>}
        </div>
      </div>

      <AddPatientModal open={!!modals.addPatient} onClose={() => closeM("addPatient")} onSave={handleAddPatient} user={user} />
      <OverallNurseModal open={!!modals.overallNurse} onClose={() => closeM("overallNurse")} users={allUsers} overallNurse={overallNurse?.name || null}
        onAssign={async ({ name, uid }) => { await FB.saveSettings("overallNurse", { name, uid }); showToast(name + " assigned as Overall Nurse."); closeM("overallNurse"); }}
        onEnd={async () => { await FB.saveSettings("overallNurse", { name: null, uid: null }); showToast("Shift ended."); closeM("overallNurse"); }} />
      <UserMgmtModal open={!!modals.userMgmt} onClose={() => closeM("userMgmt")} users={allUsers} currentUser={user} />
      <AIChatModal open={!!modals.aiChat} onClose={() => closeM("aiChat")} />
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const adminCss = `
@import url('https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&display=swap');
.adm-root *{box-sizing:border-box;margin:0;padding:0}
.adm-root{
  font-family:"Times New Roman",Times,serif;
  font-weight:700;
  background:#f0f4ff;
  color:#0a1628;
  min-height:100vh;
  display:flex;
}
.adm-root ::-webkit-scrollbar{width:6px}
.adm-root ::-webkit-scrollbar-track{background:#e8edf5}
.adm-root ::-webkit-scrollbar-thumb{background:#1e3a6e;border-radius:3px}

/* ── SIDEBAR ── */
.adm-sidebar{
  width:240px;min-height:100vh;
  background:linear-gradient(180deg,#0d2b6b 0%,#0a1f52 40%,#061440 100%);
  border-right:3px solid #1a3a7c;
  display:flex;flex-direction:column;
  position:fixed;top:0;left:0;bottom:0;z-index:100;overflow-y:auto;
}
.adm-logo-area{
  padding:22px 18px 18px;
  border-bottom:1px solid rgba(255,255,255,0.12);
  text-align:center;
}
.adm-logo-shield{
  width:54px;height:54px;
  background:linear-gradient(135deg,#c8a84b,#f0d070,#c8a84b);
  border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:26px;margin:0 auto 10px;
  box-shadow:0 0 18px rgba(200,168,75,0.5);
  border:2px solid #f0d070;
}
.adm-logo-name{
  font-family:"Times New Roman",Times,serif;
  font-size:17px;font-weight:900;
  color:#f0d070;letter-spacing:.5px;
  text-shadow:0 1px 4px rgba(0,0,0,0.5);
}
.adm-logo-sub{
  font-size:10px;color:rgba(200,168,75,0.7);
  letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;
}
.adm-user-strip{
  padding:12px 16px;
  border-bottom:1px solid rgba(255,255,255,0.10);
  display:flex;align-items:center;gap:10px;
}
.adm-user-circle{
  width:36px;height:36px;border-radius:50%;
  background:linear-gradient(135deg,#c8a84b,#f0d070);
  display:flex;align-items:center;justify-content:center;
  font-size:16px;font-weight:900;color:#0a1628;flex-shrink:0;
  border:2px solid rgba(240,208,112,0.5);
}
.adm-user-name{font-size:12px;font-weight:900;color:#ffffff;font-family:"Times New Roman",serif;}
.adm-user-title{font-size:10px;color:#c8a84b;font-weight:700;letter-spacing:.5px;}
.adm-nav-area{flex:1;padding:12px 8px}
.adm-nav-section{
  font-size:9px;font-weight:900;color:rgba(200,168,75,0.6);
  text-transform:uppercase;letter-spacing:1.5px;
  padding:12px 10px 5px;font-family:"Times New Roman",serif;
}
.adm-nav-btn{
  display:flex;align-items:center;gap:10px;
  width:100%;padding:9px 12px;
  border:none;border-radius:8px;
  background:none;
  color:rgba(255,255,255,0.65);
  font-size:13px;font-weight:700;
  font-family:"Times New Roman",Times,serif;
  cursor:pointer;transition:all .15s;
  margin-bottom:2px;text-align:left;
}
.adm-nav-btn:hover{background:rgba(200,168,75,0.12);color:#fff;}
.adm-nav-btn.active{
  background:linear-gradient(135deg,rgba(200,168,75,0.22),rgba(240,208,112,0.10));
  color:#f0d070;
  border:1px solid rgba(200,168,75,0.35);
}
.adm-nav-btn .adm-ni{font-size:16px;width:20px;text-align:center;flex-shrink:0;}
.adm-nav-count{
  margin-left:auto;
  background:rgba(200,168,75,0.25);
  color:#f0d070;font-size:10px;font-weight:900;
  padding:1px 7px;border-radius:10px;
}
.adm-nav-btn.danger-btn{color:rgba(255,120,120,0.7);}
.adm-nav-btn.danger-btn:hover{color:#ff8080;background:rgba(255,80,80,0.10);}
.adm-sidebar-footer{
  padding:12px 16px;
  border-top:1px solid rgba(255,255,255,0.10);
  font-size:10px;color:rgba(255,255,255,0.3);
  text-align:center;font-family:"Times New Roman",serif;
}

/* ── MAIN AREA ── */
.adm-main{
  flex:1;margin-left:240px;
  display:flex;flex-direction:column;min-height:100vh;
  background:#f0f4ff;
}
.adm-topbar{
  height:60px;
  background:#ffffff;
  border-bottom:2px solid #c8d8f8;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 28px;
  position:sticky;top:0;z-index:50;
  box-shadow:0 2px 12px rgba(13,43,107,0.08);
}
.adm-topbar-left{}
.adm-topbar-title{
  font-family:"Times New Roman",Times,serif;
  font-size:20px;font-weight:900;
  color:#0d2b6b;letter-spacing:-.2px;
}
.adm-topbar-sub{font-size:11px;color:#4a6699;font-weight:700;margin-top:1px;font-family:"Times New Roman",serif;}
.adm-topbar-right{display:flex;align-items:center;gap:12px;}
.adm-live-badge{
  display:inline-flex;align-items:center;gap:5px;
  padding:4px 12px;border-radius:20px;
  background:rgba(16,185,129,0.1);
  border:1px solid rgba(16,185,129,0.3);
  color:#065f46;font-size:11px;font-weight:900;
  font-family:"Times New Roman",serif;
}
.adm-live-dot{width:7px;height:7px;border-radius:50%;background:#10b981;animation:admPulse 2s infinite;}
@keyframes admPulse{0%,100%{opacity:1}50%{opacity:.35}}
.adm-topbar-email{font-size:11px;color:#4a6699;font-weight:700;font-family:"Times New Roman",serif;}
.adm-content{flex:1;padding:28px;overflow-y:auto;}

/* ── STAT CARDS ── */
.adm-stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:24px;}
.adm-stat-card{
  background:#ffffff;
  border:1px solid #c8d8f8;
  border-top:4px solid #0d2b6b;
  border-radius:12px;
  padding:20px 22px;
  box-shadow:0 2px 12px rgba(13,43,107,0.06);
  position:relative;overflow:hidden;
}
.adm-stat-card::after{
  content:"";position:absolute;bottom:-20px;right:-20px;
  width:80px;height:80px;border-radius:50%;
  background:rgba(13,43,107,0.04);
}
.adm-stat-icon{font-size:28px;margin-bottom:8px;}
.adm-stat-val{
  font-size:32px;font-weight:900;color:#0d2b6b;
  font-family:"Times New Roman",Times,serif;
  letter-spacing:-1px;
}
.adm-stat-label{font-size:12px;font-weight:700;color:#4a6699;margin-top:3px;font-family:"Times New Roman",serif;}
.adm-stat-note{font-size:10px;color:#8aa0cc;font-weight:700;margin-top:6px;font-family:"Times New Roman",serif;}

/* ── CARDS ── */
.adm-card{
  background:#ffffff;
  border:1px solid #c8d8f8;
  border-radius:12px;
  overflow:hidden;
  margin-bottom:20px;
  box-shadow:0 2px 10px rgba(13,43,107,0.05);
}
.adm-card-hdr{
  padding:14px 20px;
  border-bottom:2px solid #e8edf8;
  background:linear-gradient(135deg,#f7f9ff,#ffffff);
  display:flex;align-items:center;justify-content:space-between;
}
.adm-card-title{
  font-size:14px;font-weight:900;color:#0d2b6b;
  font-family:"Times New Roman",Times,serif;
}
.adm-card-body{padding:20px;}

/* ── TABLE ── */
.adm-table{width:100%;border-collapse:collapse;}
.adm-table th{
  font-size:11px;font-weight:900;color:#0d2b6b;
  text-transform:uppercase;letter-spacing:.8px;
  padding:10px 16px;border-bottom:2px solid #c8d8f8;
  background:#f5f8ff;text-align:left;
  font-family:"Times New Roman",Times,serif;
}
.adm-table td{
  padding:11px 16px;border-bottom:1px solid #eef2fa;
  font-size:13px;color:#1a2e5a;font-weight:700;
  font-family:"Times New Roman",Times,serif;
  vertical-align:middle;
}
.adm-table tr:last-child td{border-bottom:none;}
.adm-table tr:hover td{background:#f5f8ff;}

/* ── BADGES ── */
.adm-badge{
  display:inline-flex;align-items:center;
  padding:3px 10px;border-radius:20px;
  font-size:11px;font-weight:900;
  font-family:"Times New Roman",serif;
}
.adm-badge-navy{background:rgba(13,43,107,0.1);color:#0d2b6b;border:1px solid rgba(13,43,107,0.2);}
.adm-badge-green{background:rgba(16,185,129,0.1);color:#065f46;border:1px solid rgba(16,185,129,0.25);}
.adm-badge-red{background:rgba(220,38,38,0.1);color:#991b1b;border:1px solid rgba(220,38,38,0.2);}
.adm-badge-amber{background:rgba(180,130,0,0.1);color:#92400e;border:1px solid rgba(180,130,0,0.25);}
.adm-badge-gold{background:linear-gradient(135deg,rgba(200,168,75,0.2),rgba(240,208,112,0.15));color:#92400e;border:1px solid rgba(200,168,75,0.4);}

/* ── BUTTONS ── */
.adm-btn{
  display:inline-flex;align-items:center;gap:6px;
  padding:8px 16px;border-radius:8px;border:none;
  font-size:13px;font-weight:900;cursor:pointer;
  transition:all .15s;white-space:nowrap;
  font-family:"Times New Roman",Times,serif;
}
.adm-btn-navy{background:#0d2b6b;color:#ffffff;}
.adm-btn-navy:hover{background:#0a1f52;}
.adm-btn-red{background:rgba(220,38,38,0.1);color:#991b1b;border:1px solid rgba(220,38,38,0.25);}
.adm-btn-red:hover{background:rgba(220,38,38,0.2);}
.adm-btn-ghost{background:#f0f4ff;color:#1a2e5a;border:1px solid #c8d8f8;}
.adm-btn-ghost:hover{background:#e8edf8;}
.adm-btn-sm{padding:4px 10px;font-size:11px;}
.adm-btn:disabled{opacity:.5;cursor:wait;}

/* ── FORMS ── */
.adm-form-group{margin-bottom:15px;}
.adm-label{
  display:block;font-size:11px;font-weight:900;
  color:#0d2b6b;text-transform:uppercase;
  letter-spacing:.6px;margin-bottom:5px;
  font-family:"Times New Roman",serif;
}
.adm-input,.adm-select,.adm-textarea{
  width:100%;padding:9px 13px;
  background:#f7f9ff;border:1.5px solid #c8d8f8;
  border-radius:8px;color:#0a1628;
  font-size:13px;font-weight:700;outline:none;
  font-family:"Times New Roman",Times,serif;
  transition:border-color .15s;
}
.adm-input:focus,.adm-select:focus,.adm-textarea:focus{border-color:#0d2b6b;}
.adm-input::placeholder,.adm-textarea::placeholder{color:#8aa0cc;font-weight:400;}
.adm-select option{background:#fff;}
.adm-textarea{resize:vertical;min-height:90px;}
.adm-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}

/* ── MODAL ── */
.adm-overlay{
  position:fixed;inset:0;background:rgba(10,22,40,0.6);
  z-index:999;display:flex;align-items:center;justify-content:center;padding:20px;
  backdrop-filter:blur(2px);
}
.adm-modal{
  background:#fff;border:2px solid #c8d8f8;
  border-radius:14px;width:100%;max-width:520px;
  max-height:90vh;overflow-y:auto;
  box-shadow:0 20px 60px rgba(13,43,107,0.2);
}
.adm-modal-hdr{
  padding:18px 22px;border-bottom:2px solid #e8edf8;
  display:flex;align-items:center;justify-content:space-between;
  background:linear-gradient(135deg,#f5f8ff,#fff);
}
.adm-modal-title{font-size:15px;font-weight:900;color:#0d2b6b;font-family:"Times New Roman",serif;}
.adm-modal-close{background:none;border:none;color:#4a6699;font-size:20px;cursor:pointer;line-height:1;}
.adm-modal-body{padding:22px;}
.adm-modal-foot{padding:14px 22px;border-top:2px solid #e8edf8;display:flex;gap:10px;justify-content:flex-end;}

/* ── MISC ── */
.adm-section-hdr{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;gap:16px;}
.adm-section-title{font-size:22px;font-weight:900;color:#0d2b6b;font-family:"Times New Roman",Times,serif;letter-spacing:-.3px;}
.adm-section-sub{font-size:12px;color:#4a6699;font-weight:700;margin-top:3px;font-family:"Times New Roman",serif;}
.adm-search-bar{display:flex;align-items:center;gap:8px;background:#f7f9ff;border:1.5px solid #c8d8f8;border-radius:8px;padding:7px 13px;min-width:220px;}
.adm-search-bar input{background:none;border:none;outline:none;color:#0a1628;font-size:12px;font-weight:700;width:100%;font-family:"Times New Roman",serif;}
.adm-search-bar input::placeholder{color:#8aa0cc;font-weight:400;}
.adm-progress-wrap{height:7px;background:#e8edf8;border-radius:4px;overflow:hidden;margin-top:7px;}
.adm-progress-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#0d2b6b,#2a5bd7);}
.adm-divider{height:2px;background:#e8edf8;margin:14px 0;}
.adm-empty-state{text-align:center;padding:40px;color:#8aa0cc;}
.adm-empty-icon{font-size:40px;opacity:.25;margin-bottom:10px;}
.adm-empty-text{font-size:14px;font-weight:700;color:#4a6699;font-family:"Times New Roman",serif;}
.adm-ann-item{background:#f7f9ff;border:1px solid #c8d8f8;border-left:4px solid #0d2b6b;border-radius:8px;padding:14px 16px;margin-bottom:10px;}
.adm-ann-title{font-size:14px;font-weight:900;color:#0d2b6b;margin-bottom:4px;font-family:"Times New Roman",serif;}
.adm-ann-body{font-size:13px;color:#1a2e5a;line-height:1.6;font-weight:700;}
.adm-ann-meta{font-size:11px;color:#4a6699;margin-top:8px;display:flex;gap:12px;flex-wrap:wrap;font-weight:700;}
.adm-log-row{display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-bottom:1px solid #eef2fa;}
.adm-log-row:last-child{border-bottom:none;}
.adm-log-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;margin-top:3px;}
.adm-log-action{font-size:12px;font-weight:900;color:#0d2b6b;font-family:"Times New Roman",serif;}
.adm-log-detail{font-size:11px;color:#4a6699;font-weight:700;margin-top:2px;}
.adm-notice{padding:12px 15px;border-radius:8px;font-size:12px;font-weight:700;display:flex;gap:10px;align-items:flex-start;margin-bottom:15px;font-family:"Times New Roman",serif;}
.adm-notice-info{background:#f0f4ff;border:1px solid #c8d8f8;color:#0d2b6b;}
.adm-notice-warn{background:#fffbeb;border:1px solid #fcd34d;color:#92400e;}
.adm-notice-danger{background:#fff5f5;border:1px solid #fca5a5;color:#991b1b;}

/* ── ADMIN LOGIN PAGE ── */
.adm-login-page{
  min-height:100vh;
  background:linear-gradient(135deg,#0d2b6b 0%,#0a1f52 50%,#061440 100%);
  display:flex;align-items:center;justify-content:center;
  font-family:"Times New Roman",Times,serif;
}
.adm-login-box{
  width:100%;max-width:420px;
  background:#ffffff;
  border-radius:18px;
  padding:44px 40px;
  box-shadow:0 30px 80px rgba(0,0,0,0.4);
  border-top:5px solid #c8a84b;
}
.adm-login-crest{
  width:64px;height:64px;
  background:linear-gradient(135deg,#0d2b6b,#1a3a7c);
  border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:30px;margin:0 auto 18px;
  box-shadow:0 8px 24px rgba(13,43,107,0.35);
  border:3px solid #c8a84b;
}
.adm-login-title{
  text-align:center;font-size:24px;font-weight:900;
  color:#0d2b6b;margin-bottom:4px;letter-spacing:-.3px;
}
.adm-login-sub{text-align:center;font-size:12px;color:#4a6699;font-weight:700;margin-bottom:30px;letter-spacing:.3px;}
.adm-login-err{background:#fff5f5;border:1.5px solid #fca5a5;color:#991b1b;font-size:12px;font-weight:700;padding:10px 14px;border-radius:8px;margin-bottom:16px;text-align:center;}
.adm-login-hint{text-align:center;margin-top:18px;font-size:11px;color:#8aa0cc;font-weight:700;letter-spacing:.3px;}
`;

// ─── ADMIN COMPONENTS ─────────────────────────────────────────────────────────

function AdminDashboard({ patients, users, wardReports, logs, announcements }) {
  const activePatients = patients.filter(p => !p.deleted && (p.status || "active") === "active").length;
  const totalPatients = patients.filter(p => !p.deleted).length;
  const totalUsers = users.filter(u => !u.deleted).length;
  const reportsToday = wardReports.filter(r => r.date === today()).length;
  const wardCounts = {};
  patients.filter(p => !p.deleted && (p.status || "active") === "active").forEach(p => {
    const w = p.ward?.split("–")[0]?.trim() || "Unknown";
    wardCounts[w] = (wardCounts[w] || 0) + 1;
  });
  const roleCounts = { nurse: 0, supervisor: 0, wardmaster: 0 };
  users.filter(u => !u.deleted).forEach(u => { if (roleCounts[u.role] !== undefined) roleCounts[u.role]++; });

  return (
    <div>
      <div className="adm-section-hdr">
        <div>
          <div className="adm-section-title">System Dashboard</div>
          <div className="adm-section-sub">Live overview of MedRecord EMR · {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
        </div>
      </div>

      <div className="adm-stats-row">
        {[
          { icon: "🏥", val: activePatients, label: "Active Patients", note: `${totalPatients} total records` },
          { icon: "👥", val: totalUsers, label: "Registered Staff", note: `${roleCounts.nurse} nurses · ${roleCounts.supervisor} supervisors` },
          { icon: "📋", val: reportsToday, label: "Reports Today", note: `${wardReports.length} all-time` },
          { icon: "📜", val: logs.length, label: "Audit Log Entries", note: "Full action trail" },
        ].map((s, i) => (
          <div key={i} className="adm-stat-card">
            <div className="adm-stat-icon">{s.icon}</div>
            <div className="adm-stat-val">{s.val}</div>
            <div className="adm-stat-label">{s.label}</div>
            <div className="adm-stat-note">{s.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">🗺️ Ward Occupancy (Active)</span></div>
          <div className="adm-card-body">
            {Object.keys(wardCounts).length === 0
              ? <div className="adm-empty-state"><div className="adm-empty-icon">🏥</div><div className="adm-empty-text">No active patients</div></div>
              : Object.entries(wardCounts).sort((a, b) => b[1] - a[1]).map(([ward, count]) => (
                <div key={ward} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                    <span style={{ color: "var(--adm-t2,#1a2e5a)" }}>{ward}</span>
                    <span style={{ color: "var(--adm-t1,#0d2b6b)", fontWeight: 900 }}>{count} patient{count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="adm-progress-wrap">
                    <div className="adm-progress-fill" style={{ width: `${Math.min(100, (count / Math.max(activePatients, 1)) * 100)}%` }} />
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">👥 Staff Distribution</span></div>
          <div className="adm-card-body">
            {[
              { label: "Ward Nurses", val: roleCounts.nurse, color: "var(--adm-accent,#0d2b6b)" },
              { label: "Supervisors", val: roleCounts.supervisor, color: "var(--adm-success,#1a5c2a)" },
              { label: "Ward Masters", val: roleCounts.wardmaster, color: "var(--adm-danger,#7c2d12)" },
            ].map((r, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  <span style={{ color: "var(--adm-t2,#1a2e5a)" }}>{r.label}</span>
                  <span style={{ color: r.color, fontWeight: 900 }}>{r.val}</span>
                </div>
                <div className="adm-progress-wrap">
                  <div className="adm-progress-fill" style={{ width: `${Math.min(100, (r.val / Math.max(totalUsers, 1)) * 100)}%`, background: r.color }} />
                </div>
              </div>
            ))}
            <div className="adm-divider" />
            <div style={{ textAlign: "center", fontSize: 13, fontWeight: 900, color: "var(--adm-t1,#0d2b6b)" }}>Total: {totalUsers} staff members</div>
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-hdr">
          <span className="adm-card-title">📢 Active Announcements</span>
          <span className="adm-badge adm-badge-navy">{announcements.filter(a => !a.deleted).length}</span>
        </div>
        <div className="adm-card-body">
          {announcements.filter(a => !a.deleted).slice(0, 3).length === 0
            ? <div className="adm-empty-state"><div className="adm-empty-icon">📢</div><div className="adm-empty-text">No announcements posted</div></div>
            : announcements.filter(a => !a.deleted).slice(0, 3).map(a => (
              <div key={a.id} className="adm-ann-item">
                <div className="adm-ann-title">{a.title}</div>
                <div className="adm-ann-body">{a.body?.slice(0, 140)}{a.body?.length > 140 ? "…" : ""}</div>
                <div className="adm-ann-meta">
                  <span className={`adm-badge adm-badge-${a.priority === "urgent" ? "red" : a.priority === "important" ? "amber" : "navy"}`}>{a.priority || "info"}</span>
                  <span>Target: {a.targetRole || "All Staff"}</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-hdr"><span className="adm-card-title">🕐 Recent System Activity</span></div>
        <div className="adm-card-body">
          {logs.slice(0, 10).length === 0
            ? <div className="adm-empty-state"><div className="adm-empty-icon">📜</div><div className="adm-empty-text">No activity logged yet</div></div>
            : logs.slice(0, 10).map((l, i) => (
              <div key={l.id || i} className="adm-log-row">
                <div className="adm-log-dot" style={{ background: l.action === "DELETE" ? "#dc2626" : l.action === "CREATE" ? "#059669" : l.action === "LOGIN" ? "#0d2b6b" : "#f59e0b" }} />
                <div>
                  <div className="adm-log-action">{l.action} — {l.detail}</div>
                  <div className="adm-log-detail">{l.by} · {l.ts?.toDate ? l.ts.toDate().toLocaleString() : "—"}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Users
function AdminAnnouncements({ announcements, showToast }) {
  const [form, setForm] = useState({ title: "", body: "", priority: "info", targetRole: "all" });
  const [busy, setBusy] = useState(false);

  const handlePost = async () => {
    if (!form.title || !form.body) { showToast("Title and message are required.", "error"); return; }
    setBusy(true);
    try {
      await FB.saveAnnouncement({ ...form, postedBy: ADMIN_EMAIL });
      await FB.saveSystemLog("CREATE", `Announcement posted: "${form.title}"`);
      showToast("Announcement posted successfully.");
      setForm({ title: "", body: "", priority: "info", targetRole: "all" });
    } catch (e) { showToast("Error: " + e.message, "error"); }
    setBusy(false);
  };

  const handleDelete = async (a) => {
    if (!window.confirm("Remove this announcement?")) return;
    try {
      await FB.deleteAnnouncement(a.id);
      await FB.saveSystemLog("DELETE", `Announcement removed: "${a.title}"`);
      showToast("Announcement removed.");
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const active = announcements.filter(a => !a.deleted);

  return (
    <div>
      <div className="adm-section-title" style={{ marginBottom: 20 }}>📢 System Announcements</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">Post New Announcement</span></div>
          <div className="adm-card-body">
            <div className="adm-form-group"><label className="adm-label">Title *</label><input className="adm-input" placeholder="Announcement title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="adm-form-group"><label className="adm-label">Message *</label><textarea className="adm-textarea" placeholder="Write your message to staff…" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} /></div>
            <div className="adm-grid2">
              <div className="adm-form-group"><label className="adm-label">Priority</label>
                <select className="adm-select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  <option value="info">Info</option><option value="important">Important</option><option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="adm-form-group"><label className="adm-label">Target</label>
                <select className="adm-select" value={form.targetRole} onChange={e => setForm(f => ({ ...f, targetRole: e.target.value }))}>
                  <option value="all">All Staff</option><option value="nurse">Nurses Only</option><option value="supervisor">Supervisors</option><option value="wardmaster">Ward Masters</option>
                </select>
              </div>
            </div>
            <button className="adm-btn adm-btn-navy" style={{ width: "100%", justifyContent: "center" }} onClick={handlePost} disabled={busy}>{busy ? "Posting…" : "📢 Post Announcement"}</button>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: "var(--adm-t1,#0d2b6b)", marginBottom: 14, fontFamily: "\"Times New Roman\",serif" }}>
            Posted Announcements ({active.length})
          </div>
          {active.length === 0
            ? <div style={{ textAlign: "center", padding: 30, color: "var(--adm-t3,#8aa0cc)", fontSize: 13, fontWeight: 700 }}>No announcements yet</div>
            : active.map(a => (
              <div key={a.id} className="adm-ann-item">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                  <div className="adm-ann-title">{a.title}</div>
                  <button className="adm-btn adm-btn-red adm-btn-sm" style={{ flexShrink: 0 }} onClick={() => handleDelete(a)}>Remove</button>
                </div>
                <div className="adm-ann-body">{a.body}</div>
                <div className="adm-ann-meta">
                  <span className={`adm-badge adm-badge-${a.priority === "urgent" ? "red" : a.priority === "important" ? "amber" : "navy"}`}>{a.priority}</span>
                  <span>→ {a.targetRole || "All"}</span>
                  <span>{a.createdAt?.toDate ? a.createdAt.toDate().toLocaleDateString() : "—"}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Audit Logs
function AdminLogs({ logs }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const actionColor = { DELETE: "#dc2626", CREATE: "#059669", UPDATE: "#d97706", LOGIN: "#0d2b6b" };

  const visible = logs.filter(l => {
    const match = !search || l.detail?.toLowerCase().includes(search.toLowerCase());
    return filter === "all" ? match : match && l.action === filter;
  });

  return (
    <div>
      <div className="adm-section-hdr">
        <div>
          <div className="adm-section-title">Audit Log</div>
          <div className="adm-section-sub">{logs.length} total entries — full action trail</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["all", "CREATE", "UPDATE", "DELETE", "LOGIN"].map(a => (
            <button key={a} className="adm-btn adm-btn-ghost adm-btn-sm" style={filter === a ? { background: "#0d2b6b", color: "#fff", borderColor: "#0d2b6b" } : {}} onClick={() => setFilter(a)}>{a}</button>
          ))}
          <div className="adm-search-bar"><span style={{ color: "var(--adm-t3,#8aa0cc)" }}>🔍</span><input placeholder="Search logs…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
      </div>
      <div className="adm-card">
        <table className="adm-table">
          <thead><tr><th>Action</th><th>Detail</th><th>By</th><th>Timestamp</th></tr></thead>
          <tbody>
            {visible.length === 0
              ? <tr><td colSpan={4} style={{ textAlign: "center", padding: 30, color: "var(--adm-t3,#8aa0cc)" }}>No logs found</td></tr>
              : visible.map((l, i) => (
                <tr key={l.id || i}>
                  <td>
                    <span className="adm-badge" style={{ background: `${actionColor[l.action] || "#6b7280"}15`, color: actionColor[l.action] || "#6b7280", border: `1px solid ${actionColor[l.action] || "#6b7280"}30` }}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{ color: "var(--adm-t1,#0a1628)" }}>{l.detail}</td>
                  <td style={{ color: "var(--adm-t2,#4a6699)" }}>{l.by}</td>
                  <td style={{ color: "var(--adm-t2,#4a6699)" }}>{l.ts?.toDate ? l.ts.toDate().toLocaleString() : "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Reports Overview
function AdminReports({ wardReports, archives }) {
  const byDate = {};
  wardReports.forEach(r => { byDate[r.date] = (byDate[r.date] || 0) + 1; });
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a)).slice(0, 15);
  return (
    <div>
      <div className="adm-section-title" style={{ marginBottom: 20 }}>📊 Reports Overview</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18, marginBottom: 20 }}>
        {[
          { icon: "📋", label: "Total Ward Reports", val: wardReports.length },
          { icon: "🗃️", label: "Archived Reports", val: archives.length },
          { icon: "📅", label: "Reporting Days", val: Object.keys(byDate).length },
        ].map((s, i) => (
          <div key={i} className="adm-stat-card">
            <div className="adm-stat-icon">{s.icon}</div>
            <div className="adm-stat-val">{s.val}</div>
            <div className="adm-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="adm-card">
        <div className="adm-card-hdr"><span className="adm-card-title">📅 Reports by Date</span></div>
        <table className="adm-table">
          <thead><tr><th>Date</th><th>Reports Submitted</th><th>Ward Coverage</th></tr></thead>
          <tbody>
            {sortedDates.length === 0
              ? <tr><td colSpan={3} style={{ textAlign: "center", padding: 30, color: "var(--adm-t3,#8aa0cc)" }}>No reports yet</td></tr>
              : sortedDates.map(date => (
                <tr key={date}>
                  <td style={{ fontWeight: 900, color: "var(--adm-t1,#0a1628)" }}>{date}</td>
                  <td><span className="adm-badge adm-badge-navy">{byDate[date]} report{byDate[date] !== 1 ? "s" : ""}</span></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="adm-progress-wrap" style={{ flex: 1 }}>
                        <div className="adm-progress-fill" style={{ width: `${Math.min(100, (byDate[date] / WARDS.length) * 100)}%` }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 900, color: "var(--adm-t2,#4a6699)", whiteSpace: "nowrap" }}>{byDate[date]}/{WARDS.length} wards</span>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Settings

// ── ENHANCED AdminUsers with Suspend/Activate ─────────────────────────────────
function AdminUsers({ users, onRefresh, showToast }) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name:"",email:"",password:"",role:"nurse",ward:"",department:"" });
  const [busy, setBusy] = useState(false);

  const visible = users.filter(u => !u.deleted && (
    (roleFilter==="all" || u.role===roleFilter) &&
    (!search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
  ));
  const active = visible.filter(u=>!u.suspended);
  const suspended = visible.filter(u=>u.suspended);

  const handleAdd = async () => {
    if (!form.name||!form.email||!form.password) { showToast("Name, email and password are required.","error"); return; }
    setBusy(true);
    try {
      await FB.register(form.email, form.password, { name:form.name, role:form.role, ward:form.ward, department:form.department });
      await FB.saveSystemLog("CREATE",`New staff: ${form.name} (${form.role})`);
      showToast("Staff account created."); setShowAdd(false);
      setForm({ name:"",email:"",password:"",role:"nurse",ward:"",department:"" }); onRefresh();
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setBusy(false);
  };

  const handleRoleChange = async (u, newRole) => {
    try { await FB.updateUserRole(u.uid, newRole); await FB.saveSystemLog("UPDATE",`Role changed: ${u.name} → ${newRole}`); showToast("Role updated."); onRefresh(); }
    catch(e) { showToast("Error: "+e.message,"error"); }
  };

  const handleSuspend = async (u) => {
    if (!window.confirm(`Suspend "${u.name}"? They cannot log in until reactivated.`)) return;
    try { await FBX.suspendUser(u.uid); await FB.saveSystemLog("UPDATE",`User suspended: ${u.name}`); showToast("User suspended."); onRefresh(); }
    catch(e) { showToast("Error: "+e.message,"error"); }
  };

  const handleActivate = async (u) => {
    try { await FBX.activateUser(u.uid); await FB.saveSystemLog("UPDATE",`User reactivated: ${u.name}`); showToast("User activated."); onRefresh(); }
    catch(e) { showToast("Error: "+e.message,"error"); }
  };

  const handleDeactivate = async (u) => {
    if (!window.confirm(`Permanently deactivate "${u.name}"?`)) return;
    try { await FB.deactivateUser(u.uid); await FB.saveSystemLog("DELETE",`User deactivated: ${u.name} (${u.email})`); showToast("User deactivated."); onRefresh(); }
    catch(e) { showToast("Error: "+e.message,"error"); }
  };

  const UserTable = ({ rows, isSuspended }) => (
    <div className="adm-card" style={{ marginBottom:16 }}>
      {isSuspended && <div style={{ padding:"8px 16px", background:"rgba(180,130,0,0.08)", borderBottom:"1px solid rgba(180,130,0,0.2)", fontSize:11, fontWeight:700, color:"#92400e" }}>⚠️ Suspended Accounts ({rows.length})</div>}
      <table className="adm-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Ward</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={6} style={{ textAlign:"center", padding:26, color:"#8aa0cc" }}>No accounts found</td></tr>
            : rows.map(u => (
              <tr key={u.uid}>
                <td>
                  <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                    <div style={{ width:32,height:32,borderRadius:"50%",background:u.suspended?"#d1d5db":"linear-gradient(135deg,#0d2b6b,#2a5bd7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff",flexShrink:0 }}>
                      {(u.name||"?").charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontWeight:900, color:u.suspended?"#9ca3af":"#0a1628" }}>{u.name}</span>
                  </div>
                </td>
                <td style={{ color:"#4a6699" }}>{u.email}</td>
                <td>
                  <select className="adm-select" style={{ width:"auto",padding:"4px 9px",fontSize:12 }} value={u.role||"nurse"} onChange={e=>handleRoleChange(u,e.target.value)} disabled={u.suspended}>
                    <option value="nurse">Ward Nurse</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="wardmaster">Ward Master</option>
                  </select>
                </td>
                <td>{u.ward || <span style={{ color:"#c8d8f8" }}>—</span>}</td>
                <td>
                  {u.suspended
                    ? <span className="adm-badge adm-badge-amber">⏸ Suspended</span>
                    : <span className="adm-badge adm-badge-green">● Active</span>}
                </td>
                <td>
                  <div style={{ display:"flex", gap:5 }}>
                    {u.suspended
                      ? <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={()=>handleActivate(u)}>✓ Activate</button>
                      : <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={()=>handleSuspend(u)}>⏸ Suspend</button>}
                    <button className="adm-btn adm-btn-red adm-btn-sm" onClick={()=>handleDeactivate(u)}>🚫 Remove</button>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div className="adm-section-hdr">
        <div>
          <div className="adm-section-title">User Management</div>
          <div className="adm-section-sub">{active.length} active · {suspended.length} suspended</div>
        </div>
        <div style={{ display:"flex", gap:9, flexWrap:"wrap", alignItems:"center" }}>
          {["all","nurse","supervisor","wardmaster"].map(r=>(
            <button key={r} className="adm-btn adm-btn-ghost adm-btn-sm" style={roleFilter===r?{background:"#0d2b6b",color:"#fff"}:{}} onClick={()=>setRoleFilter(r)}>
              {r==="all"?"All Roles":r==="nurse"?"Nurses":r==="supervisor"?"Supervisors":"Ward Masters"}
            </button>
          ))}
          <div className="adm-search-bar"><span style={{color:"#8aa0cc"}}>🔍</span><input placeholder="Search staff…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
          <button className="adm-btn adm-btn-navy" onClick={()=>setShowAdd(true)}>+ Add Healthcare Worker</button>
        </div>
      </div>

      <UserTable rows={active} isSuspended={false} />
      {suspended.length > 0 && <UserTable rows={suspended} isSuspended={true} />}

      {showAdd && (
        <div className="adm-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget) setShowAdd(false); }}>
          <div className="adm-modal">
            <div className="adm-modal-hdr">
              <span className="adm-modal-title">➕ Add Healthcare Worker</span>
              <button className="adm-modal-close" onClick={()=>setShowAdd(false)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Full Name *</label><input className="adm-input" placeholder="Staff full name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
                <div className="adm-form-group"><label className="adm-label">Email *</label><input className="adm-input" type="email" placeholder="staff@hospital.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></div>
              </div>
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Password *</label><input className="adm-input" type="password" placeholder="Min 6 characters" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} /></div>
                <div className="adm-form-group"><label className="adm-label">Assign Role</label>
                  <select className="adm-select" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                    <option value="nurse">Ward Nurse</option><option value="supervisor">Supervisor</option><option value="wardmaster">Ward Master</option>
                  </select>
                </div>
              </div>
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Assigned Ward</label>
                  <select className="adm-select" value={form.ward} onChange={e=>setForm(f=>({...f,ward:e.target.value}))}>
                    <option value="">No specific ward</option>{WARDS.map(w=><option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div className="adm-form-group"><label className="adm-label">Department</label>
                  <input className="adm-input" placeholder="e.g. Nursing, ICU…" value={form.department} onChange={e=>setForm(f=>({...f,department:e.target.value}))} />
                </div>
              </div>
            </div>
            <div className="adm-modal-foot">
              <button className="adm-btn adm-btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button>
              <button className="adm-btn adm-btn-navy" onClick={handleAdd} disabled={busy}>{busy?"Creating…":"✚ Create Account"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DEPARTMENT MANAGEMENT ─────────────────────────────────────────────────────
function AdminDepartments({ showToast }) {
  const [departments, setDepartments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name:"",code:"",head:"",units:"",description:"",type:"Clinical" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = FBX.onDepartments(d => setDepartments(d.filter(x=>!x.deleted)));
    return () => unsub();
  }, []);

  const openAdd = () => { setEditItem(null); setForm({ name:"",code:"",head:"",units:"",description:"",type:"Clinical" }); setShowForm(true); };
  const openEdit = (d) => { setEditItem(d); setForm({ name:d.name,code:d.code||"",head:d.head||"",units:d.units||"",description:d.description||"",type:d.type||"Clinical" }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name) { showToast("Department name is required.","error"); return; }
    setBusy(true);
    try {
      const data = { ...form, ...(editItem?{id:editItem.id,createdAt:editItem.createdAt}:{createdAt:new Date().toISOString()}) };
      await FBX.saveDepartment(data);
      await FB.saveSystemLog(editItem?"UPDATE":"CREATE",`Department ${editItem?"updated":"created"}: ${form.name}`);
      showToast(editItem?"Department updated.":"Department created."); setShowForm(false);
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setBusy(false);
  };

  const handleDelete = async (d) => {
    if (!window.confirm(`Delete department "${d.name}"?`)) return;
    try { await FBX.deleteDepartment(d.id); await FB.saveSystemLog("DELETE",`Department deleted: ${d.name}`); showToast("Department deleted."); }
    catch(e) { showToast("Error: "+e.message,"error"); }
  };

  return (
    <div>
      <div className="adm-section-hdr">
        <div>
          <div className="adm-section-title">Department Management</div>
          <div className="adm-section-sub">{departments.length} departments configured</div>
        </div>
        <button className="adm-btn adm-btn-navy" onClick={openAdd}>+ Create Department</button>
      </div>

      {departments.length === 0 ? (
        <div className="adm-card"><div style={{ padding:48, textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:10, opacity:0.25 }}>🏢</div>
          <div style={{ fontSize:14, fontWeight:900, color:"#4a6699", marginBottom:6 }}>No Departments Yet</div>
          <div style={{ fontSize:12, color:"#8aa0cc", marginBottom:16 }}>Create departments to organise your healthcare facility</div>
          <button className="adm-btn adm-btn-navy" onClick={openAdd}>+ Create First Department</button>
        </div></div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:16 }}>
          {departments.map(d => (
            <div key={d.id} className="adm-card" style={{ overflow:"hidden" }}>
              <div className="adm-card-hdr">
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:36,height:36,borderRadius:9,background:"linear-gradient(135deg,#0d2b6b,#2a5bd7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0 }}>🏢</div>
                  <div>
                    <div className="adm-card-title">{d.name}</div>
                    {d.code && <div style={{ fontSize:10, color:"#8aa0cc", fontWeight:700 }}>{d.code}</div>}
                  </div>
                </div>
                <span className="adm-badge adm-badge-navy" style={{ fontSize:10 }}>{d.type}</span>
              </div>
              <div className="adm-card-body" style={{ paddingTop:12 }}>
                {d.head && <div style={{ fontSize:12, color:"#4a6699", marginBottom:5 }}>👤 Head: <strong style={{color:"#0a1628"}}>{d.head}</strong></div>}
                {d.description && <div style={{ fontSize:12, color:"#4a6699", marginBottom:8, lineHeight:1.5 }}>{d.description}</div>}
                {d.units && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:10, fontWeight:900, color:"#8aa0cc", textTransform:"uppercase", letterSpacing:".5px", marginBottom:5 }}>Units / Sub-departments</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                      {d.units.split(",").map(u=>u.trim()).filter(Boolean).map((u,i)=>(
                        <span key={i} className="adm-badge adm-badge-ghost" style={{ background:"#f0f4ff", color:"#0d2b6b", border:"1px solid #c8d8f8", fontSize:10 }}>{u}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display:"flex", gap:7, justifyContent:"flex-end", marginTop:8 }}>
                  <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={()=>openEdit(d)}>✏️ Edit</button>
                  <button className="adm-btn adm-btn-red adm-btn-sm" onClick={()=>handleDelete(d)}>🗑️ Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="adm-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget) setShowForm(false); }}>
          <div className="adm-modal">
            <div className="adm-modal-hdr">
              <span className="adm-modal-title">{editItem?"✏️ Edit Department":"🏢 Create Department"}</span>
              <button className="adm-modal-close" onClick={()=>setShowForm(false)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Department Name *</label><input className="adm-input" placeholder="e.g. Cardiology" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
                <div className="adm-form-group"><label className="adm-label">Department Code</label><input className="adm-input" placeholder="e.g. CARD" value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} /></div>
              </div>
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Department Head</label><input className="adm-input" placeholder="Name of head of department" value={form.head} onChange={e=>setForm(f=>({...f,head:e.target.value}))} /></div>
                <div className="adm-form-group"><label className="adm-label">Type</label>
                  <select className="adm-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                    <option>Clinical</option><option>Surgical</option><option>Diagnostic</option><option>Administrative</option><option>Support</option>
                  </select>
                </div>
              </div>
              <div className="adm-form-group"><label className="adm-label">Units / Sub-departments (comma-separated)</label><input className="adm-input" placeholder="e.g. Coronary Care, Cath Lab, Echo Suite" value={form.units} onChange={e=>setForm(f=>({...f,units:e.target.value}))} /></div>
              <div className="adm-form-group"><label className="adm-label">Description</label><textarea className="adm-textarea" style={{ minHeight:70 }} placeholder="Brief description of this department…" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} /></div>
            </div>
            <div className="adm-modal-foot">
              <button className="adm-btn adm-btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="adm-btn adm-btn-navy" onClick={handleSave} disabled={busy}>{busy?"Saving…":editItem?"✓ Update":"✚ Create"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PATIENT DATABASE (with Merge Duplicates) ──────────────────────────────────
function AdminPatients({ patients, showToast }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [mergeMode, setMergeMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [mergePreview, setMergePreview] = useState(null);

  const visible = patients.filter(p => !p.deleted).filter(p => {
    const q = search.toLowerCase();
    const match = !q || p.name?.toLowerCase().includes(q) || p.emr?.toLowerCase().includes(q) || p.diagnosis?.toLowerCase().includes(q) || p.ward?.toLowerCase().includes(q);
    if (filter==="active") return match && (p.status||"active")==="active";
    if (filter==="discharged") return match && p.status==="discharged";
    return match;
  });

  const toggleSelect = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : s.length<2 ? [...s,id] : s);
  };

  const handleMergePreview = () => {
    if (selected.length !== 2) { showToast("Select exactly 2 patients to merge.","error"); return; }
    const [a,b] = selected.map(id => patients.find(p=>p.id===id));
    setMergePreview({ primary:a, secondary:b });
  };

  const handleMergeConfirm = async () => {
    if (!mergePreview) return;
    const { primary, secondary } = mergePreview;
    // Merge secondary's clinical data into primary
    const merged = {
      ...primary,
      vitals: [...(primary.vitals||[]), ...(secondary.vitals||[])],
      medAdminLogs: [...(primary.medAdminLogs||[]), ...(secondary.medAdminLogs||[])],
      nursingReports: [...(primary.nursingReports||[]), ...(secondary.nursingReports||[])],
      labResults: [...(primary.labResults||[]), ...(secondary.labResults||[])],
      woundRecords: [...(primary.woundRecords||[]), ...(secondary.woundRecords||[])],
      prescriptions: [...(primary.prescriptions||[]), ...(secondary.prescriptions||[])],
      fluidEntries: [...(primary.fluidEntries||[]), ...(secondary.fluidEntries||[])],
      glucoseReadings: [...(primary.glucoseReadings||[]), ...(secondary.glucoseReadings||[])],
      doctorOrders: [...(primary.doctorOrders||[]), ...(secondary.doctorOrders||[])],
      transfusions: [...(primary.transfusions||[]), ...(secondary.transfusions||[])],
      mergedFrom: [...(primary.mergedFrom||[]), secondary.id],
    };
    try {
      await FB.savePatient(merged);
      await FB.deletePatient(secondary.id);
      await FB.saveSystemLog("UPDATE",`Patient records merged: "${secondary.name}" (${secondary.emr}) → "${primary.name}" (${primary.emr})`);
      showToast(`Merged "${secondary.name}" into "${primary.name}" successfully.`);
      setMergePreview(null); setSelected([]); setMergeMode(false);
    } catch(e) { showToast("Error: "+e.message,"error"); }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Permanently delete record for "${p.name}" (EMR: ${p.emr})? This cannot be undone.`)) return;
    try { await FB.deletePatient(p.id); await FB.saveSystemLog("DELETE",`Patient deleted: ${p.name} (EMR: ${p.emr})`); showToast("Patient record deleted."); }
    catch(e) { showToast("Error: "+e.message,"error"); }
  };

  return (
    <div>
      <div className="adm-section-hdr">
        <div>
          <div className="adm-section-title">Patient Database</div>
          <div className="adm-section-sub">{visible.length} records</div>
        </div>
        <div style={{ display:"flex", gap:9, flexWrap:"wrap", alignItems:"center" }}>
          {["all","active","discharged"].map(f=>(
            <button key={f} className="adm-btn adm-btn-ghost adm-btn-sm" style={filter===f?{background:"#0d2b6b",color:"#fff"}:{}} onClick={()=>setFilter(f)}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
          <div className="adm-search-bar"><span style={{color:"#8aa0cc"}}>🔍</span><input placeholder="Search patients…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
          <button className="adm-btn adm-btn-ghost" style={mergeMode?{background:"#0d2b6b",color:"#fff"}:{}} onClick={()=>{ setMergeMode(m=>!m); setSelected([]); }}>
            🔀 {mergeMode?"Exit Merge":"Merge Duplicates"}
          </button>
        </div>
      </div>

      {mergeMode && (
        <div className="adm-notice adm-notice-info" style={{ marginBottom:14 }}>
          ℹ️ <strong>Merge Mode:</strong> Select 2 patient records to merge. All clinical data will be combined into the primary record.
          {selected.length===2 && <button className="adm-btn adm-btn-navy adm-btn-sm" style={{ marginLeft:12 }} onClick={handleMergePreview}>Preview Merge →</button>}
          <span style={{ marginLeft:8, color:"#4a6699" }}>{selected.length}/2 selected</span>
        </div>
      )}

      <div className="adm-card">
        <table className="adm-table">
          <thead><tr>{mergeMode&&<th>Select</th>}<th>Patient Name</th><th>EMR No.</th><th>Ward</th><th>Diagnosis</th><th>Status</th><th>Admitted</th><th>Action</th></tr></thead>
          <tbody>
            {visible.length===0
              ? <tr><td colSpan={mergeMode?8:7} style={{textAlign:"center",padding:30,color:"#8aa0cc"}}>No records found</td></tr>
              : visible.map(p=>(
                <tr key={p.id} style={mergeMode&&selected.includes(p.id)?{background:"rgba(13,43,107,0.06)"}:{}}>
                  {mergeMode && <td><input type="checkbox" checked={selected.includes(p.id)} onChange={()=>toggleSelect(p.id)} style={{width:16,height:16,cursor:"pointer"}} /></td>}
                  <td style={{ fontWeight:900 }}>{p.name}</td>
                  <td><span style={{ fontFamily:"monospace", fontWeight:900 }}>{p.emr||"—"}</span></td>
                  <td>{p.ward?.split("–")[0]?.trim()||"—"}</td>
                  <td>{p.diagnosis||<span style={{color:"#c8d8f8"}}>—</span>}</td>
                  <td><span className={`adm-badge adm-badge-${p.status==="discharged"?"amber":"green"}`}>{p.status||"active"}</span></td>
                  <td style={{ color:"#4a6699" }}>{p.admission||"—"}</td>
                  <td><button className="adm-btn adm-btn-red adm-btn-sm" onClick={()=>handleDelete(p)}>🗑️ Delete</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {mergePreview && (
        <div className="adm-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget) setMergePreview(null); }}>
          <div className="adm-modal" style={{ maxWidth:640 }}>
            <div className="adm-modal-hdr">
              <span className="adm-modal-title">🔀 Confirm Patient Merge</span>
              <button className="adm-modal-close" onClick={()=>setMergePreview(null)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <div className="adm-notice adm-notice-warn" style={{ marginBottom:16 }}>⚠️ This action cannot be undone. The secondary record will be permanently deleted after merging.</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
                {[["✅ Primary (kept)", mergePreview.primary], ["🗑️ Secondary (deleted)", mergePreview.secondary]].map(([label, p]) => (
                  <div key={p.id} style={{ background:"#f5f8ff", border:"1px solid #c8d8f8", borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, fontWeight:900, color:"#4a6699", textTransform:"uppercase", letterSpacing:".5px", marginBottom:8 }}>{label}</div>
                    <div style={{ fontWeight:900, fontSize:14, color:"#0a1628", marginBottom:4 }}>{p.name}</div>
                    <div style={{ fontSize:12, color:"#4a6699" }}>EMR: {p.emr||"—"}</div>
                    <div style={{ fontSize:12, color:"#4a6699" }}>{p.ward||"No ward"}</div>
                    <div style={{ fontSize:12, color:"#4a6699", marginTop:6 }}>
                      {(p.vitals||[]).length} vitals · {(p.prescriptions||[]).length} meds · {(p.nursingReports||[]).length} reports
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:12, color:"#4a6699", marginBottom:6, fontWeight:700 }}>After merge, primary record will have:</div>
              <div style={{ fontSize:12, color:"#0a1628", background:"#f0f4ff", borderRadius:8, padding:12, fontWeight:700 }}>
                {(mergePreview.primary.vitals||[]).length+(mergePreview.secondary.vitals||[]).length} vitals &nbsp;·&nbsp;
                {(mergePreview.primary.prescriptions||[]).length+(mergePreview.secondary.prescriptions||[]).length} meds &nbsp;·&nbsp;
                {(mergePreview.primary.nursingReports||[]).length+(mergePreview.secondary.nursingReports||[]).length} nursing reports &nbsp;·&nbsp;
                {(mergePreview.primary.labResults||[]).length+(mergePreview.secondary.labResults||[]).length} labs
              </div>
            </div>
            <div className="adm-modal-foot">
              <button className="adm-btn adm-btn-ghost" onClick={()=>setMergePreview(null)}>Cancel</button>
              <button className="adm-btn adm-btn-navy" onClick={handleMergeConfirm}>🔀 Confirm Merge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EMR CONFIGURATION ─────────────────────────────────────────────────────────
function AdminEMRConfig({ showToast }) {
  const [tab, setTab] = useState("templates");
  const [templates, setTemplates] = useState([]);
  const [drugs, setDrugs] = useState([]);
  const [labTests, setLabTests] = useState([]);

  useEffect(() => {
    const u1 = FBX.onTemplates(d=>setTemplates(d.filter(x=>!x.deleted)));
    const u2 = FBX.onDrugs(d=>setDrugs(d.filter(x=>!x.deleted)));
    const u3 = FBX.onLabTests(d=>setLabTests(d.filter(x=>!x.deleted)));
    return () => { u1(); u2(); u3(); };
  }, []);

  return (
    <div>
      <div className="adm-section-hdr">
        <div>
          <div className="adm-section-title">EMR Configuration</div>
          <div className="adm-section-sub">Clinical templates, drug database, laboratory tests</div>
        </div>
      </div>
      <div className="tabs-bar" style={{ background:"#eef3ff", border:"1.5px solid #c8d8f8", marginBottom:18 }}>
        {[["templates","📄 Clinical Templates"],["drugs","💊 Drug Database"],["lab","🧪 Laboratory Tests"]].map(([k,l])=>(
          <button key={k} className={`tab-btn ${tab===k?"active":""}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      {tab==="templates" && <TemplatesPanel items={templates} showToast={showToast} />}
      {tab==="drugs" && <DrugsPanel items={drugs} showToast={showToast} />}
      {tab==="lab" && <LabTestsPanel items={labTests} showToast={showToast} />}
    </div>
  );
}

function TemplatesPanel({ items, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name:"",category:"",content:"" });
  const [busy, setBusy] = useState(false);

  const openAdd = () => { setEditItem(null); setForm({ name:"",category:"",content:"" }); setShowForm(true); };
  const openEdit = (d) => { setEditItem(d); setForm({ name:d.name,category:d.category||"",content:d.content||"" }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name||!form.content) { showToast("Name and content are required.","error"); return; }
    setBusy(true);
    try {
      await FBX.saveTemplate({ ...form, ...(editItem?{id:editItem.id}:{}) });
      await FB.saveSystemLog(editItem?"UPDATE":"CREATE",`Clinical template ${editItem?"updated":"created"}: ${form.name}`);
      showToast(editItem?"Template updated.":"Template created."); setShowForm(false);
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setBusy(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:900, color:"#0d2b6b" }}>Clinical Templates ({items.length})</div>
        <button className="adm-btn adm-btn-navy" onClick={openAdd}>+ Add Template</button>
      </div>
      {items.length===0 ? (
        <div className="adm-card"><div style={{ padding:36, textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:8, opacity:0.2 }}>📄</div>
          <div style={{ fontWeight:700, color:"#4a6699", marginBottom:10 }}>No clinical templates yet</div>
          <button className="adm-btn adm-btn-navy" onClick={openAdd}>+ Add First Template</button>
        </div></div>
      ) : (
        <div className="adm-card">
          <table className="adm-table">
            <thead><tr><th>Template Name</th><th>Category</th><th>Preview</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map(d=>(
                <tr key={d.id}>
                  <td style={{ fontWeight:900 }}>{d.name}</td>
                  <td>{d.category ? <span className="adm-badge adm-badge-navy" style={{fontSize:10}}>{d.category}</span> : "—"}</td>
                  <td style={{ color:"#4a6699", maxWidth:300 }}>{(d.content||"").substring(0,90)}{d.content?.length>90?"…":""}</td>
                  <td>
                    <div style={{ display:"flex", gap:6 }}>
                      <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={()=>openEdit(d)}>✏️ Edit</button>
                      <button className="adm-btn adm-btn-red adm-btn-sm" onClick={async()=>{ if(!window.confirm("Delete this template?")) return; await FBX.deleteTemplate(d.id); showToast("Template deleted."); }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && (
        <div className="adm-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget) setShowForm(false); }}>
          <div className="adm-modal" style={{ maxWidth:600 }}>
            <div className="adm-modal-hdr">
              <span className="adm-modal-title">{editItem?"✏️ Edit Template":"📄 New Clinical Template"}</span>
              <button className="adm-modal-close" onClick={()=>setShowForm(false)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Template Name *</label><input className="adm-input" placeholder="e.g. Daily Nursing Assessment" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
                <div className="adm-form-group"><label className="adm-label">Category</label>
                  <select className="adm-select" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                    <option value="">Select category</option>
                    <option>Nursing Assessment</option><option>Handover Report</option><option>Discharge Summary</option>
                    <option>Incident Report</option><option>Patient Education</option><option>Care Plan</option>
                  </select>
                </div>
              </div>
              <div className="adm-form-group"><label className="adm-label">Template Content *</label>
                <textarea className="adm-textarea" style={{ minHeight:180 }} placeholder="Write the template content here. Use [PATIENT_NAME], [DATE], [WARD], [NURSE] as placeholders…" value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} />
              </div>
            </div>
            <div className="adm-modal-foot">
              <button className="adm-btn adm-btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="adm-btn adm-btn-navy" onClick={handleSave} disabled={busy}>{busy?"Saving…":editItem?"✓ Update":"✚ Add Template"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DrugsPanel({ items, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name:"",genericName:"",class:"",routes:"",commonDoses:"",contraindications:"",interactions:"" });
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = items.filter(d=>!search||d.name?.toLowerCase().includes(search.toLowerCase())||d.genericName?.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => { setEditItem(null); setForm({ name:"",genericName:"",class:"",routes:"",commonDoses:"",contraindications:"",interactions:"" }); setShowForm(true); };
  const openEdit = (d) => { setEditItem(d); setForm({ name:d.name,genericName:d.genericName||"",class:d.class||"",routes:d.routes||"",commonDoses:d.commonDoses||"",contraindications:d.contraindications||"",interactions:d.interactions||"" }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name) { showToast("Drug name is required.","error"); return; }
    setBusy(true);
    try {
      await FBX.saveDrug({ ...form, ...(editItem?{id:editItem.id}:{}) });
      await FB.saveSystemLog(editItem?"UPDATE":"CREATE",`Drug ${editItem?"updated":"added"}: ${form.name}`);
      showToast(editItem?"Drug updated.":"Drug added to database."); setShowForm(false);
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setBusy(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, gap:10, flexWrap:"wrap" }}>
        <div style={{ fontSize:13, fontWeight:900, color:"#0d2b6b" }}>Drug Database ({items.length} drugs)</div>
        <div style={{ display:"flex", gap:9 }}>
          <div className="adm-search-bar"><span style={{color:"#8aa0cc"}}>🔍</span><input placeholder="Search drugs…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
          <button className="adm-btn adm-btn-navy" onClick={openAdd}>+ Add Drug</button>
        </div>
      </div>
      {filtered.length===0 ? (
        <div className="adm-card"><div style={{ padding:36, textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:8, opacity:0.2 }}>💊</div>
          <div style={{ fontWeight:700, color:"#4a6699", marginBottom:10 }}>{search?"No drugs match your search":"No drugs in database yet"}</div>
          {!search && <button className="adm-btn adm-btn-navy" onClick={openAdd}>+ Add First Drug</button>}
        </div></div>
      ) : (
        <div className="adm-card">
          <table className="adm-table">
            <thead><tr><th>Brand Name</th><th>Generic Name</th><th>Class</th><th>Routes</th><th>Common Doses</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(d=>(
                <tr key={d.id}>
                  <td style={{ fontWeight:900 }}>{d.name}</td>
                  <td style={{ color:"#4a6699" }}>{d.genericName||"—"}</td>
                  <td>{d.class ? <span className="adm-badge adm-badge-navy" style={{fontSize:10}}>{d.class}</span> : "—"}</td>
                  <td style={{ color:"#4a6699", fontSize:11 }}>{d.routes||"—"}</td>
                  <td style={{ color:"#4a6699", maxWidth:200, fontSize:11 }}>{d.commonDoses||"—"}</td>
                  <td>
                    <div style={{ display:"flex", gap:6 }}>
                      <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={()=>openEdit(d)}>✏️</button>
                      <button className="adm-btn adm-btn-red adm-btn-sm" onClick={async()=>{ if(!window.confirm("Remove drug?")) return; await FBX.deleteDrug(d.id); showToast("Drug removed."); }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && (
        <div className="adm-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget) setShowForm(false); }}>
          <div className="adm-modal" style={{ maxWidth:600 }}>
            <div className="adm-modal-hdr">
              <span className="adm-modal-title">{editItem?"✏️ Edit Drug":"💊 Add Drug to Database"}</span>
              <button className="adm-modal-close" onClick={()=>setShowForm(false)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Brand / Trade Name *</label><input className="adm-input" placeholder="e.g. Augmentin" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
                <div className="adm-form-group"><label className="adm-label">Generic Name</label><input className="adm-input" placeholder="e.g. Amoxicillin-Clavulanate" value={form.genericName} onChange={e=>setForm(f=>({...f,genericName:e.target.value}))} /></div>
              </div>
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Drug Class</label>
                  <select className="adm-select" value={form.class} onChange={e=>setForm(f=>({...f,class:e.target.value}))}>
                    <option value="">Select class</option>
                    <option>Antibiotic</option><option>Analgesic</option><option>Antihypertensive</option><option>Anticoagulant</option>
                    <option>Diuretic</option><option>Corticosteroid</option><option>Bronchodilator</option><option>Antiemetic</option>
                    <option>Antidiabetic</option><option>Sedative</option><option>Other</option>
                  </select>
                </div>
                <div className="adm-form-group"><label className="adm-label">Routes of Administration</label><input className="adm-input" placeholder="e.g. PO, IV, IM" value={form.routes} onChange={e=>setForm(f=>({...f,routes:e.target.value}))} /></div>
              </div>
              <div className="adm-form-group"><label className="adm-label">Common Doses</label><input className="adm-input" placeholder="e.g. 500mg BD, 875mg TDS" value={form.commonDoses} onChange={e=>setForm(f=>({...f,commonDoses:e.target.value}))} /></div>
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Contraindications</label><textarea className="adm-textarea" style={{ minHeight:70 }} placeholder="e.g. Penicillin allergy, severe hepatic impairment" value={form.contraindications} onChange={e=>setForm(f=>({...f,contraindications:e.target.value}))} /></div>
                <div className="adm-form-group"><label className="adm-label">Drug Interactions</label><textarea className="adm-textarea" style={{ minHeight:70 }} placeholder="e.g. Avoid with warfarin, methotrexate" value={form.interactions} onChange={e=>setForm(f=>({...f,interactions:e.target.value}))} /></div>
              </div>
            </div>
            <div className="adm-modal-foot">
              <button className="adm-btn adm-btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="adm-btn adm-btn-navy" onClick={handleSave} disabled={busy}>{busy?"Saving…":editItem?"✓ Update":"✚ Add Drug"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LabTestsPanel({ items, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ name:"",category:"",unit:"",normalRange:"",turnaround:"",specimen:"" });
  const [busy, setBusy] = useState(false);

  const openAdd = () => { setEditItem(null); setForm({ name:"",category:"",unit:"",normalRange:"",turnaround:"",specimen:"" }); setShowForm(true); };
  const openEdit = (d) => { setEditItem(d); setForm({ name:d.name,category:d.category||"",unit:d.unit||"",normalRange:d.normalRange||"",turnaround:d.turnaround||"",specimen:d.specimen||"" }); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name) { showToast("Test name is required.","error"); return; }
    setBusy(true);
    try {
      await FBX.saveLabTest({ ...form, ...(editItem?{id:editItem.id}:{}) });
      await FB.saveSystemLog(editItem?"UPDATE":"CREATE",`Lab test ${editItem?"updated":"added"}: ${form.name}`);
      showToast(editItem?"Lab test updated.":"Lab test added."); setShowForm(false);
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setBusy(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:900, color:"#0d2b6b" }}>Laboratory Tests ({items.length})</div>
        <button className="adm-btn adm-btn-navy" onClick={openAdd}>+ Add Lab Test</button>
      </div>
      {items.length===0 ? (
        <div className="adm-card"><div style={{ padding:36, textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:8, opacity:0.2 }}>🧪</div>
          <div style={{ fontWeight:700, color:"#4a6699", marginBottom:10 }}>No lab tests configured yet</div>
          <button className="adm-btn adm-btn-navy" onClick={openAdd}>+ Add First Lab Test</button>
        </div></div>
      ) : (
        <div className="adm-card">
          <table className="adm-table">
            <thead><tr><th>Test Name</th><th>Category</th><th>Unit</th><th>Normal Range</th><th>Specimen</th><th>TAT</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map(d=>(
                <tr key={d.id}>
                  <td style={{ fontWeight:900 }}>{d.name}</td>
                  <td>{d.category ? <span className="adm-badge adm-badge-navy" style={{fontSize:10}}>{d.category}</span> : "—"}</td>
                  <td style={{ fontFamily:"monospace", fontSize:12 }}>{d.unit||"—"}</td>
                  <td style={{ color:"#059669", fontWeight:700, fontSize:12 }}>{d.normalRange||"—"}</td>
                  <td style={{ color:"#4a6699", fontSize:12 }}>{d.specimen||"—"}</td>
                  <td style={{ color:"#4a6699", fontSize:12 }}>{d.turnaround||"—"}</td>
                  <td>
                    <div style={{ display:"flex", gap:6 }}>
                      <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={()=>openEdit(d)}>✏️</button>
                      <button className="adm-btn adm-btn-red adm-btn-sm" onClick={async()=>{ if(!window.confirm("Remove lab test?")) return; await FBX.deleteLabTest(d.id); showToast("Lab test removed."); }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && (
        <div className="adm-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget) setShowForm(false); }}>
          <div className="adm-modal">
            <div className="adm-modal-hdr">
              <span className="adm-modal-title">{editItem?"✏️ Edit Lab Test":"🧪 Add Laboratory Test"}</span>
              <button className="adm-modal-close" onClick={()=>setShowForm(false)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Test Name *</label><input className="adm-input" placeholder="e.g. Full Blood Count" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
                <div className="adm-form-group"><label className="adm-label">Category</label>
                  <select className="adm-select" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
                    <option value="">Select</option>
                    <option>Haematology</option><option>Biochemistry</option><option>Microbiology</option>
                    <option>Serology</option><option>Endocrinology</option><option>Urine Analysis</option><option>Other</option>
                  </select>
                </div>
              </div>
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Unit</label><input className="adm-input" placeholder="e.g. g/dL, mmol/L" value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} /></div>
                <div className="adm-form-group"><label className="adm-label">Normal Range</label><input className="adm-input" placeholder="e.g. 12.0–16.0" value={form.normalRange} onChange={e=>setForm(f=>({...f,normalRange:e.target.value}))} /></div>
              </div>
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Specimen Type</label><input className="adm-input" placeholder="e.g. EDTA blood, Urine, Swab" value={form.specimen} onChange={e=>setForm(f=>({...f,specimen:e.target.value}))} /></div>
                <div className="adm-form-group"><label className="adm-label">Turnaround Time</label><input className="adm-input" placeholder="e.g. 4–6 hours, Same day" value={form.turnaround} onChange={e=>setForm(f=>({...f,turnaround:e.target.value}))} /></div>
              </div>
            </div>
            <div className="adm-modal-foot">
              <button className="adm-btn adm-btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="adm-btn adm-btn-navy" onClick={handleSave} disabled={busy}>{busy?"Saving…":editItem?"✓ Update":"✚ Add Test"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BILLING SYSTEM ────────────────────────────────────────────────────────────
function AdminBilling({ patients, showToast }) {
  const [bills, setBills] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ patientId:"",patientName:"",services:[],notes:"" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = FBX.onBills(setBills);
    return () => unsub();
  }, []);

  const activePatients = patients.filter(p=>!p.deleted);

  const addServiceRow = () => setForm(f=>({ ...f, services:[...f.services, { id:uid(), description:"",quantity:1,unitPrice:0 }] }));
  const updateService = (i,k,v) => setForm(f=>({ ...f, services:f.services.map((s,j)=>j===i?{...s,[k]:v}:s) }));
  const removeService = (i) => setForm(f=>({ ...f, services:f.services.filter((_,j)=>j!==i) }));
  const calcTotal = (services) => services.reduce((t,s)=>t+((+s.quantity||0)*(+s.unitPrice||0)),0);

  const handleSave = async () => {
    if (!form.patientName||form.services.length===0) { showToast("Patient and at least one service required.","error"); return; }
    setBusy(true);
    try {
      const total = calcTotal(form.services);
      await FBX.saveBill({ ...form, total, status:"unpaid", invoiceNo:"INV-"+Math.random().toString(36).slice(2,8).toUpperCase() });
      await FB.saveSystemLog("CREATE",`Bill created for ${form.patientName} — Total: ₦${total.toLocaleString()}`);
      showToast("Bill created successfully."); setShowForm(false);
      setForm({ patientId:"",patientName:"",services:[],notes:"" });
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setBusy(false);
  };

  const handleMarkPaid = async (b) => {
    try { await FBX.updateBill(b.id,{ status:"paid",paidAt:new Date().toISOString() }); await FB.saveSystemLog("UPDATE",`Bill paid: ${b.invoiceNo} — ${b.patientName}`); showToast("Bill marked as paid."); }
    catch(e) { showToast("Error: "+e.message,"error"); }
  };

  const visible = bills.filter(b=>{
    const matchFilter = filter==="all"||b.status===filter;
    const matchSearch = !search||b.patientName?.toLowerCase().includes(search.toLowerCase())||b.invoiceNo?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const totalRevenue = bills.filter(b=>b.status==="paid").reduce((t,b)=>t+(+b.total||0),0);
  const totalPending = bills.filter(b=>b.status==="unpaid").reduce((t,b)=>t+(+b.total||0),0);

  return (
    <div>
      <div className="adm-section-hdr">
        <div>
          <div className="adm-section-title">Billing System</div>
          <div className="adm-section-sub">{bills.length} invoices · ₦{totalRevenue.toLocaleString()} collected</div>
        </div>
        <button className="adm-btn adm-btn-navy" onClick={()=>setShowForm(true)}>+ Create Bill</button>
      </div>

      <div className="adm-stats-row" style={{ gridTemplateColumns:"repeat(3,1fr)", marginBottom:18 }}>
        {[
          { icon:"💰", label:"Total Revenue", val:`₦${totalRevenue.toLocaleString()}`, note:`${bills.filter(b=>b.status==="paid").length} paid invoices` },
          { icon:"⏳", label:"Outstanding", val:`₦${totalPending.toLocaleString()}`, note:`${bills.filter(b=>b.status==="unpaid").length} unpaid invoices` },
          { icon:"📄", label:"Total Invoices", val:bills.length, note:"All time" },
        ].map((s,i)=>(
          <div key={i} className="adm-stat-card">
            <div className="adm-stat-icon">{s.icon}</div>
            <div className="adm-stat-val" style={{ fontSize:s.val.toString().length>10?18:28 }}>{s.val}</div>
            <div className="adm-stat-label">{s.label}</div>
            <div className="adm-stat-note">{s.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:9, marginBottom:14, flexWrap:"wrap" }}>
        {["all","unpaid","paid"].map(f=>(
          <button key={f} className="adm-btn adm-btn-ghost adm-btn-sm" style={filter===f?{background:"#0d2b6b",color:"#fff"}:{}} onClick={()=>setFilter(f)}>
            {f==="all"?"All Bills":f==="unpaid"?"⏳ Unpaid":"✅ Paid"}
          </button>
        ))}
        <div className="adm-search-bar"><span style={{color:"#8aa0cc"}}>🔍</span><input placeholder="Search by patient or invoice…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
      </div>

      <div className="adm-card">
        <table className="adm-table">
          <thead><tr><th>Invoice No.</th><th>Patient</th><th>Total</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            {visible.length===0
              ? <tr><td colSpan={6} style={{textAlign:"center",padding:30,color:"#8aa0cc"}}>No bills found</td></tr>
              : visible.map(b=>(
                <tr key={b.id}>
                  <td><span style={{ fontFamily:"monospace", fontWeight:900, color:"#0d2b6b" }}>{b.invoiceNo||"—"}</span></td>
                  <td style={{ fontWeight:900 }}>{b.patientName}</td>
                  <td><span style={{ fontFamily:"monospace", fontWeight:900, color:"#059669" }}>₦{(+b.total||0).toLocaleString()}</span></td>
                  <td>
                    <span className={`adm-badge ${b.status==="paid"?"adm-badge-green":"adm-badge-amber"}`}>
                      {b.status==="paid"?"✅ Paid":"⏳ Unpaid"}
                    </span>
                  </td>
                  <td style={{ color:"#4a6699", fontSize:11 }}>{b.createdAt?.toDate?b.createdAt.toDate().toLocaleDateString():"—"}</td>
                  <td>
                    {b.status==="unpaid" && <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={()=>handleMarkPaid(b)}>✓ Mark Paid</button>}
                    {b.status==="paid" && <span style={{ fontSize:11, color:"#059669", fontWeight:700 }}>Settled</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="adm-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget) setShowForm(false); }}>
          <div className="adm-modal" style={{ maxWidth:640 }}>
            <div className="adm-modal-hdr">
              <span className="adm-modal-title">💰 Create Bill / Invoice</span>
              <button className="adm-modal-close" onClick={()=>setShowForm(false)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <div className="adm-form-group"><label className="adm-label">Patient *</label>
                <select className="adm-select" value={form.patientId} onChange={e=>{ const p=activePatients.find(x=>x.id===e.target.value); setForm(f=>({ ...f, patientId:e.target.value, patientName:p?.name||"" })); }}>
                  <option value="">Select patient</option>
                  {activePatients.map(p=><option key={p.id} value={p.id}>{p.name} — EMR: {p.emr||"—"}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <label className="adm-label" style={{ marginBottom:0 }}>Services / Items *</label>
                  <button className="adm-btn adm-btn-ghost adm-btn-sm" onClick={addServiceRow}>+ Add Item</button>
                </div>
                {form.services.length===0 && <div style={{ padding:"12px 0", color:"#8aa0cc", fontSize:12, textAlign:"center" }}>No services added. Click + Add Item.</div>}
                {form.services.map((s,i)=>(
                  <div key={s.id} style={{ display:"grid", gridTemplateColumns:"3fr 1fr 1fr auto", gap:8, marginBottom:7, alignItems:"end" }}>
                    <div><label className="adm-label" style={{fontSize:9}}>Description</label><input className="adm-input" placeholder="e.g. Consultation, X-Ray" value={s.description} onChange={e=>updateService(i,"description",e.target.value)} /></div>
                    <div><label className="adm-label" style={{fontSize:9}}>Qty</label><input className="adm-input" type="number" min="1" value={s.quantity} onChange={e=>updateService(i,"quantity",e.target.value)} /></div>
                    <div><label className="adm-label" style={{fontSize:9}}>Unit Price (₦)</label><input className="adm-input" type="number" min="0" placeholder="0" value={s.unitPrice} onChange={e=>updateService(i,"unitPrice",e.target.value)} /></div>
                    <div style={{ paddingTop:16 }}><button className="adm-btn adm-btn-red adm-btn-sm" onClick={()=>removeService(i)}>✕</button></div>
                  </div>
                ))}
                {form.services.length>0 && (
                  <div style={{ textAlign:"right", padding:"8px 0", fontWeight:900, color:"#0d2b6b", fontSize:14 }}>
                    Total: <span style={{ fontFamily:"monospace" }}>₦{calcTotal(form.services).toLocaleString()}</span>
                  </div>
                )}
              </div>
              <div className="adm-form-group"><label className="adm-label">Notes</label><textarea className="adm-textarea" style={{ minHeight:60 }} placeholder="Any billing notes…" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>
            </div>
            <div className="adm-modal-foot">
              <button className="adm-btn adm-btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="adm-btn adm-btn-navy" onClick={handleSave} disabled={busy}>{busy?"Creating…":"💰 Create Invoice"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SYSTEM ANALYTICS ──────────────────────────────────────────────────────────
function AdminAnalytics({ patients, users, wardReports, bills }) {
  const activePatients = patients.filter(p=>!p.deleted&&(p.status||"active")==="active");
  const dischargedPatients = patients.filter(p=>!p.deleted&&p.status==="discharged");
  const allPatients = patients.filter(p=>!p.deleted);
  const activeStaff = users.filter(u=>!u.deleted&&!u.suspended);

  // Ward distribution
  const wardDist = {};
  activePatients.forEach(p=>{ const w=(p.ward||"Unknown").split("–")[0].trim(); wardDist[w]=(wardDist[w]||0)+1; });
  const topWards = Object.entries(wardDist).sort((a,b)=>b[1]-a[1]);

  // Role distribution
  const roleDist = { nurse:0, supervisor:0, wardmaster:0 };
  activeStaff.forEach(u=>{ if(roleDist[u.role]!==undefined) roleDist[u.role]++; });

  // Reports in last 7 days
  const now = new Date();
  const recentReports = wardReports.filter(r=>{ const d=new Date(r.date); return (now-d)/(1000*60*60*24)<=7; });

  // Billing
  const totalRevenue = (bills||[]).filter(b=>b.status==="paid").reduce((t,b)=>t+(+b.total||0),0);
  const outstandingBills = (bills||[]).filter(b=>b.status==="unpaid").reduce((t,b)=>t+(+b.total||0),0);

  // Critical vitals count
  const criticalCount = allPatients.filter(p=>checkVitalAlerts(p.vitals?.[0]||{}).some(a=>a.level==="critical")).length;

  const Bar = ({ value, max, color="#0d2b6b" }) => (
    <div style={{ height:8, background:"#e8edf8", borderRadius:4, overflow:"hidden", marginTop:4 }}>
      <div style={{ height:"100%", width:`${Math.min(100,(value/Math.max(max,1))*100)}%`, background:color, borderRadius:4, transition:"width .4s" }} />
    </div>
  );

  return (
    <div>
      <div className="adm-section-hdr">
        <div>
          <div className="adm-section-title">System Analytics</div>
          <div className="adm-section-sub">Live overview · {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        </div>
        <div className="adm-live-badge"><div className="adm-live-dot" />Live Data</div>
      </div>

      <div className="adm-stats-row" style={{ gridTemplateColumns:"repeat(4,1fr)" }}>
        {[
          { icon:"🏥", val:activePatients.length, label:"Active Patients", note:`${allPatients.length} total records`, color:"#0d2b6b" },
          { icon:"👥", val:activeStaff.length, label:"Active Staff", note:`${users.filter(u=>u.suspended).length} suspended`, color:"#059669" },
          { icon:"⚠️", val:criticalCount, label:"Critical Vitals", note:"Patients needing attention", color:"#dc2626" },
          { icon:"📋", val:recentReports.length, label:"Reports (7 days)", note:`${wardReports.length} all-time`, color:"#d97706" },
        ].map((s,i)=>(
          <div key={i} className="adm-stat-card" style={{ borderTopColor:s.color }}>
            <div className="adm-stat-icon">{s.icon}</div>
            <div className="adm-stat-val" style={{ color:s.color }}>{s.val}</div>
            <div className="adm-stat-label">{s.label}</div>
            <div className="adm-stat-note">{s.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">🏥 Patient Distribution by Ward</span></div>
          <div className="adm-card-body">
            {topWards.length===0
              ? <div style={{ color:"#8aa0cc", textAlign:"center", padding:20 }}>No patient data</div>
              : topWards.map(([ward,count])=>(
                <div key={ward} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"#0a1628" }}>{ward}</span>
                    <span style={{ fontSize:12, fontWeight:900, color:"#0d2b6b" }}>{count} patients</span>
                  </div>
                  <Bar value={count} max={activePatients.length} />
                </div>
              ))}
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">👥 Staff by Role</span></div>
          <div className="adm-card-body">
            {[["Ward Nurses","nurse","#0d2b6b"],["Supervisors","supervisor","#059669"],["Ward Masters","wardmaster","#d97706"]].map(([label,role,color])=>(
              <div key={role} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:"#0a1628" }}>{label}</span>
                  <span style={{ fontSize:12, fontWeight:900, color }}>{roleDist[role]}</span>
                </div>
                <Bar value={roleDist[role]} max={activeStaff.length} color={color} />
              </div>
            ))}
            <div className="adm-divider" />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:9 }}>
              {[["Active","#059669",activeStaff.length],["Suspended","#d97706",users.filter(u=>u.suspended).length]].map(([l,c,v])=>(
                <div key={l} style={{ background:"#f5f8ff", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:900, color:c }}>{v}</div>
                  <div style={{ fontSize:11, color:"#4a6699", fontWeight:700 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">💰 Billing Summary</span></div>
          <div className="adm-card-body">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              {[["Total Revenue","₦"+totalRevenue.toLocaleString(),"#059669"],["Outstanding","₦"+outstandingBills.toLocaleString(),"#d97706"]].map(([l,v,c])=>(
                <div key={l} style={{ background:"#f5f8ff", borderRadius:8, padding:12, textAlign:"center" }}>
                  <div style={{ fontSize:16, fontWeight:900, color:c, fontFamily:"monospace" }}>{v}</div>
                  <div style={{ fontSize:11, color:"#4a6699", fontWeight:700, marginTop:2 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:12, color:"#4a6699", fontWeight:700 }}>
              {(bills||[]).length} total invoices · {(bills||[]).filter(b=>b.status==="paid").length} paid · {(bills||[]).filter(b=>b.status==="unpaid").length} pending
            </div>
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">📊 Patient Status Overview</span></div>
          <div className="adm-card-body">
            {[["Active",activePatients.length,"#059669"],["Discharged",dischargedPatients.length,"#d97706"],["Total Records",allPatients.length,"#0d2b6b"]].map(([l,v,c])=>(
              <div key={l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid #eef2fa" }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#0a1628" }}>{l}</span>
                <span style={{ fontSize:18, fontWeight:900, color:c, fontFamily:"monospace" }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#8aa0cc", marginBottom:5, textTransform:"uppercase" }}>Patient Flow</div>
              <Bar value={activePatients.length} max={allPatients.length} color="#059669" />
              <div style={{ fontSize:10, color:"#8aa0cc", marginTop:3 }}>{allPatients.length>0?Math.round((activePatients.length/allPatients.length)*100):0}% currently active</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ENHANCED AdminSettings with 2FA Config ────────────────────────────────────
function AdminSettings({ showToast }) {
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [ejsCfg, setEjsCfg] = useState({ serviceId:"", templateId:"", publicKey:"" });
  const [savedCfg, setSavedCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    FBX.get2FAEnabled().then(v => setTwoFAEnabled(!!v)).catch(()=>{});
    FBX.getEmailJSConfig().then(c => { if(c){ setSavedCfg(c); setEjsCfg({ serviceId:c.serviceId||"", templateId:c.templateId||"", publicKey:c.publicKey||"" }); }}).catch(()=>{});
  }, []);

  const handleSaveEmailJS = async () => {
    if (!ejsCfg.serviceId||!ejsCfg.templateId||!ejsCfg.publicKey) { showToast("Fill in all three EmailJS fields.","error"); return; }
    setSaving(true);
    try {
      await FBX.saveEmailJSConfig(ejsCfg);
      setSavedCfg(ejsCfg);
      await FB.saveSystemLog("UPDATE","EmailJS configuration updated");
      showToast("EmailJS credentials saved.");
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setSaving(false);
  };

  const handleToggle2FA = async () => {
    const next = !twoFAEnabled;
    if (next && (!savedCfg||!savedCfg.serviceId)) { showToast("Save EmailJS credentials before enabling 2FA.","error"); return; }
    setSaving(true);
    try {
      await FBX.set2FAEnabled(next);
      setTwoFAEnabled(next);
      await FB.saveSystemLog("UPDATE","2FA email verification "+(next?"enabled":"disabled"));
      showToast("2FA "+(next?"enabled — staff must verify email on login.":"disabled."));
    } catch(e) { showToast("Error: "+e.message,"error"); }
    setSaving(false);
  };

  const handleTestEmail = async () => {
    if (!testEmail) { showToast("Enter a test email address.","error"); return; }
    if (!savedCfg||!savedCfg.serviceId) { showToast("Save EmailJS credentials first.","error"); return; }
    setTesting(true);
    const testOTP = Math.floor(100000 + Math.random() * 900000);
    const result = await sendOTPEmail(testEmail, "Test User", testOTP, savedCfg);
    if (result.ok) showToast(`Test email sent to ${testEmail}. Code was: ${testOTP}`,"success");
    else showToast("Test failed: "+result.error,"error");
    setTesting(false);
  };

  return (
    <div>
      <div className="adm-section-title" style={{ marginBottom:20 }}>⚙️ System Configuration</div>
      <div className="adm-notice adm-notice-warn">⚠️ Changes in this section affect all users across the entire MedRecord system.</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>

        {/* EmailJS Config */}
        <div className="adm-card" style={{ gridColumn:"1/-1" }}>
          <div className="adm-card-hdr"><span className="adm-card-title">📧 Email Service (EmailJS)</span></div>
          <div className="adm-card-body">
            <div className="adm-notice adm-notice-info" style={{ marginBottom:14 }}>
              ℹ️ MedRecord uses <strong>EmailJS</strong> (free tier, no backend needed) to send OTP codes.
              Create a free account at <strong>emailjs.com</strong>, set up a service and email template, then paste your credentials here.
              Your template must include variables: <code style={{fontFamily:"monospace",background:"rgba(0,0,0,0.06)",padding:"1px 5px",borderRadius:4}}>{"{{otp_code}}"}</code>, <code style={{fontFamily:"monospace",background:"rgba(0,0,0,0.06)",padding:"1px 5px",borderRadius:4}}>{"{{to_name}}"}</code>, <code style={{fontFamily:"monospace",background:"rgba(0,0,0,0.06)",padding:"1px 5px",borderRadius:4}}>{"{{to_email}}"}</code>.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:14 }}>
              <div className="adm-form-group">
                <label className="adm-label">Service ID</label>
                <input className="adm-input" placeholder="service_xxxxxxx" value={ejsCfg.serviceId} onChange={e=>setEjsCfg(x=>({...x,serviceId:e.target.value.trim()}))} style={{fontFamily:"monospace"}} />
              </div>
              <div className="adm-form-group">
                <label className="adm-label">Template ID</label>
                <input className="adm-input" placeholder="template_xxxxxxx" value={ejsCfg.templateId} onChange={e=>setEjsCfg(x=>({...x,templateId:e.target.value.trim()}))} style={{fontFamily:"monospace"}} />
              </div>
              <div className="adm-form-group">
                <label className="adm-label">Public Key</label>
                <input className="adm-input" placeholder="XXXXXXXXXXXXXXXXXXXX" value={ejsCfg.publicKey} onChange={e=>setEjsCfg(x=>({...x,publicKey:e.target.value.trim()}))} style={{fontFamily:"monospace"}} />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
              <button className="adm-btn adm-btn-navy" onClick={handleSaveEmailJS} disabled={saving}>{saving?"Saving…":"💾 Save EmailJS Credentials"}</button>
              {savedCfg && <span className="adm-badge adm-badge-green" style={{fontSize:12}}>✓ Credentials saved</span>}
            </div>
            {savedCfg && (
              <div style={{ marginTop:16, paddingTop:14, borderTop:"1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#4a6699", marginBottom:8 }}>🧪 Send Test Email</div>
                <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                  <input className="adm-input" style={{ maxWidth:260 }} placeholder="recipient@email.com" value={testEmail} onChange={e=>setTestEmail(e.target.value)} type="email" />
                  <button className="adm-btn adm-btn-outline" onClick={handleTestEmail} disabled={testing}>{testing?"Sending…":"Send Test OTP"}</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2FA Toggle */}
        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">🔐 Two-Factor Authentication</span></div>
          <div className="adm-card-body">
            <div className="adm-notice adm-notice-info" style={{ marginBottom:14 }}>
              ℹ️ When enabled, all staff must verify their email with a 6-digit OTP after entering their password. Admin login is not affected.
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>Current status:</div>
              {twoFAEnabled
                ? <span className="adm-badge adm-badge-green" style={{fontSize:13}}>✓ 2FA Enabled</span>
                : <span className="adm-badge adm-badge-amber" style={{fontSize:13}}>⚠️ 2FA Disabled</span>}
            </div>
            <button
              className={`adm-btn ${twoFAEnabled ? "adm-btn-outline" : "adm-btn-navy"}`}
              onClick={handleToggle2FA}
              disabled={saving}
              style={{ minWidth:160 }}
            >
              {saving ? "Saving…" : twoFAEnabled ? "🔓 Disable 2FA" : "🔐 Enable 2FA"}
            </button>
          </div>
        </div>

        {/* Admin Credentials */}
        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">🛡️ Admin Credentials</span></div>
          <div className="adm-card-body">
            <div className="adm-notice adm-notice-info">ℹ️ Admin credentials are configured in the application source code.</div>
            <div style={{ fontSize:13, fontWeight:700, lineHeight:2.2, color:"#1a2e5a" }}>
              <div>Email: <span style={{ color:"#0d2b6b", fontWeight:900 }}>{ADMIN_EMAIL}</span></div>
              <div>Role: <span className="adm-badge adm-badge-gold">System Administrator</span></div>
              <div>Access Level: <span style={{ fontWeight:900, color:"#0d2b6b" }}>Full System Control</span></div>
              <div>2FA: <span className="adm-badge adm-badge-navy" style={{fontSize:11}}>Exempt — Direct Login</span></div>
            </div>
          </div>
        </div>

        {/* Database Info */}
        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">🗄️ Database</span></div>
          <div className="adm-card-body">
            <div style={{ fontSize:13, fontWeight:700, lineHeight:2.2, color:"#1a2e5a" }}>
              <div>Provider: <span style={{ fontWeight:900 }}>Firebase Firestore</span></div>
              <div>Project: <span style={{ fontWeight:900, fontFamily:"monospace" }}>the-elites-nurses</span></div>
              <div>Status: <span className="adm-badge adm-badge-green">✓ Connected</span></div>
              <div>AI Engine: <span style={{ fontWeight:900, color:"#0d2b6b" }}>Claude (Anthropic)</span></div>
            </div>
          </div>
        </div>

        {/* Wards */}
        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">🏥 Configured Wards</span></div>
          <div className="adm-card-body">
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {WARDS.map(w=><span key={w} className="adm-badge adm-badge-navy" style={{fontSize:12}}>{w.split("–")[0].trim()}</span>)}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── MAIN ADMIN APP SHELL ──────────────────────────────────────────────────────
function AdminApp({ onLogout }) {
  const [section, setSection] = useState("analytics");
  const [patients, setPatients] = useState([]);
  const [users, setUsers] = useState([]);
  const [wardReports, setWardReports] = useState([]);
  const [archives, setArchives] = useState([]);
  const [logs, setLogs] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [bills, setBills] = useState([]);
  const [toastState, showToast] = useToast();

  const loadUsers = () => FB.getUsers().then(setUsers).catch(()=>{});

  useEffect(() => {
    const u1 = FB.onPatients(setPatients);
    const u2 = FB.onWardReports(setWardReports);
    const u3 = FB.on24hrArchives(setArchives);
    const u4 = FB.onSystemLogs(setLogs);
    const u5 = FB.onAnnouncements(setAnnouncements);
    const u6 = FBX.onBills(setBills);
    loadUsers();
    FB.saveSystemLog("LOGIN","Administrator session started");
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); };
  }, []);

  const navGroups = [
    {
      section: "Overview",
      items: [
        { id:"analytics", icon:"📊", label:"System Analytics" },
        { id:"dashboard", icon:"🏠", label:"Dashboard" },
      ]
    },
    {
      section: "Management",
      items: [
        { id:"users", icon:"👥", label:"User Management", count:users.filter(u=>!u.deleted&&!u.suspended).length },
        { id:"departments", icon:"🏢", label:"Department Management" },
        { id:"patients", icon:"🏥", label:"Patient Database", count:patients.filter(p=>!p.deleted).length },
      ]
    },
    {
      section: "Clinical",
      items: [
        { id:"emr", icon:"⚕️", label:"EMR Configuration" },
        { id:"billing", icon:"💰", label:"Billing System", count:bills.filter(b=>b.status==="unpaid").length||undefined },
      ]
    },
    {
      section: "Operations",
      items: [
        { id:"reports", icon:"📋", label:"Reports" },
        { id:"announcements", icon:"📢", label:"Announcements", count:announcements.filter(a=>!a.deleted).length||undefined },
        { id:"logs", icon:"📜", label:"Audit Logs", count:logs.length },
      ]
    },
    {
      section: "System",
      items: [
        { id:"settings", icon:"⚙️", label:"System Settings" },
      ]
    },
  ];

  const titles = {
    analytics:"System Analytics", dashboard:"Dashboard", users:"User Management",
    departments:"Department Management", patients:"Patient Database", emr:"EMR Configuration",
    billing:"Billing System", reports:"Reports Overview", announcements:"Announcements",
    logs:"Audit Log", settings:"System Settings",
  };

  return (
    <div className="adm-root">
      <style>{adminCss}</style>
      <Toast msg={toastState.msg} type={toastState.type} />

      <nav className="adm-sidebar">
        <div className="adm-logo-area">
          <div className="adm-logo-shield">🛡️</div>
          <div className="adm-logo-name">MedRecord</div>
          <div className="adm-logo-sub">Administrator Console</div>
        </div>
        <div className="adm-user-strip">
          <div className="adm-user-circle">A</div>
          <div>
            <div className="adm-user-name">System Administrator</div>
            <div className="adm-user-title">General Overseer</div>
          </div>
        </div>
        <div className="adm-nav-area">
          {navGroups.map(group => (
            <div key={group.section}>
              <div className="adm-nav-section">{group.section}</div>
              {group.items.map(n => (
                <button key={n.id} className={`adm-nav-btn ${section===n.id?"active":""}`} onClick={()=>setSection(n.id)}>
                  <span className="adm-ni">{n.icon}</span>
                  {n.label}
                  {n.count!==undefined && n.count>0 && <span className="adm-nav-count">{n.count}</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="adm-nav-section">Session</div>
          <button className="adm-nav-btn danger-btn" onClick={()=>{ FB.saveSystemLog("LOGIN","Administrator session ended"); onLogout(); }}>
            <span className="adm-ni">🚪</span>Sign Out
          </button>
        </div>
        <div className="adm-sidebar-footer">
          {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})} · All rights reserved
        </div>
      </nav>

      <div className="adm-main">
        <div className="adm-topbar">
          <div className="adm-topbar-left">
            <div className="adm-topbar-title">{titles[section]||section}</div>
            <div className="adm-topbar-sub">MedRecord EMR · General Overseer View</div>
          </div>
          <div className="adm-topbar-right">
            <div className="adm-live-badge"><div className="adm-live-dot" />System Online</div>
            <span className="adm-topbar-email">{ADMIN_EMAIL}</span>
          </div>
        </div>
        <div className="adm-content">
          {section==="analytics"  && <AdminAnalytics patients={patients} users={users} wardReports={wardReports} bills={bills} />}
          {section==="dashboard"  && <AdminDashboard patients={patients} users={users} wardReports={wardReports} logs={logs} announcements={announcements} />}
          {section==="users"      && <AdminUsers users={users} onRefresh={loadUsers} showToast={showToast} />}
          {section==="departments"&& <AdminDepartments showToast={showToast} />}
          {section==="patients"   && <AdminPatients patients={patients} showToast={showToast} />}
          {section==="emr"        && <AdminEMRConfig showToast={showToast} />}
          {section==="billing"    && <AdminBilling patients={patients} showToast={showToast} />}
          {section==="reports"    && <AdminReports wardReports={wardReports} archives={archives} />}
          {section==="announcements" && <AdminAnnouncements announcements={announcements} showToast={showToast} />}
          {section==="logs"       && <AdminLogs logs={logs} />}
          {section==="settings"   && <AdminSettings showToast={showToast} />}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// NURSE: TRIAGE / CARE PLAN / SEND TO PHYSICIAN
// ═══════════════════════════════════════════════════════════════════════════

function NurseTriageSection({ patients, user, showToast, onRefresh }) {
  const [selectedId, setSelectedId] = useState(null);
  const [td, setTd] = useState({ weight:"", height:"", temp:"", bp:"", hr:"", rr:"", spo2:"", painScore:0, chiefComplaint:"", date: new Date().toISOString().slice(0,16) });
  const [saving, setSaving] = useState(false);
  const selected = patients.find(p=>p.id===selectedId)||null;
  const set=(k,v)=>setTd(x=>({...x,[k]:v}));
  const handleSave=async()=>{
    if(!selected){showToast("Select a patient.","error");return;}
    setSaving(true);
    const triageEntry={...td,id:uid(),triageBy:user.name,at:new Date().toISOString()};
    const vitalsEntry={bp:td.bp,hr:td.hr,temp:td.temp,rr:td.rr,spo2:td.spo2,date:td.date?.split("T")[0]||today(),time:td.date?.split("T")[1]?.slice(0,5)||nowTime(),nurse:user.name,id:uid(),recordedAt:new Date().toISOString()};
    const updated={...selected,triageRecords:[triageEntry,...(selected.triageRecords||[])],vitals:[vitalsEntry,...(selected.vitals||[])],weight:td.weight||selected.weight};
    await FB.savePatient(updated);onRefresh(updated);setSaving(false);
    showToast("Triage saved.");
    setTd({weight:"",height:"",temp:"",bp:"",hr:"",rr:"",spo2:"",painScore:0,chiefComplaint:"",date:new Date().toISOString().slice(0,16)});
  };
  return (
    <div style={{padding:22,overflowY:"auto",flex:1}}>
      <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>🚨 Patient Triage</div>
      <div style={{fontSize:12,color:"var(--t2)",marginBottom:18}}>Record vital signs, weight, and pain score at triage</div>
      <div className="card" style={{padding:16,marginBottom:14}}>
        <div className="form-group">
          <label className="form-label">Select Patient *</label>
          <select className="form-select" value={selectedId||""} onChange={e=>setSelectedId(e.target.value||null)}>
            <option value="">— Select patient —</option>
            {patients.filter(p=>!p.deleted&&(p.status||"active")==="active").map(p=><option key={p.id} value={p.id}>{p.name} · {p.ward||"No ward"} · EMR:{p.emr||"—"}</option>)}
          </select>
        </div>
        {selected&&<div style={{background:"var(--bg3)",borderRadius:"var(--r-sm)",padding:"8px 12px",fontSize:12,color:"var(--t2)",marginTop:4}}><strong style={{color:"var(--t1)"}}>{selected.name}</strong> · {selected.diagnosis||"No diagnosis"} · Allergies: {selected.allergies||"NKDA"}</div>}
      </div>
      <div className="card" style={{padding:16,marginBottom:14}}>
        <div style={{fontWeight:900,fontSize:13,marginBottom:10}}>📋 Chief Complaint & Time</div>
        <div className="form-group"><label className="form-label">Date & Time</label><input className="form-input" type="datetime-local" value={td.date} onChange={e=>set("date",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Chief Complaint</label><textarea className="form-textarea" style={{minHeight:60}} value={td.chiefComplaint} onChange={e=>set("chiefComplaint",e.target.value)} placeholder="Presenting complaint…"/></div>
      </div>
      <div className="card" style={{padding:16,marginBottom:14}}>
        <div style={{fontWeight:900,fontSize:13,marginBottom:10}}>⚖️ Anthropometric</div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Weight (kg)</label><input className="form-input" type="number" step="0.1" value={td.weight} onChange={e=>set("weight",e.target.value)} placeholder="70.5"/></div>
          <div className="form-group"><label className="form-label">Height (cm)</label><input className="form-input" type="number" value={td.height} onChange={e=>set("height",e.target.value)} placeholder="175"/></div>
        </div>
      </div>
      <div className="card" style={{padding:16,marginBottom:14}}>
        <div style={{fontWeight:900,fontSize:13,marginBottom:10}}>💓 Vital Signs</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <div className="form-group"><label className="form-label">Temperature (°C)</label><input className="form-input" type="number" step="0.1" value={td.temp} onChange={e=>set("temp",e.target.value)} placeholder="36.5"/></div>
          <div className="form-group"><label className="form-label">Blood Pressure</label><input className="form-input" value={td.bp} onChange={e=>set("bp",e.target.value)} placeholder="120/80"/></div>
          <div className="form-group"><label className="form-label">Heart Rate (bpm)</label><input className="form-input" type="number" value={td.hr} onChange={e=>set("hr",e.target.value)} placeholder="72"/></div>
          <div className="form-group"><label className="form-label">Resp. Rate</label><input className="form-input" type="number" value={td.rr} onChange={e=>set("rr",e.target.value)} placeholder="16"/></div>
          <div className="form-group"><label className="form-label">SpO₂ (%)</label><input className="form-input" type="number" value={td.spo2} onChange={e=>set("spo2",e.target.value)} placeholder="98"/></div>
        </div>
      </div>
      <div className="card" style={{padding:16,marginBottom:14}}>
        <div style={{fontWeight:900,fontSize:13,marginBottom:10}}>😣 Pain Score (0–10)</div>
        <div className="pain-scale">{PAIN_SCALE.map(n=><button key={n} className={"pain-btn "+(td.painScore===n?"selected":"")} onClick={()=>set("painScore",n)}>{n}</button>)}</div>
        <div style={{fontSize:11,color:"var(--t2)",marginTop:8}}>Selected: <strong>{td.painScore}/10</strong> — {td.painScore===0?"No pain":td.painScore<=3?"Mild":td.painScore<=6?"Moderate":"Severe"}</div>
      </div>
      <button className="btn btn-primary" onClick={handleSave} disabled={saving||!selectedId}>{saving?<><span className="ai-spinner"/>Saving…</>:"🚨 Save Triage"}</button>
    </div>
  );
}

function NurseCarePlanSection({ patients, user, showToast, onRefresh }) {
  const [selectedId, setSelectedId] = useState(null);
  const [planText, setPlanText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const selected = patients.find(p=>p.id===selectedId)||null;
  const generateAI=async()=>{
    if(!selected){showToast("Select a patient first.","error");return;}
    setAiLoading(true);
    try{const r=await AI.careSuggestions(selected);setPlanText(r);}
    catch(e){showToast("AI error: "+e.message,"error");}
    setAiLoading(false);
  };
  const savePlan=async()=>{
    if(!selected||!planText.trim()){showToast("Write a care plan first.","error");return;}
    setSaving(true);
    const updated={...selected,carePlans:[{id:uid(),plan:planText,by:user.name,at:new Date().toISOString(),date:today()},...(selected.carePlans||[])]};
    await FB.savePatient(updated);onRefresh(updated);setSaving(false);showToast("Care plan saved.");setPlanText("");
  };
  return (
    <div style={{padding:22,overflowY:"auto",flex:1}}>
      <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>📋 Nursing Care Plan</div>
      <div style={{fontSize:12,color:"var(--t2)",marginBottom:18}}>Write or generate AI-assisted nursing care plans</div>
      <div className="card" style={{padding:16,marginBottom:14}}>
        <label className="form-label">Select Patient</label>
        <select className="form-select" value={selectedId||""} onChange={e=>{setSelectedId(e.target.value||null);setPlanText("");}}>
          <option value="">— Select patient —</option>
          {patients.filter(p=>!p.deleted&&(p.status||"active")==="active").map(p=><option key={p.id} value={p.id}>{p.name} · {p.diagnosis||"No diagnosis"} · {p.ward||"No ward"}</option>)}
        </select>
      </div>
      {selected&&(
        <div className="card" style={{padding:16,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:900,fontSize:13}}>Nursing Care Plan</div>
            <button className="ai-btn" onClick={generateAI} disabled={aiLoading}>{aiLoading?<><span className="ai-spinner"/>Generating…</>:"🤖 Generate with AI"}</button>
          </div>
          <textarea className="form-textarea" style={{minHeight:200}} value={planText} onChange={e=>setPlanText(e.target.value)} placeholder="NANDA-I nursing diagnoses, expected outcomes, nursing interventions, evaluation…"/>
          <button className="btn btn-primary" style={{marginTop:10}} onClick={savePlan} disabled={saving||!planText.trim()}>{saving?<><span className="ai-spinner"/>Saving…</>:"💾 Save Care Plan"}</button>
        </div>
      )}
      {selected&&(selected.carePlans||[]).length>0&&(
        <div className="card" style={{padding:16}}>
          <div style={{fontWeight:900,fontSize:13,marginBottom:10}}>Previous Care Plans ({(selected.carePlans||[]).length})</div>
          {(selected.carePlans||[]).map(cp=>(
            <div key={cp.id} style={{background:"var(--bg3)",border:"1px solid var(--border2)",borderRadius:"var(--r-sm)",padding:"10px 14px",marginBottom:10}}>
              <div style={{fontSize:11,color:"var(--t2)",marginBottom:6}}>{cp.date} · By {cp.by}</div>
              <div style={{fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{cp.plan}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SendToPhysicianSection({ patients, user, showToast, onRefresh }) {
  const [selectedId, setSelectedId] = useState(null);
  const [reason, setReason] = useState("");
  const [urgency, setUrgency] = useState("Routine");
  const [saving, setSaving] = useState(false);
  const selected = patients.find(p=>p.id===selectedId)||null;
  const handleSend=async()=>{
    if(!selected||!reason.trim()){showToast("Select patient and provide reason.","error");return;}
    setSaving(true);
    const entry={id:uid(),from:"Nurse",to:"Physician",by:user.name,reason,urgency,at:new Date().toISOString(),status:"Pending"};
    const updated={...selected,physicianReferrals:[entry,...(selected.physicianReferrals||[])],awaitingPhysician:true};
    await FB.savePatient(updated);onRefresh(updated);setSaving(false);
    showToast(selected.name+" sent to physician.");
    setReason("");setSelectedId(null);
  };
  const pendingSends=patients.filter(p=>p.awaitingPhysician&&(p.status||"active")==="active");
  return (
    <div style={{padding:22,overflowY:"auto",flex:1}}>
      <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>↗️ Send Patient → Physician</div>
      <div style={{fontSize:12,color:"var(--t2)",marginBottom:18}}>Flag patient for physician review after nursing assessment</div>
      <div className="card" style={{padding:16,marginBottom:14}}>
        <div className="form-group">
          <label className="form-label">Select Patient *</label>
          <select className="form-select" value={selectedId||""} onChange={e=>setSelectedId(e.target.value||null)}>
            <option value="">— Select patient —</option>
            {patients.filter(p=>!p.deleted&&(p.status||"active")==="active").map(p=><option key={p.id} value={p.id}>{p.name} · {p.ward||"No ward"} · EMR:{p.emr||"—"}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Urgency</label>
          <select className="form-select" value={urgency} onChange={e=>setUrgency(e.target.value)}><option>Routine</option><option>Urgent</option><option>Emergency</option></select>
        </div>
        <div className="form-group">
          <label className="form-label">Reason *</label>
          <textarea className="form-textarea" style={{minHeight:80}} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Clinical reason for physician referral…"/>
        </div>
        <button className="btn btn-primary" onClick={handleSend} disabled={saving||!selectedId}>{saving?<><span className="ai-spinner"/>Sending…</>:"↗️ Send to Physician"}</button>
      </div>
      {pendingSends.length>0&&(
        <div className="card" style={{padding:16}}>
          <div style={{fontWeight:900,fontSize:13,marginBottom:10}}>⏳ Awaiting Physician ({pendingSends.length})</div>
          {pendingSends.map(p=>{
            const ref=(p.physicianReferrals||[])[0];
            return (<div key={p.id} style={{background:"var(--bg3)",border:"1px solid var(--border2)",borderLeft:"3px solid "+(ref?.urgency==="Emergency"?"var(--danger)":ref?.urgency==="Urgent"?"var(--warning)":"var(--accent)"),borderRadius:"var(--r-sm)",padding:"10px 14px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontWeight:900,fontSize:13}}>{p.name}</span><span className={"badge "+(ref?.urgency==="Emergency"?"badge-critical":ref?.urgency==="Urgent"?"badge-warning":"badge-active")}>{ref?.urgency||"Routine"}</span></div>
              <div style={{fontSize:12,color:"var(--t2)",marginBottom:3}}>{p.ward||"—"} · {p.diagnosis||"—"}</div>
              {ref&&<div style={{fontSize:12}}>{ref.reason}</div>}
              <div style={{fontSize:11,color:"var(--t3)",marginTop:3}}>By {ref?.by} · {ref?.at?new Date(ref.at).toLocaleString():"—"}</div>
            </div>);
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPARTMENT SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const deptCss = `
.dept-root{display:flex;height:100vh;overflow:hidden;font-family:"Times New Roman",Times,serif;background:#F8FAFC;color:#0a1628;}
.dept-sidebar{width:220px;flex-shrink:0;background:linear-gradient(180deg,#071540 0%,#0a1c4e 45%,#0d2460 100%);border-right:1px solid #1a3a7c;display:flex;flex-direction:column;overflow-y:auto;}
.dept-sb-logo{padding:18px 16px 12px;border-bottom:1px solid rgba(255,255,255,.10);}
.dept-sb-icon{font-size:28px;margin-bottom:4px;}
.dept-sb-name{font-size:15px;font-weight:900;color:#fff;font-family:"Times New Roman",serif;}
.dept-sb-sub{font-size:10px;color:#7db8e8;font-weight:700;letter-spacing:.5px;}
.dept-sb-user{padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;gap:9px;}
.dept-sb-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#0a1c4e,#1a3a7c);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#7dd3fc;border:2px solid rgba(77,166,224,.3);flex-shrink:0;}
.dept-sb-uname{font-size:12px;font-weight:900;color:#fff;font-family:"Times New Roman",serif;}
.dept-sb-urole{font-size:10px;color:#7db8e8;font-weight:700;}
.dept-sb-nav{flex:1;padding:10px 8px;}
.dept-nav-section{font-size:9px;font-weight:900;color:rgba(160,210,255,.5);text-transform:uppercase;letter-spacing:1.5px;padding:10px 10px 4px;font-family:"Times New Roman",serif;}
.dept-nav-btn{display:flex;align-items:center;gap:9px;width:100%;padding:9px 12px;border:none;border-radius:8px;background:none;color:rgba(255,255,255,.65);font-size:12px;font-weight:700;font-family:"Times New Roman",Times,serif;cursor:pointer;transition:all .15s;margin-bottom:2px;text-align:left;}
.dept-nav-btn:hover{background:rgba(255,255,255,.08);color:#fff;}
.dept-nav-btn.active{background:rgba(77,166,224,.18);color:#7dd3fc;border:1px solid rgba(77,166,224,.30);}
.dept-nav-btn .dni{font-size:15px;width:18px;text-align:center;flex-shrink:0;}
.dept-sb-footer{padding:10px 16px;border-top:1px solid rgba(255,255,255,.08);font-size:10px;color:rgba(255,255,255,.25);text-align:center;}
.dept-main{flex:1;display:flex;flex-direction:column;overflow:hidden;background:#F8FAFC;}
.dept-topbar{height:54px;background:#fff;border-bottom:2px solid #dce6f5;display:flex;align-items:center;padding:0 22px;gap:12px;box-shadow:0 2px 10px rgba(10,28,78,.07);}
.dept-tb-title{font-size:16px;font-weight:900;color:#0a1628;font-family:"Times New Roman",serif;flex:1;}
.dept-tb-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 11px;border-radius:20px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:#065f46;font-size:10px;font-weight:900;}
.dept-tb-dot{width:6px;height:6px;border-radius:50%;background:#10b981;animation:pulse 2s infinite;}
.dept-content{flex:1;overflow-y:auto;padding:22px;}
.dept-card{background:#fff;border:1px solid #dce6f5;border-radius:12px;padding:18px 20px;margin-bottom:16px;box-shadow:0 2px 10px rgba(10,28,78,.05);}
.dept-card h4{font-size:12px;font-weight:900;color:#0a1c4e;text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px;display:flex;align-items:center;gap:7px;}
.dept-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin-bottom:18px;}
.dept-stat{background:#fff;border:1px solid #dce6f5;border-top:3px solid #0a1c4e;border-radius:10px;padding:14px;text-align:center;}
.dept-stat-icon{font-size:22px;margin-bottom:5px;}
.dept-stat-val{font-size:24px;font-weight:900;color:#0a1628;}
.dept-stat-label{font-size:10px;font-weight:700;color:#4a6a8a;margin-top:2px;text-transform:uppercase;letter-spacing:.4px;}
.dept-queue{display:flex;flex-direction:column;gap:8px;}
.dept-queue-item{display:flex;align-items:center;gap:12px;background:#f8fafc;border:1px solid #dce6f5;border-radius:9px;padding:11px 14px;transition:background .15s;}
.dept-queue-item:hover{background:#f0f4fa;}
.dept-queue-num{width:28px;height:28px;border-radius:50%;background:#0a1c4e;color:#fff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.dept-queue-info{flex:1;}
.dept-queue-name{font-size:13px;font-weight:900;color:#0a1628;}
.dept-queue-meta{font-size:11px;color:#4a6a8a;margin-top:1px;}
.dept-form-section{background:#f8fafc;border:1px solid #dce6f5;border-radius:10px;padding:16px;margin-bottom:12px;}
.dept-form-section h5{font-size:11px;font-weight:900;color:#0a1c4e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;}
.dept-badge-urgent{background:rgba(185,28,28,.09);color:#b91c1c;border:1px solid rgba(185,28,28,.25);padding:2px 9px;border-radius:20px;font-size:10px;font-weight:900;}
.dept-badge-normal{background:rgba(13,107,58,.09);color:#0d6b3a;border:1px solid rgba(13,107,58,.25);padding:2px 9px;border-radius:20px;font-size:10px;font-weight:900;}
.dept-badge-pending{background:rgba(122,80,0,.09);color:#7a5000;border:1px solid rgba(122,80,0,.25);padding:2px 9px;border-radius:20px;font-size:10px;font-weight:900;}
.dept-send-btn{background:linear-gradient(135deg,#0a1c4e,#1a3a7c);color:#fff;border:none;border-radius:9px;padding:10px 20px;font-size:12px;font-weight:900;font-family:"Times New Roman",serif;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:all .15s;}
.dept-send-btn:hover{opacity:.9;}
.dept-send-btn:disabled{opacity:.5;cursor:not-allowed;}
`;

function DeptShell({icon,name,role,user,onLogout,navItems,section,setSection,children}){
  return (
    <div className="dept-root">
      <style>{deptCss}</style>
      <nav className="dept-sidebar">
        <div className="dept-sb-logo"><div className="dept-sb-icon">{icon}</div><div className="dept-sb-name">{name}</div><div className="dept-sb-sub">MedRecord EMR</div></div>
        <div className="dept-sb-user">
          <div className="dept-sb-avatar">{(user?.name||"U").charAt(0).toUpperCase()}</div>
          <div><div className="dept-sb-uname">{user?.name||"Staff"}</div><div className="dept-sb-urole">{role}</div></div>
        </div>
        <div className="dept-sb-nav">
          <div className="dept-nav-section">Navigation</div>
          {navItems.map(n=><button key={n.id} className={"dept-nav-btn "+(section===n.id?"active":"")} onClick={()=>setSection(n.id)}><span className="dni">{n.icon}</span>{n.label}</button>)}
          <div className="dept-nav-section">Session</div>
          <button className="dept-nav-btn" onClick={onLogout} style={{color:"rgba(255,120,120,.8)"}}><span className="dni">🚪</span>Logout</button>
        </div>
        <div className="dept-sb-footer">{new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div>
      </nav>
      <div className="dept-main">
        <div className="dept-topbar">
          <div className="dept-tb-title">{navItems.find(n=>n.id===section)?.label||name}</div>
          <div className="dept-tb-badge"><div className="dept-tb-dot"/>Online</div>
          <span style={{fontSize:11,color:"#4a6699",fontWeight:700}}>{user?.email}</span>
        </div>
        <div className="dept-content">{children}</div>
      </div>
    </div>
  );
}

function EmptyState({icon,title,sub}){
  return <div style={{textAlign:"center",padding:"40px 20px",color:"#4a6a8a"}}><div style={{fontSize:40,marginBottom:10,opacity:.3}}>{icon}</div><div style={{fontSize:14,fontWeight:700,marginBottom:4}}>{title}</div>{sub&&<div style={{fontSize:12}}>{sub}</div>}</div>;
}

function PatientSelector({patients,selectedId,setSelectedId,highlight=[]}){
  return (
    <div className="dept-card" style={{marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:12,fontWeight:700,color:"#4a6a8a",flexShrink:0}}>Patient:</span>
        <select className="form-select" style={{flex:1,minWidth:200}} value={selectedId||""} onChange={e=>setSelectedId(e.target.value||null)}>
          <option value="">— Select patient —</option>
          {patients.map(p=><option key={p.id} value={p.id}>{(highlight||[]).some(h=>h.id===p.id)?"⭐ ":""}{p.name} · {p.ward||"No ward"} · EMR:{p.emr||"—"}</option>)}
        </select>
        {selectedId&&<span className="dept-badge-normal">✓ Selected</span>}
      </div>
    </div>
  );
}

function SimpleNoteForm({label,placeholder,onSave,showToast}){
  const [d,setD]=useState({date:today(),notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
      <div className="form-group"><label className="form-label">{label} *</label><textarea className="form-textarea" style={{minHeight:120}} value={d.notes} onChange={e=>set("notes",e.target.value)} placeholder={placeholder}/></div>
      <button className="dept-send-btn" onClick={()=>{if(!d.notes.trim()){showToast(label+" is required.","error");return;}onSave(d);setD({date:today(),notes:""});showToast("Saved.");}}>💾 Save {label}</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PHYSICIAN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function PhysicianDashboard({user,onLogout}){
  const [section,setSection]=useState("history");
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [toast,showToastRaw]=useToast();
  const showToast=(m,t)=>showToastRaw(m,t);
  useEffect(()=>{const unsub=FB.onPatients(pts=>setPatients(pts.filter(p=>!p.deleted)));return()=>unsub();},[]);
  const selected=patients.find(p=>p.id===selectedId)||null;
  const saveEntry=async(field,entry)=>{if(!selected)return;const u={...selected,[field]:[{...entry,id:uid(),by:user.name,at:new Date().toISOString()},...(selected[field]||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Saved.");};
  const navItems=[
    {id:"history",icon:"📋",label:"Patient History"},
    {id:"examination",icon:"🩺",label:"Physical Examination"},
    {id:"diagnosis",icon:"🔬",label:"Diagnosis Entry"},
    {id:"investigations",icon:"🧪",label:"Order Investigations"},
    {id:"prescribe",icon:"💊",label:"Prescribe Drugs"},
    {id:"referral",icon:"↗️",label:"Referral to Departments"},
    {id:"admission",icon:"🏥",label:"Admission / Discharge"},
  ];
  const active=patients.filter(p=>(p.status||"active")==="active");
  const awaiting=patients.filter(p=>p.awaitingPhysician&&(p.status||"active")==="active");
  return (
    <DeptShell icon="🩺" name="Physician Dashboard" role="Physician / Doctor" user={user} onLogout={onLogout} navItems={navItems} section={section} setSection={setSection}>
      <Toast msg={toast.msg} type={toast.type}/>
      {awaiting.length>0&&<div style={{background:"rgba(185,28,28,.08)",border:"1px solid rgba(185,28,28,.25)",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#b91c1c",fontWeight:700}}>⭐ {awaiting.length} patient(s) flagged by nursing: {awaiting.map(p=>p.name).join(", ")}</div>}
      <div className="dept-card" style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:700,color:"#4a6a8a",flexShrink:0}}>Patient:</span>
          <select className="form-select" style={{flex:1,minWidth:200}} value={selectedId||""} onChange={e=>setSelectedId(e.target.value||null)}>
            <option value="">— Select patient —</option>
            {active.map(p=><option key={p.id} value={p.id}>{p.awaitingPhysician?"⭐ ":""}{p.name} · {p.ward||"No ward"} · EMR:{p.emr||"—"}</option>)}
          </select>
          {selected&&<span className="dept-badge-normal">✓ {selected.name}</span>}
        </div>
      </div>
      {section==="history"&&(
        <div>
          <div className="dept-stats">
            {[["🏥","Active",active.length],["⭐","Awaiting",awaiting.length],["💊","On Meds",patients.filter(p=>(p.prescriptions||[]).length>0).length]].map(([icon,label,val])=>(
              <div key={label} className="dept-stat"><div className="dept-stat-icon">{icon}</div><div className="dept-stat-val">{val}</div><div className="dept-stat-label">{label}</div></div>
            ))}
          </div>
          <div className="dept-card"><h4>📋 Patient History</h4>
            {!selected?<EmptyState icon="👤" title="Select a patient"/>:(
              <div>
                <div className="dept-form-section"><h5>Demographics</h5>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[["Name",selected.name],["EMR",selected.emr||"—"],["DOB",selected.dob||"—"],["Gender",selected.gender||"—"],["Ward",selected.ward||"—"],["Physician",selected.physician||"—"],["Admission",selected.admission||"—"],["Allergies",selected.allergies||"NKDA"]].map(([l,v])=>(
                      <div key={l}><div style={{fontSize:10,color:"#4a6a8a",fontWeight:700,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:13,fontWeight:900}}>{v}</div></div>
                    ))}
                  </div>
                </div>
                {selected.awaitingPhysician&&(selected.physicianReferrals||[]).length>0&&(
                  <div className="dept-form-section" style={{marginTop:10,background:"#fff8f0",borderColor:"rgba(185,28,28,.2)"}}>
                    <h5 style={{color:"#b91c1c"}}>⭐ Nursing Referral</h5>
                    <div style={{fontSize:12}}>{(selected.physicianReferrals||[])[0]?.reason}</div>
                    <div style={{fontSize:10,color:"#4a6a8a",marginTop:4}}>By {(selected.physicianReferrals||[])[0]?.by} · Urgency: {(selected.physicianReferrals||[])[0]?.urgency}</div>
                  </div>
                )}
                <div className="dept-form-section" style={{marginTop:10}}><h5>Latest Vitals</h5>
                  {(selected.vitals||[])[0]?(
                    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                      {[["BP",(selected.vitals[0].bp||"—")+" mmHg"],["HR",(selected.vitals[0].hr||"—")+" bpm"],["Temp",(selected.vitals[0].temp||"—")+"°C"],["SpO₂",(selected.vitals[0].spo2||"—")+"%"]].map(([l,v])=>(
                        <div key={l} style={{background:"#fff",border:"1px solid #dce6f5",borderRadius:8,padding:"7px 12px",textAlign:"center"}}>
                          <div style={{fontSize:9,color:"#4a6a8a",textTransform:"uppercase",fontWeight:700}}>{l}</div>
                          <div style={{fontSize:13,fontWeight:900}}>{v}</div>
                        </div>
                      ))}
                    </div>
                  ):<div style={{fontSize:12,color:"#4a6a8a"}}>No vitals recorded</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {section==="examination"&&<div className="dept-card"><h4>🩺 Physical Examination</h4>{!selected?<EmptyState icon="🩺" title="Select a patient"/>:<PhysExamForm onSave={data=>saveEntry("physicalExams",data)} showToast={showToast}/>}</div>}
      {section==="diagnosis"&&<div className="dept-card"><h4>🔬 Diagnosis Entry</h4>{!selected?<EmptyState icon="🔬" title="Select a patient"/>:<DiagnosisForm patient={selected} onSave={async diag=>{const u={...selected,diagnosis:diag.primary,diagnosisHistory:[{...diag,id:uid(),by:user.name,at:new Date().toISOString()},...(selected.diagnosisHistory||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Diagnosis saved.");}} showToast={showToast}/>}</div>}
      {section==="investigations"&&<div className="dept-card"><h4>🧪 Order Investigations</h4>{!selected?<EmptyState icon="🧪" title="Select a patient"/>:<InvOrderForm physician={user.name} onSave={async orders=>{const u={...selected,investigationOrders:[...orders,...(selected.investigationOrders||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Orders placed.");}} showToast={showToast}/>}</div>}
      {section==="prescribe"&&<div className="dept-card"><h4>💊 Prescribe Drugs</h4>{!selected?<EmptyState icon="💊" title="Select a patient"/>:<PrescribeForm patient={selected} physician={user.name} onSave={async meds=>{const u={...selected,prescriptions:meds};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Prescription saved.");}} showToast={showToast}/>}</div>}
      {section==="referral"&&<div className="dept-card"><h4>↗️ Referral to Departments</h4>{!selected?<EmptyState icon="↗️" title="Select a patient"/>:<DeptReferralForm physician={user.name} onSave={async ref=>{const u={...selected,referrals:[{...ref,id:uid(),by:user.name,at:new Date().toISOString()},...(selected.referrals||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Referral sent.");}} showToast={showToast}/>}</div>}
      {section==="admission"&&<div className="dept-card"><h4>🏥 Admission / Discharge</h4>{!selected?<EmptyState icon="🏥" title="Select a patient"/>:<AdmDischargeForm patient={selected} physician={user.name} onSave={async(action,notes)=>{const u={...selected,status:action==="discharge"?"discharged":"active",awaitingPhysician:false,statusHistory:[{action,notes,id:uid(),by:user.name,at:new Date().toISOString()},...(selected.statusHistory||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Status updated.");}} showToast={showToast}/>}</div>}
    </DeptShell>
  );
}

function PhysExamForm({onSave,showToast}){
  const [d,setD]=useState({date:today(),systems:"",findings:"",impression:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
      <div className="form-group"><label className="form-label">Systems Reviewed</label><input className="form-input" value={d.systems} onChange={e=>set("systems",e.target.value)} placeholder="CNS, CVS, Respiratory, GIT…"/></div>
      <div className="form-group"><label className="form-label">Examination Findings *</label><textarea className="form-textarea" style={{minHeight:100}} value={d.findings} onChange={e=>set("findings",e.target.value)} placeholder="Document examination findings in detail…"/></div>
      <div className="form-group"><label className="form-label">Clinical Impression</label><textarea className="form-textarea" style={{minHeight:60}} value={d.impression} onChange={e=>set("impression",e.target.value)}/></div>
      <button className="dept-send-btn" onClick={()=>{if(!d.findings.trim()){showToast("Findings required.","error");return;}onSave(d);setD({date:today(),systems:"",findings:"",impression:""});}}>💾 Save Examination</button>
    </div>
  );
}

function DiagnosisForm({patient,onSave,showToast}){
  const [d,setD]=useState({date:today(),primary:patient?.diagnosis||"",differential:"",icdCode:"",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
      <div className="form-group"><label className="form-label">Primary Diagnosis *</label><input className="form-input" value={d.primary} onChange={e=>set("primary",e.target.value)} placeholder="e.g. Hypertensive Heart Disease"/></div>
      <div className="form-group"><label className="form-label">Differential Diagnoses</label><input className="form-input" value={d.differential} onChange={e=>set("differential",e.target.value)} placeholder="e.g. Congestive Heart Failure"/></div>
      <div className="form-group"><label className="form-label">ICD-10 Code</label><input className="form-input" value={d.icdCode} onChange={e=>set("icdCode",e.target.value)} placeholder="e.g. I11.0"/></div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
      <button className="dept-send-btn" onClick={()=>{if(!d.primary.trim()){showToast("Primary diagnosis required.","error");return;}onSave(d);}}>💾 Save Diagnosis</button>
    </div>
  );
}

function InvOrderForm({physician,onSave,showToast}){
  const [rows,setRows]=useState([{id:uid(),type:"Lab",test:"",priority:"Routine",date:today(),status:"Pending"}]);
  const add=type=>setRows(r=>[...r,{id:uid(),type,test:"",priority:"Routine",date:today(),status:"Pending"}]);
  const setRow=(i,k,v)=>setRows(r=>r.map((x,j)=>j===i?{...x,[k]:v}:x));
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12}}><button className="btn btn-secondary" onClick={()=>add("Lab")}>+ Lab Test</button><button className="btn btn-secondary" onClick={()=>add("Radiology")}>+ Radiology</button></div>
      {rows.map((r,i)=>(
        <div key={r.id} style={{background:"#f8fafc",border:"1px solid #dce6f5",borderRadius:9,padding:12,marginBottom:8}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr 1fr auto",gap:8,alignItems:"end"}}>
            <div><label className="form-label">Type</label><select className="form-select" value={r.type} onChange={e=>setRow(i,"type",e.target.value)}><option>Lab</option><option>Radiology</option></select></div>
            <div><label className="form-label">Test/Study</label><input className="form-input" value={r.test} onChange={e=>setRow(i,"test",e.target.value)} placeholder={r.type==="Lab"?"e.g. FBC, LFT":"e.g. Chest X-Ray"}/></div>
            <div><label className="form-label">Priority</label><select className="form-select" value={r.priority} onChange={e=>setRow(i,"priority",e.target.value)}><option>Routine</option><option>Urgent</option><option>STAT</option></select></div>
            <div><label className="form-label">Date</label><input className="form-input" type="date" value={r.date} onChange={e=>setRow(i,"date",e.target.value)}/></div>
            <div style={{paddingTop:16}}><button className="btn btn-danger btn-sm" onClick={()=>setRows(r=>r.filter((_,j)=>j!==i))}>✕</button></div>
          </div>
        </div>
      ))}
      <button className="dept-send-btn" onClick={()=>{const v=rows.filter(r=>r.test.trim());if(!v.length){showToast("Add at least one investigation.","error");return;}onSave(v.map(r=>({...r,physician,id:uid()})));setRows([{id:uid(),type:"Lab",test:"",priority:"Routine",date:today(),status:"Pending"}]);}}>📤 Place Orders</button>
    </div>
  );
}

function PrescribeForm({patient,physician,onSave,showToast}){
  const [rows,setRows]=useState(patient?.prescriptions||[]);
  const add=()=>setRows(r=>[...r,{id:uid(),drug:"",dosage:"",route:"PO",freq:"",start:today(),end:"",instructions:"",prescribedBy:physician}]);
  const setRow=(i,k,v)=>setRows(r=>r.map((x,j)=>j===i?{...x,[k]:v}:x));
  return (
    <div>
      <div style={{marginBottom:10}}><button className="btn btn-secondary" onClick={add}>+ Add Drug</button></div>
      {rows.length===0&&<EmptyState icon="💊" title="No drugs" sub="Click + Add Drug"/>}
      {rows.map((r,i)=>(
        <div key={r.id} style={{background:"#f8fafc",border:"1px solid #dce6f5",borderRadius:9,padding:12,marginBottom:8}}>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr auto",gap:8,alignItems:"end"}}>
            <div><label className="form-label">Drug</label><input className="form-input" value={r.drug} onChange={e=>setRow(i,"drug",e.target.value)} placeholder="Drug name"/></div>
            <div><label className="form-label">Dosage</label><input className="form-input" value={r.dosage} onChange={e=>setRow(i,"dosage",e.target.value)} placeholder="500mg"/></div>
            <div><label className="form-label">Route</label><select className="form-select" value={r.route} onChange={e=>setRow(i,"route",e.target.value)}><option>PO</option><option>IV</option><option>IM</option><option>SC</option><option>Topical</option><option>Inhaled</option></select></div>
            <div><label className="form-label">Freq</label><input className="form-input" value={r.freq} onChange={e=>setRow(i,"freq",e.target.value)} placeholder="BD, TID…"/></div>
            <div><label className="form-label">Start</label><input className="form-input" type="date" value={r.start} onChange={e=>setRow(i,"start",e.target.value)}/></div>
            <div><label className="form-label">End</label><input className="form-input" type="date" value={r.end} onChange={e=>setRow(i,"end",e.target.value)}/></div>
            <div style={{paddingTop:16}}><button className="btn btn-danger btn-sm" onClick={()=>setRows(r=>r.filter((_,j)=>j!==i))}>✕</button></div>
          </div>
          <div style={{marginTop:6}}><label className="form-label">Instructions</label><input className="form-input" value={r.instructions} onChange={e=>setRow(i,"instructions",e.target.value)} placeholder="e.g. Take with food"/></div>
        </div>
      ))}
      <button className="dept-send-btn" onClick={()=>onSave(rows)}>💾 Save Prescription</button>
    </div>
  );
}

function DeptReferralForm({physician,onSave,showToast}){
  const DEPTS=["Laboratory","Radiology","Pharmacy","Physiotherapy","Dietitian","ENT","Dental","Public Health","DOT / TB Clinic"];
  const [d,setD]=useState({department:"Laboratory",reason:"",urgent:false,date:today(),notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Department</label><select className="form-select" value={d.department} onChange={e=>set("department",e.target.value)}>{DEPTS.map(dep=><option key={dep}>{dep}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
      </div>
      <div className="form-group"><label className="form-label">Reason *</label><textarea className="form-textarea" style={{minHeight:80}} value={d.reason} onChange={e=>set("reason",e.target.value)} placeholder="Clinical indication for referral…"/></div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><input type="checkbox" id="ref-urg" checked={d.urgent} onChange={e=>set("urgent",e.target.checked)} style={{width:16,height:16}}/><label htmlFor="ref-urg" style={{fontSize:13,fontWeight:700}}>Mark as Urgent</label></div>
      <button className="dept-send-btn" onClick={()=>{if(!d.reason.trim()){showToast("Reason required.","error");return;}onSave(d);setD({department:"Laboratory",reason:"",urgent:false,date:today(),notes:""});}}>↗️ Send Referral</button>
    </div>
  );
}

function AdmDischargeForm({patient,physician,onSave,showToast}){
  const [d,setD]=useState({action:"active",notes:"",date:today()});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="dept-form-section"><h5>Current Status</h5><span className={patient.status==="discharged"?"dept-badge-pending":"dept-badge-normal"} style={{fontSize:13,padding:"4px 14px"}}>{patient.status||"Active"}</span></div>
      <div className="form-group" style={{marginTop:14}}><label className="form-label">Action</label>
        <select className="form-select" value={d.action} onChange={e=>set("action",e.target.value)}>
          <option value="active">Mark Active / Re-admit</option>
          <option value="discharge">Discharge Patient</option>
        </select>
      </div>
      <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
      <div className="form-group"><label className="form-label">Notes / Discharge Summary *</label><textarea className="form-textarea" style={{minHeight:100}} value={d.notes} onChange={e=>set("notes",e.target.value)} placeholder="Clinical notes, discharge instructions, follow-up plan…"/></div>
      <button className="dept-send-btn" style={{background:d.action==="discharge"?"linear-gradient(135deg,#b91c1c,#991b1b)":undefined}} onClick={()=>{if(!d.notes.trim()){showToast("Notes required.","error");return;}onSave(d.action,d.notes);setD({action:"active",notes:"",date:today()});}}>{d.action==="discharge"?"🚪 Discharge Patient":"✅ Confirm Status"}</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LABORATORY DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function LaboratoryDashboard({user,onLogout}){
  const [section,setSection]=useState("queue");
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [toast,showToastRaw]=useToast();
  const showToast=(m,t)=>showToastRaw(m,t);
  useEffect(()=>{const unsub=FB.onPatients(pts=>setPatients(pts.filter(p=>!p.deleted)));return()=>unsub();},[]);
  const selected=patients.find(p=>p.id===selectedId)||null;
  const pendingOrders=patients.flatMap(p=>(p.investigationOrders||[]).filter(o=>o.type==="Lab"&&(o.status||"Pending")==="Pending").map(o=>({...o,patientName:p.name,patientId:p.id})));
  const navItems=[{id:"queue",icon:"📋",label:"Test Requests"},{id:"sample",icon:"🧫",label:"Sample Collection"},{id:"perform",icon:"🔬",label:"Enter Results"},{id:"upload",icon:"📤",label:"Upload Results"},{id:"send",icon:"↗️",label:"Send to Physician"}];
  const saveResult=async(patientId,result)=>{const pt=patients.find(p=>p.id===patientId);if(!pt)return;const u={...pt,labResults:[{...result,id:uid(),recordedBy:user.name,at:new Date().toISOString()},...(pt.labResults||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Lab result saved.");};
  const markDone=async(patientId,orderId)=>{const pt=patients.find(p=>p.id===patientId);if(!pt)return;const u={...pt,investigationOrders:(pt.investigationOrders||[]).map(o=>o.id===orderId?{...o,status:"Completed",completedBy:user.name,completedAt:new Date().toISOString()}:o)};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Marked complete.");};
  return (
    <DeptShell icon="🧪" name="Laboratory Dashboard" role="Laboratory Scientist" user={user} onLogout={onLogout} navItems={navItems} section={section} setSection={setSection}>
      <Toast msg={toast.msg} type={toast.type}/>
      {section==="queue"&&(
        <div>
          <div className="dept-stats">
            {[["📋","Pending",pendingOrders.length],["✅","Done Today",patients.flatMap(p=>p.labResults||[]).filter(r=>r.at?.startsWith(today())).length],["👥","Patients w/ Labs",patients.filter(p=>(p.labResults||[]).length>0).length]].map(([icon,label,val])=>(
              <div key={label} className="dept-stat"><div className="dept-stat-icon">{icon}</div><div className="dept-stat-val">{val}</div><div className="dept-stat-label">{label}</div></div>
            ))}
          </div>
          <div className="dept-card"><h4>📋 Test Request Queue</h4>
            {pendingOrders.length===0?<EmptyState icon="✅" title="No pending lab orders"/>:(
              <div className="dept-queue">{pendingOrders.map(o=>(
                <div key={o.id} className="dept-queue-item"><div className="dept-queue-num">🧪</div><div className="dept-queue-info"><div className="dept-queue-name">{o.test}</div><div className="dept-queue-meta">{o.patientName} · {o.date} · Dr. {o.physician}</div></div>
                <span className={o.priority==="STAT"?"dept-badge-urgent":o.priority==="Urgent"?"dept-badge-pending":"dept-badge-normal"}>{o.priority}</span>
                <button className="btn btn-secondary btn-sm" onClick={()=>markDone(o.patientId,o.id)}>✓ Done</button>
              </div>))}</div>
            )}
          </div>
        </div>
      )}
      {(section==="sample"||section==="perform"||section==="upload")&&(
        <div className="dept-card"><h4>{section==="sample"?"🧫 Sample Collection":"📤 Results Entry"}</h4>
          <PatientSelector patients={patients} selectedId={selectedId} setSelectedId={setSelectedId}/>
          {selected?(section==="sample"?<LabSampleForm patient={selected} scientist={user.name} onSave={async data=>{const u={...selected,sampleCollections:[{...data,id:uid(),collectedBy:user.name,at:new Date().toISOString()},...(selected.sampleCollections||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Sample recorded.");}} showToast={showToast}/>:<LabResultEntryForm patient={selected} scientist={user.name} onSave={saveResult} showToast={showToast}/>):<EmptyState icon="🔬" title="Select a patient to proceed"/>}
        </div>
      )}
      {section==="send"&&(
        <div className="dept-card"><h4>↗️ Send Results → Physician</h4>
          {patients.flatMap(p=>(p.labResults||[]).filter(r=>!r.sentToPhysician).map(r=>({...r,patientName:p.name,patientId:p.id}))).length===0?<EmptyState icon="✅" title="All results sent"/>:(
            <div className="dept-queue">{patients.flatMap(p=>(p.labResults||[]).filter(r=>!r.sentToPhysician).map(r=>({...r,patientName:p.name,patientId:p.id}))).slice(0,20).map(r=>(
              <div key={r.id} className="dept-queue-item"><div className="dept-queue-num">📊</div><div className="dept-queue-info"><div className="dept-queue-name">{r.testName} — {r.patientName}</div><div className="dept-queue-meta">{r.result} {r.unit} · {r.status} · {r.date}</div></div>
              <button className="dept-send-btn" style={{fontSize:11,padding:"5px 11px"}} onClick={async()=>{const pt=patients.find(p=>p.id===r.patientId);if(!pt)return;const u={...pt,labResults:(pt.labResults||[]).map(l=>l.id===r.id?{...l,sentToPhysician:true,sentAt:new Date().toISOString()}:l)};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Sent.");}}>↗️ Send</button>
            </div>))}</div>
          )}
        </div>
      )}
    </DeptShell>
  );
}

function LabSampleForm({patient,scientist,onSave,showToast}){
  const [d,setD]=useState({date:today(),time:nowTime(),sampleType:"Venous Blood",volume:"",condition:"Acceptable",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (<div>
    <div className="form-row"><div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div><div className="form-group"><label className="form-label">Time</label><input className="form-input" type="time" value={d.time} onChange={e=>set("time",e.target.value)}/></div></div>
    <div className="form-row"><div className="form-group"><label className="form-label">Sample Type</label><select className="form-select" value={d.sampleType} onChange={e=>set("sampleType",e.target.value)}><option>Venous Blood</option><option>Capillary Blood</option><option>Urine</option><option>Stool</option><option>CSF</option><option>Sputum</option><option>Swab</option><option>Tissue Biopsy</option></select></div><div className="form-group"><label className="form-label">Volume</label><input className="form-input" value={d.volume} onChange={e=>set("volume",e.target.value)} placeholder="5mL"/></div></div>
    <div className="form-group"><label className="form-label">Condition</label><select className="form-select" value={d.condition} onChange={e=>set("condition",e.target.value)}><option>Acceptable</option><option>Haemolysed</option><option>Lipaemic</option><option>Rejected</option></select></div>
    <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
    <button className="dept-send-btn" onClick={()=>{onSave(d);setD({date:today(),time:nowTime(),sampleType:"Venous Blood",volume:"",condition:"Acceptable",notes:""});}}>🧫 Record Collection</button>
  </div>);
}

function LabResultEntryForm({patient,scientist,onSave,showToast}){
  const [d,setD]=useState({date:today(),testName:"",result:"",unit:"",refRange:"",status:"Normal",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (<div>
    <div className="form-row"><div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div><div className="form-group"><label className="form-label">Test Name *</label><input className="form-input" value={d.testName} onChange={e=>set("testName",e.target.value)} placeholder="FBC, LFT, RFT…"/></div></div>
    <div className="form-row"><div className="form-group"><label className="form-label">Result *</label><input className="form-input" value={d.result} onChange={e=>set("result",e.target.value)} placeholder="7.2"/></div><div className="form-group"><label className="form-label">Unit</label><input className="form-input" value={d.unit} onChange={e=>set("unit",e.target.value)} placeholder="mmol/L"/></div><div className="form-group"><label className="form-label">Ref Range</label><input className="form-input" value={d.refRange} onChange={e=>set("refRange",e.target.value)} placeholder="4.0–6.0"/></div></div>
    <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={d.status} onChange={e=>set("status",e.target.value)}><option>Normal</option><option>High</option><option>Low</option><option>Critical High</option><option>Critical Low</option></select></div>
    <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
    <button className="dept-send-btn" onClick={()=>{if(!d.testName.trim()||!d.result.trim()){showToast("Test name and result required.","error");return;}onSave(patient.id,d);setD({date:today(),testName:"",result:"",unit:"",refRange:"",status:"Normal",notes:""});}}>📤 Save Result</button>
  </div>);
}

// ═══════════════════════════════════════════════════════════════════════════
// RADIOLOGY DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function RadiologyDashboard({user,onLogout}){
  const [section,setSection]=useState("requests");
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [toast,showToastRaw]=useToast();
  const showToast=(m,t)=>showToastRaw(m,t);
  useEffect(()=>{const unsub=FB.onPatients(pts=>setPatients(pts.filter(p=>!p.deleted)));return()=>unsub();},[]);
  const selected=patients.find(p=>p.id===selectedId)||null;
  const pendingImaging=patients.flatMap(p=>(p.investigationOrders||[]).filter(o=>o.type==="Radiology"&&(o.status||"Pending")==="Pending").map(o=>({...o,patientName:p.name,patientId:p.id})));
  const MODALITIES=["X-Ray","CT Scan","MRI","Ultrasound","Mammography","Fluoroscopy"];
  const navItems=[{id:"requests",icon:"📋",label:"Imaging Requests"},{id:"schedule",icon:"📅",label:"Schedule Scan"},{id:"perform",icon:"🖥️",label:"Perform Imaging"},{id:"report",icon:"📝",label:"Radiologist Report"}];
  const saveStudy=async data=>{if(!selected)return;const u={...selected,imagingStudies:[{...data,id:uid(),by:user.name,at:new Date().toISOString()},...(selected.imagingStudies||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Imaging recorded.");};
  const saveReport=async data=>{if(!selected)return;const u={...selected,radiologyReports:[{...data,id:uid(),by:user.name,at:new Date().toISOString()},...(selected.radiologyReports||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Report saved.");};
  return (
    <DeptShell icon="🔬" name="Radiology Dashboard" role="Radiologist / Radiographer" user={user} onLogout={onLogout} navItems={navItems} section={section} setSection={setSection}>
      <Toast msg={toast.msg} type={toast.type}/>
      {section==="requests"&&<div><div className="dept-stats">{[["📋","Pending Scans",pendingImaging.length],["✅","Done Today",patients.flatMap(p=>p.imagingStudies||[]).filter(r=>r.at?.startsWith(today())).length],["📝","Reports",patients.flatMap(p=>p.radiologyReports||[]).length]].map(([icon,label,val])=><div key={label} className="dept-stat"><div className="dept-stat-icon">{icon}</div><div className="dept-stat-val">{val}</div><div className="dept-stat-label">{label}</div></div>)}</div><div className="dept-card"><h4>📋 Imaging Requests</h4>{pendingImaging.length===0?<EmptyState icon="✅" title="No pending imaging"/>:<div className="dept-queue">{pendingImaging.map(o=><div key={o.id} className="dept-queue-item"><div className="dept-queue-num">📷</div><div className="dept-queue-info"><div className="dept-queue-name">{o.test}</div><div className="dept-queue-meta">{o.patientName} · {o.date}</div></div><span className={o.priority==="STAT"?"dept-badge-urgent":"dept-badge-normal"}>{o.priority}</span></div>)}</div>}</div></div>}
      {(section==="schedule"||section==="perform")&&<div className="dept-card"><h4>{section==="schedule"?"📅 Schedule Scan":"🖥️ Perform Imaging"}</h4><PatientSelector patients={patients} selectedId={selectedId} setSelectedId={setSelectedId}/>{selected?<ImagingStudyForm modalities={MODALITIES} section={section} onSave={saveStudy} showToast={showToast}/>:<EmptyState icon="🖥️" title="Select a patient"/>}</div>}
      {section==="report"&&<div className="dept-card"><h4>📝 Radiologist Report</h4><PatientSelector patients={patients} selectedId={selectedId} setSelectedId={setSelectedId}/>{selected?<RadiologyReportForm section={section} onSave={saveReport} showToast={showToast}/>:<EmptyState icon="📝" title="Select a patient"/>}{selected&&(selected.radiologyReports||[]).length>0&&<div style={{marginTop:14}}>{(selected.radiologyReports||[]).map(r=><div key={r.id} style={{background:"#f8fafc",border:"1px solid #dce6f5",borderRadius:9,padding:"9px 13px",marginBottom:8}}><div style={{fontSize:10,color:"#4a6a8a",marginBottom:3}}>{r.date} · {r.modality} · {r.by}</div><div style={{fontSize:12,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{r.findings}</div>{r.conclusion&&<div style={{fontSize:12,fontWeight:700,marginTop:4}}>Conclusion: {r.conclusion}</div>}</div>)}</div>}</div>}
    </DeptShell>
  );
}

function ImagingStudyForm({modalities,section,onSave,showToast}){
  const [d,setD]=useState({date:today(),time:nowTime(),modality:"X-Ray",region:"",indication:"",scheduledDate:today(),scheduledTime:"",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (<div>
    {section==="schedule"?<div className="form-row"><div className="form-group"><label className="form-label">Scheduled Date</label><input className="form-input" type="date" value={d.scheduledDate} onChange={e=>set("scheduledDate",e.target.value)}/></div><div className="form-group"><label className="form-label">Scheduled Time</label><input className="form-input" type="time" value={d.scheduledTime} onChange={e=>set("scheduledTime",e.target.value)}/></div></div>:<div className="form-row"><div className="form-group"><label className="form-label">Performed Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div><div className="form-group"><label className="form-label">Time</label><input className="form-input" type="time" value={d.time} onChange={e=>set("time",e.target.value)}/></div></div>}
    <div className="form-row"><div className="form-group"><label className="form-label">Modality</label><select className="form-select" value={d.modality} onChange={e=>set("modality",e.target.value)}>{modalities.map(m=><option key={m}>{m}</option>)}</select></div><div className="form-group"><label className="form-label">Region *</label><input className="form-input" value={d.region} onChange={e=>set("region",e.target.value)} placeholder="Chest, Abdomen…"/></div></div>
    <div className="form-group"><label className="form-label">Indication</label><input className="form-input" value={d.indication} onChange={e=>set("indication",e.target.value)}/></div>
    <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
    <button className="dept-send-btn" onClick={()=>{if(!d.region.trim()){showToast("Region required.","error");return;}onSave(d);setD({date:today(),time:nowTime(),modality:"X-Ray",region:"",indication:"",scheduledDate:today(),scheduledTime:"",notes:""});}}>{section==="schedule"?"📅 Schedule":"🖥️ Record Imaging"}</button>
  </div>);
}

function RadiologyReportForm({section,onSave,showToast}){
  const [d,setD]=useState({date:today(),modality:"X-Ray",region:"",findings:"",conclusion:"",recommendation:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (<div>
    <div className="form-row"><div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div><div className="form-group"><label className="form-label">Modality</label><select className="form-select" value={d.modality} onChange={e=>set("modality",e.target.value)}><option>X-Ray</option><option>CT Scan</option><option>MRI</option><option>Ultrasound</option><option>Mammography</option></select></div></div>
    <div className="form-group"><label className="form-label">Region Studied</label><input className="form-input" value={d.region} onChange={e=>set("region",e.target.value)}/></div>
    <div className="form-group"><label className="form-label">Findings *</label><textarea className="form-textarea" style={{minHeight:100}} value={d.findings} onChange={e=>set("findings",e.target.value)}/></div>
    <div className="form-group"><label className="form-label">Conclusion</label><textarea className="form-textarea" style={{minHeight:60}} value={d.conclusion} onChange={e=>set("conclusion",e.target.value)}/></div>
    <div className="form-group"><label className="form-label">Recommendations</label><textarea className="form-textarea" value={d.recommendation} onChange={e=>set("recommendation",e.target.value)}/></div>
    <button className="dept-send-btn" onClick={()=>{if(!d.findings.trim()){showToast("Findings required.","error");return;}onSave(d);setD({date:today(),modality:"X-Ray",region:"",findings:"",conclusion:"",recommendation:""});}}>📝 Save Report</button>
  </div>);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHARMACY DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function PharmacyDashboard({user,onLogout}){
  const [section,setSection]=useState("queue");
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [inventory,setInventory]=useState([]);
  const [toast,showToastRaw]=useToast();
  const showToast=(m,t)=>showToastRaw(m,t);
  useEffect(()=>{
    const unsub=FB.onPatients(pts=>setPatients(pts.filter(p=>!p.deleted)));
    const unsubInv=onSnapshot(query(collection(db,"pharmacyInventory"),orderBy("name","asc")),s=>setInventory(s.docs.map(d=>d.data())));
    return()=>{unsub();unsubInv();};
  },[]);
  const selected=patients.find(p=>p.id===selectedId)||null;
  const prescriptionQueue=patients.filter(p=>(p.prescriptions||[]).length>0&&(p.status||"active")==="active");
  const navItems=[{id:"queue",icon:"📋",label:"Prescription Queue"},{id:"interaction",icon:"⚠️",label:"Drug Interaction Check"},{id:"dispense",icon:"💊",label:"Dispense Medication"},{id:"inventory",icon:"🗄️",label:"Pharmacy Inventory"},{id:"counseling",icon:"💬",label:"Drug Counseling"}];
  const saveLog=async(field,data)=>{if(!selected)return;const u={...selected,[field]:[{...data,id:uid(),by:user.name,at:new Date().toISOString()},...(selected[field]||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Saved.");};
  return (
    <DeptShell icon="💊" name="Pharmacy Dashboard" role="Pharmacist" user={user} onLogout={onLogout} navItems={navItems} section={section} setSection={setSection}>
      <Toast msg={toast.msg} type={toast.type}/>
      {section==="queue"&&<div><div className="dept-stats">{[["📋","Active Rx",prescriptionQueue.length],["💊","Total Drugs",inventory.length],["⚠️","Low Stock",inventory.filter(i=>+i.qty<=+(i.reorderLevel||0)).length]].map(([icon,label,val])=><div key={label} className="dept-stat"><div className="dept-stat-icon">{icon}</div><div className="dept-stat-val">{val}</div><div className="dept-stat-label">{label}</div></div>)}</div><div className="dept-card"><h4>📋 Prescription Queue</h4>{prescriptionQueue.length===0?<EmptyState icon="✅" title="No active prescriptions"/>:<div className="dept-queue">{prescriptionQueue.map(p=><div key={p.id} className="dept-queue-item" onClick={()=>{setSelectedId(p.id);setSection("dispense");}} style={{cursor:"pointer"}}><div className="dept-queue-num">💊</div><div className="dept-queue-info"><div className="dept-queue-name">{p.name}</div><div className="dept-queue-meta">{p.ward||"—"} · {(p.prescriptions||[]).length} drug(s)</div></div><span className="dept-badge-normal">View →</span></div>)}</div>}</div></div>}
      {section==="interaction"&&<div className="dept-card"><h4>⚠️ Drug Interaction Check</h4><PatientSelector patients={patients.filter(p=>(p.prescriptions||[]).length>0)} selectedId={selectedId} setSelectedId={setSelectedId}/>{selected&&(selected.prescriptions||[]).length>0?<PharmInteractionChecker patient={selected} showToast={showToast}/>:selected?<EmptyState icon="💊" title="No medications on file"/>:<EmptyState icon="⚠️" title="Select a patient"/>}</div>}
      {section==="dispense"&&<div className="dept-card"><h4>💊 Dispense Medication</h4><PatientSelector patients={patients} selectedId={selectedId} setSelectedId={setSelectedId}/>{selected?<DispenseForm patient={selected} pharmacist={user.name} onSave={data=>saveLog("dispensingLogs",data)} showToast={showToast}/>:<EmptyState icon="💊" title="Select a patient"/>}</div>}
      {section==="inventory"&&<div className="dept-card"><h4>🗄️ Pharmacy Inventory</h4><PharmInventoryMgr inventory={inventory} showToast={showToast}/></div>}
      {section==="counseling"&&<div className="dept-card"><h4>💬 Drug Counseling</h4><PatientSelector patients={patients} selectedId={selectedId} setSelectedId={setSelectedId}/>{selected?<CounselingForm patient={selected} pharmacist={user.name} onSave={data=>saveLog("counselingLogs",data)} showToast={showToast}/>:<EmptyState icon="💬" title="Select a patient"/>}</div>}
    </DeptShell>
  );
}

function PharmInteractionChecker({patient,showToast}){
  const [result,setResult]=useState("");const [loading,setLoading]=useState(false);
  const check=async()=>{setLoading(true);setResult("");try{const list=(patient.prescriptions||[]).map(m=>`${m.drug} ${m.dosage} ${m.route} ${m.freq}`).join(", ");const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:"You are a clinical pharmacist. Check for drug interactions and flag any concerns. Be concise.",messages:[{role:"user",content:`Check these for interactions: ${list}`}]})});const d=await r.json();setResult(d.content?.map(c=>c.text||"").join("")||"No interactions found.");}catch(e){setResult("Error: "+e.message);}setLoading(false);};
  return (<div>
    <div style={{marginBottom:12}}>{(patient.prescriptions||[]).map(m=><div key={m.id} style={{background:"#f8fafc",border:"1px solid #dce6f5",borderRadius:8,padding:"7px 12px",marginBottom:6,display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700,fontSize:13}}>{m.drug}</span><span style={{fontSize:12,color:"#4a6a8a"}}>{m.dosage} · {m.route} · {m.freq}</span></div>)}</div>
    <button className="dept-send-btn" onClick={check} disabled={loading}>{loading?<><span className="ai-spinner"/>Checking…</>:"🤖 Check with AI"}</button>
    {result&&<div style={{marginTop:14,background:"#f8fafc",border:"1px solid #dce6f5",borderRadius:10,padding:"13px 15px",fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{result}</div>}
  </div>);
}

function DispenseForm({patient,pharmacist,onSave,showToast}){
  const [d,setD]=useState({date:today(),drug:"",dosage:"",qty:"",batchNo:"",expiry:"",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (<div>
    <div className="dept-form-section"><h5>Current Prescriptions</h5>{(patient.prescriptions||[]).length===0?<div style={{fontSize:12,color:"#4a6a8a"}}>No active prescriptions</div>:(patient.prescriptions||[]).map(m=><div key={m.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #eef2fa"}}><span style={{fontWeight:700,fontSize:12}}>{m.drug}</span><span style={{fontSize:11,color:"#4a6a8a"}}>{m.dosage} · {m.route} · {m.freq}</span></div>)}</div>
    <div style={{marginTop:12}}>
      <div className="form-row"><div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div><div className="form-group"><label className="form-label">Drug *</label><input className="form-input" value={d.drug} onChange={e=>set("drug",e.target.value)} placeholder="Drug dispensed"/></div></div>
      <div className="form-row"><div className="form-group"><label className="form-label">Dosage</label><input className="form-input" value={d.dosage} onChange={e=>set("dosage",e.target.value)}/></div><div className="form-group"><label className="form-label">Qty</label><input className="form-input" type="number" value={d.qty} onChange={e=>set("qty",e.target.value)}/></div><div className="form-group"><label className="form-label">Batch No.</label><input className="form-input" value={d.batchNo} onChange={e=>set("batchNo",e.target.value)}/></div><div className="form-group"><label className="form-label">Expiry</label><input className="form-input" type="date" value={d.expiry} onChange={e=>set("expiry",e.target.value)}/></div></div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
      <button className="dept-send-btn" onClick={()=>{if(!d.drug.trim()){showToast("Drug name required.","error");return;}onSave(d);setD({date:today(),drug:"",dosage:"",qty:"",batchNo:"",expiry:"",notes:""});}}>💊 Record Dispensing</button>
    </div>
  </div>);
}

function PharmInventoryMgr({inventory,showToast}){
  const [form,setForm]=useState({name:"",category:"Tablet",qty:"",reorderLevel:"",unit:"Tabs"});
  const setF=(k,v)=>setForm(x=>({...x,[k]:v}));
  const addItem=async()=>{if(!form.name.trim()){showToast("Drug name required.","error");return;}const id="PHARM-"+uid();await setDoc(doc(db,"pharmacyInventory",id),{...form,id,addedBy:"pharmacist",createdAt:serverTimestamp()});setForm({name:"",category:"Tablet",qty:"",reorderLevel:"",unit:"Tabs"});showToast("Drug added.");};
  return (<div>
    <div className="dept-form-section"><h5>Add Drug</h5>
      <div className="form-row"><div className="form-group"><label className="form-label">Drug Name *</label><input className="form-input" value={form.name} onChange={e=>setF("name",e.target.value)} placeholder="Amoxicillin 500mg"/></div><div className="form-group"><label className="form-label">Category</label><select className="form-select" value={form.category} onChange={e=>setF("category",e.target.value)}><option>Tablet</option><option>Capsule</option><option>Syrup</option><option>Injection</option><option>Cream</option><option>Inhaler</option></select></div></div>
      <div className="form-row"><div className="form-group"><label className="form-label">Qty</label><input className="form-input" type="number" value={form.qty} onChange={e=>setF("qty",e.target.value)}/></div><div className="form-group"><label className="form-label">Reorder Level</label><input className="form-input" type="number" value={form.reorderLevel} onChange={e=>setF("reorderLevel",e.target.value)} placeholder="50"/></div><div className="form-group"><label className="form-label">Unit</label><input className="form-input" value={form.unit} onChange={e=>setF("unit",e.target.value)} placeholder="Tabs, Vials…"/></div></div>
      <button className="dept-send-btn" onClick={addItem}>+ Add Drug</button>
    </div>
    {inventory.length>0&&<div style={{marginTop:14,overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr>{["Drug","Category","Qty","Reorder","Status"].map(h=><th key={h} style={{fontSize:11,fontWeight:900,color:"#0a1c4e",textTransform:"uppercase",padding:"8px 12px",background:"#eef3ff",textAlign:"left"}}>{h}</th>)}</tr></thead>
      <tbody>{inventory.map(item=><tr key={item.id} style={{borderBottom:"1px solid #eef2fa"}}><td style={{padding:"8px 12px",fontWeight:700,fontSize:12}}>{item.name}</td><td style={{padding:"8px 12px",fontSize:12,color:"#4a6a8a"}}>{item.category}</td><td style={{padding:"8px 12px",fontFamily:"monospace",fontWeight:700,color:+item.qty<=+(item.reorderLevel||0)?"#b91c1c":"#0d6b3a"}}>{item.qty}</td><td style={{padding:"8px 12px",fontSize:12,color:"#4a6a8a"}}>{item.reorderLevel||"—"}</td><td style={{padding:"8px 12px"}}><span className={+item.qty<=+(item.reorderLevel||0)?"dept-badge-urgent":"dept-badge-normal"}>{+item.qty<=+(item.reorderLevel||0)?"Low Stock":"In Stock"}</span></td></tr>)}</tbody>
    </table></div>}
  </div>);
}

function CounselingForm({patient,pharmacist,onSave,showToast}){
  const [d,setD]=useState({date:today(),topics:"",counselPoints:"",patientUnderstanding:"Good",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (<div>
    <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
    <div className="form-group"><label className="form-label">Topics Covered</label><input className="form-input" value={d.topics} onChange={e=>set("topics",e.target.value)} placeholder="Administration, Side effects, Drug-food interactions…"/></div>
    <div className="form-group"><label className="form-label">Counseling Points *</label><textarea className="form-textarea" style={{minHeight:100}} value={d.counselPoints} onChange={e=>set("counselPoints",e.target.value)}/></div>
    <div className="form-group"><label className="form-label">Patient Understanding</label><select className="form-select" value={d.patientUnderstanding} onChange={e=>set("patientUnderstanding",e.target.value)}><option>Good</option><option>Partial</option><option>Poor</option><option>Requires Follow-up</option></select></div>
    <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
    <button className="dept-send-btn" onClick={()=>{if(!d.counselPoints.trim()){showToast("Counseling points required.","error");return;}onSave(d);setD({date:today(),topics:"",counselPoints:"",patientUnderstanding:"Good",notes:""});}}>💬 Save Counseling</button>
  </div>);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHYSIOTHERAPY DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function PhysiotherapyDashboard({user,onLogout}){
  const [section,setSection]=useState("referrals");
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [toast,showToastRaw]=useToast();
  const showToast=(m,t)=>showToastRaw(m,t);
  useEffect(()=>{const unsub=FB.onPatients(pts=>setPatients(pts.filter(p=>!p.deleted)));return()=>unsub();},[]);
  const selected=patients.find(p=>p.id===selectedId)||null;
  const referred=patients.filter(p=>(p.referrals||[]).some(r=>r.department==="Physiotherapy"));
  const navItems=[{id:"referrals",icon:"📋",label:"Referral List"},{id:"assessment",icon:"🏃",label:"Functional Assessment"},{id:"plan",icon:"📝",label:"Treatment Plan"},{id:"sessions",icon:"🤸",label:"Therapy Sessions"},{id:"progress",icon:"📊",label:"Progress Notes"}];
  const savePhysio=async(field,data)=>{if(!selected)return;const u={...selected,[field]:[{...data,id:uid(),by:user.name,at:new Date().toISOString()},...(selected[field]||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Saved.");};
  return (
    <DeptShell icon="🤸" name="Physiotherapy Dashboard" role="Physiotherapist" user={user} onLogout={onLogout} navItems={navItems} section={section} setSection={setSection}>
      <Toast msg={toast.msg} type={toast.type}/>
      <PatientSelector patients={patients} selectedId={selectedId} setSelectedId={setSelectedId} highlight={referred}/>
      {section==="referrals"&&<div className="dept-card"><h4>📋 Physiotherapy Referrals</h4>{referred.length===0?<EmptyState icon="📋" title="No referrals"/>:<div className="dept-queue">{referred.map(p=><div key={p.id} className="dept-queue-item" onClick={()=>setSelectedId(p.id)} style={{cursor:"pointer"}}><div className="dept-queue-num">🤸</div><div className="dept-queue-info"><div className="dept-queue-name">{p.name}</div><div className="dept-queue-meta">{p.ward||"—"} · {p.diagnosis||"—"}</div></div></div>)}</div>}</div>}
      {section==="assessment"&&<div className="dept-card"><h4>🏃 Functional Assessment</h4>{!selected?<EmptyState icon="🏃" title="Select a patient"/>:<SimpleNoteForm label="Assessment" placeholder="ROM, strength, balance, gait…" onSave={data=>savePhysio("physioAssessments",data)} showToast={showToast}/>}</div>}
      {section==="plan"&&<div className="dept-card"><h4>📝 Treatment Plan</h4>{!selected?<EmptyState icon="📝" title="Select a patient"/>:<SimpleNoteForm label="Treatment Plan" placeholder="Goals, exercises, modalities…" onSave={data=>savePhysio("physioTreatmentPlans",data)} showToast={showToast}/>}</div>}
      {section==="sessions"&&<div className="dept-card"><h4>🤸 Therapy Session Log</h4>{!selected?<EmptyState icon="🤸" title="Select a patient"/>:<SimpleNoteForm label="Session Notes" placeholder="Exercises performed, duration…" onSave={data=>savePhysio("physioSessions",data)} showToast={showToast}/>}{selected&&(selected.physioSessions||[]).length>0&&<div style={{marginTop:14}}>{(selected.physioSessions||[]).map(s=><div key={s.id} style={{background:"#f8fafc",border:"1px solid #dce6f5",borderRadius:9,padding:"9px 13px",marginBottom:8}}><div style={{fontSize:10,color:"#4a6a8a",marginBottom:3}}>{s.date} · {s.by}</div><div style={{fontSize:12,lineHeight:1.6}}>{s.notes}</div></div>)}</div>}</div>}
      {section==="progress"&&<div className="dept-card"><h4>📊 Progress Notes</h4>{!selected?<EmptyState icon="📊" title="Select a patient"/>:<SimpleNoteForm label="Progress Note" placeholder="Goal progress, improvements…" onSave={data=>savePhysio("physioProgressNotes",data)} showToast={showToast}/>}</div>}
    </DeptShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DIETITIAN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function DietitianDashboard({user,onLogout}){
  const [section,setSection]=useState("assessment");
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [toast,showToastRaw]=useToast();
  const showToast=(m,t)=>showToastRaw(m,t);
  useEffect(()=>{const unsub=FB.onPatients(pts=>setPatients(pts.filter(p=>!p.deleted)));return()=>unsub();},[]);
  const selected=patients.find(p=>p.id===selectedId)||null;
  const navItems=[{id:"assessment",icon:"📊",label:"Nutrition Assessment"},{id:"prescription",icon:"🥗",label:"Diet Prescription"},{id:"meal",icon:"🍽️",label:"Meal Planning"},{id:"followup",icon:"📅",label:"Follow-Up"}];
  const saveDiet=async(field,data)=>{if(!selected)return;const u={...selected,[field]:[{...data,id:uid(),by:user.name,at:new Date().toISOString()},...(selected[field]||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Saved.");};
  return (
    <DeptShell icon="🥗" name="Dietitian Dashboard" role="Dietitian / Nutritionist" user={user} onLogout={onLogout} navItems={navItems} section={section} setSection={setSection}>
      <Toast msg={toast.msg} type={toast.type}/>
      <PatientSelector patients={patients} selectedId={selectedId} setSelectedId={setSelectedId}/>
      {section==="assessment"&&<div className="dept-card"><h4>📊 Nutrition Assessment</h4>{!selected?<EmptyState icon="📊" title="Select a patient"/>:<NutrAssessForm onSave={data=>saveDiet("nutritionAssessments",data)} showToast={showToast}/>}</div>}
      {section==="prescription"&&<div className="dept-card"><h4>🥗 Diet Prescription</h4>{!selected?<EmptyState icon="🥗" title="Select a patient"/>:<DietRxForm onSave={data=>saveDiet("dietPrescriptions",data)} showToast={showToast}/>}</div>}
      {section==="meal"&&<div className="dept-card"><h4>🍽️ Meal Planning</h4>{!selected?<EmptyState icon="🍽️" title="Select a patient"/>:<SimpleNoteForm label="Meal Plan" placeholder="Breakfast, lunch, dinner, snacks…" onSave={data=>saveDiet("mealPlans",data)} showToast={showToast}/>}</div>}
      {section==="followup"&&<div className="dept-card"><h4>📅 Follow-Up</h4>{!selected?<EmptyState icon="📅" title="Select a patient"/>:<SimpleNoteForm label="Follow-Up Note" placeholder="Weight changes, compliance, adjustments…" onSave={data=>saveDiet("nutritionFollowUps",data)} showToast={showToast}/>}</div>}
    </DeptShell>
  );
}

function NutrAssessForm({onSave,showToast}){
  const [d,setD]=useState({date:today(),weight:"",height:"",bmi:"",appetiteStatus:"Normal",dietaryHistory:"",nutritionalRisk:"Low",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  const calcBMI=()=>{if(d.weight&&d.height){const h=+d.height/100;setD(x=>({...x,bmi:(+d.weight/(h*h)).toFixed(1)}));}};
  return (<div>
    <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
    <div className="form-row"><div className="form-group"><label className="form-label">Weight (kg)</label><input className="form-input" type="number" step="0.1" value={d.weight} onChange={e=>set("weight",e.target.value)} onBlur={calcBMI}/></div><div className="form-group"><label className="form-label">Height (cm)</label><input className="form-input" type="number" value={d.height} onChange={e=>set("height",e.target.value)} onBlur={calcBMI}/></div><div className="form-group"><label className="form-label">BMI</label><input className="form-input" value={d.bmi} readOnly style={{background:"#f0f4fa"}}/></div></div>
    <div className="form-row"><div className="form-group"><label className="form-label">Appetite</label><select className="form-select" value={d.appetiteStatus} onChange={e=>set("appetiteStatus",e.target.value)}><option>Normal</option><option>Reduced</option><option>Increased</option><option>Absent</option></select></div><div className="form-group"><label className="form-label">Nutritional Risk</label><select className="form-select" value={d.nutritionalRisk} onChange={e=>set("nutritionalRisk",e.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></div></div>
    <div className="form-group"><label className="form-label">Dietary History</label><textarea className="form-textarea" value={d.dietaryHistory} onChange={e=>set("dietaryHistory",e.target.value)} placeholder="Food preferences, allergies, 24hr recall…"/></div>
    <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
    <button className="dept-send-btn" onClick={()=>{onSave(d);setD({date:today(),weight:"",height:"",bmi:"",appetiteStatus:"Normal",dietaryHistory:"",nutritionalRisk:"Low",notes:""});showToast("Assessment saved.");}}>📊 Save Assessment</button>
  </div>);
}

function DietRxForm({onSave,showToast}){
  const [d,setD]=useState({date:today(),dietType:"Regular",calories:"",protein:"",fluid:"",restrictions:"",supplements:"",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (<div>
    <div className="form-row"><div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div><div className="form-group"><label className="form-label">Diet Type</label><select className="form-select" value={d.dietType} onChange={e=>set("dietType",e.target.value)}><option>Regular</option><option>Low Sodium</option><option>Low Fat</option><option>Diabetic</option><option>Renal</option><option>Soft</option><option>NPO</option><option>Enteral</option><option>Parenteral</option></select></div></div>
    <div className="form-row"><div className="form-group"><label className="form-label">Calories (kcal/day)</label><input className="form-input" type="number" value={d.calories} onChange={e=>set("calories",e.target.value)} placeholder="1800"/></div><div className="form-group"><label className="form-label">Protein (g/day)</label><input className="form-input" type="number" value={d.protein} onChange={e=>set("protein",e.target.value)}/></div><div className="form-group"><label className="form-label">Fluid (mL/day)</label><input className="form-input" type="number" value={d.fluid} onChange={e=>set("fluid",e.target.value)}/></div></div>
    <div className="form-group"><label className="form-label">Restrictions</label><input className="form-input" value={d.restrictions} onChange={e=>set("restrictions",e.target.value)}/></div>
    <div className="form-group"><label className="form-label">Supplements</label><input className="form-input" value={d.supplements} onChange={e=>set("supplements",e.target.value)}/></div>
    <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
    <button className="dept-send-btn" onClick={()=>{onSave(d);setD({date:today(),dietType:"Regular",calories:"",protein:"",fluid:"",restrictions:"",supplements:"",notes:""});showToast("Diet prescription saved.");}}>🥗 Save Prescription</button>
  </div>);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENT DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function ENTDashboard({user,onLogout}){
  const [section,setSection]=useState("examination");
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [toast,showToastRaw]=useToast();
  const showToast=(m,t)=>showToastRaw(m,t);
  useEffect(()=>{const unsub=FB.onPatients(pts=>setPatients(pts.filter(p=>!p.deleted)));return()=>unsub();},[]);
  const selected=patients.find(p=>p.id===selectedId)||null;
  const navItems=[{id:"examination",icon:"👂",label:"ENT Examination"},{id:"endoscopy",icon:"🔭",label:"Endoscopy Records"},{id:"hearing",icon:"🎧",label:"Hearing Test Results"},{id:"plan",icon:"📝",label:"Treatment Plan"}];
  const saveENT=async(field,data)=>{if(!selected)return;const u={...selected,[field]:[{...data,id:uid(),by:user.name,at:new Date().toISOString()},...(selected[field]||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Saved.");};
  return (
    <DeptShell icon="👂" name="ENT Dashboard" role="ENT Specialist" user={user} onLogout={onLogout} navItems={navItems} section={section} setSection={setSection}>
      <Toast msg={toast.msg} type={toast.type}/>
      <PatientSelector patients={patients} selectedId={selectedId} setSelectedId={setSelectedId}/>
      {section==="examination"&&<div className="dept-card"><h4>👂 ENT Examination</h4>{!selected?<EmptyState icon="👂" title="Select a patient"/>:<ENTExamForm onSave={data=>saveENT("entExaminations",data)} showToast={showToast}/>}</div>}
      {section==="endoscopy"&&<div className="dept-card"><h4>🔭 Endoscopy Record</h4>{!selected?<EmptyState icon="🔭" title="Select a patient"/>:<SimpleNoteForm label="Endoscopy Findings" placeholder="Nasal / nasopharyngoscopy findings…" onSave={data=>saveENT("entEndoscopy",data)} showToast={showToast}/>}</div>}
      {section==="hearing"&&<div className="dept-card"><h4>🎧 Hearing Test Results</h4>{!selected?<EmptyState icon="🎧" title="Select a patient"/>:<HearingTestForm onSave={data=>saveENT("hearingTests",data)} showToast={showToast}/>}</div>}
      {section==="plan"&&<div className="dept-card"><h4>📝 ENT Treatment Plan</h4>{!selected?<EmptyState icon="📝" title="Select a patient"/>:<SimpleNoteForm label="Treatment Plan" placeholder="Management, medications, surgical recommendations…" onSave={data=>saveENT("entTreatmentPlans",data)} showToast={showToast}/>}</div>}
    </DeptShell>
  );
}

function ENTExamForm({onSave,showToast}){
  const [d,setD]=useState({date:today(),ear:"",nose:"",throat:"",findings:"",impression:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (<div>
    <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
    <div className="form-group"><label className="form-label">Ear Examination</label><textarea className="form-textarea" value={d.ear} onChange={e=>set("ear",e.target.value)} placeholder="Pinna, EAC, TM…"/></div>
    <div className="form-group"><label className="form-label">Nose Examination</label><textarea className="form-textarea" value={d.nose} onChange={e=>set("nose",e.target.value)} placeholder="Septum, turbinates…"/></div>
    <div className="form-group"><label className="form-label">Throat / Larynx</label><textarea className="form-textarea" value={d.throat} onChange={e=>set("throat",e.target.value)} placeholder="Tonsils, posterior pharynx, vocal cords…"/></div>
    <div className="form-group"><label className="form-label">Clinical Impression</label><input className="form-input" value={d.impression} onChange={e=>set("impression",e.target.value)} placeholder="Diagnosis / impression"/></div>
    <button className="dept-send-btn" onClick={()=>{onSave(d);setD({date:today(),ear:"",nose:"",throat:"",findings:"",impression:""});showToast("ENT examination saved.");}}>👂 Save Examination</button>
  </div>);
}

function HearingTestForm({onSave,showToast}){
  const [d,setD]=useState({date:today(),type:"Pure Tone Audiometry",leftAC:"",rightAC:"",leftBC:"",rightBC:"",result:"Normal Hearing",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (<div>
    <div className="form-row"><div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div><div className="form-group"><label className="form-label">Test Type</label><select className="form-select" value={d.type} onChange={e=>set("type",e.target.value)}><option>Pure Tone Audiometry</option><option>Tympanometry</option><option>OAE</option><option>BERA</option><option>Speech Audiometry</option></select></div></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:10}}>
      {[["Left AC (dB)","leftAC"],["Right AC (dB)","rightAC"],["Left BC (dB)","leftBC"],["Right BC (dB)","rightBC"]].map(([l,k])=><div key={k} className="form-group"><label className="form-label">{l}</label><input className="form-input" type="number" value={d[k]} onChange={e=>set(k,e.target.value)}/></div>)}
    </div>
    <div className="form-group"><label className="form-label">Hearing Result</label><select className="form-select" value={d.result} onChange={e=>set("result",e.target.value)}><option>Normal Hearing</option><option>Mild Hearing Loss</option><option>Moderate Hearing Loss</option><option>Severe Hearing Loss</option><option>Profound Hearing Loss</option><option>Conductive Loss</option><option>Sensorineural Loss</option><option>Mixed Loss</option></select></div>
    <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
    <button className="dept-send-btn" onClick={()=>{onSave(d);setD({date:today(),type:"Pure Tone Audiometry",leftAC:"",rightAC:"",leftBC:"",rightBC:"",result:"Normal Hearing",notes:""});showToast("Hearing test saved.");}}>🎧 Save Result</button>
  </div>);
}




// ═══════════════════════════════════════════════════════════════════════════
// DENTAL DASHBOARD (continued)
// ═══════════════════════════════════════════════════════════════════════════
function DentalDashboard({user,onLogout}){
  const [section,setSection]=useState("examination");
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [toast,showToastRaw]=useToast();
  const showToast=(m,t)=>showToastRaw(m,t);
  useEffect(()=>{const unsub=FB.onPatients(pts=>setPatients(pts.filter(p=>!p.deleted)));return()=>unsub();},[]);
  const selected=patients.find(p=>p.id===selectedId)||null;
  const navItems=[
    {id:"examination",icon:"🦷",label:"Oral Examination"},
    {id:"chart",icon:"📊",label:"Dental Chart"},
    {id:"procedures",icon:"⚙️",label:"Procedures"},
    {id:"imaging",icon:"📷",label:"Dental Imaging"},
    {id:"treatment",icon:"📝",label:"Treatment Plan"},
  ];
  const saveDental=async(field,data)=>{
    if(!selected)return;
    const u={...selected,[field]:[{...data,id:uid(),by:user.name,at:new Date().toISOString()},...(selected[field]||[])]};
    await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Saved.");
  };
  return (
    <DeptShell icon="🦷" name="Dental Dashboard" role="Dental Surgeon / Dentist" user={user} onLogout={onLogout} navItems={navItems} section={section} setSection={setSection}>
      <Toast msg={toast.msg} type={toast.type}/>
      <PatientSelector patients={patients} selectedId={selectedId} setSelectedId={setSelectedId}/>
      {section==="examination"&&<div className="dept-card"><h4>🦷 Oral Examination</h4>{!selected?<EmptyState icon="🦷" title="Select a patient"/>:<DentalExamForm onSave={data=>saveDental("dentalExaminations",data)} showToast={showToast}/>}</div>}
      {section==="chart"&&<div className="dept-card"><h4>📊 Dental Chart</h4>{!selected?<EmptyState icon="📊" title="Select a patient"/>:<DentalChartForm onSave={data=>saveDental("dentalCharts",data)} showToast={showToast}/>}</div>}
      {section==="procedures"&&<div className="dept-card"><h4>⚙️ Procedures Performed</h4>{!selected?<EmptyState icon="⚙️" title="Select a patient"/>:<DentalProcedureForm onSave={data=>saveDental("dentalProcedures",data)} showToast={showToast}/>}{selected&&(selected.dentalProcedures||[]).length>0&&<div style={{marginTop:14}}>{(selected.dentalProcedures||[]).map(p=><div key={p.id} style={{background:"#f8fafc",border:"1px solid #dce6f5",borderRadius:9,padding:"9px 13px",marginBottom:8}}><div style={{fontSize:10,color:"#4a6a8a",marginBottom:3}}>{p.date} · {p.by}</div><div style={{fontSize:13,fontWeight:900}}>{p.procedure}</div><div style={{fontSize:12,color:"#4a6a8a"}}>{p.tooth} · {p.notes}</div></div>)}</div>}</div>}
      {section==="imaging"&&<div className="dept-card"><h4>📷 Dental Imaging</h4>{!selected?<EmptyState icon="📷" title="Select a patient"/>:<SimpleNoteForm label="Imaging Findings" placeholder="X-ray / OPG findings, periapical films, CBCT notes…" onSave={data=>saveDental("dentalImaging",data)} showToast={showToast}/>}</div>}
      {section==="treatment"&&<div className="dept-card"><h4>📝 Treatment Plan</h4>{!selected?<EmptyState icon="📝" title="Select a patient"/>:<SimpleNoteForm label="Treatment Plan" placeholder="Planned procedures, appointments, patient instructions…" onSave={data=>saveDental("dentalTreatmentPlans",data)} showToast={showToast}/>}</div>}
    </DeptShell>
  );
}

function DentalExamForm({onSave,showToast}){
  const [d,setD]=useState({date:today(),chiefComplaint:"",softTissue:"",hardTissue:"",periodontal:"",occlusion:"",hygiene:"Fair",findings:"",impression:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
      <div className="form-group"><label className="form-label">Chief Complaint</label><input className="form-input" value={d.chiefComplaint} onChange={e=>set("chiefComplaint",e.target.value)} placeholder="e.g. Toothache upper right"/></div>
      <div className="form-group"><label className="form-label">Soft Tissue Exam</label><textarea className="form-textarea" value={d.softTissue} onChange={e=>set("softTissue",e.target.value)} placeholder="Lips, cheeks, tongue, palate, floor of mouth, gingiva…"/></div>
      <div className="form-group"><label className="form-label">Hard Tissue Exam</label><textarea className="form-textarea" value={d.hardTissue} onChange={e=>set("hardTissue",e.target.value)} placeholder="Individual tooth findings (caries, restorations, missing teeth)…"/></div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Periodontal Status</label><select className="form-select" value={d.periodontal} onChange={e=>set("periodontal",e.target.value)}><option value="">Select</option><option>Healthy</option><option>Gingivitis</option><option>Mild Periodontitis</option><option>Moderate Periodontitis</option><option>Severe Periodontitis</option></select></div>
        <div className="form-group"><label className="form-label">Oral Hygiene</label><select className="form-select" value={d.hygiene} onChange={e=>set("hygiene",e.target.value)}><option>Excellent</option><option>Good</option><option>Fair</option><option>Poor</option></select></div>
        <div className="form-group"><label className="form-label">Occlusion</label><input className="form-input" value={d.occlusion} onChange={e=>set("occlusion",e.target.value)} placeholder="Class I/II/III"/></div>
      </div>
      <div className="form-group"><label className="form-label">Clinical Impression</label><input className="form-input" value={d.impression} onChange={e=>set("impression",e.target.value)} placeholder="Primary diagnosis"/></div>
      <button className="dept-send-btn" onClick={()=>{onSave(d);setD({date:today(),chiefComplaint:"",softTissue:"",hardTissue:"",periodontal:"",occlusion:"",hygiene:"Fair",findings:"",impression:""});showToast("Examination saved.");}}>🦷 Save Examination</button>
    </div>
  );
}

function DentalChartForm({onSave,showToast}){
  const TEETH=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28,48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
  const [conditions,setConditions]=useState({});
  const [notes,setNotes]=useState("");
  const [date,setDate]=useState(today());
  const STATUS_OPTS=["Healthy","Caries","Filled","Missing","Crowned","RCT","Extracted","Fractured","Impacted"];
  const setTooth=(t,v)=>setConditions(c=>({...c,[t]:v}));
  const upper=TEETH.slice(0,16);
  const lower=TEETH.slice(16);
  return (
    <div>
      <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
      {[["Upper (18→28)",upper],["Lower (48→38)",lower]].map(([label,row])=>(
        <div key={label} style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:900,color:"#0a1c4e",marginBottom:8,textTransform:"uppercase",letterSpacing:".5px"}}>{label}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(16,1fr)",gap:4}}>
            {row.map(t=>(
              <div key={t} style={{textAlign:"center"}}>
                <div style={{fontSize:9,fontWeight:700,color:"#4a6a8a",marginBottom:2}}>{t}</div>
                <select style={{width:"100%",fontSize:9,padding:"2px 0",borderRadius:4,border:"1px solid #dce6f5",background:conditions[t]&&conditions[t]!=="Healthy"?"#fff0f0":"#f8fafc"}} value={conditions[t]||"Healthy"} onChange={e=>setTooth(t,e.target.value)}>
                  {STATUS_OPTS.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="form-group"><label className="form-label">General Notes</label><textarea className="form-textarea" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Additional charting notes…"/></div>
      <button className="dept-send-btn" onClick={()=>{onSave({date,conditions,notes});setConditions({});setNotes("");showToast("Dental chart saved.");}}>📊 Save Chart</button>
    </div>
  );
}

function DentalProcedureForm({onSave,showToast}){
  const PROCEDURES=["Extraction","Amalgam Filling","Composite Filling","Root Canal Treatment","Scaling & Polishing","Crown Placement","Bridge","Denture","Periodontal Surgery","Apicectomy","Pulpotomy","Space Maintainer","Fissure Sealant","Whitening","Implant"];
  const [d,setD]=useState({date:today(),procedure:"Extraction",tooth:"",anaesthesia:"Local",duration:"",outcome:"Successful",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Procedure *</label><select className="form-select" value={d.procedure} onChange={e=>set("procedure",e.target.value)}>{PROCEDURES.map(p=><option key={p}>{p}</option>)}</select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Tooth / Region</label><input className="form-input" value={d.tooth} onChange={e=>set("tooth",e.target.value)} placeholder="e.g. 36, Upper anterior"/></div>
        <div className="form-group"><label className="form-label">Anaesthesia</label><select className="form-select" value={d.anaesthesia} onChange={e=>set("anaesthesia",e.target.value)}><option>Local</option><option>General</option><option>Sedation</option><option>None</option></select></div>
        <div className="form-group"><label className="form-label">Duration (mins)</label><input className="form-input" type="number" value={d.duration} onChange={e=>set("duration",e.target.value)} placeholder="30"/></div>
      </div>
      <div className="form-group"><label className="form-label">Outcome</label><select className="form-select" value={d.outcome} onChange={e=>set("outcome",e.target.value)}><option>Successful</option><option>Complicated</option><option>Incomplete</option><option>Referred</option></select></div>
      <div className="form-group"><label className="form-label">Notes / Post-op Instructions</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
      <button className="dept-send-btn" onClick={()=>{onSave(d);setD({date:today(),procedure:"Extraction",tooth:"",anaesthesia:"Local",duration:"",outcome:"Successful",notes:""});showToast("Procedure recorded.");}}>⚙️ Save Procedure</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC HEALTH DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function PublicHealthDashboard({user,onLogout}){
  const [section,setSection]=useState("immunization");
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [phData,setPhData]=useState([]);
  const [toast,showToastRaw]=useToast();
  const showToast=(m,t)=>showToastRaw(m,t);
  useEffect(()=>{
    const unsub=FB.onPatients(pts=>setPatients(pts.filter(p=>!p.deleted)));
    const unsubPH=onSnapshot(query(collection(db,"publicHealthData"),orderBy("createdAt","desc")),s=>setPhData(s.docs.map(d=>({id:d.id,...d.data()}))));
    return()=>{unsub();unsubPH();};
  },[]);
  const selected=patients.find(p=>p.id===selectedId)||null;
  const navItems=[
    {id:"immunization",icon:"💉",label:"Immunization Records"},
    {id:"surveillance",icon:"📡",label:"Disease Surveillance"},
    {id:"screening",icon:"🔍",label:"Screening Programs"},
    {id:"outreach",icon:"🌍",label:"Outreach Activities"},
    {id:"reports",icon:"📊",label:"Public Health Reports"},
  ];
  const saveImmunization=async(data)=>{
    if(!selected)return;
    const u={...selected,immunizations:[{...data,id:uid(),by:user.name,at:new Date().toISOString()},...(selected.immunizations||[])]};
    await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Immunization recorded.");
  };
  const savePHRecord=async(data)=>{
    const id="PH-"+uid();
    await setDoc(doc(db,"publicHealthData",id),{...data,id,by:user.name,createdAt:serverTimestamp()});
    showToast("Record saved.");
  };
  return (
    <DeptShell icon="🌍" name="Public Health Dashboard" role="Public Health Officer" user={user} onLogout={onLogout} navItems={navItems} section={section} setSection={setSection}>
      <Toast msg={toast.msg} type={toast.type}/>
      {section==="immunization"&&(
        <div>
          <PatientSelector patients={patients} selectedId={selectedId} setSelectedId={setSelectedId}/>
          <div className="dept-card"><h4>💉 Immunization Records</h4>
            {!selected?<EmptyState icon="💉" title="Select a patient"/>:<ImmunizationForm onSave={saveImmunization} showToast={showToast}/>}
            {selected&&(selected.immunizations||[]).length>0&&(
              <div style={{marginTop:14}}>
                <div style={{fontWeight:900,fontSize:12,color:"#0a1c4e",marginBottom:8}}>IMMUNIZATION HISTORY</div>
                <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["Vaccine","Dose","Date","Batch","Given By"].map(h=><th key={h} style={{fontSize:10,fontWeight:900,color:"#0a1c4e",padding:"7px 10px",background:"#eef3ff",textAlign:"left"}}>{h}</th>)}</tr></thead>
                  <tbody>{(selected.immunizations||[]).map(im=><tr key={im.id} style={{borderBottom:"1px solid #eef2fa"}}><td style={{padding:"7px 10px",fontWeight:700,fontSize:12}}>{im.vaccine}</td><td style={{padding:"7px 10px",fontSize:12}}>{im.dose}</td><td style={{padding:"7px 10px",fontSize:12}}>{im.date}</td><td style={{padding:"7px 10px",fontSize:12,fontFamily:"monospace"}}>{im.batchNo||"—"}</td><td style={{padding:"7px 10px",fontSize:12}}>{im.by}</td></tr>)}</tbody>
                </table></div>
              </div>
            )}
          </div>
        </div>
      )}
      {section==="surveillance"&&(
        <div className="dept-card"><h4>📡 Disease Surveillance</h4>
          <SurveillanceForm onSave={savePHRecord} showToast={showToast}/>
          {phData.filter(r=>r.type==="surveillance").length>0&&(
            <div style={{marginTop:14}}>
              {phData.filter(r=>r.type==="surveillance").slice(0,10).map(r=>(
                <div key={r.id} style={{background:"#f8fafc",border:"1px solid #dce6f5",borderRadius:9,padding:"9px 13px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontWeight:900,fontSize:13}}>{r.disease}</span><span className={r.severity==="High"?"dept-badge-urgent":r.severity==="Medium"?"dept-badge-pending":"dept-badge-normal"}>{r.severity}</span></div>
                  <div style={{fontSize:12,color:"#4a6a8a"}}>{r.location} · {r.cases} case(s) · {r.date}</div>
                  {r.notes&&<div style={{fontSize:12,marginTop:3}}>{r.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {section==="screening"&&(
        <div>
          <PatientSelector patients={patients} selectedId={selectedId} setSelectedId={setSelectedId}/>
          <div className="dept-card"><h4>🔍 Screening Programs</h4>
            {!selected?<EmptyState icon="🔍" title="Select a patient"/>:<ScreeningForm onSave={async data=>{if(!selected)return;const u={...selected,screenings:[{...data,id:uid(),by:user.name,at:new Date().toISOString()},...(selected.screenings||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Screening saved.");}} showToast={showToast}/>}
          </div>
        </div>
      )}
      {section==="outreach"&&(
        <div className="dept-card"><h4>🌍 Outreach Activity Log</h4>
          <OutreachForm onSave={savePHRecord} showToast={showToast}/>
          {phData.filter(r=>r.type==="outreach").length>0&&(
            <div style={{marginTop:14}}>
              {phData.filter(r=>r.type==="outreach").slice(0,10).map(r=>(
                <div key={r.id} style={{background:"#f8fafc",border:"1px solid #dce6f5",borderRadius:9,padding:"9px 13px",marginBottom:8}}>
                  <div style={{fontWeight:900,fontSize:13,marginBottom:3}}>{r.activity}</div>
                  <div style={{fontSize:12,color:"#4a6a8a"}}>{r.location} · {r.beneficiaries} beneficiaries · {r.date}</div>
                  {r.notes&&<div style={{fontSize:12,marginTop:3}}>{r.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {section==="reports"&&(
        <div>
          <div className="dept-stats">
            {[["💉","Immunizations",patients.flatMap(p=>p.immunizations||[]).length],["📡","Surveillance Records",phData.filter(r=>r.type==="surveillance").length],["🌍","Outreach Events",phData.filter(r=>r.type==="outreach").length],["🔍","Screenings",patients.flatMap(p=>p.screenings||[]).length]].map(([icon,label,val])=>(
              <div key={label} className="dept-stat"><div className="dept-stat-icon">{icon}</div><div className="dept-stat-val">{val}</div><div className="dept-stat-label">{label}</div></div>
            ))}
          </div>
          <div className="dept-card"><h4>📊 Summary</h4><EmptyState icon="📊" title="Reporting module" sub="Use the sections above to log data. Summary charts coming soon."/></div>
        </div>
      )}
    </DeptShell>
  );
}

function ImmunizationForm({onSave,showToast}){
  const VACCINES=["BCG","OPV (Oral Polio)","Pentavalent (DPT-HepB-Hib)","PCV (Pneumococcal)","Rota Virus","IPV (Injectable Polio)","Vitamin A","Meningococcal","Yellow Fever","HPV","Hepatitis B","COVID-19","Influenza","Tetanus Toxoid","MMR","Varicella"];
  const [d,setD]=useState({date:today(),vaccine:"BCG",dose:"1st",site:"Right deltoid",route:"IM",batchNo:"",expiry:"",reaction:"None",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Date *</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Vaccine *</label><select className="form-select" value={d.vaccine} onChange={e=>set("vaccine",e.target.value)}>{VACCINES.map(v=><option key={v}>{v}</option>)}</select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Dose</label><select className="form-select" value={d.dose} onChange={e=>set("dose",e.target.value)}><option>1st</option><option>2nd</option><option>3rd</option><option>Booster</option><option>Annual</option></select></div>
        <div className="form-group"><label className="form-label">Site</label><input className="form-input" value={d.site} onChange={e=>set("site",e.target.value)} placeholder="e.g. Right deltoid"/></div>
        <div className="form-group"><label className="form-label">Route</label><select className="form-select" value={d.route} onChange={e=>set("route",e.target.value)}><option>IM</option><option>SC</option><option>ID</option><option>Oral</option></select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Batch No.</label><input className="form-input" value={d.batchNo} onChange={e=>set("batchNo",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Expiry</label><input className="form-input" type="date" value={d.expiry} onChange={e=>set("expiry",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Reaction</label><select className="form-select" value={d.reaction} onChange={e=>set("reaction",e.target.value)}><option>None</option><option>Mild Swelling</option><option>Fever</option><option>Anaphylaxis</option><option>Other</option></select></div>
      </div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
      <button className="dept-send-btn" onClick={()=>{onSave(d);setD({date:today(),vaccine:"BCG",dose:"1st",site:"Right deltoid",route:"IM",batchNo:"",expiry:"",reaction:"None",notes:""});}}>💉 Record Immunization</button>
    </div>
  );
}

function SurveillanceForm({onSave,showToast}){
  const DISEASES=["Cholera","Typhoid","Malaria","Meningitis","Measles","COVID-19","Lassa Fever","Monkey Pox","Rabies","Diphtheria","Tuberculosis","HIV/AIDS","Hepatitis","Polio","Yellow Fever","Influenza","Other"];
  const [d,setD]=useState({type:"surveillance",date:today(),disease:"Malaria",cases:1,deaths:0,location:"",severity:"Low",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Date *</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Disease *</label><select className="form-select" value={d.disease} onChange={e=>set("disease",e.target.value)}>{DISEASES.map(v=><option key={v}>{v}</option>)}</select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">No. Cases</label><input className="form-input" type="number" value={d.cases} onChange={e=>set("cases",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Deaths</label><input className="form-input" type="number" value={d.deaths} onChange={e=>set("deaths",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Severity</label><select className="form-select" value={d.severity} onChange={e=>set("severity",e.target.value)}><option>Low</option><option>Medium</option><option>High</option><option>Outbreak</option></select></div>
      </div>
      <div className="form-group"><label className="form-label">Location / LGA</label><input className="form-input" value={d.location} onChange={e=>set("location",e.target.value)} placeholder="e.g. Surulere, Lagos"/></div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
      <button className="dept-send-btn" onClick={()=>{onSave(d);setD({type:"surveillance",date:today(),disease:"Malaria",cases:1,deaths:0,location:"",severity:"Low",notes:""});}}>📡 Report Disease</button>
    </div>
  );
}

function ScreeningForm({onSave,showToast}){
  const [d,setD]=useState({date:today(),program:"Hypertension Screening",result:"Normal",referral:false,notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  const PROGRAMS=["Hypertension Screening","Diabetes Screening","Cancer Screening (Cervical)","Cancer Screening (Breast)","HIV Counseling & Testing","TB Screening","Malaria RDT","Anaemia Screening","Growth Monitoring","Nutritional Assessment"];
  return (
    <div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Program</label><select className="form-select" value={d.program} onChange={e=>set("program",e.target.value)}>{PROGRAMS.map(p=><option key={p}>{p}</option>)}</select></div>
      </div>
      <div className="form-group"><label className="form-label">Result</label><select className="form-select" value={d.result} onChange={e=>set("result",e.target.value)}><option>Normal</option><option>Abnormal</option><option>Borderline</option><option>Positive</option><option>Negative</option><option>Inconclusive</option></select></div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><input type="checkbox" id="scr-ref" checked={d.referral} onChange={e=>set("referral",e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/><label htmlFor="scr-ref" style={{fontSize:13,fontWeight:700,cursor:"pointer"}}>Referred for further management</label></div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
      <button className="dept-send-btn" onClick={()=>{onSave(d);setD({date:today(),program:"Hypertension Screening",result:"Normal",referral:false,notes:""});}}>🔍 Save Screening</button>
    </div>
  );
}

function OutreachForm({onSave,showToast}){
  const [d,setD]=useState({type:"outreach",date:today(),activity:"Health Education",location:"",beneficiaries:"",team:"",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  const ACTIVITIES=["Health Education","Immunization Outreach","Malaria Campaign","HIV Testing Outreach","Antenatal Outreach","Growth Monitoring","Vitamin A Supplementation","Deworming Campaign","Sanitation Exercise","TB Awareness","School Health Program"];
  return (
    <div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Date *</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Activity *</label><select className="form-select" value={d.activity} onChange={e=>set("activity",e.target.value)}>{ACTIVITIES.map(a=><option key={a}>{a}</option>)}</select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Location</label><input className="form-input" value={d.location} onChange={e=>set("location",e.target.value)} placeholder="Community / LGA / Facility"/></div>
        <div className="form-group"><label className="form-label">Beneficiaries</label><input className="form-input" type="number" value={d.beneficiaries} onChange={e=>set("beneficiaries",e.target.value)} placeholder="250"/></div>
      </div>
      <div className="form-group"><label className="form-label">Team Members</label><input className="form-input" value={d.team} onChange={e=>set("team",e.target.value)} placeholder="Names of team members"/></div>
      <div className="form-group"><label className="form-label">Activity Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
      <button className="dept-send-btn" onClick={()=>{onSave(d);setD({type:"outreach",date:today(),activity:"Health Education",location:"",beneficiaries:"",team:"",notes:""});}}>🌍 Save Outreach</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DOT (DIRECTLY OBSERVED THERAPY) DASHBOARD — TB CLINIC
// ═══════════════════════════════════════════════════════════════════════════
function DOTDashboard({user,onLogout}){
  const [section,setSection]=useState("enrolled");
  const [patients,setPatients]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [dotReports,setDotReports]=useState([]);
  const [toast,showToastRaw]=useToast();
  const showToast=(m,t)=>showToastRaw(m,t);
  useEffect(()=>{
    const unsub=FB.onPatients(pts=>setPatients(pts.filter(p=>!p.deleted)));
    const unsubDOT=onSnapshot(query(collection(db,"dotReports"),orderBy("createdAt","desc")),s=>setDotReports(s.docs.map(d=>({id:d.id,...d.data()}))));
    return()=>{unsub();unsubDOT();};
  },[]);
  const selected=patients.find(p=>p.id===selectedId)||null;
  const enrolled=patients.filter(p=>p.dotEnrolled);
  const navItems=[
    {id:"enrolled",icon:"📋",label:"DOT Patient Register"},
    {id:"enroll",icon:"➕",label:"Enroll New Patient"},
    {id:"administer",icon:"💊",label:"Drug Administration"},
    {id:"adherence",icon:"📊",label:"Adherence Monitoring"},
    {id:"outcomes",icon:"✅",label:"Treatment Outcomes"},
    {id:"monthly",icon:"📅",label:"Monthly Reports"},
  ];
  const saveDOT=async(data)=>{
    if(!selected)return;
    const u={...selected,dotLogs:[{...data,id:uid(),by:user.name,at:new Date().toISOString()},...(selected.dotLogs||[])]};
    await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("DOT log saved.");
  };
  return (
    <DeptShell icon="🫁" name="DOT / TB Clinic" role="DOT Officer / TB Nurse" user={user} onLogout={onLogout} navItems={navItems} section={section} setSection={setSection}>
      <Toast msg={toast.msg} type={toast.type}/>
      {section==="enrolled"&&(
        <div>
          <div className="dept-stats">
            {[["🫁","Enrolled",enrolled.length],["💊","On Treatment",enrolled.filter(p=>p.dotPhase).length],["✅","Completed",patients.filter(p=>p.dotOutcome==="Cured"||p.dotOutcome==="Treatment Completed").length],["⚠️","Defaulters",patients.filter(p=>p.dotOutcome==="Defaulted").length]].map(([icon,label,val])=>(
              <div key={label} className="dept-stat"><div className="dept-stat-icon">{icon}</div><div className="dept-stat-val">{val}</div><div className="dept-stat-label">{label}</div></div>
            ))}
          </div>
          <div className="dept-card"><h4>📋 DOT Patient Register</h4>
            {enrolled.length===0?<EmptyState icon="🫁" title="No patients enrolled in DOT"/>:(
              <div className="dept-queue">
                {enrolled.map(p=>(
                  <div key={p.id} className="dept-queue-item" onClick={()=>{setSelectedId(p.id);setSection("administer");}} style={{cursor:"pointer"}}>
                    <div className="dept-queue-num">🫁</div>
                    <div className="dept-queue-info">
                      <div className="dept-queue-name">{p.name}</div>
                      <div className="dept-queue-meta">{p.dotCategory||"—"} · Phase: {p.dotPhase||"—"} · Started: {p.dotStartDate||"—"}</div>
                    </div>
                    <span className={p.dotPhase==="Intensive"?"dept-badge-urgent":p.dotPhase==="Continuation"?"dept-badge-normal":"dept-badge-pending"}>{p.dotPhase||"Enrolled"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {section==="enroll"&&(
        <div className="dept-card"><h4>➕ Enroll New DOT Patient</h4>
          <PatientSelector patients={patients.filter(p=>!p.dotEnrolled)} selectedId={selectedId} setSelectedId={setSelectedId}/>
          {selected?<DOTEnrollForm patient={selected} officer={user.name} onSave={async data=>{
            const u={...selected,...data,dotEnrolled:true};
            await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast(`${selected.name} enrolled in DOT.`);setSelectedId(null);setSection("enrolled");
          }} showToast={showToast}/>:<EmptyState icon="➕" title="Select a patient to enroll"/>}
        </div>
      )}
      {section==="administer"&&(
        <div className="dept-card"><h4>💊 DOT Drug Administration</h4>
          <PatientSelector patients={enrolled} selectedId={selectedId} setSelectedId={setSelectedId}/>
          {selected?<DOTAdminForm patient={selected} officer={user.name} onSave={saveDOT} showToast={showToast}/>:<EmptyState icon="💊" title="Select an enrolled patient"/>}
          {selected&&(selected.dotLogs||[]).length>0&&(
            <div style={{marginTop:14}}>
              <div style={{fontWeight:900,fontSize:12,color:"#0a1c4e",marginBottom:8}}>RECENT ADMINISTRATION LOG</div>
              {(selected.dotLogs||[]).slice(0,10).map(l=>(
                <div key={l.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#f8fafc",border:"1px solid #dce6f5",borderRadius:9,padding:"9px 13px",marginBottom:6}}>
                  <div><div style={{fontSize:12,fontWeight:900}}>{l.date} {l.time}</div><div style={{fontSize:11,color:"#4a6a8a"}}>{l.regimen} · {l.takenBy}</div></div>
                  <span className={l.status==="Taken"?"dept-badge-normal":l.status==="Missed"?"dept-badge-urgent":"dept-badge-pending"}>{l.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {section==="adherence"&&(
        <div className="dept-card"><h4>📊 Adherence Monitoring</h4>
          <PatientSelector patients={enrolled} selectedId={selectedId} setSelectedId={setSelectedId}/>
          {selected?(
            <div>
              {(() => {
                const logs=selected.dotLogs||[];
                const total=logs.length;const taken=logs.filter(l=>l.status==="Taken").length;
                const pct=total?Math.round(taken/total*100):0;
                return <div style={{background:"#f0f4fa",border:"1px solid #dce6f5",borderRadius:10,padding:16,marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:900,marginBottom:10}}>Adherence: {pct}% ({taken}/{total} doses)</div>
                  <div style={{background:"#dce6f5",borderRadius:99,height:12,overflow:"hidden"}}><div style={{width:pct+"%",height:"100%",background:pct>=90?"#10b981":pct>=75?"#f59e0b":"#ef4444",borderRadius:99,transition:"width .4s"}}/></div>
                  <div style={{fontSize:11,color:"#4a6a8a",marginTop:6}}>{pct>=90?"Good adherence":pct>=75?"Moderate adherence – follow up needed":"Poor adherence – intervention required"}</div>
                </div>;
              })()}
              <AdherenceForm patient={selected} officer={user.name} onSave={async data=>{const u={...selected,adherenceReviews:[{...data,id:uid(),by:user.name,at:new Date().toISOString()},...(selected.adherenceReviews||[])]};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Adherence review saved.");}} showToast={showToast}/>
            </div>
          ):<EmptyState icon="📊" title="Select an enrolled patient"/>}
        </div>
      )}
      {section==="outcomes"&&(
        <div className="dept-card"><h4>✅ Treatment Outcomes</h4>
          <PatientSelector patients={enrolled} selectedId={selectedId} setSelectedId={setSelectedId}/>
          {selected&&(
            <div>
              <div style={{marginBottom:12}}><div style={{fontSize:12,fontWeight:700,color:"#4a6a8a",marginBottom:4}}>Current Outcome</div><span className={!selected.dotOutcome?"dept-badge-pending":selected.dotOutcome.includes("Cured")||selected.dotOutcome.includes("Completed")?"dept-badge-normal":"dept-badge-urgent"} style={{fontSize:13,padding:"4px 14px"}}>{selected.dotOutcome||"In Treatment"}</span></div>
              <div className="form-group"><label className="form-label">Set Treatment Outcome</label><select className="form-select" id="outcome-sel"><option>Cured</option><option>Treatment Completed</option><option>Died</option><option>Defaulted</option><option>Treatment Failed</option><option>Transferred Out</option></select></div>
              <button className="dept-send-btn" style={{marginTop:8}} onClick={async()=>{const outcome=document.getElementById("outcome-sel").value;const u={...selected,dotOutcome:outcome};await FB.savePatient(u);setPatients(ps=>ps.map(p=>p.id===u.id?u:p));showToast("Outcome updated.");}}>✅ Update Outcome</button>
            </div>
          )}
          {!selected&&<EmptyState icon="✅" title="Select an enrolled patient"/>}
        </div>
      )}
      {section==="monthly"&&(
        <div>
          <div className="dept-card"><h4>📅 Monthly Report</h4>
            <div className="form-group"><label className="form-label">Month</label><input className="form-input" type="month" id="rpt-month" defaultValue={new Date().toISOString().slice(0,7)}/></div>
            <div className="form-group"><label className="form-label">Report Notes</label><textarea className="form-textarea" style={{minHeight:80}} id="rpt-notes" placeholder="Summary of DOT activities for the month…"/></div>
            <button className="dept-send-btn" onClick={async()=>{const month=document.getElementById("rpt-month").value;const notes=document.getElementById("rpt-notes").value;const id="DOT-RPT-"+uid();await setDoc(doc(db,"dotReports",id),{id,month,notes,enrolled:enrolled.length,by:user.name,createdAt:serverTimestamp()});showToast("Monthly report saved.");}}>📅 Save Report</button>
          </div>
          {dotReports.length>0&&(
            <div className="dept-card"><h4>Past Reports</h4>
              {dotReports.slice(0,10).map(r=>(
                <div key={r.id} style={{background:"#f8fafc",border:"1px solid #dce6f5",borderRadius:9,padding:"9px 13px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontWeight:900,fontSize:13}}>{r.month}</span><span style={{fontSize:11,color:"#4a6a8a"}}>{r.by}</span></div>
                  <div style={{fontSize:12,color:"#4a6a8a"}}>Enrolled: {r.enrolled||"—"}</div>
                  {r.notes&&<div style={{fontSize:12,marginTop:3,lineHeight:1.5}}>{r.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </DeptShell>
  );
}

function DOTEnrollForm({patient,officer,onSave,showToast}){
  const REGIMENS=["2HRZE/4HR (Cat 1)","2HRZES/1HRZE/5HRE (Cat 2)","6HRE (Cat 3)","2HRZE/4HR (Paediatric)","MDR-TB Regimen","XDR-TB Regimen"];
  const CATEGORIES=["New (Cat 1)","Previously Treated (Cat 2)","MDR-TB","XDR-TB","Paediatric"];
  const [d,setD]=useState({dotStartDate:today(),dotRegimen:REGIMENS[0],dotCategory:CATEGORIES[0],dotPhase:"Intensive",dotSupporter:"",dotWeight:patient?.weight||"",dotSputumBaseline:"",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Start Date *</label><input className="form-input" type="date" value={d.dotStartDate} onChange={e=>set("dotStartDate",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Category</label><select className="form-select" value={d.dotCategory} onChange={e=>set("dotCategory",e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div>
      </div>
      <div className="form-group"><label className="form-label">Regimen *</label><select className="form-select" value={d.dotRegimen} onChange={e=>set("dotRegimen",e.target.value)}>{REGIMENS.map(r=><option key={r}>{r}</option>)}</select></div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Phase</label><select className="form-select" value={d.dotPhase} onChange={e=>set("dotPhase",e.target.value)}><option>Intensive</option><option>Continuation</option></select></div>
        <div className="form-group"><label className="form-label">Weight (kg)</label><input className="form-input" type="number" value={d.dotWeight} onChange={e=>set("dotWeight",e.target.value)}/></div>
      </div>
      <div className="form-group"><label className="form-label">Baseline Sputum Result</label><input className="form-input" value={d.dotSputumBaseline} onChange={e=>set("dotSputumBaseline",e.target.value)} placeholder="e.g. 3+ AFB positive"/></div>
      <div className="form-group"><label className="form-label">Treatment Supporter</label><input className="form-input" value={d.dotSupporter} onChange={e=>set("dotSupporter",e.target.value)} placeholder="Name and relationship"/></div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
      <button className="dept-send-btn" onClick={()=>{if(!d.dotStartDate||!d.dotRegimen){showToast("Start date and regimen required.","error");return;}onSave(d);}}>🫁 Enroll Patient</button>
    </div>
  );
}

function DOTAdminForm({patient,officer,onSave,showToast}){
  const [d,setD]=useState({date:today(),time:nowTime(),regimen:patient?.dotRegimen||"",status:"Taken",takenBy:"DOT Officer",missedReason:"",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="dept-form-section"><h5>Patient Info</h5>
        <div style={{display:"flex",gap:18,flexWrap:"wrap"}}>
          {[["Regimen",patient.dotRegimen||"—"],["Phase",patient.dotPhase||"—"],["Category",patient.dotCategory||"—"],["Start Date",patient.dotStartDate||"—"]].map(([l,v])=>(
            <div key={l}><div style={{fontSize:9,color:"#4a6a8a",fontWeight:700,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:13,fontWeight:900}}>{v}</div></div>
          ))}
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Time</label><input className="form-input" type="time" value={d.time} onChange={e=>set("time",e.target.value)}/></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Status *</label><select className="form-select" value={d.status} onChange={e=>set("status",e.target.value)}><option>Taken</option><option>Missed</option><option>Refused</option><option>Not Due</option></select></div>
        <div className="form-group"><label className="form-label">Observed By</label><select className="form-select" value={d.takenBy} onChange={e=>set("takenBy",e.target.value)}><option>DOT Officer</option><option>Family Member</option><option>Community Volunteer</option><option>Self-administered</option></select></div>
      </div>
      {(d.status==="Missed"||d.status==="Refused")&&<div className="form-group"><label className="form-label">Reason</label><input className="form-input" value={d.missedReason} onChange={e=>set("missedReason",e.target.value)} placeholder="Reason for missed dose…"/></div>}
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
      <button className="dept-send-btn" onClick={()=>{onSave(d);setD({date:today(),time:nowTime(),regimen:patient?.dotRegimen||"",status:"Taken",takenBy:"DOT Officer",missedReason:"",notes:""});}}>💊 Record Administration</button>
    </div>
  );
}

function AdherenceForm({patient,officer,onSave,showToast}){
  const [d,setD]=useState({date:today(),missedDoses:0,barriers:"",interventions:"",sputumFollowup:"",weightFollowup:patient?.dotWeight||"",notes:""});
  const set=(k,v)=>setD(x=>({...x,[k]:v}));
  return (
    <div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Review Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)}/></div>
        <div className="form-group"><label className="form-label">Missed Doses (this period)</label><input className="form-input" type="number" value={d.missedDoses} onChange={e=>set("missedDoses",e.target.value)}/></div>
      </div>
      <div className="form-group"><label className="form-label">Barriers to Adherence</label><input className="form-input" value={d.barriers} onChange={e=>set("barriers",e.target.value)} placeholder="Side effects, transport, stigma, forgetfulness…"/></div>
      <div className="form-group"><label className="form-label">Interventions Taken</label><textarea className="form-textarea" value={d.interventions} onChange={e=>set("interventions",e.target.value)} placeholder="Counseling, pill boxes, home visits, incentives…"/></div>
      <div className="form-row">
        <div className="form-group"><label className="form-label">Sputum Follow-up</label><input className="form-input" value={d.sputumFollowup} onChange={e=>set("sputumFollowup",e.target.value)} placeholder="e.g. Negative at 2 months"/></div>
        <div className="form-group"><label className="form-label">Weight (kg)</label><input className="form-input" type="number" value={d.weightFollowup} onChange={e=>set("weightFollowup",e.target.value)}/></div>
      </div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)}/></div>
      <button className="dept-send-btn" onClick={()=>{onSave(d);setD({date:today(),missedDoses:0,barriers:"",interventions:"",sputumFollowup:"",weightFollowup:"",notes:""});}}>📊 Save Review</button>
    </div>
  );
}

// ── AI helpers for pharmacy ──────────────────────────────────────────────────
if(!AI.checkInteractions){AI.checkInteractions=async(prescriptions)=>{
  const list=prescriptions.map(m=>`${m.drug} ${m.dosage} ${m.route} ${m.freq}`).join(", ");
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:"You are a clinical pharmacist. Check for drug interactions, contraindications, and provide brief dosing notes. Be concise.",messages:[{role:"user",content:`Check these medications for drug interactions and flag any concerns:\n${list}`}]})});
  const d=await r.json();return d.content?.map(c=>c.text||"").join("")||"No interactions found.";
};}



// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = FB.onAuth(async (fbUser) => {
      if (fbUser) {
        const p = await FB.getProfile(fbUser.uid);
        if (p && !p.deleted && !p.suspended) {
          setUser({ uid:fbUser.uid, email:fbUser.email, ...p });
        } else {
          await FB.logout();
          setUser(null);
        }
      } else { setUser(null); }
      setChecking(false);
    });
    return () => unsub();
  }, []);

  if (checking) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg,#F8FAFC)" }}>
      <style>{css}</style>
      <div style={{ textAlign:"center", color:"var(--t2,#7fa8c9)" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>⚕️</div>
        <div style={{ fontSize:14, fontWeight:600 }}>Loading MedRecord…</div>
        <div style={{ marginTop:12 }}><span className="ai-spinner" /></div>
      </div>
    </div>
  );

  if (isAdmin) return <AdminApp onLogout={()=>setIsAdmin(false)} />;

  if (!user) return (
    <><style>{css}</style>
    <LoginPage onLogin={(u) => {
      if (u==="__ADMIN__") { setIsAdmin(true); return; }
      setUser(u);
    }} /></>
  );

  const nurseRoles = ["nurse","supervisor","wardmaster"];
  const handleLogout = async () => { await FB.logout(); setUser(null); };
  if (nurseRoles.includes(user.role)) return <MainApp user={user} onLogout={handleLogout} />;
  if (user.role === "physician") return <PhysicianDashboard user={user} onLogout={handleLogout} />;
  if (user.role === "laboratory") return <LaboratoryDashboard user={user} onLogout={handleLogout} />;
  if (user.role === "radiology") return <RadiologyDashboard user={user} onLogout={handleLogout} />;
  if (user.role === "pharmacy") return <PharmacyDashboard user={user} onLogout={handleLogout} />;
  if (user.role === "physiotherapy") return <PhysiotherapyDashboard user={user} onLogout={handleLogout} />;
  if (user.role === "dietitian") return <DietitianDashboard user={user} onLogout={handleLogout} />;
  if (user.role === "ent") return <ENTDashboard user={user} onLogout={handleLogout} />;
  if (user.role === "dental") return <DentalDashboard user={user} onLogout={handleLogout} />;
  if (user.role === "publichealth") return <PublicHealthDashboard user={user} onLogout={handleLogout} />;
  if (user.role === "dot") return <DOTDashboard user={user} onLogout={handleLogout} />;
  return <MainApp user={user} onLogout={handleLogout} />;
}
