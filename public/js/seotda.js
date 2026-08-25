// ═══════════════════════════════════════════
// seotda.js – 섯다 1:1 멀티플레이 (멀티 전용, 싱글 모드 없음)
// 진행: 앤티 자동 차감 → 첫 장 → 1차 베팅 → 둘째 장 → 최종 베팅 → 오픈
// ═══════════════════════════════════════════

const SD_API = '/api/seotda';
let sdPollTimer = null, sdState = null, sdBusy = false;

function sdFetch(action, extra) {
  return fetchT(SD_API + '?action=' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: sessionNickname, token: sessionToken, ...(extra || {}) }),
  }, 8000);
}
function sdStartPolling() { sdStopPolling(); sdPollTimer = setInterval(sdPoll, 1500); }
function sdStopPolling() { if (sdPollTimer) { clearInterval(sdPollTimer); sdPollTimer = null; } }

async function sdPoll() {
  if (!sessionNickname || !sessionToken || sdBusy) return;
  try {
    const res = await fetchT(`${SD_API}?action=poll&nickname=${encodeURIComponent(sessionNickname)}&token=${sessionToken}`, null, 5000);
    if (!res.ok) return;
    sdApply(await res.json());
  } catch (e) {}
}

function sdApply(d) {
  if (!d) return;
  if (d.status === 'queued') return;
  if (d.status === 'idle') { if (sdState) { sdStopPolling(); sdLobby('상대가 나갔습니다.'); } return; }
  const wasOver = sdState && sdState.status === 'game_over';
  sdState = d;
  if (d.status === 'game_over') {
    sdStopPolling();
    sdRenderOver(d);
    if (!wasOver) { reloadMyChips(); (d.winner === 'me' ? sfxWin : d.winner === 'tie' ? sfxChip : sfxLose)(); }
    return;
  }
  sdRender(d);
}

function sdRoot() { return document.getElementById('seotdaContent'); }

function sdLobby(msg) {
  sdState = null;
  const el = sdRoot(); if (!el) return;
  el.innerHTML = `<div class="hw-lobby">
    <div class="hw-lobby-title">🎴 섯다</div>
    <div class="hw-lobby-sub">멀티플레이 전용 · 1:1 실시간 대전</div>
    ${msg ? `<div class="hw-notice">${escHtml(msg)}</div>` : ''}
    <div class="hw-lobby-rules">
      <div>화투 20장(1~10월)에서 각자 두 장을 받아 족보로 겨룹니다.</div>
      <div>매칭되면 <b>판돈이 에스크로로 잠기고</b>, 끝나면 남은 몫이 그대로 돌아옵니다.</div>
    </div>
    <div class="hw-jokbo">${['38광땡','18광땡','13광땡','장땡','9땡~1땡','알리','독사','구삥','장삥','장사','세륙','갑오~망통']
      .map((n, i) => `<span class="hw-jokbo-chip"><b>${i + 1}</b>${n}</span>`).join('')}</div>
    <button class="pvp-btn primary" onclick="sdQueue()">매칭 시작</button>
  </div>`;
}

async function sdQueue() {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  const el = sdRoot();
  el.innerHTML = `<div class="hw-lobby"><div class="loading-spinner" style="margin:0 auto 1rem"></div>
    <p style="color:#f1c40f">상대를 찾는 중...</p>
    <button class="pvp-btn secondary" style="margin-top:.8rem" onclick="sdCancelQueue()">취소</button></div>`;
  try {
    const res = await sdFetch('queue');
    const d = await res.json();
    if (!res.ok) { sdLobby(d.error || '오류'); return; }
    sdApply(d);
    sdStartPolling();
  } catch (e) { sdLobby('서버 연결 실패'); }
}

async function sdCancelQueue() {
  sdStopPolling();
  try { await sdFetch('cancel_queue'); } catch (e) {}
  sdLobby('매칭을 취소했습니다.');
}

async function sdLeave() {
  sdStopPolling();
  try { await sdFetch('leave'); } catch (e) {}
  reloadMyChips();
  sdLobby();
}

async function sdAct(betAction, raiseMode) {
  if (sdBusy) return;
  sdBusy = true;
  try {
    const res = await sdFetch('bet', { betAction, raiseMode });
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    sdApply(d);
  } catch (e) { alert('서버 오류'); }
  finally { sdBusy = false; }
}

