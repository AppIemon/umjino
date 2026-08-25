// mp-gostop.js – 2인 맞고
let _gsPlayChoice = null;
let _gsDrawChoice = null;

function gsRender(d) {
  const area = document.getElementById('pvpGameArea');
  if (!area) return;
  const pot = d.pot ? shortFmt(BigInt(d.pot)) : '0';
  const events = (d.lastEvents || []).length
    ? `<div class="gs-events">${d.lastEvents.map(e=>`<span>${e}</span>`).join('')}</div>` : '';

  area.innerHTML = `
<div class="pvp-game gs-game">
  <div class="pvp-info-bar">
    <div class="pvp-player">
      <div class="pvp-nick me">${escHtml(d.myNick||'나')}</div>
      <div class="gs-score">${d.myScore||0}점${d.myGo?` · ${d.myGo}고`:''}${d.myShook?' · 흔들':''}</div>
    </div>
    <div class="pvp-pot-box">
      <div class="pvp-phase-label">${gsPhaseLabel(d)}</div>
      <div class="pvp-pot">${pot}칩</div>
      <div class="pvp-ante">덱 ${d.deckCount||0}</div>
    </div>
    <div class="pvp-player" style="text-align:right">
      <div class="pvp-nick op">${escHtml(d.opNick||'상대')}</div>
      <div class="gs-score">${d.opScore||0}점${d.opGo?` · ${d.opGo}고`:''}${d.opShook?' · 흔들':''}</div>
    </div>
  </div>

  <div class="gs-captured">
    <div class="gs-cap-label op">상대 획득</div>
    ${gsCapturedHTML(d.opCaptured)}
  </div>
  <div class="gs-op-hand">
    ${Array.from({length: d.opHandCount||0}).map(()=>hwatuBack('32px','52px')).join('')}
  </div>

  <div class="gs-field">
    <div class="gs-cap-label">바닥</div>
    <div class="gs-field-row">${(d.field||[]).map(c => {
      const play = (d.pending && (d.pending.playOptions||[]).some(o => o && o.id === c.id));
      const draw = (d.pending && (d.pending.drawOptions||[]).some(o => o && o.id === c.id));
      const which = play ? 'play' : draw ? 'draw' : '';
      return `<div class="pvp-card-wrap ${gsPendingSel(d,c)}" ${which?`onclick="gsPickChoice('${which}','${c.id}')"`:''}>${hwatuImg(c,'46px','76px')}</div>`;
    }).join('') || '<span class="pvp-no-cards">비어 있음</span>'}</div>
  </div>
  ${events}

  <div class="gs-captured">
    <div class="gs-cap-label me">내 획득 · ${escHtml((d.myScoreParts||[]).join(' · ')||'0점')}</div>
    ${gsCapturedHTML(d.myCaptured)}
  </div>
  <div class="gs-hand" id="gsMyHand">
    ${(d.myHand||[]).map((c,i) =>
      `<button class="gs-hand-card" ${d.isMyTurn&&!d.pending&&d.phase==='play'?`onclick="gsPlay(${i})"`:'disabled'}>
        ${hwatuImg(c,'56px','92px')}
      </button>`
    ).join('')}
  </div>

  <div class="pvp-action-area">${gsActionHTML(d)}</div>
</div>`;
}

function gsPhaseLabel(d) {
  if (d.phase === 'setting_bet') return '시작 대기';
  if (d.phase === 'go_stop') return d.isGoStop ? '고 or 스톱' : '상대 고/스톱';
  if (d.pending) return '바닥패 선택';
  return d.isMyTurn ? '내 차례' : '상대 차례';
}

function gsPendingSel(d, c) {
  if (!d.pending || !c) return '';
  const play = (d.pending.playOptions||[]).some(o => o && o.id === c.id);
  const draw = (d.pending.drawOptions||[]).some(o => o && o.id === c.id);
  if (play && _gsPlayChoice === c.id) return 'selected';
  if (draw && _gsDrawChoice === c.id) return 'selected';
  if (play || draw) return 'discardable';
  return '';
}

function gsCapturedHTML(cards) {
  const g = capturedGroups(cards);
  const row = (label, list) => list.length
    ? `<div class="gs-cap-group"><span>${label}</span>${list.map(c=>hwatuImg(c,'28px','46px')).join('')}</div>` : '';
  return `<div class="gs-cap-rows">
    ${row('광', g.gwang)}${row('열', g.yeol)}${row('띠', g.tti)}${row('피', g.pi)}
  </div>`;
}

