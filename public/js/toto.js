// ═══════════════════════════════════════════
// toto.js – 경마 + KBO 야구 베팅
// ═══════════════════════════════════════════

// ── 경마 ────────────────────────────────────
let horseRaceId = null, horsePollTimer = null, horseRaceStatus = null;
let horseSelectedHorses = [];
let horseBetType = 'first';
let horseNumHorses = 6; // 기본 6마리

function renderHorseTab() {
  const el = document.getElementById('horseContent');
  if (!el) return;
  el.innerHTML = `
<div class="horse-settings">
  <label style="color:#aaa;font-size:.82rem">말 수:</label>
  ${[2,3,4,5,6,7,8,9,10].map(n =>
    `<button class="horse-num-btn ${horseNumHorses===n?'active':''}" onclick="setHorseNum(${n})">${n}마리</button>`
  ).join('')}
</div>
<div id="horseContentInner"><div class="toto-loading">경마 정보 로딩 중...</div></div>`;
  loadHorseRace();
}

function setHorseNum(n) {
  horseNumHorses = n;
  horseRaceId = null; // 강제 새 레이스
  clearInterval(horsePollTimer); horsePollTimer = null;
  renderHorseTab();
}

async function loadHorseRace() {
  try {
    const res = await fetchT(`/api/horse?numHorses=${horseNumHorses}`, null, 8000);
    const d = await res.json();
    horseRaceId = d.id;
    horseRaceStatus = d.status;
    renderHorseRaceUI(d);
    if (d.status !== 'finished') {
      clearInterval(horsePollTimer);
      horsePollTimer = setInterval(pollHorseRace, 1500);
    }
  } catch(e) {
    const el = document.getElementById('horseContentInner') || document.getElementById('horseContent');
    if (el) el.innerHTML = '<div class="toto-err">로드 실패</div>';
  }
}

async function pollHorseRace() {
  if (!horseRaceId) return;
  try {
    const res = await fetchT('/api/horse', null, 5000);
    const d = await res.json();
    if (d.id !== horseRaceId || d.status !== horseRaceStatus) {
      horseRaceId = d.id; horseRaceStatus = d.status;
      renderHorseRaceUI(d);
      if (d.status === 'finished') { clearInterval(horsePollTimer); horsePollTimer = null; }
    } else {
      // Update countdown only
      updateHorseCountdown(d);
    }
  } catch(e) {}
}

function renderHorseRaceUI(d) {
  const el = document.getElementById('horseContentInner') || document.getElementById('horseContent');
  const now = Date.now();
  const bettingEnds = new Date(d.bettingEnds).getTime();
  const finishAt = new Date(d.finishAt).getTime();
  const isBetting = d.status === 'betting' && now < bettingEnds;
  const isRunning = d.status === 'running' || (d.status === 'betting' && now >= bettingEnds);

  let resultHTML = '';
  if (d.result) {
    resultHTML = `<div class="horse-result">
      🏁 결과: ${d.result.map((idx,i) => `${['🥇','🥈','🥉'][i]} ${d.horses[idx]?.name}`).join(' · ')}
    </div>`;
  }

  el.innerHTML = `
<div class="horse-info">
  <span class="horse-dist">${d.distLabel}</span>
  <span class="horse-status ${d.status}">${d.status==='betting'?'베팅 중':d.status==='running'?'레이스 중':'종료'}</span>
  <span id="horseCountdown" class="horse-countdown"></span>
</div>
${resultHTML}
<div class="horse-grid">
  ${d.horses.map((h, i) => `
  <div class="horse-card ${horseSelectedHorses.includes(i)?'selected':''}" onclick="toggleHorsePick(${i})">
    <div class="horse-num">${i+1}번</div>
    <div class="horse-name">${h.name}</div>
    <div class="horse-payout">배당 ×${h.payout.toFixed(2)}</div>
  </div>`).join('')}
</div>
${isBetting ? `
<div class="horse-bet-panel">
  <div class="horse-bet-type">
    <button class="${horseBetType==='first'?'btn-primary':'btn-secondary'}" onclick="setHorseBetType('first')">1등 맞추기</button>
    <button class="${horseBetType==='rank123'?'btn-primary':'btn-secondary'}" onclick="setHorseBetType('rank123')">1·2·3등 순서 맞추기</button>
  </div>
  <div class="horse-bet-hint" id="horseBetHint">${horseBetHint()}</div>
  <div class="horse-bet-row">
    <input class="slot-bet-inp" id="horseBetAmt" placeholder="베팅액" style="width:120px">
    <button class="btn-primary" onclick="placeHorseBet()">베팅</button>
    <button class="btn-secondary" onclick="horseSelectedHorses=[];renderHorseRaceUI(window._lastHorseData||{...d})">초기화</button>
  </div>
</div>` : `<div class="toto-waiting">${isRunning?'🏇 레이스 진행 중...':'레이스 대기 중...'}</div>`}
<button class="toto-refresh-btn" onclick="loadHorseRace()">새 레이스 불러오기</button>`;
  window._lastHorseData = d;
  updateHorseCountdown(d);
}

