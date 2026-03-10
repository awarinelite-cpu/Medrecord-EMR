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
const ROLES = [{ value:"nurse", label:"Ward Nurse" },{ value:"supervisor", label:"Supervisor / Overall Nurse" },{ value:"wardmaster", label:"Ward Master" }];
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
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;1,9..144,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0b1623;--bg2:#0f1e2e;--bg3:#132438;--card:#162b40;--card2:#1a3350;
  --accent:#2dd4bf;--accent2:#14b8a6;--accent3:rgba(45,212,191,0.12);
  --blue:#3b82f6;--purple:#818cf8;
  --t1:#e2eef9;--t2:#7fa8c9;--t3:#4d7a9a;
  --success:#34d399;--warning:#fbbf24;--danger:#f87171;
  --border:rgba(45,212,191,0.14);--border2:rgba(255,255,255,0.06);
  --shadow:0 8px 32px rgba(0,0,0,0.5);
  --r:12px;--r-sm:8px;--r-lg:18px;
  --font:'DM Sans',sans-serif;--mono:'DM Mono',monospace;--display:'Fraunces',serif;
}
html,body{font-family:var(--font);background:var(--bg);color:var(--t1);min-height:100vh;overflow-x:auto;-webkit-overflow-scrolling:touch}
input,select,textarea,button{font-family:var(--font)}
input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
.app{display:flex;min-height:100vh;min-width:0}.mobile-back-btn{display:none;align-items:center;gap:6px;padding:8px 14px;margin:10px 12px 0;border:1px solid var(--border2);background:var(--bg3);color:var(--t2);border-radius:var(--r-sm);font-size:12px;cursor:pointer;font-weight:600}.hamburger{display:none;align-items:center;justify-content:center;width:36px;height:36px;border:none;background:none;color:var(--t1);font-size:20px;cursor:pointer;flex-shrink:0;border-radius:var(--r-sm)}.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:299}
.sidebar{width:220px;min-height:100vh;background:var(--bg2);border-right:1px solid var(--border2);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:100;overflow-y:auto}
.main{flex:1;margin-left:220px;display:flex;flex-direction:column;min-height:100vh;transition:transform .25s,margin-left .25s}
.topbar{height:58px;background:var(--bg2);border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;padding:0 20px;position:sticky;top:0;z-index:50;gap:10px}
.content{flex:1;display:flex;overflow:hidden;height:calc(100vh - 58px)}
.sb-logo{padding:16px 14px;border-bottom:1px solid var(--border2);flex-shrink:0}
.sb-logo-mark{display:flex;align-items:center;gap:9px}
.sb-icon{width:32px;height:32px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.sb-name{font-family:var(--display);font-size:16px;font-weight:700;color:var(--t1)}
.sb-sub{font-size:9px;color:var(--t3);letter-spacing:.5px;text-transform:uppercase}
.sb-user{padding:10px 12px;border-bottom:1px solid var(--border2);display:flex;align-items:center;gap:9px;flex-shrink:0}
.sb-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--purple));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;color:#000}
.sb-uname{font-size:11px;font-weight:600;color:var(--t1)}
.sb-urole{font-size:10px;color:var(--accent)}
.sb-nav{flex:1;padding:8px 6px}
.nav-section{font-size:9px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:1px;padding:10px 8px 4px}
.nav-btn{display:flex;align-items:center;gap:8px;width:100%;padding:7px 9px;border:none;border-radius:var(--r-sm);background:none;color:var(--t2);font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;margin-bottom:1px;text-align:left;position:relative}
.nav-btn:hover{background:var(--accent3);color:var(--t1)}
.nav-btn.active{background:var(--accent3);color:var(--accent);border:1px solid var(--border)}
.nav-btn .ni{font-size:14px;width:17px;text-align:center}
.sb-footer{padding:10px 8px;border-top:1px solid var(--border2);flex-shrink:0}
.tb-title{font-family:var(--display);font-size:16px;font-weight:700}
.tb-sub{font-size:11px;color:var(--t2);margin-top:1px}
.tb-right{display:flex;align-items:center;gap:7px;flex-shrink:0}
.tb-search{display:flex;align-items:center;gap:7px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r-sm);padding:6px 11px;flex:1;max-width:320px;position:relative}
.tb-search input{background:none;border:none;outline:none;color:var(--t1);font-size:13px;width:100%}
.tb-search input::placeholder{color:var(--t3)}
.badge-live{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(52,211,153,.1);color:var(--success);border:1px solid rgba(52,211,153,.2);white-space:nowrap}
.badge-dot{width:6px;height:6px;border-radius:50%;background:var(--success);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:var(--r-sm);border:none;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}
.btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#000}
.btn-primary:hover{opacity:.9;transform:translateY(-1px)}
.btn-secondary{background:var(--accent3);color:var(--accent);border:1px solid var(--border)}
.btn-secondary:hover{background:rgba(45,212,191,.2)}
.btn-danger{background:rgba(248,113,113,.1);color:var(--danger);border:1px solid rgba(248,113,113,.2)}
.btn-danger:hover{background:rgba(248,113,113,.2)}
.btn-ghost{background:rgba(255,255,255,.04);color:var(--t2);border:1px solid var(--border2)}
.btn-ghost:hover{background:rgba(255,255,255,.08);color:var(--t1)}
.btn-lg{padding:11px 18px;font-size:14px;border-radius:var(--r);width:100%;justify-content:center}
.btn-sm{padding:4px 9px;font-size:11px}
.btn:disabled{opacity:.5;cursor:wait}
.form-group{margin-bottom:13px}
.form-label{display:block;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px}
.form-input,.form-select,.form-textarea{width:100%;padding:9px 13px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r-sm);color:var(--t1);font-size:13px;outline:none;transition:border-color .15s;font-family:var(--font);-webkit-appearance:none;appearance:none}
.form-input:focus,.form-select:focus,.form-textarea:focus{border-color:var(--accent)}
.form-input::placeholder,.form-textarea::placeholder{color:var(--t3)}
.form-textarea{resize:vertical;min-height:80px}
.form-select option{background:var(--bg2)}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.form-error{font-size:12px;color:var(--danger);margin-top:5px;padding:8px 11px;background:rgba(248,113,113,.08);border-radius:var(--r-sm);border:1px solid rgba(248,113,113,.2)}
.form-success{font-size:12px;color:var(--success);margin-top:5px;padding:8px 11px;background:rgba(52,211,153,.08);border-radius:var(--r-sm)}
.card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r-lg)}
.pt-panel{width:250px;background:var(--bg2);border-right:1px solid var(--border2);display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
.pt-panel-header{padding:12px 10px;border-bottom:1px solid var(--border2);flex-shrink:0}
.pt-panel-title{font-size:13px;font-weight:700;margin-bottom:7px}
.filter-tabs{display:flex;gap:3px;margin-bottom:7px}
.filter-tab{flex:1;padding:5px;border:none;border-radius:var(--r-sm);background:var(--bg3);color:var(--t2);font-size:10px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all .15s}
.filter-tab.active{background:var(--accent3);color:var(--accent)}
.pt-list{flex:1;overflow-y:auto;padding:5px}
.pt-card{padding:9px 10px;border-radius:var(--r-sm);cursor:pointer;border:1px solid transparent;transition:all .15s;margin-bottom:2px}
.pt-card:hover{background:var(--accent3);border-color:var(--border)}
.pt-card.active{background:var(--accent3);border-color:var(--accent)}
.pt-name{font-size:12px;font-weight:700;margin-bottom:2px}
.pt-meta{font-size:10px;color:var(--t2);display:flex;gap:5px;align-items:center;flex-wrap:wrap}
.pt-detail{flex:1;overflow-y:auto;padding:18px}
.empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--t3);text-align:center;padding:40px}
.empty-icon{font-size:46px;opacity:.25;margin-bottom:11px}
.empty-text{font-size:15px;font-weight:600;color:var(--t2);margin-bottom:5px}
.empty-sub{font-size:12px}
.pt-header{background:linear-gradient(135deg,var(--card),var(--card2));border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 20px;margin-bottom:12px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.pt-header-info h2{font-family:var(--display);font-size:19px;font-weight:700}
.pt-header-meta{font-size:11px;color:var(--t2);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap}
.pt-header-actions{display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.ai-bar{background:linear-gradient(135deg,rgba(45,212,191,.08),rgba(129,140,248,.06));border:1px solid var(--border);border-radius:var(--r);padding:9px 13px;margin-bottom:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ai-bar-label{font-size:11px;font-weight:700;color:var(--accent);margin-right:3px;white-space:nowrap}
.ai-btn{padding:4px 10px;border:1px solid var(--border);border-radius:20px;background:rgba(45,212,191,.08);color:var(--t1);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all .15s}
.ai-btn:hover{background:rgba(45,212,191,.18);color:var(--accent)}
.ai-btn:disabled{opacity:.5;cursor:wait}
.stats-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:9px;margin-bottom:12px}
.stat-card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r);padding:11px 13px}
.stat-icon{font-size:15px;margin-bottom:4px}
.stat-label{font-size:9px;color:var(--t2);font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.stat-value{font-family:var(--mono);font-size:17px;font-weight:500;color:var(--t1);margin:2px 0}
.stat-unit{font-size:9px;color:var(--t3)}
.quick-actions{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin-bottom:12px}
.quick-btn{display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--card);border:1px solid var(--border2);border-radius:var(--r-sm);cursor:pointer;font-size:11px;font-weight:500;color:var(--t2);font-family:var(--font);transition:all .15s;text-align:left}
.quick-btn:hover{background:var(--accent3);border-color:var(--border);color:var(--t1)}
.tabs-bar{display:flex;gap:2px;background:var(--card);border:1px solid var(--border2);border-radius:var(--r);padding:3px;margin-bottom:12px;overflow-x:auto;flex-shrink:0}
.tab-btn{padding:5px 11px;border:none;border-radius:var(--r-sm);background:none;color:var(--t2);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all .15s;white-space:nowrap}
.tab-btn.active{background:var(--bg3);color:var(--accent)}
.table-wrap{overflow-x:auto;border-radius:var(--r);border:1px solid var(--border2)}
table{width:100%;border-collapse:collapse}
th{padding:8px 11px;text-align:left;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;background:var(--bg3);border-bottom:1px solid var(--border2);white-space:nowrap}
td{padding:8px 11px;font-size:12px;border-bottom:1px solid var(--border2);color:var(--t1)}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(45,212,191,.03)}
.badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700}
.badge-active{background:rgba(52,211,153,.12);color:var(--success)}
.badge-discharged{background:rgba(248,113,113,.1);color:var(--danger)}
.badge-given{background:rgba(52,211,153,.12);color:var(--success)}
.badge-missed,.badge-refused,.badge-withheld{background:rgba(248,113,113,.1);color:var(--danger)}
.badge-held{background:rgba(251,191,36,.1);color:var(--warning)}
.badge-critical{background:rgba(248,113,113,.15);color:var(--danger);border:1px solid rgba(248,113,113,.3)}
.badge-warning{background:rgba(251,191,36,.12);color:var(--warning);border:1px solid rgba(251,191,36,.3)}
.badge-normal,.badge-High,.badge-Low{background:rgba(52,211,153,.1);color:var(--success)}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
.modal{background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);width:100%;max-width:520px;max-height:92vh;overflow-y:auto;position:relative}
.modal-lg{max-width:680px}
.modal-xl{max-width:900px}
.modal-header{padding:15px 18px;border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--card);z-index:1;border-radius:var(--r-lg) var(--r-lg) 0 0}
.modal-title{font-family:var(--display);font-size:15px;font-weight:700}
.modal-close{background:none;border:none;color:var(--t2);font-size:18px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:6px}
.modal-close:hover{color:var(--t1);background:var(--bg3)}
.modal-body{padding:16px 18px}
.modal-footer{padding:11px 18px;border-top:1px solid var(--border2);display:flex;gap:7px;justify-content:flex-end}
.login-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse 80% 60% at 20% 20%,rgba(45,212,191,.07) 0%,transparent 60%),var(--bg);padding:20px}
.login-box{width:100%;max-width:400px;background:var(--card);border:1px solid var(--border);border-radius:var(--r-lg);padding:36px 32px;box-shadow:var(--shadow);position:relative;overflow:hidden}
.login-box::before{content:'';position:absolute;top:-1px;left:25%;right:25%;height:2px;background:linear-gradient(90deg,transparent,var(--accent),transparent)}
.login-logo{text-align:center;margin-bottom:24px}
.login-icon{width:48px;height:48px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:21px;margin:0 auto 9px}
.login-title{font-family:var(--display);font-size:21px;font-weight:700}
.login-sub{font-size:12px;color:var(--t2);margin-top:3px}
.tab-switcher{display:flex;background:var(--bg3);border-radius:var(--r-sm);padding:3px;margin-bottom:18px}
.tab-switch-btn{flex:1;padding:7px;border:none;border-radius:var(--r-sm);background:none;color:var(--t2);font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font);transition:all .2s}
.tab-switch-btn.active{background:var(--card2);color:var(--accent)}
.info-card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r-lg);padding:15px 17px;margin-bottom:11px}
.info-card h4{font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:11px}
.profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.profile-item label{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:2px}
.profile-item span{font-size:13px;font-weight:600}
.vitals-row{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:9px}
.vital-chip{background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r-sm);padding:8px 6px;text-align:center}
.vital-chip label{font-size:9px;color:var(--t3);text-transform:uppercase;display:block;margin-bottom:2px;letter-spacing:.5px}
.vital-chip span{font-family:var(--mono);font-size:12px;font-weight:500;color:var(--accent)}
.fluid-balance{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:11px}
.fluid-stat{background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r-sm);padding:11px;text-align:center}
.fluid-stat label{font-size:10px;color:var(--t3);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
.fluid-stat span{font-family:var(--mono);font-size:16px;font-weight:500}
.ai-chat-msg{padding:10px 13px;border-radius:12px;font-size:13px;line-height:1.6;max-width:86%}
.ai-chat-msg.user{background:var(--accent3);border:1px solid var(--border);border-radius:12px 12px 4px 12px;margin-left:auto}
.ai-chat-msg.assistant{background:var(--bg3);border:1px solid var(--border2);border-radius:12px 12px 12px 4px}
.ai-spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.toast{position:fixed;bottom:22px;right:22px;background:var(--card2);border:1px solid var(--border);border-radius:var(--r);padding:10px 15px;font-size:13px;font-weight:600;color:var(--t1);box-shadow:var(--shadow);z-index:9999;transform:translateY(20px);opacity:0;transition:all .25s;pointer-events:none;max-width:300px}
.toast.show{transform:translateY(0);opacity:1}
.toast-success{border-color:rgba(52,211,153,.3)}
.toast-error{border-color:rgba(248,113,113,.3);color:var(--danger)}
.toast-warning{border-color:rgba(251,191,36,.3);color:var(--warning)}
.alert-banner{padding:9px 13px;border-radius:var(--r-sm);margin-bottom:7px;display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600}
.alert-critical{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);color:var(--danger)}
.alert-warning{background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);color:var(--warning)}
.pain-scale{display:flex;gap:4px;flex-wrap:wrap}
.pain-btn{width:32px;height:32px;border-radius:var(--r-sm);border:1px solid var(--border2);background:var(--bg3);color:var(--t2);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--mono);transition:all .15s}
.pain-btn:hover{border-color:var(--accent);color:var(--t1)}
.pain-btn.selected{background:var(--accent);border-color:var(--accent);color:#000}
.ward-overview{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:13px;padding:18px;overflow-y:auto;flex:1}
.ward-card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r-lg);padding:15px}
.ward-card-title{font-family:var(--display);font-size:14px;font-weight:700;margin-bottom:11px;display:flex;justify-content:space-between;align-items:center}
.notif-panel{position:fixed;top:58px;right:0;width:330px;height:calc(100vh - 58px);background:var(--bg2);border-left:1px solid var(--border2);z-index:200;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .25s}
.notif-panel.open{transform:translateX(0)}
.notif-item{padding:11px 15px;border-bottom:1px solid var(--border2);cursor:pointer;transition:background .15s}
.notif-item:hover{background:var(--accent3)}
.notif-item.unread{border-left:3px solid var(--accent)}
.notif-item.critical-item{border-left:3px solid var(--danger)}
.search-dropdown{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);box-shadow:var(--shadow);z-index:200;max-height:300px;overflow-y:auto}
.search-result-item{padding:9px 13px;cursor:pointer;border-bottom:1px solid var(--border2);transition:background .15s}
.search-result-item:hover{background:var(--accent3)}
.search-result-item:last-child{border-bottom:none}
.overall-row{display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);margin-bottom:12px}
.overall-dot{width:8px;height:8px;border-radius:50%;background:var(--t3);flex-shrink:0}
.overall-dot.on{background:var(--success);box-shadow:0 0 8px var(--success);animation:pulse 2s infinite}
.ward-report-card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r);padding:14px 16px;margin-bottom:10px}
.ward-report-card.submitted{border-color:rgba(52,211,153,.3);background:rgba(52,211,153,.04)}
.ward-report-card.missing{border-color:rgba(251,191,36,.25);background:rgba(251,191,36,.03)}
.ward-report-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.ward-report-name{font-weight:700;font-size:13px}
.ward-report-meta{font-size:11px;color:var(--t2);margin-top:2px}
.ward-report-body{font-size:12px;color:var(--t1);line-height:1.6;white-space:pre-wrap;background:var(--bg3);border-radius:var(--r-sm);padding:10px 12px;margin-top:8px}
.collation-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-bottom:20px}
.archive-card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r);padding:14px 16px;margin-bottom:10px}
.archive-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;gap:10px}
.archive-title{font-family:var(--display);font-size:14px;font-weight:700}
.archive-meta{font-size:11px;color:var(--t2);margin-top:2px}
.archive-note{background:rgba(45,212,191,.07);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;font-size:12px;color:var(--t1);line-height:1.6;margin-top:8px}
.supervisor-note-box{background:linear-gradient(135deg,rgba(45,212,191,.07),rgba(129,140,248,.05));border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-top:16px}
.section-title{font-family:var(--display);font-size:16px;font-weight:700;margin-bottom:4px}
.section-sub{font-size:12px;color:var(--t2);margin-bottom:16px}
.all-wards-header{background:linear-gradient(135deg,rgba(45,212,191,.1),rgba(129,140,248,.07));border:1px solid var(--border);border-radius:var(--r-lg);padding:16px 20px;margin-bottom:18px;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.ward-block{background:var(--card);border:1px solid var(--border2);border-radius:var(--r-lg);margin-bottom:14px;overflow:hidden}
.ward-block-header{padding:13px 16px;border-bottom:1px solid var(--border2);display:flex;align-items:center;justify-content:space-between;background:var(--bg3)}
.ward-block-title{font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px}
.ward-block-body{padding:14px 16px}
.shift-report-item{padding:10px 12px;background:var(--bg3);border-radius:var(--r-sm);margin-bottom:8px;border-left:3px solid var(--accent)}
.shift-report-item:last-child{margin-bottom:0}
.shift-label{font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between}
.shift-report-text{font-size:12px;color:var(--t1);line-height:1.65;white-space:pre-wrap}
.ward-empty{padding:14px;font-size:12px;color:var(--t3);font-style:italic;text-align:center}
.theme-light{--bg:#f0f4f8;--bg2:#e4ecf4;--bg3:#d6e2ee;--card:#fff;--card2:#f4f8fb;--t1:#0f2942;--t2:#3d6482;--t3:#6a99b8;--border2:rgba(0,0,0,.08);--border:rgba(45,212,191,.25)}
@media print{
  .sidebar,.topbar,.ai-bar,.quick-actions,.tabs-bar,.notif-panel,.no-print{display:none!important}
  .main{margin-left:0!important}
  .pt-detail{padding:0!important}
  .print-only{display:block!important}
  body{background:#fff!important;color:#000!important}
  .print-report-wrap{display:block!important;padding:18mm 18mm 12mm 18mm;font-family:'Times New Roman',serif;color:#000;background:#fff}
  .print-report-title{font-size:14pt;font-weight:bold;text-align:center;margin-bottom:4pt}
  .print-report-subtitle{font-size:11pt;text-align:center;margin-bottom:12pt;color:#333}
  .print-ward-section{margin-bottom:18pt;break-inside:avoid}
  .print-ward-name{font-size:12pt;font-weight:bold;margin-bottom:4pt;border-bottom:1.5pt solid #000;padding-bottom:2pt}
  .print-shift-table{width:100%;border-collapse:collapse;font-size:7.5pt;margin-bottom:6pt}
  .print-shift-table th{background:#D9E1F2;border:1pt solid #888;padding:3pt 4pt;font-weight:bold;text-align:center;white-space:nowrap}
  .print-shift-table td{border:1pt solid #888;padding:2pt 4pt;text-align:center;vertical-align:top}
  .print-shift-table td.nurses-col{text-align:left;font-size:7pt}
  .print-shift-table td.report-col{text-align:left;font-size:7.5pt;padding:4pt 5pt;white-space:pre-wrap;max-width:180pt}
  .print-overall-note{margin-top:14pt;border:1pt solid #888;padding:8pt 10pt;break-inside:avoid}
  .print-overall-note-label{font-weight:bold;font-size:10pt;margin-bottom:4pt}
  .print-overall-note-text{font-size:9.5pt;line-height:1.5;white-space:pre-wrap}
  .print-footer{margin-top:14pt;font-size:8pt;color:#555;text-align:right;border-top:0.5pt solid #ccc;padding-top:4pt}
  .print-no-report{font-style:italic;font-size:8pt;color:#888;padding:4pt 0}
}
@media(max-width:768px){.hamburger{display:flex!important}.sidebar{transform:translateX(-100%);transition:transform .25s;z-index:300;width:240px}.sidebar.open{transform:translateX(0)}.sidebar-overlay{display:block!important}html,body{overflow-x:hidden;overflow-y:auto}.app{overflow-x:hidden}.main{margin-left:0!important;width:100vw;min-width:0}.content{flex-direction:column;height:auto;overflow:visible}.pt-panel{width:100%!important;min-width:0;border-right:none;border-bottom:1px solid var(--border2);max-height:none;overflow:visible}.pt-list{max-height:none;overflow:visible}.pt-detail{padding:12px}.mobile-back-btn{display:flex!important}.pt-header{flex-direction:column;gap:10px}.pt-header-actions{justify-content:flex-start}.form-row{grid-template-columns:1fr}.stats-row{grid-template-columns:repeat(2,1fr)}.quick-actions{grid-template-columns:repeat(2,1fr)}.topbar{padding:0 12px;gap:8px}.tb-search{max-width:none;flex:1}.tb-right .badge-live{display:none}.ai-bar{gap:4px}.tabs-bar{font-size:11px}.pt-panel.hidden{display:none!important}.main.sidebar-open{transform:translateX(240px)}}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
`;

// ─── UTILITY ──────────────────────────────────────────────────────────────────
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
            {users.map(u => <option key={u.uid || u.id} value={u.uid || u.id}>{u.name} ({u.role})</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => {
            if (sel) {
              const picked = users.find(u => (u.uid || u.id) === sel);
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

// ─── LOGIN PAGE ───────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [regData, setRegData] = useState({ name: "", email: "", password: "", confirmPassword: "", role: "", ward: "" });
  const [fpEmail, setFpEmail] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const showMsg = (text, type = "error") => setMsg({ text, type });
  const switchTab = (t) => { setTab(t); setMsg(null); };

  const doLogin = async () => {
    if (!loginData.email || !loginData.password) { showMsg("Enter your email and password."); return; }
    if (loginData.email.trim().toLowerCase() === ADMIN_EMAIL && loginData.password === ADMIN_PASSWORD) {
      onLogin("__ADMIN__"); return;
    }
    setBusy(true);
    try {
      const [cred] = await Promise.all([
        FB.login(loginData.email, loginData.password),
        new Promise(r => setTimeout(r, 500)),
      ]);
      onLogin({ uid: cred.user.uid, email: cred.user.email });
      FB.getProfile(cred.user.uid).then(profile => { if (profile) onLogin(prev => ({ ...prev, ...profile })); }).catch(() => {});
    } catch (e) { showMsg(e.code === "auth/invalid-credential" ? "Incorrect email or password." : e.message); setBusy(false); }
  };

  const doRegister = async () => {
    if (!regData.name || !regData.email || !regData.password || !regData.role) { showMsg("Fill in all required fields."); return; }
    if (regData.password !== regData.confirmPassword) { showMsg("Passwords do not match."); return; }
    if (regData.password.length < 6) { showMsg("Password must be at least 6 characters."); return; }
    setBusy(true);
    try {
      const profile = { name: regData.name, role: regData.role, ward: regData.ward || "" };
      await FB.register(regData.email, regData.password, profile);
      showMsg("Account created! You can now sign in.", "success");
      switchTab("login"); setLoginData({ email: regData.email, password: "" });
    } catch (e) { showMsg(e.code === "auth/email-already-in-use" ? "Email already registered." : e.message); }
    setBusy(false);
  };

  const doForgotPassword = async () => {
    if (!fpEmail) { showMsg("Enter your email address."); return; }
    setBusy(true);
    try {
      await FB.forgotPassword(fpEmail);
      showMsg("Reset link sent! Check your inbox.", "success");
      setFpEmail(""); setTimeout(() => switchTab("login"), 3000);
    } catch (e) { showMsg(e.code === "auth/user-not-found" ? "No account found with that email." : e.message); }
    setBusy(false);
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-logo">
          <div className="login-icon">⚕️</div>
          <div className="login-title">MedRecord</div>
          <div className="login-sub">Hospital Electronic Medical Records</div>
        </div>
        <div className="tab-switcher">
          <button className={`tab-switch-btn ${tab === "login" ? "active" : ""}`} onClick={() => switchTab("login")}>Sign In</button>
          <button className={`tab-switch-btn ${tab === "register" ? "active" : ""}`} onClick={() => switchTab("register")}>Register</button>
          <button className={`tab-switch-btn ${tab === "forgot" ? "active" : ""}`} onClick={() => switchTab("forgot")}>Forgot</button>
        </div>
        {tab === "login" && <>
          <div className="form-group"><label className="form-label">Email Address</label><input className="form-input" type="email" placeholder="your@email.com" value={loginData.email} onChange={e => setLoginData(d => ({ ...d, email: e.target.value }))} onKeyDown={e => e.key === "Enter" && doLogin()} /></div>
          <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" placeholder="Enter password" value={loginData.password} onChange={e => setLoginData(d => ({ ...d, password: e.target.value }))} onKeyDown={e => e.key === "Enter" && doLogin()} /></div>
          {msg && <div className={msg.type === "error" ? "form-error" : "form-success"}>{msg.text}</div>}
          <button className="btn btn-primary btn-lg" style={{ marginTop: 13 }} onClick={doLogin} disabled={busy}>{busy ? <Spinner /> : "Sign In"}</button>
          <div style={{ textAlign: "center", marginTop: 10 }}><button onClick={() => switchTab("forgot")} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Forgot password?</button></div>
        </>}
        {tab === "forgot" && <>
          <p style={{ fontSize: 13, color: "var(--t2)", marginBottom: 13 }}>Enter your email and we'll send a reset link.</p>
          <div className="form-group"><label className="form-label">Email Address</label><input className="form-input" type="email" placeholder="your@email.com" value={fpEmail} onChange={e => setFpEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && doForgotPassword()} /></div>
          {msg && <div className={msg.type === "error" ? "form-error" : "form-success"}>{msg.text}</div>}
          <button className="btn btn-primary btn-lg" style={{ marginTop: 8 }} onClick={doForgotPassword} disabled={busy}>{busy ? <Spinner /> : "Send Reset Link"}</button>
          <div style={{ textAlign: "center", marginTop: 10 }}><button onClick={() => switchTab("login")} style={{ background: "none", border: "none", color: "var(--t2)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>← Back to Sign In</button></div>
        </>}
        {tab === "register" && <>
          <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" placeholder="Your full name" value={regData.name} onChange={e => setRegData(d => ({ ...d, name: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Email Address *</label><input className="form-input" type="email" placeholder="your@email.com" value={regData.email} onChange={e => setRegData(d => ({ ...d, email: e.target.value }))} /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Password *</label><input className="form-input" type="password" placeholder="Min 6 characters" value={regData.password} onChange={e => setRegData(d => ({ ...d, password: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Confirm *</label><input className="form-input" type="password" placeholder="Repeat password" value={regData.confirmPassword} onChange={e => setRegData(d => ({ ...d, confirmPassword: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Role *</label><select className="form-select" value={regData.role} onChange={e => setRegData(d => ({ ...d, role: e.target.value }))}><option value="">Select role</option>{ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
          {regData.role && regData.role !== "supervisor" && <div className="form-group"><label className="form-label">Ward</label><select className="form-select" value={regData.ward} onChange={e => setRegData(d => ({ ...d, ward: e.target.value }))}><option value="">Select ward</option>{WARDS.map(w => <option key={w}>{w}</option>)}</select></div>}
          {msg && <div className={msg.type === "error" ? "form-error" : "form-success"}>{msg.text}</div>}
          <button className="btn btn-primary btn-lg" style={{ marginTop: 8 }} onClick={doRegister} disabled={busy}>{busy ? <Spinner /> : "Create Account"}</button>
        </>}
      </div>
    </div>
  );
}

// ─── PATIENT TABS ─────────────────────────────────────────────────────────────
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
                    <tr style={{ fontWeight:"bold", background:"#eef0f8" }}>
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
  const [darkMode, setDarkMode] = useState(true);
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
    <div className={`app ${darkMode ? "" : "theme-light"}`}>
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
          <button className={`nav-btn ${section === "overview" ? "active" : ""}`} onClick={() => { setSection("overview"); setSidebarOpen(false); }}><span className="ni">🗺️</span>Ward Overview</button>
          <button className={`nav-btn ${section === "reports" ? "active" : ""}`} onClick={() => { setSection("reports"); setSidebarOpen(false); }}><span className="ni">📊</span>Reports</button>
          {user.role === "nurse" && <button className={`nav-btn ${section === "wardreport" ? "active" : ""}`} onClick={() => { setSection("wardreport"); setSidebarOpen(false); }}><span className="ni">📝</span>Ward Report</button>}
          {isOverallNurse && (
            <button className={`nav-btn ${section === "allwardsreport" ? "active" : ""}`} onClick={() => { setSection("allwardsreport"); setSidebarOpen(false); }} style={{ color: "var(--warning)" }}>
              <span className="ni">📋</span>24hr Nurses Report
              <span style={{ marginLeft: "auto", background: "var(--warning)", color: "#000", fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "1px 5px" }}>ALL</span>
            </button>
          )}
          {(user.role === "supervisor" || user.role === "wardmaster") && <button className={`nav-btn ${section === "collation" ? "active" : ""}`} onClick={() => { setSection("collation"); setSidebarOpen(false); }}><span className="ni">👑</span>24hr Collation</button>}
          <button className="nav-btn" onClick={() => openM("overallNurse")}><span className="ni">👑</span>Overall Nurse</button>
          <div className="nav-section">AI Tools</div>
          <button className="nav-btn" onClick={() => openM("aiChat")} style={{ color: "var(--purple)" }}><span className="ni">🤖</span>Ask Claude AI</button>
          <div className="nav-section">Settings</div>
          {(user.role === "supervisor" || user.role === "wardmaster") && <button className="nav-btn" onClick={() => openM("userMgmt")}><span className="ni">👥</span>User Management</button>}
          <button className="nav-btn" onClick={() => setDarkMode(d => !d)}><span className="ni">{darkMode ? "☀️" : "🌙"}</span>{darkMode ? "Light Mode" : "Dark Mode"}</button>
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

function AdminLoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = () => {
    setErr("");
    if (email.trim().toLowerCase() === ADMIN_EMAIL && pw === ADMIN_PASSWORD) {
      onLogin();
    } else {
      setErr("Invalid administrator credentials. Access denied.");
    }
  };

  return (
    <div className="adm-login-page">
      <style>{adminCss}</style>
      <div className="adm-login-box">
        <div className="adm-login-crest">🛡️</div>
        <div className="adm-login-title">Administrator Portal</div>
        <div className="adm-login-sub">MedRecord System — Restricted Access</div>
        {err && <div className="adm-login-err">⚠️ {err}</div>}
        <div className="adm-form-group">
          <label className="adm-label">Admin Email</label>
          <input className="adm-input" type="email" placeholder="admin@gmail.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />
        </div>
        <div className="adm-form-group">
          <label className="adm-label">Password</label>
          <input className="adm-input" type="password" placeholder="••••••••" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />
        </div>
        <button className="adm-btn adm-btn-navy" style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: 14, marginTop: 8 }} onClick={handle} disabled={busy}>
          🔐 Enter Admin Console
        </button>
        <div className="adm-login-hint">ALL ACTIONS ARE LOGGED · RESTRICTED ACCESS</div>
      </div>
    </div>
  );
}

// Dashboard
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
                    <span style={{ color: "#1a2e5a" }}>{ward}</span>
                    <span style={{ color: "#0d2b6b", fontWeight: 900 }}>{count} patient{count !== 1 ? "s" : ""}</span>
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
              { label: "Ward Nurses", val: roleCounts.nurse, color: "#0d2b6b" },
              { label: "Supervisors", val: roleCounts.supervisor, color: "#1a5c2a" },
              { label: "Ward Masters", val: roleCounts.wardmaster, color: "#7c2d12" },
            ].map((r, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                  <span style={{ color: "#1a2e5a" }}>{r.label}</span>
                  <span style={{ color: r.color, fontWeight: 900 }}>{r.val}</span>
                </div>
                <div className="adm-progress-wrap">
                  <div className="adm-progress-fill" style={{ width: `${Math.min(100, (r.val / Math.max(totalUsers, 1)) * 100)}%`, background: r.color }} />
                </div>
              </div>
            ))}
            <div className="adm-divider" />
            <div style={{ textAlign: "center", fontSize: 13, fontWeight: 900, color: "#0d2b6b" }}>Total: {totalUsers} staff members</div>
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
function AdminUsers({ users, onRefresh, showToast }) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "nurse", ward: "" });
  const [busy, setBusy] = useState(false);

  const visible = users.filter(u => !u.deleted && (
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.role?.toLowerCase().includes(search.toLowerCase())
  ));

  const handleAdd = async () => {
    if (!form.name || !form.email || !form.password) { showToast("Name, email and password are required.", "error"); return; }
    setBusy(true);
    try {
      await FB.register(form.email, form.password, { name: form.name, role: form.role, ward: form.ward });
      await FB.saveSystemLog("CREATE", `New user: ${form.name} (${form.role})`);
      showToast("User account created successfully.");
      setShowAdd(false); setForm({ name: "", email: "", password: "", role: "nurse", ward: "" });
      onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
    setBusy(false);
  };

  const handleRoleChange = async (u, newRole) => {
    try {
      await FB.updateUserRole(u.uid, newRole);
      await FB.saveSystemLog("UPDATE", `Role changed: ${u.name} → ${newRole}`);
      showToast("Role updated."); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const handleDeactivate = async (u) => {
    if (!window.confirm(`Deactivate "${u.name}"? They will no longer be able to log in.`)) return;
    try {
      await FB.deactivateUser(u.uid);
      await FB.saveSystemLog("DELETE", `User deactivated: ${u.name} (${u.email})`);
      showToast("User deactivated."); onRefresh();
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  return (
    <div>
      <div className="adm-section-hdr">
        <div>
          <div className="adm-section-title">Staff Accounts</div>
          <div className="adm-section-sub">{visible.length} active accounts</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div className="adm-search-bar"><span style={{ color: "#8aa0cc" }}>🔍</span><input placeholder="Search staff…" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <button className="adm-btn adm-btn-navy" onClick={() => setShowAdd(true)}>+ Add Staff Account</button>
        </div>
      </div>

      <div className="adm-card">
        <table className="adm-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Ward</th><th>Date Joined</th><th>Action</th></tr></thead>
          <tbody>
            {visible.length === 0
              ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 30, color: "#8aa0cc" }}>No staff found</td></tr>
              : visible.map(u => (
                <tr key={u.uid}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#0d2b6b,#2a5bd7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                        {(u.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <span style={{ color: "#0a1628", fontWeight: 900 }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{ color: "#4a6699" }}>{u.email}</td>
                  <td>
                    <select className="adm-select" style={{ width: "auto", padding: "4px 9px", fontSize: 12 }} value={u.role || "nurse"} onChange={e => handleRoleChange(u, e.target.value)}>
                      <option value="nurse">Ward Nurse</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="wardmaster">Ward Master</option>
                    </select>
                  </td>
                  <td>{u.ward || <span style={{ color: "#c8d8f8" }}>—</span>}</td>
                  <td style={{ color: "#4a6699" }}>{u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : "—"}</td>
                  <td><button className="adm-btn adm-btn-red adm-btn-sm" onClick={() => handleDeactivate(u)}>🚫 Deactivate</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="adm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="adm-modal">
            <div className="adm-modal-hdr">
              <span className="adm-modal-title">➕ Create Staff Account</span>
              <button className="adm-modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Full Name *</label><input className="adm-input" placeholder="Staff full name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="adm-form-group"><label className="adm-label">Email Address *</label><input className="adm-input" type="email" placeholder="staff@hospital.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <div className="adm-grid2">
                <div className="adm-form-group"><label className="adm-label">Password *</label><input className="adm-input" type="password" placeholder="Minimum 6 characters" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
                <div className="adm-form-group"><label className="adm-label">Role</label>
                  <select className="adm-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="nurse">Ward Nurse</option><option value="supervisor">Supervisor</option><option value="wardmaster">Ward Master</option>
                  </select>
                </div>
              </div>
              <div className="adm-form-group"><label className="adm-label">Assigned Ward</label>
                <select className="adm-select" value={form.ward} onChange={e => setForm(f => ({ ...f, ward: e.target.value }))}>
                  <option value="">No specific ward</option>{WARDS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
            <div className="adm-modal-foot">
              <button className="adm-btn adm-btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="adm-btn adm-btn-navy" onClick={handleAdd} disabled={busy}>{busy ? "Creating…" : "✚ Create Account"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Patients
function AdminPatients({ patients, showToast }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const visible = patients.filter(p => !p.deleted).filter(p => {
    const q = search.toLowerCase();
    const match = !q || p.name?.toLowerCase().includes(q) || p.emr?.toLowerCase().includes(q) || p.diagnosis?.toLowerCase().includes(q) || p.ward?.toLowerCase().includes(q);
    if (filter === "active") return match && (p.status || "active") === "active";
    if (filter === "discharged") return match && p.status === "discharged";
    return match;
  });

  const handleDelete = async (p) => {
    if (!window.confirm(`Permanently delete record for "${p.name}" (EMR: ${p.emr})? This cannot be undone.`)) return;
    try {
      await FB.deletePatient(p.id);
      await FB.saveSystemLog("DELETE", `Patient record deleted: ${p.name} (EMR: ${p.emr})`);
      showToast("Patient record deleted.");
    } catch (e) { showToast("Error: " + e.message, "error"); }
  };

  return (
    <div>
      <div className="adm-section-hdr">
        <div>
          <div className="adm-section-title">Patient Records</div>
          <div className="adm-section-sub">{visible.length} records — admin read & delete access</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {["all", "active", "discharged"].map(f => (
            <button key={f} className="adm-btn adm-btn-ghost adm-btn-sm" style={filter === f ? { background: "#0d2b6b", color: "#fff", borderColor: "#0d2b6b" } : {}} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <div className="adm-search-bar"><span style={{ color: "#8aa0cc" }}>🔍</span><input placeholder="Search patients…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
      </div>
      <div className="adm-card">
        <table className="adm-table">
          <thead><tr><th>Patient Name</th><th>EMR No.</th><th>Ward</th><th>Diagnosis</th><th>Status</th><th>Admitted</th><th>Action</th></tr></thead>
          <tbody>
            {visible.length === 0
              ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 30, color: "#8aa0cc" }}>No records found</td></tr>
              : visible.map(p => (
                <tr key={p.id}>
                  <td style={{ color: "#0a1628", fontWeight: 900 }}>{p.name}</td>
                  <td><span style={{ fontFamily: "monospace", color: "#0d2b6b", fontWeight: 900 }}>{p.emr || "—"}</span></td>
                  <td>{p.ward?.split("–")[0]?.trim() || "—"}</td>
                  <td>{p.diagnosis || <span style={{ color: "#c8d8f8" }}>—</span>}</td>
                  <td><span className={`adm-badge adm-badge-${p.status === "discharged" ? "amber" : "green"}`}>{p.status || "active"}</span></td>
                  <td style={{ color: "#4a6699" }}>{p.admission || "—"}</td>
                  <td><button className="adm-btn adm-btn-red adm-btn-sm" onClick={() => handleDelete(p)}>🗑️ Delete</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Announcements
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
          <div style={{ fontSize: 14, fontWeight: 900, color: "#0d2b6b", marginBottom: 14, fontFamily: "\"Times New Roman\",serif" }}>
            Posted Announcements ({active.length})
          </div>
          {active.length === 0
            ? <div style={{ textAlign: "center", padding: 30, color: "#8aa0cc", fontSize: 13, fontWeight: 700 }}>No announcements yet</div>
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
          <div className="adm-search-bar"><span style={{ color: "#8aa0cc" }}>🔍</span><input placeholder="Search logs…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
      </div>
      <div className="adm-card">
        <table className="adm-table">
          <thead><tr><th>Action</th><th>Detail</th><th>By</th><th>Timestamp</th></tr></thead>
          <tbody>
            {visible.length === 0
              ? <tr><td colSpan={4} style={{ textAlign: "center", padding: 30, color: "#8aa0cc" }}>No logs found</td></tr>
              : visible.map((l, i) => (
                <tr key={l.id || i}>
                  <td>
                    <span className="adm-badge" style={{ background: `${actionColor[l.action] || "#6b7280"}15`, color: actionColor[l.action] || "#6b7280", border: `1px solid ${actionColor[l.action] || "#6b7280"}30` }}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{ color: "#0a1628" }}>{l.detail}</td>
                  <td style={{ color: "#4a6699" }}>{l.by}</td>
                  <td style={{ color: "#4a6699" }}>{l.ts?.toDate ? l.ts.toDate().toLocaleString() : "—"}</td>
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
              ? <tr><td colSpan={3} style={{ textAlign: "center", padding: 30, color: "#8aa0cc" }}>No reports yet</td></tr>
              : sortedDates.map(date => (
                <tr key={date}>
                  <td style={{ fontWeight: 900, color: "#0a1628" }}>{date}</td>
                  <td><span className="adm-badge adm-badge-navy">{byDate[date]} report{byDate[date] !== 1 ? "s" : ""}</span></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="adm-progress-wrap" style={{ flex: 1 }}>
                        <div className="adm-progress-fill" style={{ width: `${Math.min(100, (byDate[date] / WARDS.length) * 100)}%` }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 900, color: "#4a6699", whiteSpace: "nowrap" }}>{byDate[date]}/{WARDS.length} wards</span>
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
function AdminSettings({ showToast }) {
  return (
    <div>
      <div className="adm-section-title" style={{ marginBottom: 20 }}>⚙️ System Configuration</div>
      <div className="adm-notice adm-notice-warn">⚠️ Changes in this section affect all users across the entire MedRecord system.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">🔐 Admin Credentials</span></div>
          <div className="adm-card-body">
            <div className="adm-notice adm-notice-info">ℹ️ Credentials are hardcoded in the application for maximum security.</div>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 2.2, color: "#1a2e5a" }}>
              <div>Email: <span style={{ color: "#0d2b6b", fontWeight: 900 }}>{ADMIN_EMAIL}</span></div>
              <div>Role: <span className="adm-badge adm-badge-gold">System Administrator</span></div>
              <div>Access Level: <span style={{ fontWeight: 900, color: "#0d2b6b" }}>Full System Control</span></div>
            </div>
          </div>
        </div>
        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">🗄️ Database</span></div>
          <div className="adm-card-body">
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 2.2, color: "#1a2e5a" }}>
              <div>Provider: <span style={{ fontWeight: 900 }}>Firebase Firestore</span></div>
              <div>Project: <span style={{ fontWeight: 900, fontFamily: "monospace" }}>the-elites-nurses</span></div>
              <div>Status: <span className="adm-badge adm-badge-green">✓ Connected</span></div>
              <div>AI Engine: <span style={{ fontWeight: 900, color: "#0d2b6b" }}>Claude (Anthropic)</span></div>
            </div>
          </div>
        </div>
        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">🏥 Configured Wards</span></div>
          <div className="adm-card-body">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {WARDS.map(w => <span key={w} className="adm-badge adm-badge-navy" style={{ fontSize: 12 }}>{w.split("–")[0].trim()}</span>)}
            </div>
          </div>
        </div>
        <div className="adm-card">
          <div className="adm-card-hdr"><span className="adm-card-title">📱 Application Info</span></div>
          <div className="adm-card-body">
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 2.2, color: "#1a2e5a" }}>
              <div>System: <span style={{ fontWeight: 900 }}>MedRecord EMR</span></div>
              <div>Version: <span style={{ fontWeight: 900 }}>1.0.0</span></div>
              <div>User Roles: <span style={{ fontWeight: 900 }}>Nurse · Supervisor · Ward Master</span></div>
              <div>Admin: <span className="adm-badge adm-badge-gold">General Overseer</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main AdminApp shell
function AdminApp({ onLogout }) {
  const [section, setSection] = useState("dashboard");
  const [patients, setPatients] = useState([]);
  const [users, setUsers] = useState([]);
  const [wardReports, setWardReports] = useState([]);
  const [archives, setArchives] = useState([]);
  const [logs, setLogs] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [toastState, showToast] = useToast();

  const loadUsers = () => FB.getUsers().then(setUsers).catch(() => {});

  useEffect(() => {
    const u1 = FB.onPatients(setPatients);
    const u2 = FB.onWardReports(setWardReports);
    const u3 = FB.on24hrArchives(setArchives);
    const u4 = FB.onSystemLogs(setLogs);
    const u5 = FB.onAnnouncements(setAnnouncements);
    loadUsers();
    FB.saveSystemLog("LOGIN", "Administrator session started");
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, []);

  const navItems = [
    { id: "dashboard", icon: "🏠", label: "Dashboard" },
    { id: "users", icon: "👥", label: "Staff Accounts", count: users.filter(u => !u.deleted).length },
    { id: "patients", icon: "🏥", label: "Patient Records", count: patients.filter(p => !p.deleted).length },
    { id: "reports", icon: "📊", label: "Reports" },
    { id: "announcements", icon: "📢", label: "Announcements", count: announcements.filter(a => !a.deleted).length },
    { id: "logs", icon: "📜", label: "Audit Logs", count: logs.length },
    { id: "settings", icon: "⚙️", label: "System Settings" },
  ];

  const titles = { dashboard: "System Dashboard", users: "Staff Accounts", patients: "Patient Records", reports: "Reports Overview", announcements: "Announcements", logs: "Audit Log", settings: "System Settings" };

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
          <div className="adm-nav-section">Main Navigation</div>
          {navItems.map(n => (
            <button key={n.id} className={`adm-nav-btn ${section === n.id ? "active" : ""}`} onClick={() => setSection(n.id)}>
              <span className="adm-ni">{n.icon}</span>
              {n.label}
              {n.count !== undefined && <span className="adm-nav-count">{n.count}</span>}
            </button>
          ))}

          <div className="adm-nav-section">Session</div>
          <button className="adm-nav-btn danger-btn" onClick={() => { FB.saveSystemLog("LOGIN", "Administrator session ended"); onLogout(); }}>
            <span className="adm-ni">🚪</span>Sign Out
          </button>
        </div>

        <div className="adm-sidebar-footer">
          {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · All rights reserved
        </div>
      </nav>

      <div className="adm-main">
        <div className="adm-topbar">
          <div className="adm-topbar-left">
            <div className="adm-topbar-title">{titles[section]}</div>
            <div className="adm-topbar-sub">MedRecord EMR · General Overseer View</div>
          </div>
          <div className="adm-topbar-right">
            <div className="adm-live-badge"><div className="adm-live-dot" />System Online</div>
            <span className="adm-topbar-email">{ADMIN_EMAIL}</span>
          </div>
        </div>

        <div className="adm-content">
          {section === "dashboard" && <AdminDashboard patients={patients} users={users} wardReports={wardReports} logs={logs} announcements={announcements} />}
          {section === "users" && <AdminUsers users={users} onRefresh={loadUsers} showToast={showToast} />}
          {section === "patients" && <AdminPatients patients={patients} showToast={showToast} />}
          {section === "reports" && <AdminReports wardReports={wardReports} archives={archives} />}
          {section === "announcements" && <AdminAnnouncements announcements={announcements} showToast={showToast} />}
          {section === "logs" && <AdminLogs logs={logs} />}
          {section === "settings" && <AdminSettings showToast={showToast} />}
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = FB.onAuth(async (fbUser) => {
      if (fbUser) { const p = await FB.getProfile(fbUser.uid); setUser(p ? { uid: fbUser.uid, email: fbUser.email, ...p } : null); }
      else setUser(null);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  if (checking) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1623" }}>
      <style>{css}</style>
      <div style={{ textAlign: "center", color: "#7fa8c9" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚕️</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Loading MedRecord…</div>
        <div style={{ marginTop: 12 }}><span className="ai-spinner" /></div>
      </div>
    </div>
  );

  if (isAdmin) return <AdminApp onLogout={() => setIsAdmin(false)} />;

  if (!user) return (
    <><style>{css}</style>
    <LoginPage onLogin={(u) => {
      if (u === "__ADMIN__") { setIsAdmin(true); return; }
      setUser(u);
    }} /></>
  );

  return <MainApp user={user} onLogout={async () => { await FB.logout(); setUser(null); }} />;
}
