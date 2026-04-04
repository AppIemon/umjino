// ═══════════════════════════════════════════
// chip_input.js – 토큰 클릭 베팅 위젯 (공용)
// ═══════════════════════════════════════════
// 사용법: renderChipInput('containerId', { label, onSpin, onClear })
// 현재 금액: chipInputGet('containerId')

const _cipState = {}; // containerId → { bet: BigInt, betDist: {} }

function chipInputGet(id) {
  return _cipState[id]?.bet || 0n;
}

function chipInputClear(id) {
  const s = _cipState[id];
  if (!s) return;
  if (s.bet > 0n) { chips += s.bet; chipDist = computeGreedyDist(chips); }
  s.bet = 0n; s.betDist = {};
  _cipRender(id);
  updateChipsDisplay();
}

function chipInputThrow(id, chip, e) {
  const s = _cipState[id] || ((_cipState[id] = { bet: 0n, betDist: {} }));
  if (chip.value > chips) return;
  const k = chip.value.toString();
  if ((chipDist[k] || 0n) === 0n) { if (!makeChange(chip.idx)) return; }
  chipDist[k] = (chipDist[k] || 0n) - 1n;
  chips -= chip.value; s.bet += chip.value;
  s.betDist[k] = (s.betDist[k] || 0n) + 1n;
  sfxChip(); saveState();
  _cipAnimToken(id, chip, e);
  _cipRender(id);
  updateChipsDisplay();
}

function _cipAnimToken(id, chip, e) {
  const bz = document.getElementById('cipZone_' + id);
  if (!bz) return;
  const bRect = bz.getBoundingClientRect();
  const cx = (e?.clientX || window.innerWidth/2) - 27;
  const cy = (e?.clientY || bRect.top - 30) - 27;
  const fly = document.createElement('div'); fly.className = 'flying-token';
  fly.innerHTML = createChipSVG(chip); fly.style.cssText = `width:54px;height:54px;left:${cx}px;top:${cy}px`;
  document.body.appendChild(fly);
  const ex = bRect.left + bRect.width/2 - 27 + (Math.random()-.5)*50;
  const ey = bRect.top + bRect.height/2 - 27 + (Math.random()-.5)*28;
  setTimeout(() => { fly.style.cssText += `;left:${ex}px;top:${ey}px;transform:rotate(${Math.random()*720}deg);transition:all .5s cubic-bezier(.25,.46,.45,.94)`; }, 10);
  setTimeout(() => {
    fly.remove();
    const bt = document.createElement('div'); bt.className = 'bet-token';
    bt.innerHTML = createChipSVG(chip); bt.style.cssText = `width:42px;height:42px;left:${ex-bRect.left}px;top:${ey-bRect.top}px`;
    bz.appendChild(bt);
  }, 510);
}

function _cipRender(id) {
  const s = _cipState[id];
  const amtEl = document.getElementById('cipAmt_' + id);
  if (amtEl) amtEl.textContent = s?.bet > 0n ? formatBig(s.bet) + '칩' : '0';
  // 칩 스택 다시 그리기
  const row = document.getElementById('cipChips_' + id);
  if (!row) return;
  row.innerHTML = '';
  getDisplayChips().forEach(({ chip, cnt }) => {
    row.appendChild(_makeChipStack(chip, cnt, (c, e) => chipInputThrow(id, c, e)));
  });
}

function renderChipInput(id, opts = {}) {
  _cipState[id] = { bet: 0n, betDist: {} };
  const label = opts.label || '베팅';
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `
<div class="cip-wrap">
  <div class="cip-chips-scroll"><div class="chips-container" id="cipChips_${id}"></div></div>
  <div class="cip-zone-row">
    <div class="cip-zone" id="cipZone_${id}">
      <div class="cip-zone-label">${label}</div>
      <div class="cip-amt" id="cipAmt_${id}">0</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:.3rem">
      ${opts.spinBtn !== false ? `<button class="btn-primary cip-spin-btn" id="cipSpin_${id}" onclick="${opts.onSpin||''}">확인</button>` : ''}
      <button class="slot-clear-btn" onclick="chipInputClear('${id}')">취소</button>
    </div>
  </div>
</div>`;
  _cipRender(id);
}

// 칩 업데이트 시 모든 cip 위젯 갱신
function updateAllChipInputs() {
  for (const id of Object.keys(_cipState)) {
    _cipRender(id);
  }
}
