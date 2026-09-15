import { 
  auth, db, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged(auth, user => {
  if (user) {
    currentUser = user;
    const savedUser = localStorage.getItem("keizoku_username") || "User";
    $("userCodeLabel").textContent = `User: ${savedUser}`;
    $("authOverlay").style.display = "none";
    subscribeUserData();
    subscribeLogs();
  } else {
    currentUser = null;
    $("authOverlay").style.display = "flex";
    if (unsubUser) unsubUser();
    if (unsubLogs) unsubLogs();
  }
});

$("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("keizoku_username");
  signOut(auth);
}); 
} from "./firebase-config.js";

const $=id=>document.getElementById(id);
const todayKey=()=>new Date().toISOString().slice(0,10);

let currentUser = null;
let currentCode = "";
let currentMonth = new Date().toISOString().slice(0,7);
let unsubUser = null;
let unsubLogs = null;

let state = {
  targets: { days: 20, hours: 20, posts: 10 },
  ideas: ["", "", "", "", ""],
  reflection: "",
  logs: {}
};

// --- 月計算 ---
function getMonthDates(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({length: last}, (_, i) => `${y}-${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

function changeMonth(diff) {
  let [y, m] = currentMonth.split("-").map(Number);
  m += diff;

  if (m > 12) {
    y += 1;
    m = 1;
  } else if (m < 1) {
    y -= 1;
    m = 12;
  }

  currentMonth = `${y}-${String(m).padStart(2, "0")}`;
  subscribeLogs();
}

// --- Firebase 連携 ---
function usernameToEmail(username) {
  // ユーザーネームを小文字に統一し、メール形式に変換
  return `${username.trim().toLowerCase()}@keizoku.app`;
}

async function handleLogin() {
  const username = $("usernameInput").value.trim();
  const pass = $("passInput").value.trim();
  $("authError").textContent = "";

  if (!username) {
    $("authError").textContent = "ユーザーネームを入力してください。";
    return;
  }
  if (!/^\d{6}$/.test(pass)) {
    $("authError").textContent = "パスワードは6桁の数字で入力してください。";
    return;
  }

  const email = usernameToEmail(username);

  try {
    // 既存ユーザーのログイン試行
    await signInWithEmailAndPassword(auth, email, pass);
    localStorage.setItem("keizoku_username", username);
  } catch (err) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      try {
        // 新規アカウント作成
        await createUserWithEmailAndPassword(auth, email, pass);
        localStorage.setItem("keizoku_username", username);
      } catch (createErr) {
        $("authError").textContent = "登録/ログインエラー: " + createErr.message;
      }
    } else {
      $("authError").textContent = "ログインエラー: " + err.message;
    }
  }
}

async function handleLogin() {
  const code = $("accessCodeInput").value.trim();
  $("authError").textContent = "";
  if (!/^\d{6}$/.test(code)) {
    $("authError").textContent = "6桁の数字を入力してください。";
    return;
  }
  
  const email = codeToEmail(code);
  const pass = codeToPassword(code);

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    localStorage.setItem("keizoku_code", code);
  } catch (err) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      try {
        await createUserWithEmailAndPassword(auth, email, pass);
        localStorage.setItem("keizoku_code", code);
      } catch (createErr) {
        $("authError").textContent = "アカウント作成に失敗しました: " + createErr.message;
      }
    } else {
      $("authError").textContent = "ログインエラー: " + err.message;
    }
  }
}

onAuthStateChanged(auth, user => {
  if (user) {
    currentUser = user;
    currentCode = localStorage.getItem("keizoku_code") || "6桁コード";
    $("userCodeLabel").textContent = `Code: ${currentCode}`;
    $("authOverlay").style.display = "none";
    subscribeUserData();
    subscribeLogs();
  } else {
    currentUser = null;
    $("authOverlay").style.display = "flex";
    if (unsubUser) unsubUser();
    if (unsubLogs) unsubLogs();
  }
});

$("loginBtn").addEventListener("click", handleLogin);
$("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("keizoku_code");
  signOut(auth);
});

// Realtime Snapshots
function subscribeUserData() {
  if (!currentUser) return;
  const userRef = doc(db, "users", currentUser.uid);
  unsubUser = onSnapshot(userRef, docSnap => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.targets) state.targets = data.targets;
      if (data.ideas) state.ideas = data.ideas;
      if (data.reflection !== undefined) state.reflection = data.reflection;
      updateUI();
    } else {
      saveUserData();
    }
  });
}

function subscribeLogs() {
  if (!currentUser) return;
  if (unsubLogs) unsubLogs();
  const logsRef = collection(db, "users", currentUser.uid, "logs");
  unsubLogs = onSnapshot(logsRef, snapshot => {
    state.logs = {};
    snapshot.forEach(doc => {
      state.logs[doc.id] = doc.data();
    });
    updateUI();
  });
}

// Firestore 保存処理
async function saveUserData() {
  if (!currentUser) return;
  await setDoc(doc(db, "users", currentUser.uid), {
    targets: state.targets,
    ideas: state.ideas,
    reflection: state.reflection,
    updatedAt: new Date()
  }, { merge: true });
}

async function saveLogData(date, logObj) {
  if (!currentUser) return;
  await setDoc(doc(db, "users", currentUser.uid, "logs", date), {
    ...logObj,
    updatedAt: new Date()
  }, { merge: true });
}

function ensureLog(date) {
  if (!state.logs[date]) {
    state.logs[date] = { task: "", minutes: 0, mode: "50", post: false, done: false };
  }
  return state.logs[date];
}

// --- UI レンダリング & イベント操作 ---
function updateUI() {
  const tKey = todayKey();
  const todayData = ensureLog(tKey);

  // Today Card
  $("task").value = todayData.task || "";
  $("minutes").value = todayData.minutes || 30;
  $("mode").value = todayData.mode || "50";
  $("reflection").value = state.reflection || "";
  
  document.querySelectorAll(".mode-pill").forEach(b => b.classList.toggle("active", b.dataset.mode === (todayData.mode || "50")));
  $("completeBtn").classList.toggle("done", !!todayData.done);
  $("completeBtn").textContent = todayData.done ? "☑ 今日の作業は完了！" : "☐ 今日の作業を完了する";
  $("todayStatus").textContent = todayData.done ? "いいね。今日の1歩は積み上がりました。" : "まだ完了していません";

  // Progress
  const dates = getMonthDates(currentMonth);
  const monthLogs = dates.map(d => state.logs[d]).filter(Boolean);
  const activeDays = monthLogs.filter(d => d.done).length;
  const minutesSum = monthLogs.reduce((s, d) => s + (Number(d.minutes) || 0), 0);
  const postsCount = monthLogs.filter(d => d.post).length;

  const dayRate = Math.min(activeDays / Math.max(1, state.targets.days), 1);
  const hourRate = Math.min((minutesSum / 60) / Math.max(1, state.targets.hours), 1);
  const postRate = Math.min(postsCount / Math.max(1, state.targets.posts), 1);
  const overall = (dayRate + hourRate + postRate) / 3;

  const [y, m] = currentMonth.split("-");
  $("monthTitle").textContent = `${y}年${Number(m)}月の進み具合`;
  $("monthPercent").textContent = Math.round(overall * 100) + "%";
  $("progressBar").style.width = Math.round(overall * 100) + "%";
  $("daysStat").textContent = activeDays;
  $("hoursStat").textContent = (minutesSum / 60).toFixed(1);
  $("postsStat").textContent = postsCount;
  $("targetDays").value = state.targets.days;
  $("targetHours").value = state.targets.hours;
  $("targetPosts").value = state.targets.posts;
  $("progressMessage").textContent = overall === 0 ? "まずは今日を1日積み上げよう。" : overall < .4 ? "いいスタート。小さく続けよう。" : overall < .8 ? "ちゃんと積み上がってる。" : "かなり進んでる。最後まで無理せずいこう。";

  renderLogsTable(dates);
  renderIdeas();
}

function renderLogsTable(dates) {
  const body = $("logBody"); 
  body.innerHTML = "";
  const tKey = todayKey();

  dates.forEach(date => {
    const d = ensureLog(date);
    const tr = document.createElement("tr");
    if (date === tKey) tr.classList.add("today");
    if (d.done) tr.classList.add("done");
    tr.innerHTML = `
      <td>${date.slice(5).replace("-", "/")}${date === tKey ? " ← 今日" : ""}</td>
      <td><input class="log-task" data-date="${date}" value="${esc(d.task)}" placeholder="やったこと"></td>
      <td><input class="log-min" data-date="${date}" type="number" min="0" value="${d.minutes || 0}"> 分</td>
      <td><select class="log-mode" data-date="${date}">
        <option value="100" ${d.mode === "100" ? "selected" : ""}>🔥 100%</option>
        <option value="50" ${d.mode === "50" ? "selected" : ""}>⚙️ 50%</option>
        <option value="10" ${d.mode === "10" ? "selected" : ""}>🐢 10%</option>
      </select></td>
      <td><input class="log-post check" data-date="${date}" type="checkbox" ${d.post ? "checked" : ""}></td>
      <td><input class="log-done check" data-date="${date}" type="checkbox" ${d.done ? "checked" : ""}></td>`;
    body.appendChild(tr);
  });

  body.querySelectorAll("input,select").forEach(el => el.addEventListener("change", e => {
    const date = e.target.dataset.date;
    const d = ensureLog(date);
    if (e.target.classList.contains("log-task")) d.task = e.target.value;
    if (e.target.classList.contains("log-min")) d.minutes = Number(e.target.value) || 0;
    if (e.target.classList.contains("log-mode")) d.mode = e.target.value;
    if (e.target.classList.contains("log-post")) d.post = e.target.checked;
    if (e.target.classList.contains("log-done")) d.done = e.target.checked;
    saveLogData(date, d);
  }));
}

function renderIdeas() {
  const wrap = $("ideas"); 
  wrap.innerHTML = "";
  while (state.ideas.length < 5) state.ideas.push("");

  state.ideas.forEach((idea, i) => {
    const row = document.createElement("div"); 
    row.className = "idea-row";
    row.innerHTML = `<input data-idea="${i}" value="${esc(idea)}" placeholder="ネタ ${i + 1}"><button class="delete-idea" data-del="${i}" type="button">×</button>`;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll("input").forEach(el => el.addEventListener("change", e => {
    state.ideas[Number(e.target.dataset.idea)] = e.target.value;
    saveUserData();
  }));
  wrap.querySelectorAll("button").forEach(el => el.addEventListener("click", e => {
    state.ideas.splice(Number(e.target.dataset.del), 1);
    state.ideas.push("");
    saveUserData();
  }));
}

function esc(s) { return String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"); }

// イベント設定
$("prevMonthBtn").addEventListener("click", () => changeMonth(-1));
$("nextMonthBtn").addEventListener("click", () => changeMonth(1));

$("task").addEventListener("change", e => {
  const d = ensureLog(todayKey());
  d.task = e.target.value;
  saveLogData(todayKey(), d);
});
$("minutes").addEventListener("change", e => {
  const d = ensureLog(todayKey());
  d.minutes = Number(e.target.value) || 0;
  saveLogData(todayKey(), d);
});
$("mode").addEventListener("change", e => {
  const d = ensureLog(todayKey());
  d.mode = e.target.value;
  saveLogData(todayKey(), d);
});
document.querySelectorAll(".mode-pill").forEach(b => b.addEventListener("click", () => {
  $("mode").value = b.dataset.mode;
  $("mode").dispatchEvent(new Event("change"));
}));
$("completeBtn").addEventListener("click", () => {
  const d = ensureLog(todayKey());
  d.done = !d.done;
  saveLogData(todayKey(), d);
});
$("reflection").addEventListener("change", e => {
  state.reflection = e.target.value;
  saveUserData();
});
["targetDays", "targetHours", "targetPosts"].forEach((id, i) => $(id).addEventListener("change", e => {
  const keys = ["days", "hours", "posts"];
  state.targets[keys[i]] = Math.max(1, Number(e.target.value) || 1);
  saveUserData();
}));
$("addIdeaBtn").addEventListener("click", () => {
  state.ideas.push("");
  renderIdeas();
  saveUserData();
});
$("todayRowBtn").addEventListener("click", () => {
  currentMonth = todayKey().slice(0, 7);
  subscribeLogs();
  setTimeout(() => document.querySelector("tr.today")?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
});

// バックアップ
$("exportBtn").addEventListener("click", () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const a = document.createElement('a');
  a.setAttribute("href", dataStr);
  a.setAttribute("download", `keizoku-dashboard-backup-${todayKey()}.json`);
  document.body.appendChild(a);
  a.click();
  a.remove();
});

$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (imported.targets) state.targets = imported.targets;
      if (imported.ideas) state.ideas = imported.ideas;
      if (imported.reflection) state.reflection = imported.reflection;
      await saveUserData();

      if (imported.logs) {
        const batch = writeBatch(db);
        Object.keys(imported.logs).forEach(date => {
          const ref = doc(db, "users", currentUser.uid, "logs", date);
          batch.set(ref, imported.logs[date]);
        });
        await batch.commit();
      }
      alert("インポートが完了しました。");
    } catch (err) {
      alert("JSONの読み込みに失敗しました: " + err.message);
    }
  };
  reader.readAsText(file);
});