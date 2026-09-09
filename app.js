
/* =========================
   ONE-CLICK ACTIONS
   ========================= */
const QUICK_STATUS_ORDER = ["Not Started", "In Progress", "Complete"];

function normalizeStatus(status) {
  const s = String(status || "").toLowerCase().replace(/\s+/g, "_");
  if (["complete", "completed", "done"].includes(s)) return "Complete";
  if (["in_progress", "progress", "doing"].includes(s)) return "In Progress";
  return "Not Started";
}

function nextStatus(status) {
  const current = normalizeStatus(status);
  const i = QUICK_STATUS_ORDER.indexOf(current);
  return QUICK_STATUS_ORDER[(i + 1) % QUICK_STATUS_ORDER.length];
}

function statusClass(status) {
  return normalizeStatus(status).toLowerCase().replace(/\s+/g, "_");
}

function assignmentById(id) {
  return state.assignments.find(a => a.id === id);
}

function assignmentMatchesCurrentFilters(a) {
  const q = String($("aq")?.value || "").toLowerCase();
  const s = $("as")?.value || "";
  return (!q || String(a.title || "").toLowerCase().includes(q))
    && (!s || normalizeStatus(a.status) === s);
}

function refreshQuickControlInPlace(triggerEl, assignment) {
  if (!triggerEl || !assignment) return;

  let replacement = null;
  if (triggerEl.classList.contains("quick-status")) replacement = quickStatusButton(assignment);
  else if (triggerEl.classList.contains("quick-done")) replacement = quickDoneButton(assignment);
  else if (triggerEl.classList.contains("quick-priority")) replacement = quickPriorityButton(assignment);
  else if (triggerEl.classList.contains("quick-todo")) replacement = quickTodoButton(assignment);

  if (replacement) triggerEl.outerHTML = replacement;
}

async function quickUpdateAssignment(id, patch, triggerEl) {
  if (!id || typeof sb === "undefined") return;

  const assignment = assignmentById(id);
  if (!assignment) return;

  const previous = {};
  Object.keys(patch).forEach(key => {
    previous[key] = assignment[key];
    assignment[key] = patch[key];
  });

  // Update only the clicked control immediately. No table reload or full render.
  const row = triggerEl?.closest(".tr");
  refreshQuickControlInPlace(triggerEl, assignment);

  if (row) {
    row.hidden = !assignmentMatchesCurrentFilters(assignment);
    row.classList.add("quick-saving");
    row.setAttribute("aria-busy", "true");
  }

  try {
    const { error } = await sb.from("assignments").update(patch).eq("id", id);
    if (error) throw error;

    if (row) {
      row.classList.remove("quick-saving");
      row.removeAttribute("aria-busy");
    }
  } catch (err) {
    console.error(err);

    // Revert only the affected assignment/control if the save fails.
    Object.keys(previous).forEach(key => {
      assignment[key] = previous[key];
    });

    if (row) {
      row.hidden = !assignmentMatchesCurrentFilters(assignment);
      row.classList.remove("quick-saving");
      row.removeAttribute("aria-busy");

      const currentControl = row.querySelector(
        ".quick-status, .quick-done, .quick-priority, .quick-todo"
      );
      if (currentControl) refreshQuickControlInPlace(currentControl, assignment);
    }

    alert("Couldn't save that change: " + (err.message || err));
  }
}

function quickStatusButton(a) {
  const status = normalizeStatus(a.status);
  const next = nextStatus(status);
  const symbol = status === "Complete" ? "✓" : status === "In Progress" ? "●" : "○";

  return `
    <button class="quick-status ${statusClass(status)}" type="button"
      title="Click to change to ${next}"
      aria-label="Change ${esc(a.title)} to ${next}"
      onclick="event.stopPropagation(); quickUpdateAssignment('${a.id}', {status:'${next}'}, this)">
      <span>${symbol}</span><span>${esc(status)}</span>
    </button>`;
}

