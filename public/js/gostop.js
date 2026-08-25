// ═══════════════════════════════════════════
// gostop.js – 고스톱(맞고) 1:1 멀티플레이 (멀티 전용, 싱글 모드 없음)
// 각자 10장 · 바닥 8장 · 7점부터 고/스톱 선택
// ═══════════════════════════════════════════

const GS_API = '/api/gostop';
let gsPollTimer = null, gsState = null, gsBusy = false;

function gsFetch(action, extra) {
  return fetchT(GS_API + '?action=' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: sessionNickname, token: sessionToken, ...(extra || {}) }),
  }, 8000);
}
function gsStartPolling() { gsStopPolling(); gsPollTimer = setInterval(gsPoll, 1500); }
function gsStopPolling() { if (gsPollTimer) { clearInterval(gsPollTimer); gsPollTimer = null; } }

async function gsPoll() {
  if (!sessionNickname || !sessionToken || gsBusy) return;
  try {
    const res = await fetchT(`${GS_API}?action=poll&nickname=${encodeURIComponent(sessionNickname)}&token=${sessionToken}`, null, 5000);
    if (!res.ok) return;
    gsApply(await res.json());
  } catch (e) {}
}

function gsApply(d) {
  if (!d) return;
  if (d.status === 'queued') return;
  if (d.status === 'idle') { if (gsState) { gsStopPolling(); gsLobby('상대가 나갔습니다.'); } return; }
  const wasOver = gsState && gsState.status === 'game_over';
  gsState = d;
  if (d.status === 'game_over') {
    gsStopPolling();
    gsRenderOver(d);
    if (!wasOver) { reloadMyChips(); (d.winner === 'me' ? sfxWin : d.winner === 'draw' ? sfxChip : sfxLose)(); }
    return;
  }
  gsRender(d);
}

function gsRoot() { return document.getElementById('gostopContent'); }

function gsLobby(msg) {
  gsState = null;
  const el = gsRoot(); if (!el) return;
  el.innerHTML = `<div class="hw-lobby">
    <div class="hw-lobby-title">🌸 고스톱</div>
    <div class="hw-lobby-sub">멀티플레이 전용 · 1:1 맞고</div>
    ${msg ? `<div class="hw-notice">${escHtml(msg)}</div>` : ''}
    <div class="hw-lobby-rules">
      <div>각자 10장, 바닥 8장으로 시작해 같은 달끼리 짝을 맞춰 먹습니다.</div>
      <div><b>7점</b>부터 고 또는 스톱을 고를 수 있습니다.</div>
      <div>판돈은 매칭 때 에스크로로 잠기고, 점수만큼만 오갑니다.</div>
    </div>
    <div class="hw-jokbo">${['오광 15','사광 4','삼광 3','비삼광 2','고도리 5','홍·청·초단 3','열끗 5장+','띠 5장+','피 10장+']
      .map(n => `<span class="hw-jokbo-chip">${n}</span>`).join('')}</div>
    <button class="pvp-btn primary" onclick="gsQueue()">매칭 시작</button>
  </div>`;
}

async function gsQueue() {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  const el = gsRoot();
  el.innerHTML = `<div class="hw-lobby"><div class="loading-spinner" style="margin:0 auto 1rem"></div>
    <p style="color:#f1c40f">상대를 찾는 중...</p>
    <button class="pvp-btn secondary" style="margin-top:.8rem" onclick="gsCancelQueue()">취소</button></div>`;
  try {
    const res = await gsFetch('queue');
    const d = await res.json();
    if (!res.ok) { gsLobby(d.error || '오류'); return; }
    gsApply(d);
    gsStartPolling();
  } catch (e) { gsLobby('서버 연결 실패'); }
}

async function gsCancelQueue() {
  gsStopPolling();
  try { await gsFetch('cancel_queue'); } catch (e) {}
  gsLobby('매칭을 취소했습니다.');
}

async function gsLeave() {
  gsStopPolling();
  try { await gsFetch('leave'); } catch (e) {}
  reloadMyChips();
  gsLobby();
}