function horseBetHint() {
  if (horseBetType === 'first') return horseSelectedHorses.length ? `선택: ${horseSelectedHorses[0]+1}번 말` : '말 1마리 선택';
  return horseSelectedHorses.length < 3 ? `${horseSelectedHorses.map((i,r)=>`${['1','2','3'][r]}등: ${i+1}번`).join(', ')} (${3-horseSelectedHorses.length}개 더 선택)` : `순서: ${horseSelectedHorses.map((i,r)=>`${['1','2','3'][r]}등 ${i+1}번`).join(', ')}`;
}

function toggleHorsePick(idx) {
  if (horseBetType === 'first') { horseSelectedHorses = [idx]; }
  else {
    const i = horseSelectedHorses.indexOf(idx);
    if (i > -1) horseSelectedHorses.splice(i, 1);
    else if (horseSelectedHorses.length < 3) horseSelectedHorses.push(idx);
  }
  document.querySelectorAll('.horse-card').forEach((el, i) => el.classList.toggle('selected', horseSelectedHorses.includes(i)));
  const hint = document.getElementById('horseBetHint');
  if (hint) hint.textContent = horseBetHint();
}

function setHorseBetType(t) { horseBetType = t; horseSelectedHorses = []; if (window._lastHorseData) renderHorseRaceUI(window._lastHorseData); }

function updateHorseCountdown(d) {
  const el = document.getElementById('horseCountdown');
  if (!el) return;
  const now = Date.now();
  const target = d.status === 'betting' ? new Date(d.bettingEnds).getTime() : new Date(d.finishAt).getTime();
  const diff = Math.max(0, Math.ceil((target - now) / 1000));
  el.textContent = diff > 0 ? `${diff}초` : '';
}