function sdRender(d) {
  const el = sdRoot(); if (!el) return;
  const pot = shortFmt(BigInt(d.pot || '0'));
  const need = BigInt(d.roundHigh || '0') - BigInt(d.myCommitted || '0');
  const phaseTxt = d.phase === 'bet1' ? '1차 베팅 (첫 장)' : d.phase === 'bet2' ? '최종 베팅 (두 장)' : '패 공개';

  const opCards = d.opCards.map((c, i) => c ? hwCardHTML(c, { w: 76 }) : hwBackHTML({ w: 76 })).join('')
    || `<div class="hw-empty">대기 중</div>`;
  const myCards = d.myCards.map(c => hwCardHTML(c, { w: 96 })).join('');

  el.innerHTML = `<div class="hw-table">
  <div class="hw-bar">
    <div class="hw-side"><div class="hw-nick op">${escHtml(d.opNick)}</div>
      <div class="hw-sub">💰 ${shortFmt(BigInt(d.opChips || '0'))} · 베팅 ${shortFmt(BigInt(d.opCommitted || '0'))}</div></div>
    <div class="hw-pot"><div class="hw-pot-label">${phaseTxt}</div><div class="hw-pot-val">🏆 ${pot}</div>
      <div class="hw-sub">앤티 ${shortFmt(BigInt(d.ante || '0'))} · 한도 ${shortFmt(BigInt(d.stake || '0'))}</div></div>
    <div class="hw-side right"><div class="hw-nick me">${escHtml(d.myNick)}</div>
      <div class="hw-sub">💰 ${shortFmt(BigInt(d.myChips || '0'))} · 베팅 ${shortFmt(BigInt(d.myCommitted || '0'))}</div></div>
  </div>

  <div class="hw-zone op"><div class="hw-zone-label op">상대 패 (${d.opCardCount}장)</div>
    <div class="hw-row">${opCards}</div></div>

  <div class="hw-zone me"><div class="hw-zone-label me">내 패${d.myHand ? ` — <b class="hw-jok">${d.myHand}</b>` : ''}</div>
    <div class="hw-row">${myCards}</div></div>

  <div class="hw-actions">${sdActionsHTML(d, need)}</div>
  <div class="hw-log">${(d.log || []).map(l => `<div>${escHtml(l)}</div>`).join('')}</div>
  <button class="hw-leave" onclick="sdLeave()">나가기 (기권)</button>
</div>`;
}

function sdActionsHTML(d, need) {
  if (!d.isMyTurn) return `<div class="hw-wait">⏳ 상대 차례...</div>`;
  const room = BigInt(d.stake || '0') - BigInt(d.myCommitted || '0');
  const b = (label, act, mode, cls) => `<button class="pvp-btn ${cls}" onclick="sdAct('${act}'${mode ? `,'${mode}'` : ''})">${label}</button>`;
  const callable = room > 0n;
  return `<div class="hw-btn-row">
    ${need > 0n
      ? b(`콜 ${shortFmt(need > room ? room : need)}`, 'call', null, 'primary')
      : b('체크', 'check', null, 'primary')}
    ${callable ? b('삥', 'raise', 'ping', 'raise') : ''}
    ${callable ? b('따당', 'raise', 'ttadang', 'raise') : ''}
    ${callable ? b('하프', 'raise', 'half', 'raise') : ''}
    ${callable ? b('풀', 'raise', 'full', 'raise full') : ''}
    ${b('다이', 'die', null, 'fold')}
  </div>`;
}

function sdRenderOver(d) {
  const el = sdRoot(); if (!el) return;
  const win = d.winner === 'me', tie = d.winner === 'tie';
  const color = win ? '#2ecc71' : tie ? '#f1c40f' : '#e74c3c';
  const msg = win ? '🎉 승리!' : tie ? '🤝 무승부' : '😢 패배';
  const delta = BigInt(d.myDelta || '0');
  const sd = d.showdown;
  el.innerHTML = `<div class="hw-over">
    <div class="hw-over-msg" style="color:${color}">${msg}</div>
    <div class="hw-over-delta" style="color:${delta >= 0n ? '#2ecc71' : '#e74c3c'}">
      ${delta >= 0n ? '+' : '-'}${shortFmt(delta < 0n ? -delta : delta)}칩</div>
    ${sd ? `<div class="hw-over-jok">${escHtml(sd.p0)} vs ${escHtml(sd.p1)}</div>` : ''}
    <div class="hw-over-cards">
      <div><div class="hw-zone-label me">내 패</div><div class="hw-row">${d.myCards.map(c => hwCardHTML(c, { w: 78 })).join('')}</div></div>
      <div><div class="hw-zone-label op">상대 패</div><div class="hw-row">${(d.opCards || []).filter(Boolean).map(c => hwCardHTML(c, { w: 78 })).join('') || '<div class="hw-empty">다이</div>'}</div></div>
    </div>
    <div class="hw-btn-row" style="margin-top:.9rem">
      <button class="pvp-btn primary" onclick="sdLeave().then(sdQueue)">다시 매칭</button>
      <button class="pvp-btn secondary" onclick="sdLeave()">나가기</button>
    </div>
  </div>`;
}

async function renderSeotdaUI() {
  await hwProbeImages();
  if (!sdState) {
    sdLobby();
    // 진행 중이던 판이 있으면 복구
    if (sessionNickname && sessionToken) { await sdPoll(); if (sdState) sdStartPolling(); }
  } else if (sdState.status === 'game_over') sdRenderOver(sdState);
  else sdRender(sdState);
}

window.addEventListener('beforeunload', () => {
  if (sessionNickname && sessionToken && sdPollTimer) {
    try { navigator.sendBeacon(SD_API + '?action=leave', new Blob([JSON.stringify({ nickname: sessionNickname, token: sessionToken })], { type: 'application/json' })); } catch (e) {}
  }
});
