const KEY="keizoku-dashboard-v1";
const $=id=>document.getElementById(id);
const todayKey=()=>new Date().toISOString().slice(0,10);
const monthKey=()=>todayKey().slice(0,7);

const defaults=()=>({
  task:"",
  minutes:30,
  mode:"50",
  completed:false,
  reflection:"",
  targets:{days:20,hours:20,posts:10},
  ideas:["","","","",""],
  logs:{}
});

let state=JSON.parse(localStorage.getItem(KEY)||"null")||defaults();

function save(){localStorage.setItem(KEY,JSON.stringify(state)); update();}

function ensureLog(date){
  if(!state.logs[date]) state.logs[date]={task:"",minutes:0,mode:"50",post:false,done:false};
  return state.logs[date];
}

function syncTodayToLog(){
  const d=ensureLog(todayKey());
  d.task=state.task;
  d.minutes=Number(state.minutes)||0;
  d.mode=state.mode;
  d.done=state.completed;
}

function loadToday(){
  const d=ensureLog(todayKey());
  state.task=d.task||"";
  state.minutes=d.minutes||30;
  state.mode=d.mode||"50";
  state.completed=!!d.done;
  $("task").value=state.task;
  $("minutes").value=state.minutes||30;
  $("mode").value=state.mode;
  $("reflection").value=state.reflection||"";
  renderMode();
  renderStatus();
}

function renderMode(){
  document.querySelectorAll(".mode-pill").forEach(b=>b.classList.toggle("active",b.dataset.mode===state.mode));
  $("mode").value=state.mode;
}

function renderStatus(){
  $("completeBtn").classList.toggle("done",state.completed);
  $("completeBtn").textContent=state.completed?"☑ 今日の作業は完了！":"☐ 今日の作業を完了する";
  $("todayStatus").textContent=state.completed?"いいね。今日の1歩は積み上がりました。":"まだ完了していません";
}

function monthDates(){
  const [y,m]=monthKey().split("-").map(Number);
  const last=new Date(y,m,0).getDate();
  return Array.from({length:last},(_,i)=>`${y}-${String(m).padStart(2,"0")}-${String(i+1).padStart(2,"0")}`);
}

