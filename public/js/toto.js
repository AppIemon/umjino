// ═══════════════════════════════════════════
// toto.js – 경마 (상시) + KBO 야구 베팅
// ═══════════════════════════════════════════

// ── 경마 ────────────────────────────────────
let horseRaceId = null, horsePollTimer = null;
let horseSelectedHorses = [];
let horseBetType = 'first';

function renderHorseTab() {
  const el = document.getElementById('horseContent');
  if (!el) return;
  el.innerHTML = '<div class="toto-loading">🏇 경마 로딩 중...</div>';
  loadHorseRace();
}

async function loadHorseRace() {
  try {
    const res = await fetchT('/api/horse', null, 8000);
    const d = await res.json();
    horseRaceId = d.id;
    renderHorseRaceUI(d);
    // 폴링 항상 유지 (상시 레이스)
    clearInterval(horsePollTimer);
    horsePollTimer = setInterval(pollHorseRace, 2000);
  } catch(e) {
    const el = document.getElementById('horseContent');
    if (el) el.innerHTML = '<div class="toto-err">로드 실패. <button class="btn-secondary" onclick="renderHorseTab()" style="font-size:.8rem;margin-left:.5rem">재시도</button></div>';
  }
}

async function pollHorseRace() {
  try {
    const res = await fetchT('/api/horse', null, 5000);
    const d = await res.json();
    if (d.id !== horseRaceId) {
      horseRaceId = d.id;
      horseSelectedHorses = [];
    }
    renderHorseRaceUI(d);
  } catch(e) {}
}

function renderHorseRaceUI(d) {
  const el = document.getElementById('horseContent');
  if (!el) return;
  const now = Date.now();
  const serverOffset = d.serverTime ? (new Date(d.serverTime).getTime() - now) : 0;
  const bettingEnds = new Date(d.bettingEnds).getTime();
  const finishAt = new Date(d.finishAt).getTime();
  const isBetting = d.status === 'betting' && (now + serverOffset) < bettingEnds;
  const isRunning = d.status === 'running';
  const isFinished = d.status === 'finished';

  const betRemain = Math.max(0, Math.ceil((bettingEnds - now - serverOffset) / 1000));
  const raceRemain = Math.max(0, Math.ceil((finishAt - now - serverOffset) / 1000));

  // 상태 표시
  const statusHTML = isFinished
    ? `<span class="horse-status finished">🏁 종료</span>`
    : isBetting
    ? `<span class="horse-status betting">🎯 베팅 중 <b>${betRemain}초</b></span>`
    : `<span class="horse-status running">🏇 레이스 중 <b>${raceRemain}초</b></span>`;

  // 지난 결과
  let lastResultHTML = '';
  if (d.lastResult?.result) {
    const lr = d.lastResult;
    lastResultHTML = `<div class="horse-last-result">
      이전 결과 (${lr.distLabel}):
      ${lr.result.map((idx,i) => `<span class="horse-medal">${['🥇','🥈','🥉'][i]}${lr.horses[idx]?.name}</span>`).join(' ')}
    </div>`;
  }

  // 말 카드
  const horseCards = d.horses.map((h, i) => {
    const isSelected = horseBetType === 'first'
      ? horseSelectedHorses[0] === i
      : horseSelectedHorses.includes(i);
    const rank = horseBetType === 'rank123' ? horseSelectedHorses.indexOf(i) : -1;
    const isResult = isFinished && d.result && d.result.includes(i);
    const resultRank = isFinished && d.result ? d.result.indexOf(i) : -1;
    return `<div class="horse-card${isSelected?' selected':''}${isResult?' result-horse':''}" onclick="${isBetting ? `toggleHorsePick(${i})` : ''}">
      <div class="horse-num">${i+1}번${rank >= 0 ? ` <b style="color:#e74c3c">[${rank+1}등 선택]</b>` : ''}</div>
      <div class="horse-name">${h.name}${resultRank >= 0 ? ` ${'🥇🥈🥉'[resultRank]}` : ''}</div>
      <div class="horse-payout">×${h.payout.toFixed(2)}</div>
    </div>`;
  }).join('');

  // 베팅 패널
  const betPanel = isBetting ? `
<div class="horse-bet-panel">
  <div class="horse-bet-type">
    <button class="${horseBetType==='first'?'btn-primary':'btn-secondary'}" style="font-size:.8rem;padding:.35rem .8rem" onclick="setHorseBetType('first')">1등 맞추기</button>
    <button class="${horseBetType==='rank123'?'btn-primary':'btn-secondary'}" style="font-size:.8rem;padding:.35rem .8rem" onclick="setHorseBetType('rank123')">1·2·3등 순서</button>
  </div>
  <div class="horse-bet-hint">${horseBetHint(d.horses.length)}</div>
  <div class="horse-bet-row">
    <input class="slot-bet-inp" id="horseBetAmt" placeholder="베팅액" style="width:120px">
    <button class="btn-primary" style="font-size:.85rem" onclick="placeHorseBet('${d.id}')">베팅 🏇</button>
    <button class="btn-secondary" style="font-size:.8rem" onclick="horseSelectedHorses=[]">초기화</button>
  </div>
</div>` : isRunning ? `<div class="toto-waiting">🏇 레이스 진행 중... ${raceRemain}초</div>` : `<div class="toto-waiting">🎯 다음 베팅 대기 중...</div>`;

  el.innerHTML = `
<div class="horse-info">
  <span class="horse-dist">${d.distLabel} · ${d.numHorses}마리</span>
  ${statusHTML}
</div>
${lastResultHTML}
<div class="horse-grid">${horseCards}</div>
${betPanel}`;
}

