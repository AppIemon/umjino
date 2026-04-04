// ═══════════════════════════════════════════
// slot.js – 5×3 parallel slot machines
// 기댓값 ~1.25, 가로 연속만 인정
// ═══════════════════════════════════════════

const SLOT_SYMS = ['🍒','🍋','🍇','🔔','⭐','💎','7️⃣'];

// 확률 가중치 — 더 자주 이기도록 상향
const SLOT_WEIGHTS = [32, 25, 18, 13, 7, 4, 1]; // 합=100, 7️⃣ 매우 희귀
const WEIGHT_TOTAL = SLOT_WEIGHTS.reduce((a,b)=>a+b,0);

// 배당 EV ~1.25: 자주 터지는 작은 배당 + 가끔 대박
const SLOT_PAY = {
  3: {'🍒':3,'🍋':4,'🍇':6,'🔔':10,'⭐':16,'💎':30,'7️⃣':60},
  4: {'🍒':10,'🍋':15,'🍇':25,'🔔':42,'⭐':70,'💎':140,'7️⃣':280},
  5: {'🍒':30,'🍋':48,'🍇':80,'🔔':140,'⭐':240,'💎':480,'7️⃣':1000},
};

// 가로 3줄만
const SLOT_WIN_LINES = [
  [0,3,6,9,12],   // top row
  [1,4,7,10,13],  // middle row
  [2,5,8,11,14],  // bottom row
];

// 슬롯 추가 가격표: 첫 번째 100, 두 번째 1000, 세 번째 10000, ...
function slotAddCost(currentCount) {
  // currentCount = 현재 보유 대수 (기본 1대는 무료)
  // 추가 1번째: 100, 2번째: 1000, 3번째: 10000, ...
  return pow10(2 + (currentCount - 1)); // 10^(2+n-1)
}

let slotMachines = [], _slotId = 0;
let slotBet = 0n;       // 현재 베팅 금액
let slotBetDist = {};   // 베팅에 사용된 칩 분포 (환불용)

function createSlotMachineData() {
  return { id: _slotId++, busy: false, grid: Array(15).fill('🍒') };
}

function initSlot() {
  if (slotMachines.length === 0) slotMachines.push(createSlotMachineData());
  renderSlotMachines();
}

function addSlotMachine() {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  const cost = slotAddCost(slotMachines.length);
  if (chips < cost) { alert('칩 부족! 필요: ' + formatBig(cost) + '칩'); return; }
  if (!confirm(formatBig(cost) + '칩을 사용해 슬롯머신을 추가하시겠습니까?')) return;
  chips -= cost; chipDist = computeGreedyDist(chips);
  slotMachines.push(createSlotMachineData());
  updateChipsDisplay(); updateSlotChipsDisplay(); saveState();
  renderSlotMachines();
}

function removeSlotMachine(id) {
  if (slotMachines.length <= 1) { alert('최소 1대는 있어야 합니다'); return; }
  const i = slotMachines.findIndex(m => m.id === id);
  if (i > -1) slotMachines.splice(i, 1);
  renderSlotMachines();
}

// ── 슬롯 칩 던지기 ─────────────────────────────
function slotThrowChip(chip, e) {
  if (chip.value > chips) return;
  const key = chip.value.toString();
  if((chipDist[key]||0n)===0n){if(!makeChange(chip.idx))return;}
  chipDist[key] = (chipDist[key] || 0n) - 1n;
  chips -= chip.value; slotBet += chip.value;
  slotBetDist[key] = (slotBetDist[key] || 0n) + 1n;
  sfxChip();

  // 토큰 던지기 모션 → 베팅존
  const bz = document.getElementById('slotBetZone');
  if (bz) {
    const bRect = bz.getBoundingClientRect();
    const cx = (e?.clientX || window.innerWidth/2) - 27;
    const cy = (e?.clientY || window.innerHeight*0.8) - 27;
    const fly = document.createElement('div'); fly.className = 'flying-token';
    fly.innerHTML = createChipSVG(chip);
    fly.style.cssText = `width:54px;height:54px;left:${cx}px;top:${cy}px`;
    document.body.appendChild(fly);
    const ex = bRect.left + bRect.width/2 - 27 + (Math.random()-.5)*60;
    const ey = bRect.top + bRect.height/2 - 27 + (Math.random()-.5)*30;
    setTimeout(() => { fly.style.cssText += `;left:${ex}px;top:${ey}px;transform:rotate(${Math.random()*720}deg);transition:all .55s cubic-bezier(.25,.46,.45,.94)`; }, 10);
    setTimeout(() => {
      fly.remove();
      const bt = document.createElement('div'); bt.className = 'bet-token';
      bt.innerHTML = createChipSVG(chip);
      bt.style.cssText = `width:44px;height:44px;left:${ex - bRect.left}px;top:${ey - bRect.top}px`;
      bz.appendChild(bt);
    }, 550);
  }
  updateChipsDisplay(); updateSlotBetDisplay(); saveState();
}

