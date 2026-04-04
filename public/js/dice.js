// ═══════════════════════════════════════════
// dice.js – 주사위 게임
// ═══════════════════════════════════════════
let diceBetType = 'parity', diceGuess = 'odd';

function renderDiceUI() {
  const el = document.getElementById('diceContent');
  if (!el) return;
  el.innerHTML = `
<div class="dice-panel">
  <div id="diceDisplay" class="dice-face">🎲</div>
  <div class="dice-bet-types">
    <button class="${diceBetType==='parity'?'btn-primary':'btn-secondary'}" onclick="setDiceBetType('parity')">홀짝 (×2)</button>
    <button class="${diceBetType==='exact'?'btn-primary':'btn-secondary'}" onclick="setDiceBetType('exact')">숫자 맞추기 (×7)</button>
  </div>
  <div class="dice-guess-row" id="diceGuessRow">${renderDiceGuessRow()}</div>
  <div class="dice-bet-row">
    <input class="slot-bet-inp" id="diceBetAmt" placeholder="베팅액">
    <button class="btn-primary" id="diceRollBtn" onclick="rollDice()">굴리기 🎲</button>
  </div>
  <div id="diceResult" class="dice-result"></div>
</div>`;
}

function renderDiceGuessRow() {
  if (diceBetType === 'parity') {
    return `<button class="${diceGuess==='odd'?'btn-primary':'btn-secondary'}" onclick="setDiceGuess('odd')">홀수</button>
            <button class="${diceGuess==='even'?'btn-primary':'btn-secondary'}" onclick="setDiceGuess('even')">짝수</button>`;
  }
  return [1,2,3,4,5,6].map(n =>
    `<button class="dice-num-btn ${diceGuess==n?'active':''}" onclick="setDiceGuess(${n})">${n}</button>`
  ).join('');
}

function setDiceBetType(t) { diceBetType = t; diceGuess = t === 'parity' ? 'odd' : 1; renderDiceUI(); }
function setDiceGuess(g) {
  diceGuess = g;
  document.getElementById('diceGuessRow').innerHTML = renderDiceGuessRow();
}

const DICE_FACES = ['','⚀','⚁','⚂','⚃','⚄','⚅'];

async function rollDice() {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  const amtStr = document.getElementById('diceBetAmt')?.value?.trim();
  let amt; try { amt = BigInt(amtStr); } catch(e) { alert('금액 입력'); return; }
  if (amt <= 0n) { alert('0보다 커야 함'); return; }
  if (amt > chips) { alert('칩 부족'); return; }

  const btn = document.getElementById('diceRollBtn'); btn.disabled = true;
  const display = document.getElementById('diceDisplay');

  // Spin animation
  let spins = 0;
  const iv = setInterval(() => {
    display.textContent = DICE_FACES[Math.floor(Math.random()*6)+1];
    if (++spins > 12) clearInterval(iv);
  }, 80);

  try {
    const res = await fetchT('/api/dice', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: sessionNickname, token: sessionToken, betType: diceBetType, guess: diceGuess, amount: amt.toString() }) }, 8000);
    const d = await res.json();

    await new Promise(r => setTimeout(r, 900));
    clearInterval(iv);
    display.textContent = DICE_FACES[d.roll] || '🎲';
    display.style.animation = 'diceBounce .4s ease';
    setTimeout(() => display.style.animation = '', 400);

    if (!res.ok) { document.getElementById('diceResult').textContent = d.error; btn.disabled = false; return; }

    chips = BigInt(d.newChips); chipDist = computeGreedyDist(chips);
    updateChipsDisplay(); updateSlotChipsDisplay();

    const result = document.getElementById('diceResult');
    if (d.won) {
      result.textContent = `🎉 당첨! +${shortFmt(BigInt(d.payout))}칩`;
      result.style.color = '#2ecc71'; sfxWin();
      if(typeof saveRecentPlay==='function')saveRecentPlay({type:'🎲 주사위',desc:(diceBetType==='exact'?d.roll+'이 나옴':'홀짝 적중')+' +'+shortFmt(BigInt(d.payout))+'칩',result:'win'});
    } else {
      result.textContent = `😢 꽝! (${d.roll}이 나왔습니다)`;
      result.style.color = '#e74c3c'; sfxLose();
      if(typeof saveRecentPlay==='function')saveRecentPlay({type:'🎲 주사위',desc:d.roll+'이 나옴 꽝',result:'lose'});
    }
    saveState();
  } catch(e) { document.getElementById('diceResult').textContent = '오류 발생'; }
  btn.disabled = false;
}
