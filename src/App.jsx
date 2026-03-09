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
};

const WARDS = ["Ward A – General Medicine","Ward B – Surgical","Ward C – Pediatrics","Ward D – Cardiology","Ward E – Orthopedics","Ward F – ICU","Ward G – Maternity","Ward H – Oncology"];
const ROLES = [{ value:"nurse", label:"Ward Nurse" },{ value:"supervisor", label:"Supervisor / Overall Nurse" },{ value:"wardmaster", label:"Ward Master" }];
const SHIFTS = ["Morning (07:00–15:00)","Afternoon (15:00–23:00)","Night (23:00–07:00)"];
const PAIN_SCALE = [0,1,2,3,4,5,6,7,8,9,10];
const today = () => new Date().toISOString().split("T")[0];
const nowTime = () => new Date().toTimeString().slice(0,5);
const uid = () => Math.random().toString(36).slice(2,10);

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

function calcNEWS2(v) {
  if (!v) return null;
  let score = 0; const breakdown = [];
  const rr = +v.rr;
  if (!isNaN(rr) && rr > 0) { const pts = rr<=8?3:rr<=11?1:rr<=20?0:rr<=24?2:3; score+=pts; breakdown.push({label:"Resp Rate",val:`${rr}/min`,pts}); }
  const spo2 = +v.spo2;
  if (!isNaN(spo2) && spo2 > 0) { const pts = spo2<=91?3:spo2<=93?2:spo2<=95?1:0; score+=pts; breakdown.push({label:"SpO₂",val:`${spo2}%`,pts}); }
  const [sys] = (v.bp||"").split("/"); const sbp = +sys;
  if (!isNaN(sbp) && sbp > 0) { const pts = sbp<=90?3:sbp<=100?2:sbp<=110?1:sbp<=219?0:3; score+=pts; breakdown.push({label:"Sys BP",val:`${sbp}mmHg`,pts}); }
  const hr = +v.hr;
  if (!isNaN(hr) && hr > 0) { const pts = hr<=40?3:hr<=50?1:hr<=90?0:hr<=110?1:hr<=130?2:3; score+=pts; breakdown.push({label:"Heart Rate",val:`${hr}bpm`,pts}); }
  const temp = +v.temp;
  if (!isNaN(temp) && temp > 0) { const pts = temp<=35?3:temp<=36?1:temp<=38?0:temp<=39?1:2; score+=pts; breakdown.push({label:"Temp",val:`${temp}°C`,pts}); }
  if (breakdown.length === 0) return null;
  const risk = score<=4?"low":score<=6?"medium":"high";
  const label = score<=4?"Low Risk":score<=6?"Medium Risk":"High Risk — Urgent Review";
  const action = score<=4?"Continue routine monitoring":score<=6?"Increase monitoring frequency, notify senior nurse":"Immediate escalation to physician required";
  return { score, risk, label, action, breakdown };
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
body{font-family:var(--font);background:var(--bg);color:var(--t1);min-height:100vh}
input,select,textarea,button{font-family:var(--font)}
input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
.app{display:flex;min-height:100vh}
.sidebar{width:220px;min-height:100vh;background:var(--bg2);border-right:1px solid var(--border2);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:100;overflow-y:auto}
.main{flex:1;margin-left:220px;display:flex;flex-direction:column;min-height:100vh}
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
.news2-bar{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--r);margin-bottom:12px;border:1px solid}
.news2-low{background:rgba(52,211,153,.08);border-color:rgba(52,211,153,.3);color:var(--success)}
.news2-med{background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.3);color:var(--warning)}
.news2-high{background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.3);color:var(--danger)}
.news2-score{font-family:var(--mono);font-size:22px;font-weight:700;min-width:36px;text-align:center}
.news2-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin-top:8px}
.news2-item{background:var(--bg3);border-radius:var(--r-sm);padding:6px 9px;font-size:11px}
.news2-item-label{color:var(--t3);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
.news2-item-val{font-weight:700;font-size:13px;margin-top:1px}
.news2-item-pts{font-size:9px;color:var(--t3)}
.clinical-section{background:var(--card);border:1px solid var(--border2);border-radius:var(--r-lg);padding:14px 16px;margin-bottom:12px}
.clinical-section-title{font-weight:700;font-size:13px;margin-bottom:10px;display:flex;align-items:center;gap:7px}
.checklist-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.checklist-item{display:flex;align-items:flex-start;gap:8px;padding:7px 9px;background:var(--bg3);border-radius:var(--r-sm);cursor:pointer;border:1px solid transparent;transition:all .15s}
.checklist-item.checked{background:rgba(52,211,153,.08);border-color:rgba(52,211,153,.25)}
.checklist-item input[type=checkbox]{margin-top:1px;accent-color:var(--accent);flex-shrink:0}
.checklist-label{font-size:12px;font-weight:500}
.checklist-sub{font-size:10px;color:var(--t3);margin-top:1px}
.risk-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-left:8px}
.risk-low{background:rgba(52,211,153,.12);color:var(--success)}
.risk-med{background:rgba(251,191,36,.12);color:var(--warning)}
.risk-high{background:rgba(248,113,113,.12);color:var(--danger)}
.incident-card{background:var(--card);border:1px solid var(--border2);border-radius:var(--r);padding:12px 14px;margin-bottom:8px;border-left:3px solid var(--t3)}
.incident-card.critical{border-left-color:var(--danger)}
.incident-card.high{border-left-color:var(--warning)}
.incident-card.medium{border-left-color:#fb923c}
.incident-card.low{border-left-color:var(--success)}
.incident-type{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--t3)}
.discharge-section{border-top:1px solid var(--border2);padding-top:12px;margin-top:12px}
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
@media(max-width:768px){.sidebar{transform:translateX(-100%);transition:transform .25s}.main{margin-left:0}.pt-panel{display:none}.form-row{grid-template-columns:1fr}.vitals-row{grid-template-columns:repeat(3,1fr)}}
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

