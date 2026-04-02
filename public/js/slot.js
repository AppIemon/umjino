// ═══════════════════════════════════════════
// slot.js – 5×3 parallel slot machines
// 기댓값 ~1.1, 가로 연속만 인정, 1.5배 제거
// ═══════════════════════════════════════════

const SLOT_SYMS = ['🍒','🍋','🍇','🔔','⭐','💎','7️⃣'];

// 확률 가중치 (낮을수록 희귀)
const SLOT_WEIGHTS = [28, 22, 16, 12, 9, 7, 6]; // 합=100
const WEIGHT_TOTAL = SLOT_WEIGHTS.reduce((a,b)=>a+b,0);

// 배당 (연속 3/4/5개, 기댓값 ~1.1 맞춤)
const SLOT_PAY = {
  3: {'🍒':2,'🍋':3,'🍇':5,'🔔':8,'⭐':13,'💎':25,'7️⃣':50},
  4: {'🍒':7,'🍋':12,'🍇':20,'🔔':33,'⭐':55,'💎':110,'7️⃣':220},
  5: {'🍒':20,'🍋':35,'🍇':60,'🔔':100,'⭐':170,'💎':340,'7️⃣':700},
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
// 공유 베팅 입력값
let slotSharedBet = '';

function createSlotMachineData() {
  return { id: _slotId++, busy: false, grid: Array(15).fill('🍒') };
}

function initSlot() {
  if (slotMachines.length === 0) {
    slotMachines.push(createSlotMachineData());
  }
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
  <input class="slot-bet-inp" id="slotSharedBet" type="text" placeholder="베팅액 (모든 슬롯 공통)"
    value="${slotSharedBet}" oninput="slotSharedBet=this.value" style="flex:1;max-width:180px">
  <button class="slot-spin-btn" id="slotSpinAllBtn" onclick="spinAll()">스핀! 🎰</button>
  <button class="slot-add-btn" onclick="addSlotMachine()" title="슬롯머신 추가 (${formatBig(nextCost)}칩)">➕ ${formatBig(nextCost)}칩</button>
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
  <div class="spm-sym">7️⃣ ×3/4/5</div><div class="spm-val">×50/220/700</div>
  <div class="spm-sym">💎 ×3/4/5</div><div class="spm-val">×25/110/340</div>
  <div class="spm-sym">⭐ ×3/4/5</div><div class="spm-val">×13/55/170</div>
  <div class="spm-sym">🔔 ×3/4/5</div><div class="spm-val">×8/33/100</div>
  <div class="spm-sym">🍇 ×3/4/5</div><div class="spm-val">×5/20/60</div>
  <div class="spm-sym">🍋 ×3/4/5</div><div class="spm-val">×3/12/35</div>
  <div class="spm-sym">🍒 ×3/4/5</div><div class="spm-val">×2/7/20</div>
</div>`;
    area.appendChild(div);
  });
  updateSlotChipsDisplay();
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
  const betStr = document.getElementById('slotSharedBet').value.replace(/,/g,'').trim();
  let betAmt; try { betAmt = BigInt(betStr); } catch(e) { alert('숫자를 입력하세요'); return; }
  if (betAmt <= 0n) { alert('1 이상 입력'); return; }
  const totalBet = betAmt * BigInt(slotMachines.length);
  if (totalBet > chips) { alert('칩 부족! 필요: ' + formatBig(totalBet) + '칩'); return; }

  const busy = slotMachines.some(m => m.busy);
  if (busy) return;

  // 칩 차감
  chips -= totalBet; chipDist = computeGreedyDist(chips);
  updateChipsDisplay(); updateSlotChipsDisplay();
  document.getElementById('slotSpinAllBtn').disabled = true;

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
  }

  updateChipsDisplay(); updateSlotChipsDisplay(); updateRlChipRow(); saveState();
  document.getElementById('slotSpinAllBtn').disabled = false;
}

function setSlotResult(id, msg, color) {
  const el = document.getElementById('smResult' + id);
  if (!el) return; el.textContent = msg; el.style.color = color || '#f1c40f';
}