function slotClearBet() {
  chips += slotBet; slotBet = 0n; slotBetDist = {};
  chipDist = computeGreedyDist(chips);
  const bz = document.getElementById('slotBetZone');
  if (bz) bz.querySelectorAll('.bet-token').forEach(t => t.remove());
  updateChipsDisplay(); updateSlotBetDisplay(); saveState();
}

function updateSlotBetDisplay() {
  const el = document.getElementById('slotBetAmt');
  if (el) el.textContent = slotBet > 0n ? formatBig(slotBet) + '칩' : '0';
  const el2 = document.getElementById('slotMyChips2');
  if (el2) el2.textContent = shortFmt(chips) + '칩';
  // 칩 스택 업데이트
  renderSlotChipStacks();
}

function renderSlotChipStacks() {
  const container = document.getElementById('slotChipStacks');
  if (!container) return;
  container.innerHTML = '';
  for (let i = chipTypes.length - 1; i >= 0; i--) {
    const chip = chipTypes[i];
    const cnt = chipDist[chip.value.toString()] || 0n;
    if (cnt <= 0n) continue;
    const stack = document.createElement('div');
    stack.className = 'chip-stack';
    stack.innerHTML = createChipSVG(chip);
    stack.title = formatBig(chip.value) + ' × ' + cnt;
    if (cnt > 1n) {
      const badge = document.createElement('div');
      badge.className = 'chip-count';
      badge.textContent = cnt > 99n ? '99+' : cnt.toString();
      stack.appendChild(badge);
    }
    stack.onclick = (e) => slotThrowChip(chip, e);
    container.appendChild(stack);
  }
}

function renderSlotMachines() {
  const area = document.getElementById('slotMachinesArea');
  area.innerHTML = '';

  // 공유 컨트롤 (맨 위)
  const ctrl = document.createElement('div');
  ctrl.className = 'slot-shared-ctrl';
  const nextCost = slotAddCost(slotMachines.length);
  ctrl.innerHTML = `
<div class="slot-shared-row">
  <div class="slot-chip-label">💰 <span id="slotMyChips2">${shortFmt(chips)}칩</span></div>
  <button class="slot-add-btn" onclick="addSlotMachine()" title="슬롯머신 추가 (${formatBig(nextCost)}칩)">➕ ${formatBig(nextCost)}칩</button>
</div>
<div class="slot-bet-row">
  <div class="slot-chip-scroll"><div class="chips-container" id="slotChipStacks"></div></div>
  <div class="slot-bet-zone" id="slotBetZone">
    <div class="slot-bet-label">베팅</div>
    <div class="slot-bet-amount" id="slotBetAmt">0</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:.35rem;flex-shrink:0">
    <button class="slot-spin-btn" id="slotSpinAllBtn" onclick="spinAll()">스핀! 🎰</button>
    <button class="slot-clear-btn" onclick="slotClearBet()">취소</button>
  </div>
</div>`;
  area.appendChild(ctrl);

  // 슬롯들
  slotMachines.forEach(m => {
    const div = document.createElement('div');
    div.className = 'slot-machine'; div.id = 'sm' + m.id;
    const gridHTML = Array(15).fill(0).map((_,i) =>
      `<div class="slot-cell" id="smCell${m.id}_${i}">${m.grid[i]}</div>`).join('');
    div.innerHTML = `
<div class="slot-machine-hdr">
  <span class="slot-machine-name">🎰 슬롯 #${slotMachines.indexOf(m)+1}</span>
  ${slotMachines.length > 1 ? `<button class="slot-close-btn" onclick="removeSlotMachine(${m.id})">✕</button>` : ''}
</div>
<div class="slot-grid" id="smGrid${m.id}">${gridHTML}</div>
<div class="slot-winlines" id="smWL${m.id}"></div>
<div class="slot-result-msg" id="smResult${m.id}"></div>
<div class="slot-paytable-mini">
  <div class="spm-sym">7️⃣ ×3/4/5</div><div class="spm-val">×${SLOT_PAY[3]['7️⃣']}/${SLOT_PAY[4]['7️⃣']}/${SLOT_PAY[5]['7️⃣']}</div>
  <div class="spm-sym">💎 ×3/4/5</div><div class="spm-val">×${SLOT_PAY[3]['💎']}/${SLOT_PAY[4]['💎']}/${SLOT_PAY[5]['💎']}</div>
  <div class="spm-sym">⭐ ×3/4/5</div><div class="spm-val">×${SLOT_PAY[3]['⭐']}/${SLOT_PAY[4]['⭐']}/${SLOT_PAY[5]['⭐']}</div>
  <div class="spm-sym">🔔 ×3/4/5</div><div class="spm-val">×${SLOT_PAY[3]['🔔']}/${SLOT_PAY[4]['🔔']}/${SLOT_PAY[5]['🔔']}</div>
  <div class="spm-sym">🍇 ×3/4/5</div><div class="spm-val">×${SLOT_PAY[3]['🍇']}/${SLOT_PAY[4]['🍇']}/${SLOT_PAY[5]['🍇']}</div>
  <div class="spm-sym">🍋 ×3/4/5</div><div class="spm-val">×${SLOT_PAY[3]['🍋']}/${SLOT_PAY[4]['🍋']}/${SLOT_PAY[5]['🍋']}</div>
  <div class="spm-sym">🍒 ×3/4/5</div><div class="spm-val">×${SLOT_PAY[3]['🍒']}/${SLOT_PAY[4]['🍒']}/${SLOT_PAY[5]['🍒']}</div>
</div>`;
    area.appendChild(div);
  });
  renderSlotChipStacks();
  updateSlotBetDisplay();
}
// ── 가중 랜덤 ────────────────────────────────
function weightedSym() {
  let r = Math.floor(Math.random() * WEIGHT_TOTAL);
  for (let i = 0; i < SLOT_SYMS.length; i++) {
    r -= SLOT_WEIGHTS[i]; if (r < 0) return SLOT_SYMS[i];
  }
  return SLOT_SYMS[0];
}