async function gsSend(action, extra) {
  if (gsBusy) return;
  gsBusy = true;
  try {
    const res = await gsFetch(action, extra);
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    gsApply(d);
  } catch (e) { alert('서버 오류'); }
  finally { gsBusy = false; }
}

function gsPlay(cardId) {
  if (!gsState || !gsState.isMyTurn || gsState.phase !== 'playing') return;
  sfxCardFlip();
  gsSend('play', { cardId });
}
function gsChoose(fieldId) { sfxChip(); gsSend('choose', { fieldId }); }
function gsGo()   { sfxChip(); gsSend('go'); }
function gsStop() { sfxWin();  gsSend('stop'); }

// 바닥패를 달별로 묶어 배치
function gsFieldHTML(d) {
  const byMonth = {};
  d.field.forEach(c => { (byMonth[c.m] = byMonth[c.m] || []).push(c); });
  const months = Object.keys(byMonth).map(Number).sort((a, b) => a - b);
  if (!months.length) return '<div class="hw-empty">바닥이 비었습니다</div>';
  const choosing = d.phase === 'choose' && d.pending;
  const opts = choosing ? d.pending.options : [];
  return months.map(m => `<div class="hw-pile${byMonth[m].length >= 3 ? ' hot' : ''}">${
    byMonth[m].map(c => hwCardHTML(c, {
      w: 40,
      cls: opts.includes(c.id) ? 'pick' : '',
      onclick: opts.includes(c.id) ? `gsChoose('${c.id}')` : null,
    })).join('')}</div>`).join('');
}

function gsScoreBadges(p) {
  const parts = [];
  if (p.gwang) parts.push(`광${p.gwang}`);
  if (p.yeol)  parts.push(`열${p.yeol}`);
  if (p.tti)   parts.push(`띠${p.tti}`);
  if (p.pi)    parts.push(`피${p.pi}`);
  return parts.map(t => `<span class="hw-badge">${t}</span>`).join('');
}

function gsRender(d) {
  const el = gsRoot(); if (!el) return;
  const turnTxt = d.phase === 'go_choice' ? (d.isMyTurn ? '고? 스톱?' : '상대 고/스톱 선택 중')
    : d.phase === 'choose' ? (d.isMyTurn ? '먹을 패를 고르세요' : '상대 선택 중')
    : d.isMyTurn ? '내 차례' : '상대 차례';

  el.innerHTML = `<div class="hw-table gostop">
  <div class="hw-bar">
    <div class="hw-side"><div class="hw-nick op">${escHtml(d.op.nickname)}${d.op.go ? ` <span class="hw-go">${d.op.go}고</span>` : ''}</div>
      <div class="hw-sub">${d.op.score}점 · 손패 ${d.op.handCount}장</div>
      <div class="hw-badges">${gsScoreBadges(d.op)}</div></div>
    <div class="hw-pot"><div class="hw-pot-label">${turnTxt}</div>
      <div class="hw-pot-val">${d.me.score} : ${d.op.score}</div>
      <div class="hw-sub">더미 ${d.deckCount} · 점당 ${shortFmt(BigInt(d.pointValue || '0'))}</div></div>
    <div class="hw-side right"><div class="hw-nick me">${escHtml(d.me.nickname)}${d.me.go ? ` <span class="hw-go">${d.me.go}고</span>` : ''}</div>
      <div class="hw-sub">${d.me.score}점 · 손패 ${d.me.handCount}장</div>
      <div class="hw-badges">${gsScoreBadges(d.me)}</div></div>
  </div>

  <div class="hw-zone op"><div class="hw-zone-label op">상대 획득패</div>
    <div class="hw-cap">${hwCapturedHTML(d.op.captured, 24)}</div></div>

  <div class="hw-field-zone">
    <div class="hw-zone-label field">바닥${d.lastFlip ? ` <span class="hw-flip">방금 뒤집힘: ${d.lastFlip.m}월</span>` : ''}</div>
    <div class="hw-field">${gsFieldHTML(d)}</div>
  </div>

  <div class="hw-zone me"><div class="hw-zone-label me">내 획득패</div>
    <div class="hw-cap">${hwCapturedHTML(d.me.captured, 24)}</div></div>

  <div class="hw-zone hand"><div class="hw-zone-label me">내 손패${
      d.isMyTurn && d.phase === 'playing' ? ' — 낼 패를 고르세요' : ''}</div>
    <div class="hw-row hand-row">${d.myHand.map(c => hwCardHTML(c, {
      w: 46,
      cls: d.isMyTurn && d.phase === 'playing' ? 'playable' : 'idle',
      onclick: d.isMyTurn && d.phase === 'playing' ? `gsPlay('${c.id}')` : null,
    })).join('') || '<div class="hw-empty">손패 없음</div>'}</div></div>

  <div class="hw-actions">${
    d.phase === 'go_choice' && d.isMyTurn
      ? `<div class="hw-go-prompt">현재 <b>${d.me.score}점</b> — 더 갈까요?</div>
         <div class="hw-btn-row">
           <button class="pvp-btn raise" onclick="gsGo()">고! (계속)</button>
           <button class="pvp-btn primary" onclick="gsStop()">스톱 (정산)</button>
         </div>`
      : d.isMyTurn ? '' : `<div class="hw-wait">⏳ 상대 차례...</div>`}
  </div>
  <div class="hw-log">${(d.log || []).map(l => `<div>${escHtml(l)}</div>`).join('')}</div>
  <button class="hw-leave" onclick="gsLeave()">나가기 (기권)</button>
</div>`;
}

