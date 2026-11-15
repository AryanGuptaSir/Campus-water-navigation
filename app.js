// AquaTrack: simple student-reported campus water map.
// The five pins are campus reference areas from the supplied campus navigator,
// NOT verified dispenser positions. Confirm each physical dispenser before deployment.
const STORAGE_KEY = "aquatrack-lpu-reports-v2";
const TWO_HOURS = 2 * 60 * 60 * 1000;
const POINTS = [
  {id:"wp-academic-32",name:"Academic Block 32 area",lat:31.252067803473242,lng:75.70481427611107,detail:"Reference pin near Block 32. Exact dispenser position needs on-site confirmation."},
  {id:"wp-library",name:"Central Library area",lat:31.2520037645069,lng:75.7033832605494,detail:"Reference pin near Central Library. Exact dispenser position needs on-site confirmation."},
  {id:"wp-sports",name:"LPU Sports Center area",lat:31.250906002325454,lng:75.70216375724516,detail:"Reference pin near Sports Center. Exact dispenser position needs on-site confirmation."},
  {id:"wp-hostel",name:"Boys Hostel 1 (BH1) area",lat:31.251388828832052,lng:75.70034452628732,detail:"Reference pin near BH1. Exact dispenser position needs on-site confirmation."},
  {id:"wp-robo",name:"Robo Park area",lat:31.25348028186916,lng:75.7032755637416,detail:"Reference pin near Robo Park. Exact dispenser position needs on-site confirmation."}
];
const DEMO_REPORTS = [
  {id:"demo-1",pointId:"wp-academic-32",status:"available",note:"Sample only — not a real student report",time:Date.now()-12*60000,by:"DEMO DATA",demo:true},
  {id:"demo-2",pointId:"wp-library",status:"unavailable",note:"Sample only — not a real student report",time:Date.now()-28*60000,by:"DEMO DATA",demo:true},
  {id:"demo-3",pointId:"wp-sports",status:"dirty",note:"Sample only — not a real student report",time:Date.now()-19*60000,by:"DEMO DATA",demo:true},
  {id:"demo-4",pointId:"wp-hostel",status:"available",note:"Sample only — not a real student report",time:Date.now()-8*60000,by:"DEMO DATA",demo:true}
];
let reports = loadLocalReports(), map, markers = {}, selectedPoint = null;
let sharedMode = false, firestore = null, currentUser = null, unsubscribeReports = null;
const $ = id => document.getElementById(id);
function loadLocalReports(){try{const saved=localStorage.getItem(STORAGE_KEY);return saved?JSON.parse(saved):DEMO_REPORTS.slice()}catch{return DEMO_REPORTS.slice()}}
function saveLocalReports(){localStorage.setItem(STORAGE_KEY,JSON.stringify(reports))}
function fmtTime(ts){return new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true,timeZoneName:"short"}).format(new Date(ts))}
function fmtAgo(ts){const m=Math.max(0,Math.floor((Date.now()-ts)/60000));return m<1?"just now":m<60?`${m} min ago`:`${Math.floor(m/60)} hr ${m%60} min ago`}
function statusFor(pointId){return reports.filter(r=>r.pointId===pointId && Date.now()-r.time<=TWO_HOURS && Date.now()>=r.time-60000).sort((a,b)=>b.time-a.time)[0]||null}
function statusName(s){return ({available:"Available",unavailable:"Unavailable",dirty:"Dirty / quality concern",stale:"Needs update"})[s]||"Needs update"}
function iconFor(status){return L.divIcon({className:"marker-wrap",html:`<div class="water-marker ${status}"></div>`,iconSize:[22,22],iconAnchor:[11,11]})}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function pointPopup(p,r){return `<div class="popup-title">${esc(p.name)}</div><div class="popup-meta">${esc(p.detail)}</div><div class="popup-status">${statusName(r?r.status:"stale")}</div><div class="popup-meta">${r?`Updated ${fmtAgo(r.time)} · ${fmtTime(r.time)}${r.demo?" · DEMO":""}`:"No report in the last 2 hours"}</div>`}
function init(){
  if(!window.L){$("map").textContent="Map library could not load. Check your internet connection.";return}
  map=L.map("map").setView([31.2523,75.7032],16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:20,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  POINTS.forEach(p=>{const marker=L.marker([p.lat,p.lng],{icon:iconFor("stale")}).addTo(map);marker.bindPopup(pointPopup(p,null));marker.on("click",()=>showDetails(p));markers[p.id]=marker;const o=document.createElement("option");o.value=p.id;o.textContent=p.name;$("location").appendChild(o)});
  $("reportForm").addEventListener("submit",submitReport);$("search").addEventListener("input",renderList);
  $("resetView").addEventListener("click",()=>map.setView([31.2523,75.7032],16));
  $("closeModal").addEventListener("click",closeModal);$("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal()});
  $("reportThis").addEventListener("click",()=>{if(selectedPoint){$("location").value=selectedPoint.id;closeModal();$("status").focus();$("reportForm").scrollIntoView({behavior:"smooth",block:"center"})}});
  $("timezone").textContent=Intl.DateTimeFormat().resolvedOptions().timeZone||"device local time";
  window.addEventListener("storage",e=>{if(e.key===STORAGE_KEY&&!sharedMode){reports=loadLocalReports();render()}});
  render();updateClock();setInterval(updateClock,1000);setInterval(render,30000);
  startFirebaseIfConfigured();
}
function updateClock(){$("clock").textContent=new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true}).format(new Date())}
function render(){const counts={available:0,unavailable:0,dirty:0,stale:0};POINTS.forEach(p=>{const r=statusFor(p.id),s=r?r.status:"stale";counts[s]++;markers[p.id].setIcon(iconFor(s));markers[p.id].setPopupContent(pointPopup(p,r))});$("availableCount").textContent=counts.available;$("unavailableCount").textContent=counts.unavailable;$("dirtyCount").textContent=counts.dirty;$("staleCount").textContent=counts.stale;$("pointCount").textContent=`${POINTS.length} points`;
  $("mapStatus").textContent=sharedMode?"Shared reports update automatically.":"Local demo: reports stay in this browser.";renderList()}