// ── Grid evaluation (가로 연속만) ────────────
function evalSlotGrid(grid) {
  const lines = [], winCells = new Set();
  for (const line of SLOT_WIN_LINES) {
    const syms = line.map(i => grid[i]), first = syms[0];
    let count = 1;
    for (let i = 1; i < 5; i++) { if (syms[i] === first) count++; else break; }
    if (count >= 3) {
      const mult = (SLOT_PAY[count] && SLOT_PAY[count][first]) || 0;
      if (mult > 0) {
        lines.push({ sym: first, count, cells: line.slice(0, count), mult });
        line.slice(0, count).forEach(i => winCells.add(i));
      }
    }
  }
  const totalMult = lines.reduce((s, l) => s + l.mult, 0);
  return { lines, totalMult, winCells };
}

// ── 모든 슬롯 동시 스핀 ───────────────────────
async function spinAll() {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  if (slotBet <= 0n) { alert('베팅 먼저!'); return; }
  const betAmt = slotBet;
  const totalBet = betAmt * BigInt(slotMachines.length);

  // slotBet은 이미 차감됐으므로, 추가 슬롯 수만큼 더 차감
  const extraBet = betAmt * BigInt(slotMachines.length - 1);
  if (extraBet > chips) { alert('칩 부족! 슬롯 ' + slotMachines.length + '대 × ' + formatBig(betAmt) + '칩'); return; }

  const busy = slotMachines.some(m => m.busy);
  if (busy) return;

  // 추가 슬롯 차감 + 베팅존 초기화
  if (extraBet > 0n) {
    chips -= extraBet; chipDist = computeGreedyDist(chips);
  }
  slotBet = 0n; slotBetDist = {};
  document.getElementById('slotBetZone')?.querySelectorAll('.bet-token').forEach(t => t.remove());
  updateChipsDisplay(); updateSlotBetDisplay();

  // 토큰 던지기 모션 (각 슬롯으로)
  slotMachines.forEach((m, mi) => {
    const smEl = document.getElementById('sm' + m.id);
    if (!smEl) return;
    const sRect = smEl.getBoundingClientRect();
    const chip = chipTypes[Math.min(Math.floor(Math.log10(Number(betAmt > 0n ? betAmt : 1n)) / 1), chipTypes.length-1)] || chipTypes[0];
    const fly = document.createElement('div'); fly.className = 'flying-token';
    fly.innerHTML = createChipSVG(chip); fly.style.cssText = `width:44px;height:44px;left:${window.innerWidth/2-22}px;top:${window.innerHeight*0.75}px`;
    document.body.appendChild(fly);
    setTimeout(() => {
      fly.style.cssText += `;left:${sRect.left+sRect.width/2-22}px;top:${sRect.top+40}px;transform:rotate(${Math.random()*360}deg);transition:all .55s cubic-bezier(.25,.46,.45,.94)`;
    }, 10 + mi * 60);
    setTimeout(() => fly.remove(), 600 + mi * 60);
  });

  await new Promise(r => setTimeout(r, 650));

  // 모든 슬롯 동시에 스핀 준비
  const finalGrids = slotMachines.map(() => Array(15).fill(0).map(() => weightedSym()));
  slotMachines.forEach(m => {
    m.busy = true;
    document.getElementById('smWL' + m.id).innerHTML = '';
    setSlotResult(m.id, '🎰 ...', '#aaa');
    for (let i = 0; i < 15; i++) {
      const cell = document.getElementById(`smCell${m.id}_${i}`);
      if (cell) { cell.className = 'slot-cell'; cell.classList.add('spinning'); }
    }
  });

  // 심볼 랜덤 표시
  const iv = setInterval(() => {
    slotMachines.forEach(m => {
      for (let i = 0; i < 15; i++) {
        const cell = document.getElementById(`smCell${m.id}_${i}`);
        if (cell) cell.textContent = SLOT_SYMS[Math.floor(Math.random() * SLOT_SYMS.length)];
      }
    });
  }, 80);

  await new Promise(r => setTimeout(r, 900));
  clearInterval(iv);

  // 컬럼별 순차 정지 (모든 슬롯 동시에 같은 타이밍)
  for (let col = 0; col < 5; col++) {
    await new Promise(r => setTimeout(r, 100));
    sfxSlotStop();
    slotMachines.forEach((m, mi) => {
      for (let row = 0; row < 3; row++) {
        const idx = col * 3 + row;
        const cell = document.getElementById(`smCell${m.id}_${idx}`);
        if (cell) { cell.classList.remove('spinning'); cell.textContent = finalGrids[mi][idx]; }
      }
    });
  }

  slotMachines.forEach((m, mi) => { m.grid = finalGrids[mi]; });
  await new Promise(r => setTimeout(r, 180));

  // 결과 계산
  let totalWin = 0n;
  slotMachines.forEach((m, mi) => {
    const ev = evalSlotGrid(finalGrids[mi]);
    ev.winCells.forEach(idx => {
      const cell = document.getElementById(`smCell${m.id}_${idx}`);
      if (cell) {
        const l = ev.lines.find(l => l.cells.includes(idx));
        cell.classList.add('win' + (l ? l.count : 3));
      }
    });
    const wlEl = document.getElementById('smWL' + m.id);
    if (ev.lines.length) wlEl.innerHTML = ev.lines.map(l => `<span class="slot-win-tag">${l.sym}×${l.count} ×${l.mult}</span>`).join('');
    else wlEl.innerHTML = '';

    let payout = 0n;
    if (ev.totalMult > 0) {
      payout = betAmt * BigInt(ev.totalMult);
      totalWin += payout;
      setSlotResult(m.id, `🎉 +${shortFmt(payout)}칩`, '#2ecc71');
    } else {
      setSlotResult(m.id, '꽝 🍀', '#e74c3c');
    }
    m.busy = false;
  });

  if (totalWin > 0n) {
    chips += totalWin; chipDist = computeGreedyDist(chips);
    sfxSlotWin(3);
    if(typeof saveRecentPlay==='function')saveRecentPlay({type:'🎰 슬롯머신',desc:slotMachines.length+'대 × '+formatBig(betAmt)+'칩 베팅 → +'+formatBig(totalWin)+'칩',result:'win'});
  } else {
    if(typeof saveRecentPlay==='function')saveRecentPlay({type:'🎰 슬롯머신',desc:slotMachines.length+'대 × '+formatBig(betAmt)+'칩 베팅 → 꽝',result:'lose'});
  }

  updateChipsDisplay(); updateSlotChipsDisplay(); updateRlChipRow(); saveState();
  document.getElementById('slotSpinAllBtn').disabled = false;
}

function setSlotResult(id, msg, color) {
  const el = document.getElementById('smResult' + id);
  if (!el) return; el.textContent = msg; el.style.color = color || '#f1c40f';
}