function gsActionHTML(d) {
  if (d.phase === 'setting_bet') {
    if (d.isSetter) return `<div class="pvp-action-prompt">
      <p>앤티는 자동 계산됩니다</p>
      <button class="pvp-btn primary" onclick="mpSetBaseBet()">▶ 고스톱 시작</button>
    </div>`;
    return `<div class="pvp-action-prompt muted">상대가 게임을 시작 중...</div>`;
  }
  if (d.pending) {
    const needPlay = (d.pending.playOptions||[]).length > 0;
    const needDraw = (d.pending.drawOptions||[]).length > 0;
    const opts = []
      .concat(needPlay ? d.pending.playOptions.map(c => ({...c, which:'play'})) : [])
      .concat(needDraw ? d.pending.drawOptions.map(c => ({...c, which:'draw'})) : []);
    return `<div class="gs-choose">
      <div class="gs-flip-row">
        <div><div class="gs-cap-label">낸 패</div>${hwatuImg(d.pending.played,'48px','78px')}</div>
        <div><div class="gs-cap-label">뒤집은 패</div>${hwatuImg(d.pending.drawn,'48px','78px')}</div>
      </div>
      <p>같은 월이 2장입니다. ${needPlay&&needDraw?'낸 패 / 뒤집은 패 각각 ':' '}가져갈 바닥패를 고르세요</p>
      <div class="pvp-cards-row">${opts.map(c =>
        `<div class="pvp-card-wrap discardable${((c.which==='play'?_gsPlayChoice:_gsDrawChoice)===c.id)?' selected':''}"
           onclick="gsPickChoice('${c.which}','${c.id}')">${hwatuImg(c,'50px','82px')}
           <div class="pvp-discard-label">${c.which==='play'?'낸 패 짝':'뒤집은 패 짝'}</div>
         </div>`
      ).join('')}</div>
      <button class="pvp-btn primary" style="margin-top:.5rem" onclick="gsConfirmChoice()">선택 확정</button>
    </div>`;
  }
  if (d.isGoStop) {
    return `<div class="gs-gostop">
      <p>7점 이상! 계속할까요?</p>
      <div class="pvp-btn-row">
        <button class="pvp-btn raise" onclick="gsGoStop('go')">고!</button>
        <button class="pvp-btn primary" onclick="gsGoStop('stop')">스톱</button>
      </div>
    </div>`;
  }
  if (d.waitingGoStop) return `<div class="pvp-action-prompt muted">상대가 고/스톱을 선택 중...</div>`;
  if (d.phase === 'play' && !d.isMyTurn) return `<div class="pvp-action-prompt muted">상대가 패를 내는 중...</div>`;
  if (d.phase === 'play' && d.isMyTurn) return `<div class="pvp-action-prompt">손패를 눌러 바닥에 내세요</div>`;
  return '';
}

async function gsPlay(handIdx) {
  try {
    const res = await mpFetch('gs_play', { handIdx });
    const d = await res.json();
    if (!res.ok) { alert(d.error||'오류'); return; }
    _gsPlayChoice = _gsDrawChoice = null;
    mpHandleState(d); mpLastState = d;
  } catch(e) { alert('서버 오류'); }
}

function gsPickChoice(which, id) {
  if (which === 'play') _gsPlayChoice = id;
  else _gsDrawChoice = id;
  if (mpLastState) gsRender(mpLastState);
}

async function gsConfirmChoice() {
  const d = mpLastState;
  if (!d || !d.pending) return;
  const playNeed = (d.pending.playOptions||[]).length > 0;
  const drawNeed = (d.pending.drawOptions||[]).length > 0;
  if (playNeed && !_gsPlayChoice) { alert('낸 패와 짝이 될 바닥패를 고르세요'); return; }
  if (drawNeed && !_gsDrawChoice) { alert('뒤집은 패와 짝이 될 바닥패를 고르세요'); return; }
  try {
    const res = await mpFetch('gs_choose', { playId: _gsPlayChoice, drawId: _gsDrawChoice });
    const data = await res.json();
    if (!res.ok) { alert(data.error||'오류'); return; }
    _gsPlayChoice = _gsDrawChoice = null;
    mpHandleState(data); mpLastState = data;
  } catch(e) { alert('서버 오류'); }
}

async function gsGoStop(decision) {
  try {
    const res = await mpFetch('gs_gostop', { decision });
    const d = await res.json();
    if (!res.ok) { alert(d.error||'오류'); return; }
    mpHandleState(d); mpLastState = d;
  } catch(e) { alert('서버 오류'); }
}

function gsShowGameOver(d) {
  const area = document.getElementById('pvpGameArea');
  const isWin = d.winner === 'me', isTie = d.winner === 'tie';
  const color = isWin ? '#2ecc71' : isTie ? '#f1c40f' : '#e74c3c';
  const msg = isWin ? '🎉 승리!' : isTie ? '🤝 나가리' : '😢 패배';
  const pot = d.stakeAmount ? shortFmt(BigInt(d.stakeAmount)) + '칩' : '?';
  const sr = d.showdownResult || {};
  area.innerHTML = `<div class="pvp-gameover">
    <div class="pvp-result-msg" style="color:${color}">${msg}</div>
    <div class="pvp-pot-result">${pot}${sr.mult>1?` · ×${sr.mult}`:''}</div>
    <div class="pvp-hand-info">${sr.reason||''} · 나 ${d.myScore||0}점 / 상대 ${d.opScore||0}점</div>
    <div class="pvp-hand-info">${(sr.parts||d.myScoreParts||[]).join(' · ')}</div>
    <div style="width:100%">
      <div class="gs-cap-label me">내 획득</div>${gsCapturedHTML(d.myCaptured)}
      <div class="gs-cap-label op">상대 획득</div>${gsCapturedHTML(d.opCaptured)}
    </div>
    <button class="pvp-btn primary" onclick="mpExit()">나가기</button>
  </div>`;
  if (isWin) sfxWin(); else if (!isTie) sfxLose();
  if (typeof reloadMyChips==='function') reloadMyChips();
}