// 1-second debounced autosave hook
function useAutosave(data, saveFn, enabled = true) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef(null);
  const fnRef = useRef(saveFn);
  fnRef.current = saveFn;
  useEffect(() => {
    if (!enabled) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaving(true); setSaved(false);
      try { await fnRef.current(data); setSaved(true); setTimeout(() => setSaved(false), 2000); }
      catch (_) {}
      setSaving(false);
    }, 1000);
    return () => clearTimeout(timer.current);
  }, [JSON.stringify(data), enabled]);
  return { saving, saved };
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
function GlobalSearch({ patients, onSelect, user }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const isNurse = user?.role === "nurse";
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const results = q.length > 1
    ? patients.filter(p => {
        if (isNurse) {
          // Nurses can only search cross-ward by exact EMR number
          const emrMatch = p.emr?.toLowerCase() === q.toLowerCase().trim();
          const sameWard = p.ward === user.ward;
          return sameWard || emrMatch;
        }
        return (
          p.name?.toLowerCase().includes(q.toLowerCase()) ||
          p.emr?.toLowerCase().includes(q.toLowerCase()) ||
          p.diagnosis?.toLowerCase().includes(q.toLowerCase()) ||
          p.ward?.toLowerCase().includes(q.toLowerCase())
        );
      }).slice(0, 8) : [];
  return (
    <div ref={ref} className="tb-search">
      <span style={{ color: "var(--t3)", fontSize: 14, flexShrink: 0 }}>🔍</span>
      <input
        placeholder={isNurse ? "Search by name or exact EMR number…" : "Search by name, EMR, diagnosis, ward…"}
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {q && <button onClick={() => { setQ(""); setOpen(false); }} style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 14 }}>✕</button>}
      {open && q.length > 1 && (
        <div className="search-dropdown">
          {results.length === 0
            ? <div style={{ padding: "12px 14px", color: "var(--t3)", fontSize: 13 }}>
                {isNurse ? `No patient found. For patients in other wards, enter exact EMR number.` : `No results for "${q}"`}
              </div>
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
  const blank = { date: today(), shift: SHIFTS[0], report: "", nurseOnDuty: "" };
  const [d, setD] = useState(blank);
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  useEffect(() => { if (open) setD(x => ({ ...x, nurseOnDuty: nurse || "" })); }, [open, nurse]);
  const { saving, saved } = useAutosave(d, (val) => val.report.trim() ? onSave({ ...val, _draft: true }) : Promise.resolve(), open && d.report.trim().length > 0);
  const save = () => {
    if (!d.report.trim()) { alert("Report content is required."); return; }
    onSave(d); setD(blank); onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="📝 Nursing Report">
      <div className="modal-body">
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, fontSize: 11 }}>
          <span style={{ color: "var(--t3)" }}>Auto-saves as you type</span>
          {saving && <span style={{ color: "var(--accent)" }}>💾 Saving…</span>}
          {saved && !saving && <span style={{ color: "var(--success)" }}>✅ Saved</span>}
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e => set("date", e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Shift</label><select className="form-select" value={d.shift} onChange={e => set("shift", e.target.value)}>{SHIFTS.map(s => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div className="form-group"><label className="form-label">Nurse on Duty</label><input className="form-input" value={d.nurseOnDuty} onChange={e => set("nurseOnDuty", e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Report *</label><textarea className="form-textarea" style={{ minHeight: 120 }} value={d.report} onChange={e => set("report", e.target.value)} placeholder="Enter nursing report for this shift — auto-saves as you type…" /></div>
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

// ─── INCIDENT REPORT MODAL ────────────────────────────────────────────────────
function IncidentModal({ open, onClose, nurse, patient, onSave }) {
  const empty = { date: today(), time: nowTime(), type: "", severity: "medium", location: "", description: "", immediateAction: "", reportedTo: "", witness: "", patientHarmed: "no" };
  const [d, setD] = useState(empty);
  const set = (k,v) => setD(x=>({...x,[k]:v}));
  useEffect(() => { if (open) setD({...empty, patientName: patient?.name||""}); }, [open]);
  const TYPES = ["Patient Fall","Medication Error","Near Miss","Equipment Failure","Needle Stick Injury","Patient Aggression","Wrong Patient/Procedure","Pressure Injury","Adverse Drug Reaction","Visitor Incident","Other"];
  const save = () => {
    if (!d.type || !d.description.trim()) { alert("Incident type and description are required."); return; }
    onSave({...d, id:"IR-"+uid(), nurse, createdAt:new Date().toISOString()});
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="⚠️ Incident Report" size="modal-lg">
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Time</label><input className="form-input" type="time" value={d.time} onChange={e=>set("time",e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Incident Type *</label>
            <select className="form-select" value={d.type} onChange={e=>set("type",e.target.value)}>
              <option value="">— Select type —</option>
              {TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Severity</label>
            <select className="form-select" value={d.severity} onChange={e=>set("severity",e.target.value)}>
              {["low","medium","high","critical"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Location</label><input className="form-input" value={d.location} onChange={e=>set("location",e.target.value)} placeholder="e.g. Ward A, Bed 3" /></div>
          <div className="form-group"><label className="form-label">Patient Harmed?</label>
            <select className="form-select" value={d.patientHarmed} onChange={e=>set("patientHarmed",e.target.value)}>
              <option value="no">No</option><option value="minor">Minor</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
            </select>
          </div>
        </div>
        <div className="form-group"><label className="form-label">Description of Incident *</label><textarea className="form-textarea" style={{minHeight:90}} value={d.description} onChange={e=>set("description",e.target.value)} placeholder="Describe exactly what happened, in sequence…" /></div>
        <div className="form-group"><label className="form-label">Immediate Action Taken</label><textarea className="form-textarea" style={{minHeight:60}} value={d.immediateAction} onChange={e=>set("immediateAction",e.target.value)} placeholder="What was done immediately after the incident…" /></div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Reported To</label><input className="form-input" value={d.reportedTo} onChange={e=>set("reportedTo",e.target.value)} placeholder="Name / role" /></div>
          <div className="form-group"><label className="form-label">Witness (if any)</label><input className="form-input" value={d.witness} onChange={e=>set("witness",e.target.value)} placeholder="Witness name" /></div>
        </div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>📋 Submit Report</button></div>
    </Modal>
  );
}

// ─── ADMISSION CHECKLIST MODAL ────────────────────────────────────────────────
function AdmissionChecklistModal({ open, onClose, nurse, onSave }) {
  const [d, setD] = useState({ date: today(), time: nowTime(), admissionMode: "", consciousLevel: "Alert", painScore: 0, fallRisk: "", skinIntegrity: "", nutritionRisk: "", mobility: "", mentalStatus: "", orientation: { person: false, place: false, time: false }, allergiesVerified: false, idBandFitted: false, nextOfKinNotified: false, valuablesRecorded: false, medicationsReconciled: false, notes: "" });
  const set = (k,v) => setD(x=>({...x,[k]:v}));
  const FALL_RISKS = ["Low (0–2)","Moderate (3–4)","High (5+)"];
  const SKIN_OPTIONS = ["Intact","Bruising","Pressure ulcer","Wound","Rash","Other"];
  const MOBILITY = ["Independent","Requires assistance","Bed-bound","Wheelchair"];

  // Morse Fall Scale simplified score
  const fallScore = [
    d.fallHistory?25:0, d.secondaryDiagnosis?15:0,
    d.walkingAid==="furniture"?30:d.walkingAid==="crutches"?15:0,
    d.ivAccess?20:0, d.gait==="impaired"?10:d.gait==="disabled"?20:0,
    d.mentalStatus==="forgets"?15:0
  ].reduce((a,b)=>a+b,0);
  const fallRiskLevel = fallScore<25?"Low":fallScore<45?"Moderate":"High";

  const save = () => {
    onSave({...d, fallScore, fallRiskLevel, id:"AC-"+uid(), nurse, createdAt:new Date().toISOString()});
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="📋 Admission Checklist" size="modal-lg">
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Time</label><input className="form-input" type="time" value={d.time} onChange={e=>set("time",e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Admission Mode</label>
            <select className="form-select" value={d.admissionMode} onChange={e=>set("admissionMode",e.target.value)}>
              <option value="">—</option>{["Emergency","Elective","Transfer","Referral"].map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Conscious Level</label>
            <select className="form-select" value={d.consciousLevel} onChange={e=>set("consciousLevel",e.target.value)}>
              {["Alert","Voice response","Pain response","Unresponsive"].map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div className="clinical-section">
          <div className="clinical-section-title">🦺 Fall Risk Assessment (Morse Scale)
            <span className={`risk-badge ${fallRiskLevel==="Low"?"risk-low":fallRiskLevel==="Moderate"?"risk-med":"risk-high"}`}>Score: {fallScore} — {fallRiskLevel}</span>
          </div>
          <div className="checklist-grid">
            {[["fallHistory","History of falls in last 3 months"],["secondaryDiagnosis","Secondary diagnosis present"],["ivAccess","IV line / heparin lock"]].map(([k,l])=>(
              <label key={k} className={`checklist-item ${d[k]?"checked":""}`}><input type="checkbox" checked={!!d[k]} onChange={e=>set(k,e.target.checked)} /><div><div className="checklist-label">{l}</div></div></label>
            ))}
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">Walking Aid</label>
              <select className="form-select" value={d.walkingAid||""} onChange={e=>set("walkingAid",e.target.value)}>
                <option value="">None/bedrest/wheelchair</option><option value="crutches">Crutches/cane/walker</option><option value="furniture">Holds onto furniture</option>
              </select>
            </div>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">Gait</label>
              <select className="form-select" value={d.gait||""} onChange={e=>set("gait",e.target.value)}>
                <option value="">Normal/bedrest</option><option value="impaired">Weak/impaired</option><option value="disabled">Impaired/disabled</option>
              </select>
            </div>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">Mental Status</label>
              <select className="form-select" value={d.mentalStatus||""} onChange={e=>set("mentalStatus",e.target.value)}>
                <option value="">Oriented to own ability</option><option value="forgets">Forgets limitations</option>
              </select>
            </div>
          </div>
        </div>

        <div className="clinical-section">
          <div className="clinical-section-title">🩺 Clinical Assessment</div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Pain Score (0–10)</label>
              <select className="form-select" value={d.painScore} onChange={e=>set("painScore",+e.target.value)}>
                {PAIN_SCALE.map(n=><option key={n} value={n}>{n} {n===0?"(None)":n<=3?"(Mild)":n<=6?"(Moderate)":"(Severe)"}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Skin Integrity</label>
              <select className="form-select" value={d.skinIntegrity} onChange={e=>set("skinIntegrity",e.target.value)}>
                <option value="">—</option>{SKIN_OPTIONS.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Mobility</label>
              <select className="form-select" value={d.mobility} onChange={e=>set("mobility",e.target.value)}>
                <option value="">—</option>{MOBILITY.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Orientation</label>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              {["person","place","time"].map(k=>(
                <label key={k} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer"}}>
                  <input type="checkbox" checked={!!d.orientation?.[k]} onChange={e=>setD(x=>({...x,orientation:{...x.orientation,[k]:e.target.checked}}))} style={{accentColor:"var(--accent)"}} />
                  Oriented to {k}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="clinical-section">
          <div className="clinical-section-title">✅ Admission Checklist</div>
          <div className="checklist-grid">
            {[["allergiesVerified","Allergies verified & documented"],["idBandFitted","ID band fitted & verified"],["nextOfKinNotified","Next of kin notified"],["valuablesRecorded","Valuables inventoried & stored"],["medicationsReconciled","Medications reconciled"]].map(([k,l])=>(
              <label key={k} className={`checklist-item ${d[k]?"checked":""}`}><input type="checkbox" checked={!!d[k]} onChange={e=>set(k,e.target.checked)} /><div><div className="checklist-label">{l}</div></div></label>
            ))}
          </div>
        </div>
        <div className="form-group"><label className="form-label">Additional Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)} placeholder="Any other observations on admission…" /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>💾 Save Checklist</button></div>
    </Modal>
  );
}

// ─── DISCHARGE SUMMARY MODAL ──────────────────────────────────────────────────
function DischargeSummaryModal({ open, onClose, nurse, patient, onSave }) {
  const [d, setD] = useState({ date: today(), time: nowTime(), dischargeType: "Home", conditionAtDischarge: "", functionalStatus: "", painAtDischarge: 0, woundCondition: "", medicationsToTakeHome: "", medicationsCeased: "", followUpDate: "", followUpWith: "", followUpLocation: "", dietAdvice: "", activityAdvice: "", woundCareAdvice: "", returnToEDAdvice: "", patientEducationGiven: [], patientUnderstands: false, caregiverEducation: false, dischargeLetterGiven: false, scriptGiven: false, referralsMade: "", notes: "" });
  const set = (k,v) => setD(x=>({...x,[k]:v}));
  const EDU_ITEMS = ["Medication instructions","Activity restrictions","Diet advice","Wound care","Warning signs to watch for","Follow-up appointment","When to return to ED"];
  const toggleEdu = (item) => setD(x=>({ ...x, patientEducationGiven: x.patientEducationGiven.includes(item) ? x.patientEducationGiven.filter(i=>i!==item) : [...x.patientEducationGiven, item] }));
  const save = () => {
    onSave({...d, id:"DS-"+uid(), nurse, patientId:patient?.id, patientName:patient?.name, diagnosis:patient?.diagnosis, createdAt:new Date().toISOString()});
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="🚪 Discharge Summary" size="modal-lg">
      <div className="modal-body">
        <div className="form-row">
          <div className="form-group"><label className="form-label">Discharge Date</label><input className="form-input" type="date" value={d.date} onChange={e=>set("date",e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Time</label><input className="form-input" type="time" value={d.time} onChange={e=>set("time",e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Discharged To</label>
            <select className="form-select" value={d.dischargeType} onChange={e=>set("dischargeType",e.target.value)}>
              {["Home","Home with support","Nursing home","Rehabilitation facility","Another hospital","Against medical advice"].map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Pain at Discharge (0–10)</label>
            <select className="form-select" value={d.painAtDischarge} onChange={e=>set("painAtDischarge",+e.target.value)}>
              {PAIN_SCALE.map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group"><label className="form-label">Condition at Discharge</label><textarea className="form-textarea" style={{minHeight:70}} value={d.conditionAtDischarge} onChange={e=>set("conditionAtDischarge",e.target.value)} placeholder="Describe patient's overall clinical condition on discharge…" /></div>

        <div className="clinical-section">
          <div className="clinical-section-title">💊 Medications</div>
          <div className="form-group"><label className="form-label">Medications to Take Home</label><textarea className="form-textarea" style={{minHeight:60}} value={d.medicationsToTakeHome} onChange={e=>set("medicationsToTakeHome",e.target.value)} placeholder="List all discharge medications…" /></div>
          <div className="form-group"><label className="form-label">Medications Ceased/Changed</label><textarea className="form-textarea" style={{minHeight:50}} value={d.medicationsCeased} onChange={e=>set("medicationsCeased",e.target.value)} placeholder="List any meds stopped or changed and reason…" /></div>
        </div>

        <div className="clinical-section">
          <div className="clinical-section-title">📅 Follow-Up</div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">Follow-Up Date</label><input className="form-input" type="date" value={d.followUpDate} onChange={e=>set("followUpDate",e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Follow-Up With</label><input className="form-input" value={d.followUpWith} onChange={e=>set("followUpWith",e.target.value)} placeholder="Dr / Clinic name" /></div>
          </div>
          <div className="form-group"><label className="form-label">Follow-Up Location</label><input className="form-input" value={d.followUpLocation} onChange={e=>set("followUpLocation",e.target.value)} placeholder="Hospital / clinic address" /></div>
          <div className="form-group"><label className="form-label">Return to ED if…</label><textarea className="form-textarea" style={{minHeight:50}} value={d.returnToEDAdvice} onChange={e=>set("returnToEDAdvice",e.target.value)} placeholder="e.g. Fever >38.5, increased pain, shortness of breath…" /></div>
        </div>

        <div className="clinical-section">
          <div className="clinical-section-title">📚 Patient Education Given</div>
          <div className="checklist-grid">
            {EDU_ITEMS.map(item=>(
              <label key={item} className={`checklist-item ${d.patientEducationGiven.includes(item)?"checked":""}`}>
                <input type="checkbox" checked={d.patientEducationGiven.includes(item)} onChange={()=>toggleEdu(item)} />
                <div className="checklist-label">{item}</div>
              </label>
            ))}
          </div>
          <div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:10}}>
            {[["patientUnderstands","Patient verbally confirms understanding"],["caregiverEducation","Caregiver/family also educated"],["dischargeLetterGiven","Discharge letter given"],["scriptGiven","Prescription given"]].map(([k,l])=>(
              <label key={k} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer"}}>
                <input type="checkbox" checked={!!d[k]} onChange={e=>set(k,e.target.checked)} style={{accentColor:"var(--accent)"}} />{l}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group"><label className="form-label">Additional Notes</label><textarea className="form-textarea" value={d.notes} onChange={e=>set("notes",e.target.value)} placeholder="Any other relevant discharge information…" /></div>
      </div>
      <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>💾 Save Discharge Summary</button></div>
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
    setBusy(true);
    try {
      const cred = await FB.login(loginData.email, loginData.password);
      const profile = await FB.getProfile(cred.user.uid);
      onLogin({ uid: cred.user.uid, email: cred.user.email, ...profile });
    } catch (e) { showMsg(e.code === "auth/invalid-credential" ? "Incorrect email or password." : e.message); }
    setBusy(false);
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
  // Show all orders newest-first, continuous scroll — all entries always visible
  const rows = [...(patient.doctorOrders || [])].sort((a,b) => {
    const da = new Date((a.date||"")+"T"+(a.time||"00:00")), db2 = new Date((b.date||"")+"T"+(b.time||"00:00"));
    return db2 - da;
  });
  const toggleAck = async (orderId) => {
    const updated = { ...patient, doctorOrders: (patient.doctorOrders||[]).map(o => o.id === orderId ? { ...o, acknowledged: true, acknowledgedBy: nurse, acknowledgedAt: new Date().toISOString() } : o) };
    await FB.savePatient(updated); onUpdate(updated);
  };
  return (
    <div className="info-card">
      <h4>Doctor's Orders — Full History ({rows.length})</h4>
      <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 10 }}>All orders saved continuously. Scroll down to see older entries.</div>
      {rows.length === 0 ? <div className="empty-state" style={{ padding: 20 }}><div className="empty-icon">📋</div><div className="empty-text">No orders yet</div></div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r, idx) => (
            <div key={r.id || idx} style={{ background: "var(--bg3)", border: `1px solid ${r.priority === "STAT" ? "var(--danger)" : r.priority === "Urgent" ? "var(--warning)" : "var(--border2)"}`, borderRadius: "var(--r-sm)", padding: 12, position: "relative" }}>
              {idx === 0 && <span style={{ position:"absolute", top:8, right:10, fontSize:9, fontWeight:700, background:"var(--accent)", color:"#000", borderRadius:10, padding:"1px 6px" }}>LATEST</span>}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 5 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>{r.date} {r.time}</span>
                  <span className={`badge ${r.priority === "STAT" ? "badge-critical" : r.priority === "Urgent" ? "badge-warning" : "badge-active"}`}>{r.priority}</span>
                </div>
                <span style={{ fontSize: 11, color: "var(--t2)" }}>Dr. {r.doctor || "—"} {r.nurse ? `· Rec: ${r.nurse}` : ""}</span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.65, marginBottom: 7, whiteSpace:"pre-wrap" }}>{r.order}</p>
              {r.notes && <div style={{ fontSize:11, color:"var(--t3)", marginBottom:7, fontStyle:"italic" }}>{r.notes}</div>}
              {r.acknowledged
                ? <div style={{ fontSize: 11, color: "var(--success)" }}>✅ Acknowledged by {r.acknowledgedBy} · {r.acknowledgedAt ? new Date(r.acknowledgedAt).toLocaleString() : "—"}</div>
                : <button className="btn btn-secondary btn-sm" onClick={() => toggleAck(r.id)}>✋ Acknowledge Order</button>}
            </div>
          ))}
          <div style={{ textAlign:"center", padding:"8px 0", fontSize:11, color:"var(--t3)" }}>— End of orders history —</div>
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

function NEWS2Tab({ patient }) {
  const vitals = patient.vitals || [];
  if (!vitals.length) return <div className="empty-state"><div className="empty-icon">💓</div><div className="empty-text">No Vitals Recorded</div><div className="empty-sub">Record vitals to see NEWS2 score.</div></div>;
  return (
    <div style={{padding:"12px 0"}}>
      <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"var(--t2)"}}>📈 NEWS2 Early Warning Score History</div>
      {vitals.slice(0,10).map((v,i) => {
        const n = calcNEWS2(v);
        if (!n) return null;
        const cls = n.risk==="low"?"news2-low":n.risk==="medium"?"news2-med":"news2-high";
        return (
          <div key={i} className={`news2-bar ${cls}`} style={{flexDirection:"column",alignItems:"flex-start"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,width:"100%"}}>
              <div className="news2-score">{n.score}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13}}>{n.label}</div>
                <div style={{fontSize:11,opacity:.8,marginTop:1}}>{n.action}</div>
                <div style={{fontSize:10,opacity:.7,marginTop:2}}>{v.recordedAt ? new Date(v.recordedAt).toLocaleString() : "—"}{v.nurse ? ` · ${v.nurse}` : ""}</div>
              </div>
            </div>
            <div className="news2-grid" style={{width:"100%"}}>
              {n.breakdown.map(b=>(
                <div key={b.label} className="news2-item">
                  <div className="news2-item-label">{b.label}</div>
                  <div className="news2-item-val">{b.val}</div>
                  <div className="news2-item-pts">{b.pts} pt{b.pts!==1?"s":""}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdmissionTab({ patient }) {
  const records = patient.admissionChecklists || [];
  if (!records.length) return <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">No Admission Checklist</div><div className="empty-sub">Complete on patient admission.</div></div>;
  return (
    <div style={{padding:"12px 0"}}>
      {records.map(r => (
        <div key={r.id} className="clinical-section">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:13}}>{r.date} {r.time}</div>
            <div style={{display:"flex",gap:8}}>
              <span className={`risk-badge ${r.fallRiskLevel==="Low"?"risk-low":r.fallRiskLevel==="Moderate"?"risk-med":"risk-high"}`}>Fall: {r.fallRiskLevel} ({r.fallScore})</span>
              <span style={{fontSize:11,color:"var(--t2)"}}>By {r.nurse}</span>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:7,fontSize:12}}>
            {[["Admission Mode",r.admissionMode],["Conscious Level",r.consciousLevel],["Pain Score",r.painScore+"/10"],["Skin",r.skinIntegrity],["Mobility",r.mobility]].map(([l,v])=>v?<div key={l} style={{background:"var(--bg3)",borderRadius:"var(--r-sm)",padding:"5px 8px"}}><div style={{fontSize:9,color:"var(--t3)",fontWeight:700,textTransform:"uppercase"}}>{l}</div><div style={{fontWeight:600}}>{v}</div></div>:null)}
          </div>
          {r.orientation && <div style={{marginTop:8,fontSize:12}}>Orientation: {["person","place","time"].filter(k=>r.orientation[k]).map(k=>`✅ ${k}`).join("  ") || "Not documented"}</div>}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:8,fontSize:11}}>
            {[["allergiesVerified","Allergies verified"],["idBandFitted","ID band fitted"],["nextOfKinNotified","NOK notified"],["valuablesRecorded","Valuables recorded"],["medicationsReconciled","Meds reconciled"]].map(([k,l])=><span key={k} style={{color:r[k]?"var(--success)":"var(--t3)"}}>{r[k]?"✅":"❌"} {l}</span>)}
          </div>
          {r.notes && <div style={{marginTop:8,fontSize:12,color:"var(--t2)"}}>{r.notes}</div>}
        </div>
      ))}
    </div>
  );
}

function DischargeSummaryTab({ patient }) {
  const records = patient.dischargeSummaries || [];
  if (!records.length) return <div className="empty-state"><div className="empty-icon">🚪</div><div className="empty-text">No Discharge Summary</div><div className="empty-sub">Complete when discharging the patient.</div></div>;
  return (
    <div style={{padding:"12px 0"}}>
      {records.map(r => (
        <div key={r.id} className="clinical-section">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:13}}>Discharge: {r.date} {r.time}</div>
            <span style={{fontSize:11,color:"var(--t2)"}}>By {r.nurse}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:7,fontSize:12,marginBottom:10}}>
            {[["Discharged To",r.dischargeType],["Pain at D/C",r.painAtDischarge+"/10"],["Follow-Up",r.followUpDate],["Follow-Up With",r.followUpWith]].map(([l,v])=>v!=null&&v!==""?<div key={l} style={{background:"var(--bg3)",borderRadius:"var(--r-sm)",padding:"5px 8px"}}><div style={{fontSize:9,color:"var(--t3)",fontWeight:700,textTransform:"uppercase"}}>{l}</div><div style={{fontWeight:600}}>{v}</div></div>:null)}
          </div>
          {r.conditionAtDischarge && <div style={{marginBottom:8,fontSize:12}}><strong>Condition:</strong> {r.conditionAtDischarge}</div>}
          {r.medicationsToTakeHome && <div style={{marginBottom:8,fontSize:12}}><strong>Take-home meds:</strong> {r.medicationsToTakeHome}</div>}
          {r.returnToEDAdvice && <div style={{marginBottom:8,fontSize:12,color:"var(--danger)"}}><strong>⚠️ Return to ED if:</strong> {r.returnToEDAdvice}</div>}
          {r.patientEducationGiven?.length > 0 && <div style={{marginBottom:8,fontSize:12}}><strong>Education given:</strong> {r.patientEducationGiven.join(", ")}</div>}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:11}}>
            {[["patientUnderstands","Patient understands"],["caregiverEducation","Caregiver educated"],["dischargeLetterGiven","Letter given"],["scriptGiven","Script given"]].map(([k,l])=><span key={k} style={{color:r[k]?"var(--success)":"var(--t3)"}}>{r[k]?"✅":"❌"} {l}</span>)}
          </div>
          {r.notes && <div style={{marginTop:8,fontSize:12,color:"var(--t2)"}}>{r.notes}</div>}
        </div>
      ))}
    </div>
  );
}

function IncidentsTab({ patient }) {
  const records = patient.incidents || [];
  if (!records.length) return <div className="empty-state"><div className="empty-icon">⚠️</div><div className="empty-text">No Incidents Reported</div><div className="empty-sub">Incidents related to this patient will appear here.</div></div>;
  const sevColor = s => s==="critical"?"var(--danger)":s==="high"?"var(--warning)":s==="medium"?"#fb923c":"var(--success)";
  return (
    <div style={{padding:"12px 0"}}>
      {records.map(r => (
        <div key={r.id} className={`incident-card ${r.severity}`}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
            <div>
              <div className="incident-type">{r.type}</div>
              <div style={{fontWeight:700,fontSize:13,marginTop:2}}>{r.date} {r.time} · {r.location||"—"}</div>
            </div>
            <span style={{background:sevColor(r.severity)+"22",color:sevColor(r.severity),padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:700}}>{r.severity?.toUpperCase()}</span>
          </div>
          <div style={{fontSize:12,marginBottom:6,lineHeight:1.5}}>{r.description}</div>
          {r.immediateAction && <div style={{fontSize:11,color:"var(--t2)",marginBottom:4}}><strong>Action taken:</strong> {r.immediateAction}</div>}
          {r.reportedTo && <div style={{fontSize:11,color:"var(--t2)",marginBottom:4}}><strong>Reported to:</strong> {r.reportedTo}</div>}
          <div style={{fontSize:10,color:"var(--t3)",display:"flex",gap:10,flexWrap:"wrap",marginTop:4}}>
            <span>Patient harmed: {r.patientHarmed||"No"}</span>
            {r.witness && <span>Witness: {r.witness}</span>}
            <span>By: {r.nurse}</span>
          </div>
        </div>
      ))}
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
    // Append entry to Firestore array instantly (backend writes every time)
    await FB.appendToPatient(patient.id, field, entry);
    const updated = { ...patient, [field]: [entry, ...(patient[field] || [])] };
    refresh(updated);
  };
  const saveArr = async (field, arr) => {
    const updated = { ...patient, [field]: arr };
    await FB.savePatient(updated); refresh(updated);
  };

  const latestV = patient.vitals?.[0] || {};
  const tabs = [
    ["visit", "📋 Visit"], ["vitals", "💓 Vitals"], ["news2", "📈 NEWS2"],
    ["prescription", "📝 Rx"], ["medadmin", "💊 Med Admin"], ["orders", "📋 Orders"],
    ["glycemic", "🩸 Glycemic"], ["fluid", "💧 Fluid"], ["nursing", "📝 Nursing"],
    ["wound", "🩹 Wounds"], ["lab", "🧪 Labs"], ["transfusion", "🩸 Transfusion"],
    ["admission", "📋 Admission"], ["discharge", "🚪 Discharge"], ["incidents", "⚠️ Incidents"],
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
      {(() => { const n2=calcNEWS2(latestV); if(!n2) return null; const cls=n2.risk==="low"?"news2-low":n2.risk==="medium"?"news2-med":"news2-high"; return (
        <div className={`news2-bar ${cls}`} onClick={()=>setActiveTab("news2")} style={{cursor:"pointer",marginBottom:12}}>
          <div className="news2-score">{n2.score}</div>
          <div style={{flex:1}}><div style={{fontWeight:700,fontSize:12}}>NEWS2: {n2.label}</div><div style={{fontSize:11,opacity:.85}}>{n2.action}</div></div>
          <span style={{fontSize:11,opacity:.7}}>View history →</span>
        </div>
      ); })()}

      <div className="quick-actions">
        {[
          ["💓", "Add Vitals", () => openM("vitals")], ["💊", "Med Admin", () => openM("medAdmin")],
          ["📝", "Prescription", () => openM("prescription")], ["📋", "Doctor Order", () => openM("doctorOrder")],
          ["🩸", "Glucose", () => openM("glucose")], ["💧", "Fluid I/O", () => openM("fluid")],
          ["📝", "Nursing Report", () => openM("nursing")], ["🩹", "Wound Care", () => openM("wound")],
          ["🧪", "Lab Result", () => openM("lab")], ["🩸", "Transfusion", () => openM("transfusion")],
          ["⚠️", "Incident", () => openM("incident")], ["📋", "Admission CL", () => openM("admissionCL")],
          ["🚪", "Discharge", () => openM("dischargeSummary")],
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
      {activeTab === "news2" && <NEWS2Tab patient={patient} />}
      {activeTab === "admission" && <AdmissionTab patient={patient} />}
      {activeTab === "discharge" && <DischargeSummaryTab patient={patient} />}
      {activeTab === "incidents" && <IncidentsTab patient={patient} />}

      <VitalsModal open={!!modals.vitals} onClose={() => closeM("vitals")} nurse={user?.name} onSave={async v => { const entry = { ...v, id: uid(), recordedAt: new Date().toISOString() }; await save("vitals", entry); toast("Vital signs saved."); const a = checkVitalAlerts(v); if (a.some(x => x.level === "critical")) toast("⚠️ Critical vitals detected!", "warning"); }} />
      <GlucoseModal open={!!modals.glucose} onClose={() => closeM("glucose")} nurse={user?.name} onSave={async g => { await save("glucoseReadings", { ...g, id: uid() }); toast("Glucose saved."); }} />
      <FluidModal open={!!modals.fluid} onClose={() => closeM("fluid")} nurse={user?.name} onSave={async f => { await save("fluidEntries", { ...f, id: uid() }); toast("Fluid entry saved."); }} />
      <MedAdminModal open={!!modals.medAdmin} onClose={() => closeM("medAdmin")} nurse={user?.name} onSave={async e => { await save("medAdminLogs", { ...e, id: uid() }); toast("Administration recorded."); }} />
      <PrescriptionModal open={!!modals.prescription} onClose={() => closeM("prescription")} patient={patient} onSave={async list => { await saveArr("prescriptions", list); toast("Prescriptions saved."); }} />
      <NursingReportModal open={!!modals.nursing} onClose={() => closeM("nursing")} nurse={user?.name} onSave={async rp => {
        const entryId = rp.id || uid();
        const existing = patient.nursingReports || [];
        const alreadyExists = existing.some(e => e.id === entryId);
        const entry = { ...rp, id: entryId };
        const updated = { ...patient, nursingReports: alreadyExists ? existing.map(e => e.id === entryId ? entry : e) : [entry, ...existing] };
        await FB.savePatient(updated); refresh(updated);
        if (!rp._draft) toast("Nursing report saved.");
      }} />
      <WoundCareModal open={!!modals.wound} onClose={() => closeM("wound")} nurse={user?.name} onSave={async w => { await save("woundRecords", { ...w, id: uid() }); toast("Wound record saved."); }} />
      <LabResultModal open={!!modals.lab} onClose={() => closeM("lab")} nurse={user?.name} onSave={async l => { await save("labResults", { ...l, id: uid() }); toast("Lab result saved."); }} />
      <DoctorOrderModal open={!!modals.doctorOrder} onClose={() => closeM("doctorOrder")} nurse={user?.name} onSave={async o => { await save("doctorOrders", { ...o, id: uid() }); toast("Order saved."); }} />
      <TransfusionModal open={!!modals.transfusion} onClose={() => closeM("transfusion")} nurse={user?.name} onSave={async t => { await save("transfusions", { ...t, id: uid() }); toast("Transfusion saved."); }} />
      <IncidentModal open={!!modals.incident} onClose={() => closeM("incident")} nurse={user?.name} patient={patient} onSave={async inc => { await save("incidents", inc); toast("Incident report submitted."); }} />
      <AdmissionChecklistModal open={!!modals.admissionCL} onClose={() => closeM("admissionCL")} nurse={user?.name} onSave={async ac => { await save("admissionChecklists", ac); toast("Admission checklist saved."); }} />
      <DischargeSummaryModal open={!!modals.dischargeSummary} onClose={() => closeM("dischargeSummary")} nurse={user?.name} patient={patient} onSave={async ds => { await save("dischargeSummaries", ds); toast("Discharge summary saved."); }} />
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

  // Role helpers — isOverallNurse must come first
  const isOverallNurse = !!(overallNurse?.uid && overallNurse.uid === user.uid);
  const isNurse = user.role === "nurse";
  const canSeeAllWards = user.role === "supervisor" || user.role === "wardmaster" || isOverallNurse;
  const roleLabel = user.role === "wardmaster" ? "Ward Master" : user.role === "supervisor" ? "Supervisor / CNS" : "Ward Nurse";

  // Nurses see only their ward patients in the list; others see all
  const wardPatients = isNurse && !canSeeAllWards
    ? patients.filter(p => p.ward === user.ward)
    : patients;

  const filtered = wardPatients.filter(p => {
    if (filter === "active") return (p.status || "active") === "active";
    if (filter === "discharged") return p.status === "discharged";
    return true;
  });

  // selected: always look in ALL patients (so EMR cross-ward search works for nurses)
  const selected = patients.find(p => p.id === selectedId) || null;

  const handleAddPatient = async (data) => {
    const patient = {
      id: "PT-" + uid(), status: "active", createdAt: new Date().toISOString(),
      vitals: [], medAdminLogs: [], glucoseReadings: [], fluidEntries: [],
      prescriptions: [], nursingReports: [], statusHistory: [], transfusions: [],
      woundRecords: [], labResults: [], doctorOrders: [], incidents: [],
      admissionChecklists: [], dischargeSummaries: [], ...data,
    };
    try { await FB.savePatient(patient); setSelectedId(patient.id); showToast("Patient added."); }
    catch (e) { showToast("Error: " + e.message, "error"); }
  };

  const handleUpdatePatient = (updated) => {
    setPatients(ps => ps.map(p => p.id === updated.id ? updated : p));
  };

  const handleSelectPatient = (id) => {
    setSelectedId(id);
    setSection("patients");
  };

  return (
    <div className={`app ${darkMode ? "" : "theme-light"}`}>
      <style>{css}</style>
      <Toast msg={toastState.msg} type={toastState.type} />
      <NotifPanel open={notifOpen} notifs={notifs} unread={unread} onMarkRead={markRead} onClose={() => setNotifOpen(false)} onSelectPatient={handleSelectPatient} />

      {/* Sidebar */}
      <nav className="sidebar">
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
          <button className={`nav-btn ${section === "patients" ? "active" : ""}`} onClick={() => setSection("patients")}><span className="ni">🏥</span>Patients</button>
          {(user.role === "supervisor" || user.role === "wardmaster" || isOverallNurse) && <button className={`nav-btn ${section === "overview" ? "active" : ""}`} onClick={() => setSection("overview")}><span className="ni">🗺️</span>Ward Overview</button>}
          {(user.role === "supervisor" || user.role === "wardmaster" || isOverallNurse) && <button className={`nav-btn ${section === "reports" ? "active" : ""}`} onClick={() => setSection("reports")}><span className="ni">📊</span>Reports</button>}
          {user.role === "nurse" && <button className={`nav-btn ${section === "wardreport" ? "active" : ""}`} onClick={() => setSection("wardreport")}><span className="ni">📝</span>Ward Report</button>}
          {isOverallNurse && (
            <button className={`nav-btn ${section === "allwardsreport" ? "active" : ""}`} onClick={() => setSection("allwardsreport")} style={{ color: "var(--warning)" }}>
              <span className="ni">📋</span>24hr Nurses Report
              <span style={{ marginLeft: "auto", background: "var(--warning)", color: "#000", fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "1px 5px" }}>ALL</span>
            </button>
          )}
          {(user.role === "supervisor" || user.role === "wardmaster") && <button className={`nav-btn ${section === "collation" ? "active" : ""}`} onClick={() => setSection("collation")}><span className="ni">👑</span>24hr Collation</button>}
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
      <div className="main">
        <div className="topbar">
          <div style={{ flexShrink: 0 }}>
            <div className="tb-title">{section === "overview" ? "Ward Overview" : section === "reports" ? "Reports" : section === "wardreport" ? "Ward Report" : section === "collation" ? "24hr Collation" : section === "allwardsreport" ? "24hr Nurses Report" : "Patients"}</div>
            <div className="tb-sub">
              {section === "patients" ? `${filtered.length} ${filter} patient${filtered.length !== 1 ? "s" : ""}` : section === "overview" ? `${patients.filter(p => (p.status || "active") === "active").length} active` : section === "wardreport" ? (user.ward || "No ward") : section === "collation" ? `${wardReports.filter(r => r.date === new Date().toISOString().split("T")[0]).length} reports today` : section === "allwardsreport" ? `${WARDS.length} wards · Overall Nurse view` : `${patients.length} total`}
            </div>
          </div>
          <GlobalSearch patients={patients} onSelect={handleSelectPatient} user={user} />
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
            <div className="pt-panel">
              <div className="pt-panel-header">
                <div className="pt-panel-title">
                  {isNurse && user.ward ? `${user.ward.split("–")[0]?.trim()} Patients` : "Patient List"}
                  {isNurse && user.ward && <div style={{fontSize:9,color:"var(--t3)",fontWeight:400,marginTop:1}}>Your ward only · Search EMR to view others</div>}
                </div>
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
                  : <>
                    {isNurse && !canSeeAllWards && <div style={{ padding: "7px 10px", fontSize: 11, color: "var(--t3)", borderBottom: "1px solid var(--border2)", background: "var(--bg3)" }}>🏥 {user.ward || "Your ward"}</div>}
                    {filtered.length === 0
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
                  </>}
              </div>
            </div>
            {selected
              ? <>
                  {searchSelectedId === selected.id && (
                    <div style={{ background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.3)", borderRadius: "var(--r)", padding: "8px 14px", marginBottom: 10, fontSize: 12, color: "var(--warning)", display: "flex", alignItems: "center", gap: 8 }}>
                      🔍 Viewing patient from <strong style={{marginLeft:4}}>{selected.ward}</strong>&nbsp;— found via EMR search
                    </div>
                  )}
                  <PatientDetail key={selected.id} patient={selected} user={user} onUpdate={handleUpdatePatient} toast={showToast} />
                </>
              : <div className="pt-detail"><div className="empty-state"><div className="empty-icon">📋</div><div className="empty-text">No Patient Selected</div><div className="empty-sub">{isNurse && !canSeeAllWards ? "Select a patient from your ward, or search by EMR number to view any patient." : "Select a patient from the list or add a new one."}</div></div></div>}
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

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
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
  if (!user) return (<><style>{css}</style><LoginPage onLogin={setUser} /></>);
  return <MainApp user={user} onLogout={async () => { await FB.logout(); setUser(null); }} />;
}
