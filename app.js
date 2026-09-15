
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

function rebuildIndexes({courses=false, assignments=false, exams=false, grades=false}={}) {
  if (courses) {
    state.indexes.courses = new Map(state.courses.map(c => [c.id, c]));
  }
  if (assignments) {
    state.indexes.assignments = new Map(state.assignments.map(a => [a.id, a]));
    state.cache.sortedAssignments = [...state.assignments].sort((a,b)=>(a.due_at||"9999").localeCompare(b.due_at||"9999"));
    state.indexes.assignmentsByDate = new Map();
    for (const a of state.assignments) {
      if (!a.due_at) continue;
      const key = calendarDayKey(new Date(a.due_at));
      const bucket = state.indexes.assignmentsByDate.get(key);
      if (bucket) bucket.push(a); else state.indexes.assignmentsByDate.set(key, [a]);
    }
  }
  if (exams) {
    state.cache.sortedExams = [...state.exams].sort((a,b)=>(a.starts_at||"9999").localeCompare(b.starts_at||"9999"));
    state.indexes.examsByDate = new Map();
    for (const e of state.exams) {
      if (!e.starts_at) continue;
      const key = calendarDayKey(new Date(e.starts_at));
      const bucket = state.indexes.examsByDate.get(key);
      if (bucket) bucket.push(e); else state.indexes.examsByDate.set(key, [e]);
    }
  }
  if (grades) {
    state.indexes.gradesByCourse = new Map();
    for (const g of state.grades) {
      const bucket = state.indexes.gradesByCourse.get(g.course_id);
      if (bucket) bucket.push(g); else state.indexes.gradesByCourse.set(g.course_id, [g]);
    }
  }
}
function courseById(id) { return state.indexes.courses.get(id); }
function assignmentById(id) { return state.indexes.assignments.get(id); }
function gradesForCourse(id) { return state.indexes.gradesByCourse.get(id) || []; }
function replaceInArray(arr, item) {
  const i = arr.findIndex(x => x.id === item.id);
  if (i >= 0) arr[i] = item; else arr.push(item);
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

  // A completed assignment should never remain on the To-do list.
  // This makes completion the source of truth and also handles changes made
  // through either the status dropdown or the Done button.
  if (normalizeStatus(patch.status) === "Complete") {
    patch = {...patch, is_todo:false};
  }

  const previous = {};
  Object.keys(patch).forEach(key => {
    previous[key] = assignment[key];
    assignment[key] = patch[key];
  });
  rebuildIndexes({assignments:true});

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
    if (state.view === "dashboard" && typeof renderDashboardTodo === "function") {
      renderDashboardTodo();
    }
  } catch (err) {
    console.error(err);

    // Revert only the affected assignment/control if the save fails.
    Object.keys(previous).forEach(key => {
      assignment[key] = previous[key];
    });
    rebuildIndexes({assignments:true});

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
  return `<select class="quick-status ${statusClass(status)}"
    aria-label="Change ${esc(a.title)} status"
    onclick="event.stopPropagation()"
    onchange="event.stopPropagation(); quickUpdateAssignment('${a.id}', {status:this.value}, this)">
    ${QUICK_STATUS_ORDER.map(st => `<option value="${st}" ${st === status ? "selected" : ""}>${st}</option>`).join("")}
  </select>`;
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
    <button class="quick-icon todo-toggle ${todo ? "active" : ""}" type="button"
      title="${todo ? "Remove from to-do list" : "Add to to-do list"}"
      aria-label="${todo ? "Remove from to-do list" : "Add to to-do list"}"
      onclick="event.stopPropagation(); quickUpdateAssignment('${a.id}', {is_todo:${!todo}}, this)">
      ${todo ? "✓ To-do" : "+ To-do"}
    </button>`;
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

let state = {
  user:null, semesters:[], courses:[], assignments:[], exams:[], grades:[], notifications:[],
  view:"dashboard", calendarMonthOffset:0,
  loaded:{grades:false,notifications:false},
  indexes:{courses:new Map(), assignments:new Map(), assignmentsByDate:new Map(), examsByDate:new Map(), gradesByCourse:new Map()},
  cache:{sortedAssignments:[],sortedExams:[]}
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const dateFormatter = new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"});
const dateTimeFormatter = new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const fmtDate = x => x ? dateFormatter.format(new Date(x)) : "—";
const fmtDateTime = x => {
  if(!x) return "—";
  const d=new Date(x);
  return (d.getHours()===0 && d.getMinutes()===0) ? dateFormatter.format(d) : dateTimeFormatter.format(d);
};
const daysUntil = x => x ? Math.ceil((new Date(x).getTime()-Date.now())/86400000) : null;

let todoCleanupTimer = null;

async function cleanupCompletedTodos(){
  if(!state.user || typeof sb === "undefined") return;
  const completed=state.assignments.filter(a=>normalizeStatus(a.status)==="Complete" && !!a.is_todo);
  if(!completed.length) return;

  const ids=completed.map(a=>a.id);
  const {error}=await sb.from("assignments").update({is_todo:false}).in("id",ids);
  if(error){
    console.error("Couldn't clean completed assignments from To-do list",error);
    return;
  }
  completed.forEach(a=>{a.is_todo=false;});
  rebuildIndexes({assignments:true});
  if(state.view==="dashboard" && typeof renderDashboardTodo==="function") renderDashboardTodo();
}

function scheduleTodoCleanup(){
  if(todoCleanupTimer) clearTimeout(todoCleanupTimer);
  const now=new Date();
  const next=new Date(now);
  next.setHours(24,0,0,0);
  const delay=Math.max(1000,next-now);
  todoCleanupTimer=setTimeout(async()=>{
    await cleanupCompletedTodos();
    scheduleTodoCleanup();
  },delay);
}

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
  if(state.user?.id===user.id && !$('app').classList.contains('hidden')) return;
  state.user=user;
  $("auth").classList.add("hidden"); $("app").classList.remove("hidden");
  $("userEmail").textContent=user.email||"";
  await loadCoreData();
  await cleanupCompletedTodos();
  scheduleTodoCleanup();
  render();
}
function showSetup(){
  $("auth").classList.remove("hidden"); $("app").classList.add("hidden");
  $("authBox").innerHTML=`<div class="logo">🎓<span>Assignment Tracker</span></div><h1>Setup</h1><p class="muted">Add your Supabase URL and publishable key to <code>config.js</code>, then reload this page.</p><div class="notice">Your secret/service_role key should never go in this file.</div>`;
}
function showAuth(){
  state.user=null;
  $("auth").classList.remove("hidden"); $("app").classList.add("hidden");
  $("authBox").innerHTML=`<div class="logo">🎓<span>Assignment Tracker</span></div><h1>Assignment Tracker</h1><p class="muted">Assignments, exams, grades, courses, and calendar — all synced across devices.</p>
  <form id="loginForm"><input id="email" type="email" placeholder="Email" required><input id="password" type="password" placeholder="Password" required><button class="btn primary" type="submit">Log in</button><button class="btn" type="button" id="signup">Create account</button></form><div id="authMsg"></div>`;
  $("loginForm").onsubmit=async e=>{e.preventDefault(); const {error}=await sb.auth.signInWithPassword({email:$("email").value,password:$("password").value}); if(error)$("authMsg").textContent=error.message};
  $("signup").onclick=async()=>{const {error}=await sb.auth.signUp({email:$("email").value,password:$("password").value});$("authMsg").textContent=error?error.message:"Check your email to confirm your account."};
}
async function loadCoreData(){
  const results = await Promise.all([
    sb.from("semesters").select("id,name,start_date,end_date,is_current").order("start_date",{ascending:false}),
    sb.from("courses").select("id,code,name,credits,instructor,color,semester_id").order("code"),
    sb.from("assignments").select("id,title,course_id,due_at,assignment_type,status,priority,is_todo,parent_id,sort_order").order("due_at"),
    sb.from("exams").select("id,title,course_id,starts_at,exam_type,location,weight_percent").order("starts_at")
  ]);
  const names=["semesters","courses","assignments","exams"];
  results.forEach((r,i)=>{if(r.error) console.error(names[i],r.error); state[names[i]]=r.data||[]});
  rebuildIndexes({courses:true,assignments:true,exams:true});
  let current=state.semesters.find(s=>s.is_current) || state.semesters[0];
  state.currentSemester=current?.id||null;
}
async function loadGrades(){
  if(state.loaded.grades) return;
  const {data,error}=await sb.from("grade_items").select("id,title,course_id,category,points_earned,points_possible,weight_percent,graded_at").order("graded_at",{ascending:false});
  if(error) { console.error("grades",error); state.grades=[]; }
  else state.grades=data||[];
  state.loaded.grades=true;
  rebuildIndexes({grades:true});
}
async function ensureViewData(view=state.view){
  if(view==="grades" || view==="courses") await loadGrades();
}
async function refreshCoreData(){
  state.loaded.grades=false;
  await loadCoreData();
}
async function loadAll(){
  await loadCoreData();
  await ensureViewData(state.view);
}
async function render(){
  $("appTitle").textContent=state.view==="dashboard"?"Dashboard":state.view==="assignments"?"Masterlist":state.view==="calendar"?"Calendar":state.view==="exams"?"Exam Center":state.view==="courses"?"Courses":"Grades & GPA";
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
  await ensureViewData(state.view);
  const views={dashboard:renderDashboard,assignments:renderAssignments,calendar:renderCalendar,exams:renderExams,courses:renderCourses,grades:renderGrades};
  views[state.view]();
}
function renderDashboard(){
 const a=state.assignments,e=state.exams,now=Date.now(),weekEnd=now+8*86400000;
 const done=a.reduce((n,x)=>n+(normalizeStatus(x.status)==="Complete"?1:0),0);
 const open=a.filter(x=>normalizeStatus(x.status)!=="Complete");
 const upcoming=[];
 for(const x of state.cache.sortedAssignments){
   if(x.due_at && normalizeStatus(x.status)!=="Complete" && new Date(x.due_at).getTime()>=now){ upcoming.push(x); if(upcoming.length===6) break; }
 }
 const examSoon=[];
 for(const x of state.cache.sortedExams){
   if(x.starts_at && new Date(x.starts_at).getTime()>=now){ examSoon.push(x); if(examSoon.length===3) break; }
 }
 const weekCount=open.reduce((n,x)=>{if(!x.due_at)return n;const t=new Date(x.due_at).getTime();return n+(t>=now&&t<=weekEnd?1:0)},0);
 const examCount=e.reduce((n,x)=>n+(x.starts_at&&new Date(x.starts_at).getTime()>=now?1:0),0);
 $("content").innerHTML=`<div class="hero"><div><span class="eyebrow">ACADEMIC COMMAND CENTER</span><h2>Stay on top of your work</h2><p>Stay ahead of deadlines, exams, and grades without wrestling with a spreadsheet.</p></div><button class="btn primary" onclick="openAssignment()">＋ Add assignment</button></div>
 <div class="metric-grid"><div class="metric"><small>OPEN WORK</small><b>${open.length}</b><span>assignments remaining</span></div><div class="metric pink"><small>THIS WEEK</small><b>${weekCount}</b><span>deadlines to watch</span></div><div class="metric teal"><small>EXAMS AHEAD</small><b>${examCount}</b><span>upcoming exams</span></div><div class="metric gold"><small>COMPLETION</small><b>${a.length?Math.round(done/a.length*100):0}%</b><span>of assignments complete</span></div></div>
 <div class="two-col"><section class="card"><div class="section-head"><div><h3>Next up</h3><small>Your nearest deadlines</small></div><button class="link" onclick="setView('assignments')">View all →</button></div>${upcoming.length?upcoming.map(itemRow).join(""):`<div class="empty">🎉 Nothing due soon.</div>`}</section>
 <section class="card"><div class="section-head"><div><h3>Exam radar</h3><small>Upcoming exams</small></div><button class="link" onclick="setView('exams')">Exam center →</button></div>${examSoon.length?examSoon.map(examRow).join(""):`<div class="empty">No upcoming exams.</div>`}</section></div>
 <section class="card dashboard-todo-card"><div class="section-head"><div><h3>To-do list</h3><small>Assignments you marked for focused follow-up</small></div><button class="link" onclick="setView('assignments')">Masterlist →</button></div><div id="dashboardTodo" class="dashboard-todo-list"></div></section>`;
 renderDashboardTodo();
}
function itemRow(x){const c=courseById(x.course_id);const d=daysUntil(x.due_at);return `<div class="list-row dashboard-assignment-row"><div class="emoji-dot">📚</div><div class="grow"><b>${esc(x.title)}</b><small>${esc(c?.code||"Course")} · ${esc(x.assignment_type)}</small></div><span class="deadline ${d!==null&&d<=2?"hot":""}">${d===0?"Today":d===1?"Tomorrow":d<0?"Overdue":d+"d"}<small>${fmtDate(x.due_at)}</small></span><span class="dashboard-done">${quickDoneButton(x)}</span></div>`}
function todoRow(x){
 const c=courseById(x.course_id);
 const d=daysUntil(x.due_at);
 return `<div class="list-row todo-row"><div class="emoji-dot">☐</div><div class="grow"><b>${esc(x.title)}</b><small>${esc(c?.code||"Course")} · ${esc(x.assignment_type)}</small></div><span class="deadline ${d!==null&&d<0?"hot":""}">${d===null?"No date":d===0?"Today":d===1?"Tomorrow":d<0?"Overdue":d+"d"}<small>${fmtDate(x.due_at)}</small></span><span class="todo-done">${quickDoneButton(x)}</span><button class="btn small" type="button" onclick="event.stopPropagation(); quickUpdateAssignment('${x.id}', {is_todo:false}, this)">Remove from list</button></div>`;
}
function renderDashboardTodo(){
 const host=$("dashboardTodo");
 if(!host) return;
 const todo=state.assignments.filter(x=>!!x.is_todo&&normalizeStatus(x.status)!=="Complete");
 todo.sort((a,b)=>(a.due_at||"9999").localeCompare(b.due_at||"9999"));
 host.innerHTML=todo.length?todo.slice(0,8).map(todoRow).join(""):`<div class="empty">Your to-do list is empty. Use “+ To-do” on an assignment in the Masterlist to add one.</div>`;
}
function examRow(x){const c=courseById(x.course_id);const d=daysUntil(x.starts_at);return `<div class="list-row"><div class="emoji-dot exam">📝</div><div class="grow"><b>${esc(x.title)}</b><small>${esc(c?.code||"Course")} · ${esc(x.exam_type)}</small></div><span class="deadline hot">${d===0?"Today":d===1?"Tomorrow":d+"d"}<small>${fmtDateTime(x.starts_at)}</small></span></div>`}
function coursePulse(c){const grades=state.grades.filter(g=>g.course_id===c.id&&g.points_earned!=null&&g.points_possible);let p=grades.length?grades.reduce((a,g)=>a+Number(g.points_earned),0)/grades.reduce((a,g)=>a+Number(g.points_possible),0)*100:null;return `<div class="pulse"><span class="swatch" style="background:${esc(c.color)}"></span><b>${esc(c.code)}</b><div class="grow"><div class="bar"><i style="width:${p||0}%;background:${esc(c.color)}"></i></div></div><strong>${p==null?"—":p.toFixed(1)+"%"}</strong></div>`}
function renderAssignments(){
 const rows=state.cache.sortedAssignments;
 $("content").innerHTML=`<div class="page-head"><div><span class="eyebrow">MASTERLIST</span><h2>All assignments</h2><p>Use the status menu to update progress, ★ for priority, and To-do to add or remove an assignment from your Dashboard to-do list.</p></div><button class="btn primary" onclick="openAssignment()">＋ Add assignment</button></div><div class="card"><div class="filters"><input id="aq" placeholder="Search…"><select id="as"><option value="">All statuses</option><option>Not Started</option><option>In Progress</option><option>Complete</option></select></div><div id="assignmentTable"></div></div>`;
 const draw=()=>{
   let q=$("aq").value.toLowerCase(),s=$("as").value;
   let r=rows.filter(x=>(!q||String(x.title||"").toLowerCase().includes(q))&&(!s||normalizeStatus(x.status)===s));
   $("assignmentTable").innerHTML=`<div class="table">
     <div class="tr th"><span>Done</span><span>Assignment</span><span>Course</span><span>Due</span><span>Status</span><span>Actions</span></div>
     ${r.map(x=>{
       let c=courseById(x.course_id),d=daysUntil(x.due_at);
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
function calendarDayKey(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function calendarMonth(year,month){
  const first=new Date(year,month,1), daysIn=new Date(year,month+1,0).getDate(), start=(first.getDay()+6)%7;
  const cells=[];
  for(let i=0;i<start;i++) cells.push('<div class="day muted" aria-hidden="true"></div>');
  for(let d=1;d<=daysIn;d++){
    const date=new Date(year,month,d), key=calendarDayKey(date), today=calendarDayKey(new Date())===key;
    const items=state.indexes.assignmentsByDate.get(key)||[];
    const ex=state.indexes.examsByDate.get(key)||[];
    const visibleItems=items.slice(0,4), visibleEx=ex.slice(0,2), extra=Math.max(0,items.length-visibleItems.length)+Math.max(0,ex.length-visibleEx.length);
    let html=`<div class="day${today?" today":""}"><b>${d}</b>`;
    html+=visibleItems.map(a=>{const c=courseById(a.course_id);const done=normalizeStatus(a.status)==="Complete";return `<span class="cal-chip course-chip ${done?"completed":""}" style="--course-color:${esc(c?.color||"#d9d9d9")}" title="${done?"Completed: ":""}${esc(a.title)}">${esc(c?.code?c.code+" · ":"")}${esc(a.title)}</span>`}).join("");
    html+=visibleEx.map(a=>{const c=courseById(a.course_id);return `<span class="cal-chip exam-chip course-chip" style="--course-color:${esc(c?.color||"#777")}">📝 ${esc(c?.code?c.code+" · ":"")}${esc(a.title)}</span>`}).join("");
    if(extra) html+=`<span class="cal-more">+${extra} more</span>`;
    html+='</div>'; cells.push(html);
  }
  while(cells.length%7) cells.push('<div class="day muted" aria-hidden="true"></div>');
  return `<section class="month-card card"><div class="month-head"><h3>${new Date(year,month,1).toLocaleDateString(undefined,{month:"long",year:"numeric"})}</h3><span>${daysIn} days</span></div><div class="weekdays">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(x=>`<b>${x}</b>`).join("")}</div><div class="days">${cells.join("")}</div></section>`;
}
function calendarMove(delta){state.calendarMonthOffset=Math.max(0,Math.min(12,state.calendarMonthOffset+delta));if(state.view==="calendar")renderCalendar();}
function calendarGoToday(){state.calendarMonthOffset=0;if(state.view==="calendar")renderCalendar();}
window.calendarMove=calendarMove; window.calendarGoToday=calendarGoToday;
function renderCalendar(){
  const now=new Date();
  const selected=new Date(now.getFullYear(),now.getMonth()+state.calendarMonthOffset,1);
  const end=new Date(now.getFullYear(),now.getMonth()+12,1);
  const atStart=state.calendarMonthOffset===0, atEnd=state.calendarMonthOffset===12;
  $("content").innerHTML=`<div class="page-head calendar-page-head"><div><span class="eyebrow">CALENDAR</span><h2>Academic calendar</h2><p>One full month at a time. Deadlines use their course colors; completed assignments are greyed out and crossed out.</p></div><div class="calendar-nav"><button class="btn" onclick="calendarMove(-1)" ${atStart?"disabled":""}>← Previous</button><button class="btn primary" onclick="calendarGoToday()">Today</button><button class="btn" onclick="calendarMove(1)" ${atEnd?"disabled":""}>Next →</button></div></div><div class="calendar-position">Month ${state.calendarMonthOffset+1} of 13 · Through ${end.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</div><div class="calendar-single">${calendarMonth(selected.getFullYear(),selected.getMonth())}</div>`;
}
function renderExams(){
 const rows=state.cache.sortedExams;
 $("content").innerHTML=`<div class="page-head"><div><span class="eyebrow">EXAM CENTER</span><h2>Exam center</h2><p>Track dates, weights, locations, and study status.</p></div><button class="btn primary" onclick="openExam()">＋ Add exam</button></div><div class="exam-grid">${rows.map(x=>{let c=courseById(x.course_id),d=daysUntil(x.starts_at);return `<div class="exam-card"><div class="exam-top"><span class="exam-icon">📝</span><em>${d<0?"Complete":d===0?"TODAY":d+" DAYS"}</em></div><h3>${esc(x.title)}</h3><p>${esc(c?.code||"Course")} · ${esc(x.exam_type)}</p><strong>${fmtDateTime(x.starts_at)}</strong><small>${esc(x.location||"Location TBD")} ${x.weight_percent?`· ${x.weight_percent}% of grade`:""}</small><div class="exam-actions"><button onclick="editExam('${x.id}')">Edit</button><button onclick="deleteExam('${x.id}')">Delete</button></div></div>`}).join("")||'<div class="empty">Add your first exam.</div>'}</div>`;
}
function renderCourses(){
 const openByCourse=new Map();
 for(const a of state.assignments) if(normalizeStatus(a.status)!=="Complete") openByCourse.set(a.course_id,(openByCourse.get(a.course_id)||0)+1);
 $("content").innerHTML=`<div class="page-head"><div><span class="eyebrow">COURSES</span><h2>Your classes</h2><p>Course-level workload and grade context.</p></div><button class="btn primary" onclick="openCourse()">＋ Add course</button></div><div class="course-grid">${state.courses.map(c=>{let g=gradesForCourse(c.id).filter(x=>x.points_earned!=null&&x.points_possible),earned=0,possible=0;for(const x of g){earned+=Number(x.points_earned);possible+=Number(x.points_possible)}let pct=possible?earned/possible*100:null,a=openByCourse.get(c.id)||0;return `<div class="course-card"><div class="course-accent" style="background:${esc(c.color)}"></div><span class="course-code">${esc(c.code)}</span><h3>${esc(c.name)}</h3><p>${esc(c.instructor||"Instructor not set")} · ${c.credits} credits</p><div class="course-stats"><span><b>${pct==null?"—":pct.toFixed(1)+"%"}</b><small>current grade</small></span><span><b>${a}</b><small>open assignments</small></span></div><button onclick="openCourse('${c.id}')">Open course →</button></div>`}).join("")||'<div class="empty">Add your first course.</div>'}</div>`;
}
function renderGrades(){
 let totalCredits=0,weighted=0;const cards=state.courses.map(c=>{let g=gradesForCourse(c.id).filter(x=>x.points_earned!=null&&x.points_possible),earned=0,possible=0;for(const x of g){earned+=Number(x.points_earned);possible+=Number(x.points_possible)}let p=possible?earned/possible*100:null;if(p!=null){totalCredits+=Number(c.credits);weighted+=p*Number(c.credits)}return {c,p,g}});let avg=totalCredits?weighted/totalCredits:null;
 $("content").innerHTML=`<div class="page-head"><div><span class="eyebrow">GRADES & GPA</span><h2>Grades and GPA</h2><p>Gradebook by course, plus a semester GPA estimate.</p></div><button class="btn primary" onclick="openGrade()">＋ Add grade</button></div><div class="gpa-banner"><div><small>SEMESTER GPA ESTIMATE</small><b>${avg==null?"—":gpaFromPercent(avg).toFixed(2)}</b></div><div><small>AVERAGE PERCENT</small><b>${avg==null?"—":avg.toFixed(1)+"%"}</b></div><div><small>CREDITS TRACKED</small><b>${totalCredits}</b></div></div><div class="grade-grid">${cards.map(o=>`<div class="card grade-card"><div><b>${esc(o.c.code)}</b><span>${o.p==null?"No grades yet":o.p.toFixed(1)+"%"}</span></div><h3>${esc(o.c.name)}</h3><div class="bar"><i style="width:${o.p||0}%;background:${esc(o.c.color)}"></i></div><small>${o.g.length} graded item${o.g.length===1?"":"s"}</small></div>`).join("")}</div>`;
}
function gpaFromPercent(p){return p>=93?4:p>=90?3.7:p>=87?3.3:p>=83?3:p>=80?2.7:p>=77?2.3:p>=73?2:p>=70?1.7:p>=67?1.3:p>=65?1:0}
async function insert(table,obj){
  const {data,error}=await sb.from(table).insert({...obj,user_id:state.user.id}).select().single();
  if(error){alert(error.message);return false;}
  if(table==="assignments"){state.assignments.push(data);rebuildIndexes({assignments:true});}
  else if(table==="courses"){state.courses.push(data);state.courses.sort((a,b)=>String(a.code).localeCompare(String(b.code)));rebuildIndexes({courses:true});}
  else if(table==="exams"){state.exams.push(data);state.exams.sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));rebuildIndexes({exams:true});}
  else if(table==="grade_items"){state.grades.unshift(data);state.loaded.grades=true;rebuildIndexes({grades:true});}
  render();
  return true;
}
async function update(table,id,obj){
  const {data,error}=await sb.from(table).update(obj).eq("id",id).select().single();
  if(error){alert(error.message);return false;}
  if(table==="assignments"){replaceInArray(state.assignments,data);rebuildIndexes({assignments:true});}
  else if(table==="courses"){replaceInArray(state.courses,data);state.courses.sort((a,b)=>String(a.code).localeCompare(String(b.code)));rebuildIndexes({courses:true});}
  else if(table==="exams"){replaceInArray(state.exams,data);state.exams.sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));rebuildIndexes({exams:true});}
  else if(table==="grade_items"){replaceInArray(state.grades,data);state.loaded.grades=true;rebuildIndexes({grades:true});}
  render();
  return true;
}
async function remove(table,id){
  if(!confirm("Delete this item?")) return;
  const {error}=await sb.from(table).delete().eq("id",id);
  if(error){alert(error.message);return;}
  if(table==="assignments"){state.assignments=state.assignments.filter(x=>x.id!==id);rebuildIndexes({assignments:true});}
  else if(table==="courses"){state.courses=state.courses.filter(x=>x.id!==id);rebuildIndexes({courses:true});}
  else if(table==="exams"){state.exams=state.exams.filter(x=>x.id!==id);rebuildIndexes({exams:true});}
  else if(table==="grade_items"){state.grades=state.grades.filter(x=>x.id!==id);rebuildIndexes({grades:true});}
  render();
}
function openAssignment(id){
  let x=id?state.assignments.find(a=>a.id===id):null;
  modalForm("Assignment",[
    ["title","Title","text",x?.title||""],
    ["course_id","Course","select",x?.course_id||"",state.courses.map(c=>[c.id,c.code+" — "+c.name])],
    ["due_at","Due date","date-optional-time",x?.due_at||""],
    ["assignment_type","Type","text",x?.assignment_type||"Assignment"],
    ["priority","Priority","select",x?.priority||"Normal",["Low","Normal","High","Urgent"].map(x=>[x,x])],
    ["status","Status","select",x?.status||"Not Started",["Not Started","In Progress","Complete"].map(x=>[x,x])]
  ],async v=>id?update("assignments",id,v):insert("assignments",v))
}
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
function modalForm(title,fields,onSave){
  const fieldHtml = fields.map(f=>{
    if(f[2]==="select"){
      return `<label>${esc(f[1])}<select name="${f[0]}" required><option value="">Choose…</option>${f[4].map(o=>`<option value="${esc(o[0])}" ${o[0]==f[3]?"selected":""}>${esc(o[1])}</option>`).join("")}</select></label>`;
    }
    if(f[2]==="date-optional-time"){
      const d=f[3]?new Date(f[3]):null;
      const valid=d && !Number.isNaN(d.getTime());
      const pad=n=>String(n).padStart(2,"0");
      const dateValue=valid?`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`:"";
      const timeValue=valid && (d.getHours()!==0 || d.getMinutes()!==0)?`${pad(d.getHours())}:${pad(d.getMinutes())}`:"";
      return `<label>${esc(f[1])}<div class="date-time-row"><input name="due_at_date" type="date" value="${dateValue}" required><input name="due_at_time" type="time" value="${timeValue}" aria-label="Optional due time" title="Optional due time"><span class="field-hint">time optional</span></div></label>`;
    }
    return `<label>${esc(f[1])}<input name="${f[0]}" type="${f[2]}" value="${esc(f[3])}" ${["title","course_id","due_at","starts_at","code","name"].includes(f[0])?"required":""}></label>`;
  }).join("");
  $("modal").innerHTML=`<div class="modal-box"><div class="modal-head"><h2>${title}</h2><button onclick="closeModal()">×</button></div><form id="dynamic">${fieldHtml}<div class="modal-actions"><button type="button" onclick="closeModal()">Cancel</button><button class="btn primary">Save</button></div></form></div>`;
  $("modal").classList.add("open");
  $("dynamic").onsubmit=e=>{
    e.preventDefault();
    let v=Object.fromEntries(new FormData(e.target).entries());
    if(v.due_at_date!==undefined){
      v.due_at=v.due_at_date ? new Date(`${v.due_at_date}T${v.due_at_time||"00:00"}`).toISOString() : null;
      delete v.due_at_date;
      delete v.due_at_time;
    }
    ["weight_percent","credits","points_earned","points_possible"].forEach(k=>{if(v[k]!==undefined&&v[k]!=="")v[k]=Number(v[k])});
    ["starts_at"].forEach(k=>{if(v[k])v[k]=new Date(v[k]).toISOString()});
    onSave(v);
    closeModal();
  };
}
function closeModal(){$("modal").classList.remove("open")}
function setView(v){state.view=v;render()} window.setView=setView;window.openAssignment=openAssignment;window.openExam=openExam;window.openCourse=openCourse;window.openGrade=openGrade;window.editAssignment=editAssignment;window.deleteAssignment=deleteAssignment;window.editExam=editExam;window.deleteExam=deleteExam;window.closeModal=closeModal;
document.addEventListener("click",e=>{let b=e.target.closest("[data-view]");if(b)setView(b.dataset.view);if(e.target.id==="logout")sb.auth.signOut()});
/* Project hierarchy helpers */
function assignmentChildren(items,parentId){return (items||[]).filter(a=>(a.parent_id||null)===(parentId||null)).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));}
function assignmentProgress(items,parentId){const c=assignmentChildren(items,parentId);const done=c.filter(x=>normalizeStatus(x.status)==="Complete").length;return {done,total:c.length,pct:c.length?Math.round(done/c.length*100):0};}

boot();