function quickDoneButton(a) {
  const done = normalizeStatus(a.status) === "Complete";
  return `
    <button class="quick-done ${done ? "done" : ""}" type="button"
      title="${done ? "Click to reopen" : "Mark complete"}"
      aria-label="${done ? "Reopen assignment" : "Mark assignment complete"}"
      onclick="event.stopPropagation(); quickUpdateAssignment('${a.id}', {status:'${done ? "In Progress" : "Complete"}'}, this)">
      ${done ? "✓" : "○"}
    </button>`;
}

function quickPriorityButton(a) {
  const priority = String(a.priority || "Normal");
  const active = priority === "High" || priority === "Urgent";
  const next = active ? "Normal" : "High";

  return `
    <button class="quick-icon ${active ? "active" : ""}" type="button"
      title="${active ? "Remove priority" : "Mark high priority"}"
      aria-label="${active ? "Remove priority" : "Mark high priority"}"
      onclick="event.stopPropagation(); quickUpdateAssignment('${a.id}', {priority:'${next}'}, this)">★</button>`;
}

function quickTodoButton(a) {
  const todo = !!a.is_todo;
  return `
    <button class="quick-icon ${todo ? "active" : ""}" type="button"
      title="${todo ? "Remove from to-do" : "Add to to-do"}"
      aria-label="${todo ? "Remove from to-do" : "Add to to-do"}"
      onclick="event.stopPropagation(); quickUpdateAssignment('${a.id}', {is_todo:${!todo}}, this)">☑</button>`;
}

window.quickUpdateAssignment = quickUpdateAssignment;
window.quickStatusButton = quickStatusButton;
window.quickDoneButton = quickDoneButton;
window.quickPriorityButton = quickPriorityButton;
window.quickTodoButton = quickTodoButton;

const { createClient } = window.supabase;
const sb = createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let state = { user:null, semesters:[], courses:[], assignments:[], exams:[], grades:[], notifications:[], view:"dashboard" };

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const fmtDate = x => x ? new Date(x).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : "—";
const fmtDateTime = x => x ? new Date(x).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : "—";
const daysUntil = x => x ? Math.ceil((new Date(x)-new Date())/86400000) : null;

