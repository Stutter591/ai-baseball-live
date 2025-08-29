// --- 小型狀態 & 模型（示意版，不依賴外部庫） -------------------------

const state = {
  inning: 1, half: "上", // 上=away攻；下=home攻
  outs: 0,
  bases: { first: false, second: false, third: false },
  score: { away: [], home: [] }, // 逐局分
  team: { away: "Away", home: "Home" },
  timeline: [],
  lastWinProb: 0.5
};

function resetGame() {
  state.inning = 1; state.half = "上"; state.outs = 0;
  state.bases = { first:false, second:false, third:false };
  state.score = { away: [], home: [] };
  state.timeline = [];
  state.lastWinProb = 0.5;
  renderAll();
  pushEvent("比賽開始");
}

// --- 簡化事件處理 -------------------------------------------------------
const EVT_HANDLERS = {
  single(){ occupyBase(1); pushEvent("安打 1B"); },
  double(){ occupyBase(2); pushEvent("二壘安打 2B"); },
  walk(){    occupyBase(1); pushEvent("保送 BB"); },
  out(){     state.outs = Math.min(2, state.outs + 1); pushEvent("出局"); updateLabels(); }
};

function occupyBase(hit) {
  // very simplified base advancement
  const b = state.bases;
  if (hit === 2) { // 2B：所有跑者至少前進兩壘
    const runHome = (b.third?1:0) + (b.second?1:0);
    const toThird = b.first;
    state.bases = { first:false, second:true, third:toThird };
    scoreRuns(runHome);
  } else { // 1B / BB
    const runHome = b.third ? 1 : 0;
    const toThird = b.second;
    const toSecond = b.first;
    state.bases = { first:true, second:toSecond, third:toThird };
    scoreRuns(runHome);
  }
  updateLabels();
}

function scoreRuns(n) {
  if (n<=0) return;
  const arr = battingSide() === "away" ? state.score.away : state.score.home;
  while (arr.length < state.inning) arr.push(0);
  arr[state.inning-1] += n;
}

function battingSide() { return state.half === "上" ? "away" : "home"; }

// --- 半局切換 ------------------------------------------------------------
function endHalfInning() {
  pushEvent(`結束 ${state.inning} ${state.half}`);
  // 重置壘包、出局
  state.bases = { first:false, second:false, third:false };
  state.outs = 0;

  // 做「下局預測」：用簡化啟發式
  predictNext();

  // 切換半局／進位
  if (state.half === "上") state.half = "下";
  else { state.half = "上"; state.inning += 1; }

  updateLabels();
  renderScoreboard();
}

// --- 簡化下局預測（示意，用於可互動 Demo） ------------------------------
function predictNext() {
  const sumAway = state.score.away.reduce((a,b)=>a+b,0);
  const sumHome = state.score.home.reduce((a,b)=>a+b,0);
  const scoreDiff = sumAway - sumHome; // away - home
  const baseVal = (state.bases.first?0.02:0) + (state.bases.second?0.04:0) + (state.bases.third?0.06:0);
  const outsPenalty = state.outs * 0.03;
  // 以 logistic 估略：勝率偏離 50% 與當前分差/壘包/出局有關
  let winProb = 0.5 + Math.tanh(scoreDiff/2)*0.15 + baseVal - outsPenalty;
  winProb = Math.min(0.95, Math.max(0.05, winProb));

  // 預測「下局比分差」：小幅回歸均值
  const predDelta = (scoreDiff>0? -1:1) * Math.min(0.6, Math.abs(scoreDiff)*0.2 + baseVal*2 - outsPenalty);

  // UI 更新
  const nextSide = battingSide()==="away" ? state.team.away : state.team.home;
  document.getElementById("winProbNext").textContent = Math.round(winProb*100);
  document.getElementById("winProbLabel").textContent = `${nextSide} 下局勝率（示意模型）`;
  const d = (winProb - state.lastWinProb);
  const badge = document.getElementById("deltaBadge");
  badge.textContent = `變動 ${d>=0?"+":""}${d.toFixed(2)}`;
  badge.className = "badge" + (d<0 ? " down" : "");
  document.getElementById("predDelta").textContent = `${predDelta>=0?"+":""}${predDelta.toFixed(2)}`;

  state.lastWinProb = winProb;
}

// --- 事件時間軸 -----------------------------------------------------------
function pushEvent(text) {
  const t = document.getElementById("timeline");
  const li = document.createElement("li");
  li.textContent = `[${state.inning}${state.half}] ${text}`;
  t.prepend(li);
}

// --- UI 渲染 --------------------------------------------------------------
function renderScoreboard() {
  const table = document.getElementById("scoreTable");
  const tA = state.team.away, tH = state.team.home;
  const innings = Math.max(state.score.away.length, state.score.home.length, state.inning);
  const headCells = [`<th>Team</th>`].concat(
    Array.from({length:innings}, (_,i)=>`<th>${i+1}</th>`),
    [`<th>R</th>`]
  ).join("");

  const row = (name, arr) => {
    const totals = arr.reduce((a,b)=>a+b,0);
    const cells = Array.from({length:innings}, (_,i)=>`<td>${arr[i]??""}</td>`).join("");
    return `<tr><td style="text-align:left;font-weight:600">${name}</td>${cells}<td style="font-weight:700">${totals}</td></tr>`;
  };

  table.innerHTML = `<thead><tr>${headCells}</tr></thead><tbody>${
    row(tA, state.score.away) + row(tH, state.score.home)
  }</tbody>`;
}

function updateLabels() {
  document.getElementById("inningLbl").textContent = `${state.inning} ${state.half}`;
  document.getElementById("outsLbl").textContent = state.outs;
  ["first","second","third"].forEach((b,i)=>{
    const el = document.getElementById(`base${i+1}`);
    el.classList.toggle("active", !!state.bases[b]);
  });
}

function wireControls() {
  document.querySelectorAll("[data-evt]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const type = btn.getAttribute("data-evt");
      EVT_HANDLERS[type]?.();
    });
  });
  document.getElementById("endHalf").addEventListener("click", endHalfInning);
  document.getElementById("reset").addEventListener("click", resetGame);
  document.getElementById("teamAway").addEventListener("input", e=>{
    state.team.away = e.target.value || "Away"; renderScoreboard();
  });
  document.getElementById("teamHome").addEventListener("input", e=>{
    state.team.home = e.target.value || "Home"; renderScoreboard();
  });
}

function renderAll(){ renderScoreboard(); updateLabels(); }
wireControls();
resetGame(); // 初始化