function horseBetHint(numHorses) {
  if (horseBetType === 'first') {
    return horseSelectedHorses.length ? `선택: ${horseSelectedHorses[0]+1}번 말` : '말 1마리 선택하세요';
  }
  const need = Math.min(3, numHorses);
  return horseSelectedHorses.length < need
    ? `${horseSelectedHorses.map((i,r)=>`${r+1}등: ${i+1}번`).join(', ')} (${need-horseSelectedHorses.length}개 더 선택)`
    : `순서: ${horseSelectedHorses.slice(0,need).map((i,r)=>`${r+1}등 ${i+1}번`).join(', ')}`;
}

function toggleHorsePick(idx) {
  if (horseBetType === 'first') {
    horseSelectedHorses = [idx];
  } else {
    const i = horseSelectedHorses.indexOf(idx);
    if (i > -1) horseSelectedHorses.splice(i, 1);
    else if (horseSelectedHorses.length < 3) horseSelectedHorses.push(idx);
  }
  document.querySelectorAll('.horse-card').forEach((el, i) => {
    el.classList.toggle('selected', horseBetType === 'first'
      ? horseSelectedHorses[0] === i
      : horseSelectedHorses.includes(i));
  });
  document.querySelector('.horse-bet-hint') && (document.querySelector('.horse-bet-hint').textContent = horseBetHint());
}

function setHorseBetType(t) { horseBetType = t; horseSelectedHorses = []; }

async function placeHorseBet(raceId) {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  const need = horseBetType === 'first' ? 1 : 3;
  if (horseSelectedHorses.length < need) { alert(horseBetType==='first'?'말 1마리 선택':'1·2·3등 순서대로 3마리 선택'); return; }
  const amtStr = document.getElementById('horseBetAmt')?.value?.trim();
  let amt; try { amt = BigInt(amtStr); } catch(e) { alert('금액 입력'); return; }
  if (amt <= 0n) { alert('0보다 커야 함'); return; }
  if (amt > chips) { alert('칩 부족'); return; }
  try {
    const res = await fetchT('/api/horse', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action:'bet', nickname:sessionNickname, token:sessionToken,
        raceId, betType:horseBetType, pick:horseSelectedHorses, amount:amt.toString() }) }, 8000);
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    chips -= amt; chipDist = computeGreedyDist(chips);
    updateChipsDisplay(); updateSlotChipsDisplay();
    if(typeof saveRecentPlay==='function') saveRecentPlay({type:'🏇 경마',desc:`베팅 ${formatBig(amt)}칩`,result:'bet'});
    sfxChip();
    horseSelectedHorses = [];
  } catch(e) { alert('오류'); }
}

// ── KBO 야구 ─────────────────────────────────
let baseballGames = [], baseballPollTimer = null;

async function loadBaseballGames() {
  const el = document.getElementById('baseballContent');
  if (el) el.innerHTML = '<div class="toto-loading">⚾ KBO 실시간 데이터 로딩...</div>';
  await refreshBaseballGames();
  clearInterval(baseballPollTimer);
  baseballPollTimer = setInterval(refreshBaseballGames, 60000); // 1분마다 갱신
}

async function refreshBaseballGames() {
  try {
    const res = await fetchT('/api/baseball', null, 8000);
    baseballGames = await res.json();
    renderBaseballUI();
  } catch(e) {
    const el = document.getElementById('baseballContent');
    if (el && el.innerHTML.includes('로딩')) el.innerHTML = '<div class="toto-err">로드 실패</div>';
  }
}