async function boot(){
  if(!window.APP_CONFIG || window.APP_CONFIG.SUPABASE_URL.includes("YOUR-")){
    showSetup();
    return;
  }
  const {data:{session}} = await sb.auth.getSession();
  if(session) await signedIn(session.user); else showAuth();
  sb.auth.onAuthStateChange(async (_event,session)=> session ? signedIn(session.user) : showAuth());
}
async function signedIn(user){
  state.user=user;
  $("auth").classList.add("hidden"); $("app").classList.remove("hidden");
  $("userEmail").textContent=user.email||"";
  await loadAll(); render();
}
function showSetup(){
  $("auth").classList.remove("hidden"); $("app").classList.add("hidden");
  $("authBox").innerHTML=`<div class="logo">🎓<span>Assignment Tracker</span></div><h1>Setup</h1><p class="muted">Add your Supabase URL and publishable key to <code>config.js</code>, then reload this page.</p><div class="notice">Your secret/service_role key should never go in this file.</div>`;
}
function showAuth(){
  $("auth").classList.remove("hidden"); $("app").classList.add("hidden");
  $("authBox").innerHTML=`<div class="logo">🎓<span>Assignment Tracker</span></div><h1>Assignment Tracker</h1><p class="muted">Assignments, exams, grades, courses, and calendar — all synced across devices.</p>
  <form id="loginForm"><input id="email" type="email" placeholder="Email" required><input id="password" type="password" placeholder="Password" required><button class="btn primary" type="submit">Log in</button><button class="btn" type="button" id="signup">Create account</button></form><div id="authMsg"></div>`;
  $("loginForm").onsubmit=async e=>{e.preventDefault(); const {error}=await sb.auth.signInWithPassword({email:$("email").value,password:$("password").value}); if(error)$("authMsg").textContent=error.message};
  $("signup").onclick=async()=>{const {error}=await sb.auth.signUp({email:$("email").value,password:$("password").value});$("authMsg").textContent=error?error.message:"Check your email to confirm your account."};
}
async function loadAll(){
  const uid=state.user.id;
  const results=await Promise.all([
    sb.from("semesters").select("*").order("start_date",{ascending:false}),
    sb.from("courses").select("*").order("code"),
    sb.from("assignments").select("*").order("due_at"),
    sb.from("exams").select("*").order("starts_at"),
    sb.from("grade_items").select("*").order("graded_at",{ascending:false}),
    sb.from("notifications").select("*").is("read_at",null).order("scheduled_for")
  ]);
  const names=["semesters","courses","assignments","exams","grades","notifications"];
  results.forEach((r,i)=>{if(r.error) console.error(names[i],r.error); state[names[i]]=r.data||[]});
  let current=state.semesters.find(s=>s.is_current);
  if(!current && state.semesters.length){ current=state.semesters[0]; }
  state.currentSemester=current?.id||null;
}
function render(){
  $("appTitle").textContent=state.view==="dashboard"?"Dashboard":state.view==="assignments"?"Masterlist":state.view==="calendar"?"Calendar":state.view==="exams"?"Exam Center":state.view==="courses"?"Courses":"Grades & GPA";
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
  const views={dashboard:renderDashboard,assignments:renderAssignments,calendar:renderCalendar,exams:renderExams,courses:renderCourses,grades:renderGrades};
  views[state.view]();
}
function renderDashboard(){
 const a=state.assignments,e=state.exams,done=a.filter(x=>normalizeStatus(x.status)==="completed").length;
 const upcoming=a.filter(x=>x.due_at&&normalizeStatus(x.status)!=="completed"&&new Date(x.due_at)>=new Date()).sort((x,y)=>new Date(x.due_at)-new Date(y.due_at)).slice(0,6);
 const examSoon=e.filter(x=>new Date(x.starts_at)>=new Date()).sort((x,y)=>new Date(x.starts_at)-new Date(y.starts_at)).slice(0,3);
 $("content").innerHTML=`<div class="hero"><div><span class="eyebrow">ACADEMIC COMMAND CENTER</span><h2>Stay on top of your work</h2><p>Stay ahead of deadlines, exams, and grades without wrestling with a spreadsheet.</p></div><button class="btn primary" onclick="openAssignment()">＋ Add assignment</button></div>
 <div class="metric-grid"><div class="metric"><small>OPEN WORK</small><b>${a.length-done}</b><span>assignments remaining</span></div><div class="metric pink"><small>THIS WEEK</small><b>${a.filter(x=>x.due_at&&daysUntil(x.due_at)>=0&&daysUntil(x.due_at)<=7&&normalizeStatus(x.status)!=="completed").length}</b><span>deadlines to watch</span></div><div class="metric teal"><small>EXAMS AHEAD</small><b>${e.filter(x=>new Date(x.starts_at)>=new Date()).length}</b><span>upcoming exams</span></div><div class="metric gold"><small>COMPLETION</small><b>${a.length?Math.round(done/a.length*100):0}%</b><span>of assignments complete</span></div></div>
 <div class="two-col"><section class="card"><div class="section-head"><div><h3>Next up</h3><small>Your nearest deadlines</small></div><button class="link" onclick="setView('assignments')">View all →</button></div>${upcoming.length?upcoming.map(itemRow).join(""):`<div class="empty">🎉 Nothing due soon.</div>`}</section>
 <section class="card"><div class="section-head"><div><h3>Exam radar</h3><small>Upcoming exams</small></div><button class="link" onclick="setView('exams')">Exam center →</button></div>${examSoon.length?examSoon.map(examRow).join(""):`<div class="empty">No upcoming exams.</div>`}</section></div>
 <section class="card"><div class="section-head"><div><h3>Course pulse</h3><small>Your current semester</small></div><button class="link" onclick="setView('grades')">Grades →</button></div><div class="course-pulse">${state.courses.slice(0,6).map(coursePulse).join("")||'<div class="empty">Add a course to get started.</div>'}</div></section>`;
}
function itemRow(x){const c=state.courses.find(c=>c.id===x.course_id);const d=daysUntil(x.due_at);return `<div class="list-row"><div class="emoji-dot">📚</div><div class="grow"><b>${esc(x.title)}</b><small>${esc(c?.code||"Course")} · ${esc(x.assignment_type)}</small></div><span class="deadline ${d!==null&&d<=2?"hot":""}">${d===0?"Today":d===1?"Tomorrow":d<0?"Overdue":d+"d"}<small>${fmtDate(x.due_at)}</small></span></div>`}
function examRow(x){const c=state.courses.find(c=>c.id===x.course_id);const d=daysUntil(x.starts_at);return `<div class="list-row"><div class="emoji-dot exam">📝</div><div class="grow"><b>${esc(x.title)}</b><small>${esc(c?.code||"Course")} · ${esc(x.exam_type)}</small></div><span class="deadline hot">${d===0?"Today":d===1?"Tomorrow":d+"d"}<small>${fmtDateTime(x.starts_at)}</small></span></div>`}
function coursePulse(c){const grades=state.grades.filter(g=>g.course_id===c.id&&g.points_earned!=null&&g.points_possible);let p=grades.length?grades.reduce((a,g)=>a+Number(g.points_earned),0)/grades.reduce((a,g)=>a+Number(g.points_possible),0)*100:null;return `<div class="pulse"><span class="swatch" style="background:${esc(c.color)}"></span><b>${esc(c.code)}</b><div class="grow"><div class="bar"><i style="width:${p||0}%;background:${esc(c.color)}"></i></div></div><strong>${p==null?"—":p.toFixed(1)+"%"}</strong></div>`}
function renderAssignments(){
 const rows=[...state.assignments].sort((a,b)=>new Date(a.due_at||"9999")-new Date(b.due_at||"9999"));
 $("content").innerHTML=`<div class="page-head"><div><span class="eyebrow">MASTERLIST</span><h2>All assignments</h2><p>Click a status to cycle it: Not Started → In Progress → Complete.</p></div><button class="btn primary" onclick="openAssignment()">＋ Add assignment</button></div><div class="card"><div class="filters"><input id="aq" placeholder="Search…"><select id="as"><option value="">All statuses</option><option>Not Started</option><option>In Progress</option><option>Complete</option></select></div><div id="assignmentTable"></div></div>`;
 const draw=()=>{
   let q=$("aq").value.toLowerCase(),s=$("as").value;
   let r=rows.filter(x=>(!q||String(x.title||"").toLowerCase().includes(q))&&(!s||normalizeStatus(x.status)===s));
   $("assignmentTable").innerHTML=`<div class="table">
     <div class="tr th"><span>Done</span><span>Assignment</span><span>Course</span><span>Due</span><span>Status</span><span>Actions</span></div>
     ${r.map(x=>{
       let c=state.courses.find(c=>c.id===x.course_id),d=daysUntil(x.due_at);
       return `<div class="tr">
         <span>${quickDoneButton(x)}</span>
         <span><b>${esc(x.title)}</b><small>${esc(x.assignment_type)}</small></span>
         <span>${esc(c?.code||"—")}</span>
         <span class="${d!=null&&d<=2?'hot':''}">${fmtDateTime(x.due_at)}<small>${d==null?"":d<0?"Overdue":d===0?"Today":d+" days"}</small></span>
         <span>${quickStatusButton(x)}</span>
         <span class="quick-actions">${quickPriorityButton(x)}${quickTodoButton(x)}<button class="icon" title="Edit" onclick="editAssignment('${x.id}')">✎</button><button class="icon" title="Delete" onclick="deleteAssignment('${x.id}')">×</button></span>
       </div>`;
     }).join("")||'<div class="empty">No assignments found.</div>'}
   </div>`;
 };
 $("aq").oninput=draw;
 $("as").oninput=draw;
 draw();
}
function renderCalendar(){
 const now=new Date(), y=now.getFullYear(),m=now.getMonth(),first=new Date(y,m,1),daysIn=new Date(y,m+1,0).getDate(),start=(first.getDay()+6)%7;
 let cells="";for(let i=0;i<start;i++)cells+='<div class="day muted"></div>';for(let d=1;d<=daysIn;d++){let date=new Date(y,m,d),items=state.assignments.filter(a=>a.due_at&&new Date(a.due_at).toDateString()===date.toDateString()),ex=state.exams.filter(a=>new Date(a.starts_at).toDateString()===date.toDateString());cells+=`<div class="day"><b>${d}</b>${items.slice(0,3).map(a=>`<span class="cal-chip">${esc(a.title)}</span>`).join("")}${ex.slice(0,2).map(a=>`<span class="cal-chip exam-chip">📝 ${esc(a.title)}</span>`).join("")}</div>`}
 $("content").innerHTML=`<div class="page-head"><div><span class="eyebrow">CALENDAR</span><h2>${now.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</h2><p>Deadlines and exams by month.</p></div></div><div class="card calendar"><div class="weekdays">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(x=>`<b>${x}</b>`).join("")}</div><div class="days">${cells}</div></div>`;
}
function renderExams(){
 const rows=[...state.exams].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
 $("content").innerHTML=`<div class="page-head"><div><span class="eyebrow">EXAM CENTER</span><h2>Exam center</h2><p>Track dates, weights, locations, and study status.</p></div><button class="btn primary" onclick="openExam()">＋ Add exam</button></div><div class="exam-grid">${rows.map(x=>{let c=state.courses.find(c=>c.id===x.course_id),d=daysUntil(x.starts_at);return `<div class="exam-card"><div class="exam-top"><span class="exam-icon">📝</span><em>${d<0?"Complete":d===0?"TODAY":d+" DAYS"}</em></div><h3>${esc(x.title)}</h3><p>${esc(c?.code||"Course")} · ${esc(x.exam_type)}</p><strong>${fmtDateTime(x.starts_at)}</strong><small>${esc(x.location||"Location TBD")} ${x.weight_percent?`· ${x.weight_percent}% of grade`:""}</small><div class="exam-actions"><button onclick="editExam('${x.id}')">Edit</button><button onclick="deleteExam('${x.id}')">Delete</button></div></div>`}).join("")||'<div class="empty">Add your first exam.</div>'}</div>`;
}
function renderCourses(){
 $("content").innerHTML=`<div class="page-head"><div><span class="eyebrow">COURSES</span><h2>Your classes</h2><p>Course-level workload and grade context.</p></div><button class="btn primary" onclick="openCourse()">＋ Add course</button></div><div class="course-grid">${state.courses.map(c=>{let g=state.grades.filter(x=>x.course_id===c.id&&x.points_earned!=null&&x.points_possible),p=g.length?g.reduce((a,x)=>a+Number(x.points_earned),0)/g.reduce((a,x)=>a+Number(x.points_possible),0)*100:null,a=state.assignments.filter(x=>x.course_id===c.id&&normalizeStatus(x.status)!=="completed").length;return `<div class="course-card"><div class="course-accent" style="background:${esc(c.color)}"></div><span class="course-code">${esc(c.code)}</span><h3>${esc(c.name)}</h3><p>${esc(c.instructor||"Instructor not set")} · ${c.credits} credits</p><div class="course-stats"><span><b>${p==null?"—":p.toFixed(1)+"%"}</b><small>current grade</small></span><span><b>${a}</b><small>open assignments</small></span></div><button onclick="openCourse('${c.id}')">Open course →</button></div>`}).join("")||'<div class="empty">Add your first course.</div>'}</div>`;
}
function renderGrades(){
 let totalCredits=0,weighted=0;const cards=state.courses.map(c=>{let g=state.grades.filter(x=>x.course_id===c.id&&x.points_earned!=null&&x.points_possible),p=g.length?g.reduce((a,x)=>a+Number(x.points_earned),0)/g.reduce((a,x)=>a+Number(x.points_possible),0)*100:null;if(p!=null){totalCredits+=Number(c.credits);weighted+=p*Number(c.credits)}return {c,p,g}});let avg=totalCredits?weighted/totalCredits:null;
 $("content").innerHTML=`<div class="page-head"><div><span class="eyebrow">GRADES & GPA</span><h2>Grades and GPA</h2><p>Gradebook by course, plus a semester GPA estimate.</p></div><button class="btn primary" onclick="openGrade()">＋ Add grade</button></div><div class="gpa-banner"><div><small>SEMESTER GPA ESTIMATE</small><b>${avg==null?"—":gpaFromPercent(avg).toFixed(2)}</b></div><div><small>AVERAGE PERCENT</small><b>${avg==null?"—":avg.toFixed(1)+"%"}</b></div><div><small>CREDITS TRACKED</small><b>${totalCredits}</b></div></div><div class="grade-grid">${cards.map(o=>`<div class="card grade-card"><div><b>${esc(o.c.code)}</b><span>${o.p==null?"No grades yet":o.p.toFixed(1)+"%"}</span></div><h3>${esc(o.c.name)}</h3><div class="bar"><i style="width:${o.p||0}%;background:${esc(o.c.color)}"></i></div><small>${o.g.length} graded item${o.g.length===1?"":"s"}</small></div>`).join("")}</div>`;
}
function gpaFromPercent(p){return p>=93?4:p>=90?3.7:p>=87?3.3:p>=83?3:p>=80?2.7:p>=77?2.3:p>=73?2:p>=70?1.7:p>=67?1.3:p>=65?1:0}
async function insert(table,obj){const {error}=await sb.from(table).insert({...obj,user_id:state.user.id});if(error){alert(error.message);return false;}await loadAll();render();return true}
async function update(table,id,obj){const {error}=await sb.from(table).update(obj).eq("id",id);if(error)alert(error.message);await loadAll();render()}
async function remove(table,id){if(confirm("Delete this item?")){const {error}=await sb.from(table).delete().eq("id",id);if(error)alert(error.message);await loadAll();render()}}
function openAssignment(id){let x=id?state.assignments.find(a=>a.id===id):null;modalForm("Assignment",[
 ["title","Title","text",x?.title||""],["course_id","Course","select",x?.course_id||"",state.courses.map(c=>[c.id,c.code+" — "+c.name])],["due_at","Due date/time","datetime-local",x?.due_at?new Date(x.due_at).toISOString().slice(0,16):""],["assignment_type","Type","text",x?.assignment_type||"Assignment"],["priority","Priority","select",x?.priority||"Normal",["Low","Normal","High","Urgent"].map(x=>[x,x])],["status","Status","select",x?.status||"Not Started",["Not Started","In Progress","Complete"].map(x=>[x,x])]],async v=>id?update("assignments",id,v):insert("assignments",v))}