function renderList(){if(!map)return;const q=$("search").value.toLowerCase();$("pointList").innerHTML="";POINTS.filter(p=>p.name.toLowerCase().includes(q)).forEach(p=>{const r=statusFor(p.id),s=r?r.status:"stale",b=document.createElement("button");b.className="point";b.innerHTML=`<span class="dot ${s==="available"?"green":s==="unavailable"?"red":s==="dirty"?"yellow":"grey"}"></span><span class="pmeta"><strong>${esc(p.name)}</strong><small>${r?`Updated ${fmtAgo(r.time)} · ${fmtTime(r.time)}${r.demo?" · DEMO":""}`:"No recent report"}</small></span><span class="pill ${s}">${statusName(s)}</span>`;b.addEventListener("click",()=>{map.setView([p.lat,p.lng],18);markers[p.id].openPopup();showDetails(p)});$("pointList").appendChild(b)})}
async function submitReport(e){e.preventDefault();const pointId=$("location").value,status=$("status").value,note=$("note").value.trim(),p=POINTS.find(x=>x.id===pointId);if(!p)return;
  const localTime=Date.now();const report={id:`r-${localTime}-${Math.random().toString(36).slice(2,7)}`,pointId,status,note,time:localTime,by:"Student report",demo:false};
  const submit=$("reportForm").querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="Submitting…";
  try{
    if(sharedMode){await firestore.collection("reports").add({pointId,status,note,clientTime:localTime,createdAt:firebase.firestore.FieldValue.serverTimestamp(),uid:currentUser.uid});$("formMessage").textContent=`Report shared successfully. Server time: ${fmtTime(Date.now())}. Other connected users will receive the update.`}
    else{reports=reports.filter(r=>!r.demo);reports.push(report);saveLocalReports();render();$("formMessage").textContent=`Report saved at ${fmtTime(report.time)}. It is visible in this browser only; configure Firebase for sharing.`}
    $("note").value="";map.setView([p.lat,p.lng],18);markers[p.id].openPopup();showDetails(p);
  }catch(err){console.error(err);$("formMessage").textContent="Could not submit the report. Check your connection and Firebase setup."}
  finally{submit.disabled=false;submit.innerHTML='Submit water report <span>→</span>'}
}
function showDetails(p){selectedPoint=p;const r=statusFor(p.id),history=reports.filter(x=>x.pointId===p.id).sort((a,b)=>b.time-a.time).slice(0,5);$("modalTitle").textContent=p.name;$("modalBody").innerHTML=`<div class="detail-line"><b>Current status:</b> ${statusName(r?r.status:"stale")}</div><div class="detail-line"><b>Last report:</b> ${r?`${fmtTime(r.time)} (${fmtAgo(r.time)})`+(r.demo?" · DEMONSTRATION DATA":""):"No report in the last 2 hours"}</div><div class="detail-line"><b>Map location:</b> <span>Reference area only; exact dispenser position has not been verified.</span></div><h3 style="font-size:13px;margin:16px 0 4px">Recent reports</h3>${history.length?history.map(x=>`<div class="report-row"><b>${statusName(x.status)}</b> · ${fmtTime(x.time)}${x.demo?" · DEMO":""}<small>${esc(x.note||"No additional details")}</small></div>`).join(""):"<p class='popup-meta'>No reports recorded yet.</p>"}`;$("modal").classList.remove("hidden")}
function closeModal(){$("modal").classList.add("hidden")}
function firebaseConfigReady(){const c=window.AQUATRACK_FIREBASE_CONFIG||{};return c.apiKey&&!c.apiKey.startsWith("PASTE_")&&c.projectId&&!c.projectId.startsWith("PASTE_")&&c.appId&&!c.appId.startsWith("PASTE_")}
async function startFirebaseIfConfigured(){
  if(!firebaseConfigReady()){setMode(false);return}
  try{
    if(!window.firebase){throw new Error("Firebase SDK did not load")}
    firebase.initializeApp(window.AQUATRACK_FIREBASE_CONFIG);firestore=firebase.firestore();
    await firebase.auth().signInAnonymously();currentUser=firebase.auth().currentUser;
    sharedMode=true;setMode(true);
    unsubscribeReports=firestore.collection("reports").orderBy("createdAt","desc").limit(300).onSnapshot(snapshot=>{
      reports=snapshot.docs.map(doc=>{const d=doc.data();const serverMs=d.createdAt&&d.createdAt.toMillis?d.createdAt.toMillis():d.clientTime;return{id:doc.id,pointId:d.pointId,status:d.status,note:d.note||"",time:serverMs||Date.now(),by:"Student report",demo:false}}).filter(r=>POINTS.some(p=>p.id===r.pointId));render();
    },err=>{console.error(err);$("mapStatus").textContent="Could not sync shared reports. Check Firestore rules."});
  }catch(err){console.error(err);sharedMode=false;setMode(false);$("formMessage").textContent="Firebase is configured but could not connect. Check Authentication, Firestore and rules."}
}
function setMode(isShared){$("connectionLabel").textContent=isShared?"SHARED LIVE MODE":"LOCAL DEMO";$("modeTitle").textContent=isShared?"Shared reporting enabled":"Prototype / demo mode";$("modeText").textContent=isShared?"Reports are shared with other connected users and update automatically. Pins still need physical verification.":"Sample reports are labelled as demo data. New reports are saved in this browser only.";if(!isShared)$("formMessage").textContent="Local demo mode: your report updates this browser only."}
document.addEventListener("DOMContentLoaded",init);