function gsRenderOver(d) {
  const el = gsRoot(); if (!el) return;
  const win = d.winner === 'me', draw = d.winner === 'draw';
  const color = win ? '#2ecc71' : draw ? '#f1c40f' : '#e74c3c';
  const s = d.settle || {};
  const reasonTxt = { chongtong: '총통!', nagari: '나가리', stop: '스톱', leave: '상대 기권', timeout: '시간 초과' }[s.reason] || '';
  const msg = draw ? '🤝 나가리 — 판돈 반환' : win ? '🎉 승리!' : '😢 패배';
  const delta = BigInt(d.myDelta || '0');
  el.innerHTML = `<div class="hw-over">
    <div class="hw-over-msg" style="color:${color}">${msg}</div>
    ${reasonTxt ? `<div class="hw-over-jok">${reasonTxt}</div>` : ''}
    ${!draw ? `<div class="hw-over-jok">${s.pts}점 × ${s.mult}배${
      (s.flags && s.flags.length) ? ` · ${s.flags.map(escHtml).join(' · ')}` : ''}</div>` : ''}
    ${(s.detail && s.detail.length) ? `<div class="hw-over-detail">${s.detail.map(escHtml).join(' / ')}</div>` : ''}
    <div class="hw-over-delta" style="color:${delta >= 0n ? '#2ecc71' : '#e74c3c'}">
      ${delta >= 0n ? '+' : '-'}${shortFmt(delta < 0n ? -delta : delta)}칩</div>
    <div class="hw-over-cards">
      <div><div class="hw-zone-label me">내 획득패</div>${hwCapturedHTML(d.me.captured, 26)}</div>
      <div><div class="hw-zone-label op">상대 획득패</div>${hwCapturedHTML(d.op.captured, 26)}</div>
    </div>
    <div class="hw-btn-row" style="margin-top:.9rem">
      <button class="pvp-btn primary" onclick="gsLeave().then(gsQueue)">다시 매칭</button>
      <button class="pvp-btn secondary" onclick="gsLeave()">나가기</button>
    </div>
  </div>`;
}

async function renderGostopUI() {
  await hwProbeImages();
  if (!gsState) {
    gsLobby();
    if (sessionNickname && sessionToken) { await gsPoll(); if (gsState) gsStartPolling(); }
  } else if (gsState.status === 'game_over') gsRenderOver(gsState);
  else gsRender(gsState);
}

window.addEventListener('beforeunload', () => {
  if (sessionNickname && sessionToken && gsPollTimer) {
    try { navigator.sendBeacon(GS_API + '?action=leave', new Blob([JSON.stringify({ nickname: sessionNickname, token: sessionToken })], { type: 'application/json' })); } catch (e) {}
  }
});
