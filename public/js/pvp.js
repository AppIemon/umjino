// ═══════════════════════════════════════════
// pvp.js – 세븐포커 1:1 멀티플레이어
// 규칙: setting_bet → discard(4장→3장) → bet1 → bet2 → bet3 → showdown
// ═══════════════════════════════════════════

const MP_API = '/api/mp';
let mpPollTimer = null, mpLastState = null;

function mpFetch(action, extra) {
  return fetchT(MP_API + '?action=' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: sessionNickname, token: sessionToken, ...(extra||{}) })
  }, 8000);
}
function mpStartPolling() { mpStopPolling(); mpPollTimer = setInterval(mpPoll, 1500); }
function mpStopPolling() { if (mpPollTimer) { clearInterval(mpPollTimer); mpPollTimer = null; } }

async function mpPoll() {
  if (!sessionNickname || !sessionToken) return;
  try {
    const res = await fetchT(`${MP_API}?action=poll&nickname=${encodeURIComponent(sessionNickname)}&token=${sessionToken}`, null, 5000);
    if (!res.ok) return;
    const d = await res.json();
    mpHandleState(d);
  } catch(e) {}
}

function mpHandleState(d) {
  const area = document.getElementById('pvpGameArea');
  const content = document.getElementById('pvpContent');
  if (!area || !content) return;

  if (d.status === 'idle') {
    if (area.style.display !== 'none') {
      mpStopPolling();
      setTimeout(() => mpExit(), 2000);
      area.innerHTML = `<div class="pvp-notice warn">⚠️ 상대방이 나갔습니다. 팟이 지급됩니다.</div>`;
    }
    return;
  }
  if (d.status === 'queued') return;
  if (d.status === 'game_over') { mpStopPolling(); mpShowGameOver(d); return; }
  if (d.status === 'in_game') {
    content.style.display = 'none';
    area.style.display = 'block';
    mpRenderGame(d);
    mpLastState = d;
  }
}

