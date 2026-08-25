// mp-sutda.js – 1:1 섯다
function sdRender(d) {
  const area = document.getElementById('pvpGameArea');
  if (!area) return;
  const pot = d.pot ? shortFmt(BigInt(d.pot)) : '0';
  const base = d.baseBet ? shortFmt(BigInt(d.baseBet)) : '?';
  const rematch = d.showdownResult?.rematch
    ? `<div class="pvp-notice warn" style="margin-bottom:.4rem">🔄 재경기 (구사 또는 동점)</div>` : '';

  area.innerHTML = `
<div class="pvp-game sutda-game">
  ${rematch}
  <div class="pvp-info-bar">
    <div class="pvp-player ${d.myFolded?'folded':''}">
      <div class="pvp-nick me">${escHtml(d.myNick||'나')}</div>
      <div class="pvp-chips">${d.myChips?shortFmt(BigInt(d.myChips)):'-'}칩</div>
    </div>
    <div class="pvp-pot-box">
      <div class="pvp-phase-label">${sdPhaseLabel(d.phase)}</div>
      <div class="pvp-pot">🏆 ${pot}칩</div>
      <div class="pvp-ante">판돈 ${base}칩</div>
    </div>
    <div class="pvp-player ${d.opFolded?'folded':''}" style="text-align:right">
      <div class="pvp-nick op">${escHtml(d.opNick||'상대')}</div>
      <div class="pvp-chips">${d.opChips?shortFmt(BigInt(d.opChips)):'-'}칩</div>
    </div>
  </div>
  <div class="pvp-section">
    <div class="pvp-section-label op">상대 패</div>
    ${sdCardsRow(d.opCards, '58px', '96px')}
  </div>
  <div class="pvp-section">
    <div class="pvp-section-label me">내 패</div>
    ${sdCardsRow(d.myCards, '72px', '118px')}
  </div>
  <div class="pvp-action-area">${typeof mpActionHTML==='function'?mpActionHTML(d):''}</div>
  <div class="pvp-status">${d.phase==='bet1'?(d.isMyTurn?'':'⏳ 상대 베팅 중...'):''}</div>
</div>`;
}

function sdPhaseLabel(p) {
  return { setting_bet:'앤티 설정', bet1:'베팅', showdown:'패 공개', finished:'종료' }[p] || p;
}

function sdCardsRow(cards, w, h) {
  if (!cards || !cards.length) return '<div class="pvp-no-cards">카드 없음</div>';
  return `<div class="pvp-cards-row hwatu-row">${cards.map(c =>
    `<div class="pvp-card-wrap">${hwatuImg(c, w, h)}</div>`
  ).join('')}</div>`;
}

function sdShowGameOver(d) {
  const area = document.getElementById('pvpGameArea');
  const isWin = d.winner === 'me', isTie = d.winner === 'tie';
  const color = isWin ? '#2ecc71' : isTie ? '#f1c40f' : '#e74c3c';
  const msg = isWin ? '🎉 승리!' : isTie ? '🤝 무승부' : '😢 패배';
  const pot = d.stakeAmount ? shortFmt(BigInt(d.stakeAmount)) + '칩' : '?';
  const myCards = (d.myCards || []).map(c => ({...c, faceUp:true}));
  const opCards = (d.opCards || []).map(c => ({...c, faceUp:true}));
  area.innerHTML = `<div class="pvp-gameover">
    <div class="pvp-result-msg" style="color:${color}">${msg}</div>
    <div class="pvp-pot-result">팟 ${pot}</div>
    <div class="pvp-hand-info">${d.myHandName||''} vs ${d.opHandName||''}</div>
    <div class="pvp-final-cards">
      <div><div class="pvp-section-label me">내 패</div>${sdCardsRow(myCards,'52px','86px')}</div>
      <div><div class="pvp-section-label op">상대 패</div>${sdCardsRow(opCards,'52px','86px')}</div>
    </div>
    <button class="pvp-btn primary" onclick="mpExit()">나가기</button>
  </div>`;
  if (isWin) sfxWin(); else if (!isTie) sfxLose();
  if (typeof reloadMyChips==='function') reloadMyChips();
}