async function placeHorseBet() {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  const need = horseBetType === 'first' ? 1 : 3;
  if (horseSelectedHorses.length !== need) { alert(horseBetType==='first'?'말 1마리 선택':'1·2·3등 순서대로 3마리 선택'); return; }
  const amtStr = document.getElementById('horseBetAmt')?.value?.trim();
  let amt; try { amt = BigInt(amtStr); } catch(e) { alert('금액 입력'); return; }
  if (amt <= 0n) { alert('0보다 커야 함'); return; }
  try {
    const res = await fetchT('/api/horse', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bet', nickname: sessionNickname, token: sessionToken, raceId: horseRaceId, betType: horseBetType, pick: horseSelectedHorses, amount: amt.toString() }) }, 8000);
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    chips -= amt; chipDist = computeGreedyDist(chips); updateChipsDisplay(); updateSlotChipsDisplay();
    if(typeof saveRecentPlay==="function")saveRecentPlay({type:"🏇 경마",desc:"베팅 "+formatBig(amt)+"칩",result:"bet"});
    alert('베팅 완료!'); horseSelectedHorses = [];
  } catch(e) { alert('오류'); }
}

// ── KBO 야구 ─────────────────────────────────
let baseballGames = [];

async function loadBaseballGames() {
  const el = document.getElementById('baseballContent');
  if (!el) return;
  el.innerHTML = '<div class="toto-loading">오늘의 KBO 경기 로딩...</div>';
  try {
    const res = await fetchT('/api/baseball', null, 8000);
    baseballGames = await res.json();
    renderBaseballUI();
  } catch(e) { el.innerHTML = '<div class="toto-err">로드 실패</div>'; }
}

function renderBaseballUI() {
  const el = document.getElementById('baseballContent');
  if (!el) return;
  if (!baseballGames.length) { el.innerHTML = '<div class="toto-empty">⚾ 오늘 예정 경기 없음</div>'; return; }
  el.innerHTML = baseballGames.map(g => {
    const isDone = g.status === 'finished';
    const resultLabel = isDone ? (g.result==='home'?`🏆 ${g.home} 승`:g.result==='away'?`🏆 ${g.away} 승`:'🤝 무승부') : '';
    const score = (g.hscore!=null&&g.ascore!=null) ? `<span class="bb-score">${g.hscore}:${g.ascore}</span>` : '';
    return `<div class="baseball-card${isDone?' finished':''}">
  <div class="baseball-teams">
    <span class="bb-home${g.result==='home'?' winner':''}">${g.home}</span>
    <div style="text-align:center">${score||'<span class="bb-vs">VS</span>'}${isDone?`<div class="bb-result">${resultLabel}</div>`:`<div class="bb-betcount">${g.betCount}명 참여</div>`}</div>
    <span class="bb-away${g.result==='away'?' winner':''}">${g.away}</span>
  </div>
  ${!isDone?`<div class="baseball-bet-row">
    <button class="bb-pick-btn" onclick="bbSelectPick('${g.id}','home',this)">${g.home}</button>
    <button class="bb-pick-btn draw" onclick="bbSelectPick('${g.id}','draw',this)">무</button>
    <button class="bb-pick-btn" onclick="bbSelectPick('${g.id}','away',this)">${g.away}</button>
  </div>
  <div class="baseball-bet-confirm" id="bbConfirm_${g.id}" style="display:none">
    <input class="slot-bet-inp" id="bbAmt_${g.id}" placeholder="베팅액" style="width:110px">
    <button class="btn-primary" style="font-size:.82rem" onclick="placeBaseballBet('${g.id}')">베팅</button>
  </div>`:''}
</div>`;
  }).join('');
}

let _bbPicks = {};
function bbSelectPick(gameId, pick, btn) {
  _bbPicks[gameId] = pick;
  btn.closest('.baseball-bet-row').querySelectorAll('.bb-pick-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const cf = document.getElementById('bbConfirm_'+gameId);
  if(cf) cf.style.display='flex';
}

async function placeBaseballBet(gameId) {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  const pick = _bbPicks[gameId];
  if (!pick) { alert('팀을 선택하세요'); return; }
  const amtStr = document.getElementById('bbAmt_' + gameId)?.value?.trim();
  let amt; try { amt = BigInt(amtStr); } catch(e) { alert('금액 입력'); return; }
  if (amt <= 0n) { alert('0보다 커야 함'); return; }
  try {
    const res = await fetchT('/api/baseball', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bet', nickname: sessionNickname, token: sessionToken, gameId, pick, amount: amt.toString() }) }, 8000);
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    chips -= amt; chipDist = computeGreedyDist(chips); updateChipsDisplay(); updateSlotChipsDisplay();
    alert('베팅 완료!'); loadBaseballGames();
  } catch(e) { alert('오류'); }
}