function renderLogs(){
  const body=$("logBody"); body.innerHTML="";
  monthDates().forEach(date=>{
    const d=ensureLog(date);
    const tr=document.createElement("tr");
    if(date===todayKey()) tr.classList.add("today");
    if(d.done) tr.classList.add("done");
    tr.dataset.date=date;
    tr.innerHTML=`
      <td>${date.slice(5).replace("-","/")}${date===todayKey()?" ← 今日":""}</td>
      <td><input class="log-task" data-date="${date}" value="${esc(d.task)}" placeholder="やったこと"></td>
      <td><input class="log-min" data-date="${date}" type="number" min="0" value="${d.minutes||0}"> 分</td>
      <td><select class="log-mode" data-date="${date}">
        <option value="100" ${d.mode==="100"?"selected":""}>🔥 100%</option>
        <option value="50" ${d.mode==="50"?"selected":""}>⚙️ 50%</option>
        <option value="10" ${d.mode==="10"?"selected":""}>🐢 10%</option>
      </select></td>
      <td><input class="log-post check" data-date="${date}" type="checkbox" ${d.post?"checked":""}></td>
      <td><input class="log-done check" data-date="${date}" type="checkbox" ${d.done?"checked":""}></td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll("input,select").forEach(el=>el.addEventListener("change",e=>{
    const date=e.target.dataset.date, d=ensureLog(date);
    if(e.target.classList.contains("log-task")) d.task=e.target.value;
    if(e.target.classList.contains("log-min")) d.minutes=Number(e.target.value)||0;
    if(e.target.classList.contains("log-mode")) d.mode=e.target.value;
    if(e.target.classList.contains("log-post")) d.post=e.target.checked;
    if(e.target.classList.contains("log-done")) d.done=e.target.checked;
    if(date===todayKey()){state.task=d.task;state.minutes=d.minutes;state.mode=d.mode;state.completed=d.done;loadToday();}
    save();
  }));
}

function update(){
  const dates=monthDates().map(d=>state.logs[d]).filter(Boolean);
  const active=dates.filter(d=>d.done).length;
  const minutes=dates.reduce((s,d)=>s+(Number(d.minutes)||0),0);
  const posts=dates.filter(d=>d.post).length;
  const dayRate=Math.min(active/Math.max(1,state.targets.days),1);
  const hourRate=Math.min((minutes/60)/Math.max(1,state.targets.hours),1);
  const postRate=Math.min(posts/Math.max(1,state.targets.posts),1);
  const overall=(dayRate+hourRate+postRate)/3;
  $("monthTitle").textContent=`${new Date().getMonth()+1}月の進み具合`;
  $("monthPercent").textContent=Math.round(overall*100)+"%";
  $("progressBar").style.width=Math.round(overall*100)+"%";
  $("daysStat").textContent=active;
  $("hoursStat").textContent=(minutes/60).toFixed(1);
  $("postsStat").textContent=posts;
  $("targetDays").value=state.targets.days;
  $("targetHours").value=state.targets.hours;
  $("targetPosts").value=state.targets.posts;
  $("progressMessage").textContent=overall===0?"まずは今日を1日積み上げよう。":overall<.4?"いいスタート。小さく続けよう。":overall<.8?"ちゃんと積み上がってる。":"かなり進んでる。最後まで無理せずいこう。";
  renderStatus(); renderLogs(); renderIdeas();
}

function renderIdeas(){
  const wrap=$("ideas"); wrap.innerHTML="";
  while(state.ideas.length<5) state.ideas.push("");
  state.ideas.forEach((idea,i)=>{
    const row=document.createElement("div"); row.className="idea-row";
    row.innerHTML=`<input data-idea="${i}" value="${esc(idea)}" placeholder="ネタ ${i+1}"><button class="delete-idea" data-del="${i}" type="button">×</button>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll("input").forEach(el=>el.addEventListener("input",e=>{state.ideas[Number(e.target.dataset.idea)]=e.target.value;save()}));
  wrap.querySelectorAll("button").forEach(el=>el.addEventListener("click",e=>{state.ideas.splice(Number(e.target.dataset.del),1);state.ideas.push("");save()}));
}
function esc(s){return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;")}

$("task").addEventListener("input",e=>{state.task=e.target.value;ensureLog(todayKey()).task=state.task;save()});
$("minutes").addEventListener("input",e=>{state.minutes=Number(e.target.value)||0;ensureLog(todayKey()).minutes=state.minutes;save()});
$("mode").addEventListener("change",e=>{state.mode=e.target.value;ensureLog(todayKey()).mode=state.mode;save();renderMode()});
document.querySelectorAll(".mode-pill").forEach(b=>b.addEventListener("click",()=>{$("mode").value=b.dataset.mode;$("mode").dispatchEvent(new Event("change"))}));
$("completeBtn").addEventListener("click",()=>{state.completed=!state.completed;ensureLog(todayKey()).done=state.completed;save()});
$("reflection").addEventListener("input",e=>{state.reflection=e.target.value;save()});
["targetDays","targetHours","targetPosts"].forEach((id,i)=>$(id).addEventListener("change",e=>{
  const keys=["days","hours","posts"]; state.targets[keys[i]]=Math.max(1,Number(e.target.value)||1);save();
}));
$("addIdeaBtn").addEventListener("click",()=>{state.ideas.push("");renderIdeas();save();document.querySelector("#ideas input:last-of-type")?.focus()});
$("todayRowBtn").addEventListener("click",()=>document.querySelector("tr.today")?.scrollIntoView({behavior:"smooth",block:"center"}));
$("resetBtn").addEventListener("click",()=>{if(confirm("保存したデータをすべて消します。よろしいですか？")){state=defaults();save();loadToday()}});

loadToday(); update();