// ── 카드 SVG ──────────────────────────────
function mpCardSVG(card, w, h, isOwner) {
  if (!card) return '';
  const W = 80, H = 112;
  if (!card.faceUp) {
    if (isOwner) {
      const tc = {'♠':'#aaaaff','♣':'#aaaaff','♥':'#ffaaaa','♦':'#ffaaaa'}[card.suit]||'#aaa';
      return `<svg viewBox="0 0 ${W} ${H}" style="width:${w};height:${h};border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.5);opacity:.7">
<rect width="${W}" height="${H}" rx="6" fill="#1a1a4a" stroke="#444"/>
<text x="6" y="18" font-size="12" font-weight="bold" fill="${tc}">${card.rank}</text>
<text x="6" y="30" font-size="13" fill="${tc}">${card.suit}</text>
<text x="${W/2}" y="${H/2+5}" font-size="22" fill="${tc}" text-anchor="middle">${card.suit}</text>
<rect width="${W}" height="${H}" rx="6" fill="rgba(0,0,0,.35)"/>
<text x="${W/2}" y="${H/2+5}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,.4)">🔒</text>
</svg>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" style="width:${w};height:${h};border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.5)">
<rect width="${W}" height="${H}" rx="6" fill="#1a237e" stroke="#333"/>
<rect x="5" y="5" width="${W-10}" height="${H-10}" rx="4" fill="none" stroke="rgba(255,255,255,.12)"/>
<text x="${W/2}" y="${H/2+10}" text-anchor="middle" font-size="28" fill="rgba(255,255,255,.12)">🂠</text>
</svg>`;
  }
  const c = {'♠':'#111','♣':'#111','♥':'#d32f2f','♦':'#d32f2f'}[card.suit];
  return `<svg viewBox="0 0 ${W} ${H}" style="width:${w};height:${h};border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,.4)">
<rect width="${W}" height="${H}" rx="6" fill="white" stroke="#ddd"/>
<text x="5" y="17" font-size="12" font-weight="bold" fill="${c}">${card.rank}</text>
<text x="5" y="29" font-size="13" fill="${c}">${card.suit}</text>
<text x="${W/2}" y="${H/2+8}" font-size="26" fill="${c}" text-anchor="middle">${card.suit}</text>
<text x="${W-5}" y="${H-4}" font-size="12" font-weight="bold" fill="${c}" text-anchor="end" transform="rotate(180 ${W-5} ${H-4})">${card.rank}</text>
</svg>`;
}

function mpCardsRow(cards, w, h, discardable, selectedIdx, isOwner) {
  if (!cards || !cards.length) return '<div class="pvp-no-cards">카드 없음</div>';
  return `<div class="pvp-cards-row">${cards.map((c, i) => {
    const isSel = selectedIdx === i;
    return `<div class="pvp-card-wrap${isSel?' selected':''}${discardable?' discardable':''}"
      ${discardable ? `onclick="mpSelectDiscard(${i})"` : ''}>
      ${mpCardSVG(c, w, h, isOwner)}
      ${discardable ? `<div class="pvp-discard-label">${isSel?'✓ 선택':'버리기'}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ── 게임 렌더 ──────────────────────────────
let _discardSelected = null;

function mpRenderGame(d) {
  const area = document.getElementById('pvpGameArea');
  const pot = d.pot ? shortFmt(BigInt(d.pot)) : '0';
  const base = d.baseBet ? shortFmt(BigInt(d.baseBet)) : '?';

  area.innerHTML = `
<div class="pvp-game">
  <!-- 상단 정보바 -->
  <div class="pvp-info-bar">
    <div class="pvp-player ${d.myFolded?'folded':''}">
      <div class="pvp-nick me">${escHtml(d.myNick||'나')}</div>
      <div class="pvp-chips">${d.myChips?shortFmt(BigInt(d.myChips)):'-'}칩</div>
      ${d.myFolded?'<div class="pvp-fold-tag">FOLD</div>':''}
    </div>
    <div class="pvp-pot-box">
      <div class="pvp-phase-label">${mpPhaseLabel(d.phase)}</div>
      <div class="pvp-pot">🏆 ${pot}칩</div>
      <div class="pvp-ante">앤티 ${base}칩</div>
    </div>
    <div class="pvp-player ${d.opFolded?'folded':''}" style="text-align:right">
      <div class="pvp-nick op">${escHtml(d.opNick||'상대')}</div>
      <div class="pvp-chips">${d.opChips?shortFmt(BigInt(d.opChips)):'-'}칩</div>
      ${d.opFolded?'<div class="pvp-fold-tag">FOLD</div>':''}
    </div>
  </div>

  <!-- 상대 카드 -->
  <div class="pvp-section">
    <div class="pvp-section-label op">상대 카드</div>
    ${mpCardsRow(d.opCards, '48px', '67px', false, null, false)}
  </div>

  <!-- 내 카드 -->
  <div class="pvp-section" id="pvpMySection">
    <div class="pvp-section-label me">내 카드${d.phase==='discard'&&!d.myActed?' — 버릴 카드 1장 선택':''}</div>
    <div id="pvpMyCardsRow">${mpCardsRow(d.myCards, '56px', '78px', d.phase==='discard'&&!d.myActed, _discardSelected, true)}</div>
    ${d.phase==='discard'&&!d.myActed&&_discardSelected!==null?
      `<button class="pvp-confirm-discard" onclick="mpConfirmDiscard()">✓ ${_discardSelected+1}번 카드 버리기</button>` : ''}
  </div>

  <!-- 액션 영역 -->
  <div class="pvp-action-area" id="pvpActionArea">${mpActionHTML(d)}</div>
  <div class="pvp-status" id="pvpStatus">${mpStatusLabel(d)}</div>
</div>`;
}

function mpPhaseLabel(p) {
  return { setting_bet:'앤티 설정', discard:'카드 교환', bet1:'1차 베팅', bet2:'2차 베팅', bet3:'3차 베팅', showdown:'패 공개', finished:'게임 종료' }[p] || p;
}
function mpStatusLabel(d) {
  if (d.phase==='discard') return d.myActed ? '⏳ 상대 선택 대기...' : '';
  if (['bet1','bet2','bet3'].includes(d.phase)) return d.isMyTurn ? '' : '⏳ 상대 베팅 중...';
  return '';
}

function mpActionHTML(d) {
  const { phase, isMyTurn, isSetter, myActed, roundHighBet, myRoundPaid, baseBet, pot } = d;
  const base = baseBet ? BigInt(baseBet) : 1n;
  const potBig = pot ? BigInt(pot) : 0n;

  if (phase === 'setting_bet') {
    if (isSetter) return `<div class="pvp-action-prompt">
      <p>앤티는 자동 계산됩니다 (잔액 기준)</p>
      <button class="pvp-btn primary" onclick="mpSetBaseBet()">▶ 게임 시작</button>
    </div>`;
    return `<div class="pvp-action-prompt muted">상대가 게임을 시작 중...</div>`;
  }

  if (phase === 'discard') {
    if (myActed) return `<div class="pvp-action-prompt muted">버리기 완료. 상대 대기 중...</div>`;
    return '';
  }

  if (['bet1','bet2','bet3'].includes(phase)) {
    if (!isMyTurn) return `<div class="pvp-action-prompt muted">상대 베팅 중...</div>`;
    const callNeed = (roundHighBet||0) - (myRoundPaid||0);
    const canCheck = callNeed === 0;

    const halfUnits = Math.max(1, Math.round(Number(potBig/base)/2));
    const fullUnits = Math.max(1, Number(potBig/base));

    const btn = (label, onclick, cls='') =>
      `<button class="pvp-btn ${cls}" onclick="${onclick}">${label}</button>`;

    return `<div class="pvp-bet-actions">
  <div class="pvp-bet-info">단위 ${shortFmt(base)}칩 · 팟 ${shortFmt(potBig)}칩</div>
  <div class="pvp-btn-row">
    ${canCheck
      ? btn('체크 ✓', "mpBetAction('call',0)", 'primary')
      : btn(`콜 +${callNeed}단위`, `mpBetAction('call',${callNeed})`, 'primary')}
    ${btn(`하프 +${halfUnits}단위`, `mpBetAction('raise',${halfUnits})`, 'raise')}
    ${btn(`풀 +${fullUnits}단위`, `mpBetAction('raise',${fullUnits})`, 'raise full')}
    ${btn('다이 ✗', "mpBetAction('fold',-1)", 'fold')}
  </div>
</div>`;
  }
  return '';
}

// ── 유저 인터랙션 ──────────────────────────
async function mpSetBaseBet() {
  try {
    const res = await mpFetch('set_bet', {});
    const d = await res.json();
    if (!res.ok) { alert(d.error||'오류'); return; }
    mpHandleState(d); mpLastState = d;
  } catch(e) { alert('서버 오류'); }
}

function mpSelectDiscard(idx) {
  _discardSelected = _discardSelected === idx ? null : idx;
  if (!mpLastState) return;
  document.getElementById('pvpMyCardsRow').innerHTML =
    mpCardsRow(mpLastState.myCards, '56px', '78px', true, _discardSelected, true);
  // 버리기 확인 버튼
  const existing = document.getElementById('pvpDiscardConfirm');
  if (_discardSelected !== null) {
    if (!existing) {
      const btn = document.createElement('button');
      btn.id = 'pvpDiscardConfirm'; btn.className = 'pvp-confirm-discard';
      btn.textContent = `✓ ${_discardSelected+1}번 카드 버리기`;
      btn.onclick = mpConfirmDiscard;
      btn.ontouchend = e => { e.preventDefault(); mpConfirmDiscard(); };
      document.getElementById('pvpMyCardsRow').after(btn);
    } else {
      existing.textContent = `✓ ${_discardSelected+1}번 카드 버리기`;
    }
  } else if (existing) { existing.remove(); }
}

async function mpConfirmDiscard() {
  if (_discardSelected === null) { alert('버릴 카드를 선택하세요'); return; }
  const idx = _discardSelected;
  try {
    const res = await mpFetch('discard', { discardIdx: idx });
    const d = await res.json();
    if (!res.ok) { alert(d.error||'오류'); return; }
    _discardSelected = null;
    mpHandleState(d); mpLastState = d;
  } catch(e) { alert('서버 오류'); }
}

async function mpBetAction(act, units) {
  const finalAct = (units === -1) ? 'fold' : act;
  const raiseUnits = (finalAct === 'raise' && units > 0) ? units : 1;
  try {
    const res = await mpFetch('bet_action', { betAction: finalAct, raiseUnits });
    const d = await res.json();
    if (!res.ok) { alert(d.error||'오류'); return; }
    mpHandleState(d); mpLastState = d;
  } catch(e) { alert('서버 오류'); }
}

// ── 게임 오버 ──────────────────────────────
function mpShowGameOver(d) {
  const area = document.getElementById('pvpGameArea');
  const isWin = d.winner === 'me', isTie = d.winner === 'tie';
  const color = isWin ? '#2ecc71' : isTie ? '#f1c40f' : '#e74c3c';
  const msg = isWin ? '🎉 승리!' : isTie ? '🤝 무승부' : '😢 패배';
  const pot = d.stakeAmount ? shortFmt(BigInt(d.stakeAmount)) + '칩' : '?';
  const sr = d.showdownResult || mpLastState?.showdownResult;
  const handInfo = sr && !sr.byFold && sr.p0HandName
    ? `<div class="pvp-hand-info">나: ${sr.p0HandName} / 상대: ${sr.p1HandName}</div>`
    : sr?.byFold ? `<div class="pvp-hand-info">폴드로 종료</div>` : '';
  const myCards = (d.myCards || mpLastState?.myCards || []).map(c=>({...c,faceUp:true}));
  const opCards = (d.opCards || mpLastState?.opCards || []).map(c=>({...c,faceUp:true}));

  area.innerHTML = `<div class="pvp-gameover">
  <div class="pvp-result-msg" style="color:${color}">${msg}</div>
  <div class="pvp-pot-result">팟 ${pot}</div>
  ${handInfo}
  <div class="pvp-final-cards">
    <div>
      <div class="pvp-section-label me">내 패</div>
      ${mpCardsRow(myCards,'44px','62px',false,null,true)}
    </div>
    <div>
      <div class="pvp-section-label op">상대 패</div>
      ${mpCardsRow(opCards,'44px','62px',false,null,false)}
    </div>
  </div>
  <button class="pvp-btn primary" onclick="mpExit()">나가기</button>
</div>`;

  if (isWin) sfxWin(); else if (!isTie) sfxLose();
  reloadMyChips();
}

// ── 대기실 ────────────────────────────────
async function mpJoinQueue() {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  const content = document.getElementById('pvpContent');
  content.innerHTML = `<div class="pvp-queue-box">
    <div class="loading-spinner" style="margin:0 auto 1rem"></div>
    <p style="color:#f1c40f">매칭 대기 중...</p>
    <button class="pvp-btn secondary" onclick="mpCancelQueue()" style="margin-top:.8rem">취소</button>
  </div>`;
  try {
    const res = await mpFetch('queue');
    const d = await res.json();
    if (!res.ok) {
      content.innerHTML = `<p style="color:#e74c3c">${escHtml(d.error||'오류')}</p><button class="pvp-btn primary" onclick="mpJoinQueue()">다시 시도</button>`;
      return;
    }
    if (d.status==='in_game'||d.status==='game_over') mpHandleState(d);
    mpStartPolling();
  } catch(e) {
    content.innerHTML = `<p style="color:#e74c3c">서버 연결 실패</p><button class="pvp-btn primary" onclick="mpJoinQueue()">다시 시도</button>`;
  }
}

async function mpCancelQueue() {
  mpStopPolling();
  try { await mpFetch('cancel_queue'); } catch(e) {}
  document.getElementById('pvpContent').innerHTML = `<p style="color:#aaa;margin-bottom:.9rem">취소됨</p><button class="pvp-btn primary" onclick="mpJoinQueue()">다시 매칭</button>`;
}

function mpExit() {
  mpStopPolling(); mpLastState = null; _discardSelected = null;
  const area = document.getElementById('pvpGameArea');
  const content = document.getElementById('pvpContent');
  area.style.display = 'none';
  content.style.display = 'block';
  content.innerHTML = `<p style="color:#aaa;margin-bottom:.9rem">실시간 1:1 세븐 포커</p><button class="pvp-btn primary" onclick="mpJoinQueue()">매칭 시작</button>`;
}

window.addEventListener('beforeunload', () => {
  if (sessionNickname && sessionToken && mpPollTimer) {
    try { navigator.sendBeacon(MP_API+'?action=leave', new Blob([JSON.stringify({nickname:sessionNickname,token:sessionToken})],{type:'application/json'})); } catch(e) {}
  }
});