function renderBaseballUI() {
  const el = document.getElementById('baseballContent');
  if (!el) return;
  if (!baseballGames.length) {
    el.innerHTML = '<div class="toto-empty">⚾ 오늘 KBO 경기 없음 (월요일 또는 시즌 오프)</div>';
    return;
  }
  el.innerHTML = baseballGames.map(g => {
    const isDone = g.status === 'finished';
    const isLive = g.status === 'in_progress';
    const canBet = g.status === 'open' || isLive;

    const resultLabel = isDone
      ? (g.result==='home'?`🏆 ${g.home} 승`:g.result==='away'?`🏆 ${g.away} 승`:'🤝 무승부')
      : '';
    const scoreHTML = (g.hscore != null && g.ascore != null)
      ? `<span class="bb-score${isLive?' live':''}">${g.hscore} : ${g.ascore}</span>`
      : '';
    const statusChip = isDone
      ? `<span class="bb-status-chip finished">종료</span>`
      : isLive
      ? `<span class="bb-status-chip live">🔴 LIVE${g.statusLabel?' '+g.statusLabel:''}</span>`
      : `<span class="bb-status-chip open">베팅 가능</span>`;

    return `<div class="baseball-card${isDone?' finished':isLive?' live-game':''}">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
    ${statusChip}
    <span style="font-size:.68rem;color:#666">${g.betCount}명 베팅</span>
  </div>
  <div class="baseball-teams">
    <span class="bb-home${g.result==='home'?' winner':''}">${g.home}</span>
    <div style="text-align:center">
      ${scoreHTML || '<span class="bb-vs">VS</span>'}
      ${isDone ? `<div class="bb-result">${resultLabel}</div>` : ''}
    </div>
    <span class="bb-away${g.result==='away'?' winner':''}">${g.away}</span>
  </div>
  ${canBet ? `
  <div class="baseball-bet-row">
    <button class="bb-pick-btn" onclick="bbSelectPick('${g.id}','home',this)">${g.home}</button>
    <button class="bb-pick-btn draw" onclick="bbSelectPick('${g.id}','draw',this)">무</button>
    <button class="bb-pick-btn" onclick="bbSelectPick('${g.id}','away',this)">${g.away}</button>
  </div>
  <div class="baseball-bet-confirm" id="bbConfirm_${g.id}" style="display:none">
    <input class="slot-bet-inp" id="bbAmt_${g.id}" placeholder="베팅액" style="width:110px">
    <button class="btn-primary" style="font-size:.82rem" onclick="placeBaseballBet('${g.id}')">베팅</button>
  </div>` : ''}
</div>`;
  }).join('');
}

let _bbPicks = {};
function bbSelectPick(gameId, pick, btn) {
  _bbPicks[gameId] = pick;
  btn.closest('.baseball-bet-row').querySelectorAll('.bb-pick-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const cf = document.getElementById('bbConfirm_'+gameId);
  if (cf) cf.style.display = 'flex';
}

async function placeBaseballBet(gameId) {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  const pick = _bbPicks[gameId];
  if (!pick) { alert('팀을 선택하세요'); return; }
  const amtStr = document.getElementById('bbAmt_'+gameId)?.value?.trim();
  let amt; try { amt = BigInt(amtStr); } catch(e) { alert('금액 입력'); return; }
  if (amt <= 0n) { alert('0보다 커야 함'); return; }
  if (amt > chips) { alert('칩 부족'); return; }
  try {
    const res = await fetchT('/api/baseball', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'bet', nickname:sessionNickname, token:sessionToken, gameId, pick, amount:amt.toString() }) }, 8000);
    const d = await res.json();
    if (!res.ok) { alert(d.error||'오류'); return; }
    chips -= amt; chipDist = computeGreedyDist(chips);
    updateChipsDisplay(); updateSlotChipsDisplay();
    sfxChip();
    alert('베팅 완료!');
    await refreshBaseballGames();
  } catch(e) { alert('오류'); }
}

function switchTotoSub(sub, btn) {
  document.querySelectorAll('#tabToto .toto-sub-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('horseSub').style.display = sub === 'horse' ? '' : 'none';
  document.getElementById('baseballSub').style.display = sub === 'baseball' ? '' : 'none';
  if (sub === 'horse') renderHorseTab();
  if (sub === 'baseball') loadBaseballGames();
}