function editAssignment(id){openAssignment(id)} function deleteAssignment(id){remove("assignments",id)}
function openExam(id){let x=id?state.exams.find(a=>a.id===id):null;modalForm("Exam",[["title","Title","text",x?.title||""],["course_id","Course","select",x?.course_id||"",state.courses.map(c=>[c.id,c.code+" — "+c.name])],["starts_at","Date/time","datetime-local",x?.starts_at?new Date(x.starts_at).toISOString().slice(0,16):""],["exam_type","Type","text",x?.exam_type||"Exam"],["location","Location","text",x?.location||""],["weight_percent","Grade weight %","number",x?.weight_percent||""]],async v=>id?update("exams",id,v):insert("exams",v))}
function editExam(id){openExam(id)} function deleteExam(id){remove("exams",id)}
async function ensureCurrentSemester(){
  if(state.currentSemester) return state.currentSemester;
  const existing=state.semesters?.find(s=>s.is_current) || state.semesters?.[0];
  if(existing){ state.currentSemester=existing.id; return existing.id; }
  const now=new Date(), month=now.getMonth()+1, year=now.getFullYear();
  let name,startDate,endDate;
  if(month>=8){ name=`Fall ${year}`; startDate=`${year}-08-01`; endDate=`${year}-12-31`; }
  else if(month<=5){ name=`Spring ${year}`; startDate=`${year}-01-01`; endDate=`${year}-05-31`; }
  else { name=`Summer ${year}`; startDate=`${year}-06-01`; endDate=`${year}-07-31`; }
  const {data,error}=await sb.from("semesters").insert({user_id:state.user.id,name,start_date:startDate,end_date:endDate,is_current:true}).select().single();
  if(error){
    const retry=await sb.from("semesters").select("*").order("start_date",{ascending:false}).limit(1).maybeSingle();
    if(retry.data){ state.semesters=retry.data?[retry.data]:[]; state.currentSemester=retry.data.id; return retry.data.id; }
    throw error;
  }
  state.semesters=[data,...state.semesters]; state.currentSemester=data.id; return data.id;
}
function openCourse(id){
  let x=id?state.courses.find(c=>c.id===id):null;
  modalForm("Class",[["code","Course code","text",x?.code||""],["name","Course name","text",x?.name||""],["credits","Credits","number",x?.credits||3],["instructor","Instructor","text",x?.instructor||""],["color","Accent color","color",x?.color||"#111111"]],async v=>{
    try{
      if(!id) v.semester_id=await ensureCurrentSemester();
      if(id) await update("courses",id,v); else await insert("courses",v);
    }catch(err){alert(err.message||"Could not save class.")}
  })
}
function openGrade(){modalForm("Grade item",[["title","Item","text",""],["course_id","Course","select","",state.courses.map(c=>[c.id,c.code+" — "+c.name])],["category","Category","text","Assignment"],["points_earned","Points earned","number",""],["points_possible","Points possible","number",""],["weight_percent","Weight %","number",""],["graded_at","Graded date","date",""]],async v=>insert("grade_items",v))}
function modalForm(title,fields,onSave){$("modal").innerHTML=`<div class="modal-box"><div class="modal-head"><h2>${title}</h2><button onclick="closeModal()">×</button></div><form id="dynamic">${fields.map(f=>`<label>${esc(f[1])}${f[2]==="select"?`<select name="${f[0]}" required><option value="">Choose…</option>${f[4].map(o=>`<option value="${esc(o[0])}" ${o[0]==f[3]?"selected":""}>${esc(o[1])}</option>`).join("")}</select>`:`<input name="${f[0]}" type="${f[2]}" value="${esc(f[3])}" ${["title","course_id","due_at","starts_at","code","name"].includes(f[0])?"required":""}>`}</label>`).join("")}<div class="modal-actions"><button type="button" onclick="closeModal()">Cancel</button><button class="btn primary">Save</button></div></form></div>`;$("modal").classList.add("open");$("dynamic").onsubmit=e=>{e.preventDefault();let v=Object.fromEntries(new FormData(e.target).entries());["weight_percent","credits","points_earned","points_possible"].forEach(k=>{if(v[k]!==undefined&&v[k]!=="")v[k]=Number(v[k])});["due_at","starts_at"].forEach(k=>{if(v[k])v[k]=new Date(v[k]).toISOString()});onSave(v);closeModal()}}
function closeModal(){$("modal").classList.remove("open")}
function setView(v){state.view=v;render()} window.setView=setView;window.openAssignment=openAssignment;window.openExam=openExam;window.openCourse=openCourse;window.openGrade=openGrade;window.editAssignment=editAssignment;window.deleteAssignment=deleteAssignment;window.editExam=editExam;window.deleteExam=deleteExam;window.closeModal=closeModal;
document.addEventListener("click",e=>{let b=e.target.closest("[data-view]");if(b)setView(b.dataset.view);if(e.target.id==="logout")sb.auth.signOut()});
/* Project hierarchy helpers */
function assignmentChildren(items,parentId){return (items||[]).filter(a=>(a.parent_id||null)===(parentId||null)).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));}
function assignmentProgress(items,parentId){const c=assignmentChildren(items,parentId);const done=c.filter(x=>normalizeStatus(x.status)==="completed").length;return {done,total:c.length,pct:c.length?Math.round(done/c.length*100):0};}

boot();
