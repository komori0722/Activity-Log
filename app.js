import { 
  auth, db, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  doc, setDoc, getDoc, collection, getDocs, writeBatch 
} from "./firebase-config.js";

const $=id=>document.getElementById(id);
const todayKey=()=>new Date().toISOString().slice(0,10);

let currentUser = null;
let currentMonth = new Date().toISOString().slice(0,7);

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
  loadLogs();
}

// --- Firebase 連携 ---
function usernameToEmail(username) {
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
    await signInWithEmailAndPassword(auth, email, pass);
    localStorage.setItem("keizoku_username", username);
  } catch (err) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      try {
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

onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    const savedUser = localStorage.getItem("keizoku_username") || "User";
    $("userCodeLabel").textContent = `User: ${savedUser}`;
    $("authOverlay").style.display = "none";
    await loadUserData();
    await loadLogs();
  } else {
    currentUser = null;
    $("authOverlay").style.display = "flex";
  }
});

$("loginBtn").addEventListener("click", handleLogin);
$("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("keizoku_username");
  signOut(auth);
});

// データ取得（1回のみロード）
async function loadUserData() {
  if (!currentUser) return;
  const userRef = doc(db, "users", currentUser.uid);
  const docSnap = await getDoc(userRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    if (data.targets) state.targets = data.targets;
    if (data.ideas) state.ideas = data.ideas;
    if (data.reflection !== undefined) state.reflection = data.reflection;
  }
  updateUI();
}

async function loadLogs() {
  if (!currentUser) return;
  const logsRef = collection(db, "users", currentUser.uid, "logs");
  const snapshot = await getDocs(logsRef);
  state.logs = {};
  snapshot.forEach(doc => {
    state.logs[doc.id] = doc.data();
  });
  updateUI();
}

// 一括保存処理（保存ボタン押下時のみ実行）
async function saveAllData() {
  if (!currentUser) return;
  const saveBtn = $("saveAllBtn");
  if (saveBtn) saveBtn.textContent = "保存中...";

  try {
    // ユーザー基本情報の保存
    await setDoc(doc(db, "users", currentUser.uid), {
      targets: state.targets,
      ideas: state.ideas,
      reflection: state.reflection,
      updatedAt: new Date()
    }, { merge: true });

    // ログ情報の一括保存 (Batch処理)
    const batch = writeBatch(db);
    Object.keys(state.logs).forEach(date => {
      const logRef = doc(db, "users", currentUser.uid, "logs", date);
      batch.set(logRef, {
        ...state.logs[date],
        updatedAt: new Date()
      }, { merge: true });
    });
    await batch.commit();

    alert("すべてのデータを保存しました！");
  } catch (err) {
    alert("保存に失敗しました: " + err.message);
  } finally {
    if (saveBtn) saveBtn.textContent = "💾 変更を保存する";
  }
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

  body.querySelectorAll("input,select").forEach(el => el.addEventListener("input", e => {
    const date = e.target.dataset.date;
    const d = ensureLog(date);
    if (e.target.classList.contains("log-task")) d.task = e.target.value;
    if (e.target.classList.contains("log-min")) d.minutes = Number(e.target.value) || 0;
    if (e.target.classList.contains("log-mode")) d.mode = e.target.value;
    if (e.target.classList.contains("log-post")) d.post = e.target.checked;
    if (e.target.classList.contains("log-done")) d.done = e.target.checked;
  }));
}

function renderIdeas() {
  const wrap = $("ideas"); 
  wrap.innerHTML = "";
  
  // 初期状態で最低5行は確保する
  while (state.ideas.length < 5) state.ideas.push("");

  state.ideas.forEach((idea, i) => {
    const row = document.createElement("div"); 
    row.className = "idea-row";
    row.innerHTML = `<input data-idea="${i}" value="${esc(idea)}" placeholder="ネタ ${i + 1}"><button class="delete-idea" data-del="${i}" type="button">×</button>`;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll("input").forEach(el => {
    el.addEventListener("input", e => {
      const idx = Number(e.target.dataset.idea);
      state.ideas[idx] = e.target.value;
    });
  });

  wrap.querySelectorAll("button").forEach(el => el.addEventListener("click", e => {
    const idx = Number(e.target.dataset.del);
    // 該当の要素を削除する
    state.ideas.splice(idx, 1);
    // 削除後に画面を更新
    renderIdeas();
  }));
}

function esc(s) { return String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"); }

// イベント設定
$("prevMonthBtn").addEventListener("click", () => changeMonth(-1));
$("nextMonthBtn").addEventListener("click", () => changeMonth(1));

// 手動保存ボタン
$("saveAllBtn")?.addEventListener("click", saveAllData);

$("task").addEventListener("input", e => {
  const d = ensureLog(todayKey());
  d.task = e.target.value;
});
$("minutes").addEventListener("input", e => {
  const d = ensureLog(todayKey());
  d.minutes = Number(e.target.value) || 0;
});
$("mode").addEventListener("change", e => {
  const d = ensureLog(todayKey());
  d.mode = e.target.value;
});
document.querySelectorAll(".mode-pill").forEach(b => b.addEventListener("click", () => {
  $("mode").value = b.dataset.mode;
  $("mode").dispatchEvent(new Event("change"));
}));
$("completeBtn").addEventListener("click", () => {
  const d = ensureLog(todayKey());
  d.done = !d.done;
  updateUI();
});
$("reflection").addEventListener("input", e => {
  state.reflection = e.target.value;
});
["targetDays", "targetHours", "targetPosts"].forEach((id, i) => $(id).addEventListener("input", e => {
  const keys = ["days", "hours", "posts"];
  state.targets[keys[i]] = Math.max(1, Number(e.target.value) || 1);
}));
$("addIdeaBtn").addEventListener("click", () => {
  state.ideas.push("");
  renderIdeas();
});
$("todayRowBtn").addEventListener("click", () => {
  currentMonth = todayKey().slice(0, 7);
  loadLogs();
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
      if (imported.logs) state.logs = imported.logs;
      updateUI();
      await saveAllData();
    } catch (err) {
      alert("JSONの読み込みに失敗しました: " + err.message);
    }
  };
  reader.readAsText(file);
});