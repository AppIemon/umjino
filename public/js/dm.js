// ═══════════════════════════════════════════
// dm.js – Direct Message system
// ═══════════════════════════════════════════

const DM_API = '/api/dm';
let dmPollTimer = null;
let dmCurrentConv = null; // { id, participants, type, name }
let dmMsgBefore = null;

// ── API helpers ────────────────────────────
function dmFetch(action, extra) {
  return fetchT(DM_API + '?action=' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: sessionNickname, token: sessionToken, ...extra }),
  }, 8000);
}
function dmGet(params) {
  const qs = new URLSearchParams({ nick: sessionNickname, token: sessionToken, ...params }).toString();
  return fetchT(DM_API + '?' + qs, null, 8000);
}

// ── 미읽 배지 ──────────────────────────────
async function dmRefreshBadge() {
  if (!sessionNickname) return;
  try {
    const res = await dmGet({ action: 'unread' });
    const d = await res.json();
    const badge = document.getElementById('dmBadge');
    if (badge) {
      badge.textContent = d.unread > 0 ? (d.unread > 99 ? '99+' : d.unread) : '';
      badge.style.display = d.unread > 0 ? 'flex' : 'none';
    }
  } catch(e) {}
}

// ── 폴링 ──────────────────────────────────
function dmStartPoll() {
  if (dmPollTimer) return;
  dmPollTimer = setInterval(() => {
    dmRefreshBadge();
    if (document.getElementById('dmOverlay')?.classList.contains('show')) {
      if (dmCurrentConv) dmLoadMessages(false);
      else dmLoadInbox();
    }
  }, 3000);
}
function dmStopPoll() { clearInterval(dmPollTimer); dmPollTimer = null; }

// ── 열기/닫기 ─────────────────────────────
function showDM(targetNick) {
  if (!sessionNickname) { document.getElementById('authModal').classList.add('show'); return; }
  document.getElementById('dmOverlay').classList.add('show');
  dmCurrentConv = null;
  if (targetNick && targetNick !== sessionNickname) {
    dmOpenWith(targetNick);
  } else {
    dmLoadInbox();
  }
  dmStartPoll();
}
function closeDM() {
  document.getElementById('dmOverlay').classList.remove('show');
  dmCurrentConv = null;
  // 폴은 badge 용으로 유지
}

// ── 받은편지함 ─────────────────────────────
async function dmLoadInbox() {
  dmCurrentConv = null;
  const panel = document.getElementById('dmPanel');
  panel.innerHTML = `
<div class="dm-header">
  <span>💬 메시지</span>
  <button class="dm-new-btn" onclick="dmNewGroup()">+ 그룹 DM</button>
  <button class="dm-close-btn" onclick="closeDM()">✕</button>
</div>
<div class="dm-list" id="dmList"><div class="dm-loading">불러오는 중...</div></div>`;
  try {
    const res = await dmGet({ action: 'inbox' });
    const convs = await res.json();
    const list = document.getElementById('dmList');
    if (!convs.length) { list.innerHTML = '<div class="dm-empty">대화가 없습니다</div>'; return; }
    list.innerHTML = convs.map(c => `
<div class="dm-conv-item" onclick="dmOpenConv(${JSON.stringify(JSON.stringify(c))})">
  <div class="dm-conv-icon">${c.type === 'group' ? '👥' : '💬'}</div>
  <div class="dm-conv-info">
    <div class="dm-conv-name">${escHtml(c.name)}${c.unread > 0 ? `<span class="dm-unread-dot">${c.unread}</span>` : ''}</div>
    <div class="dm-conv-last">${c.lastMsg ? escHtml(c.lastMsg.content.slice(0, 40)) : '메시지 없음'}</div>
  </div>
</div>`).join('');
  } catch(e) {
    document.getElementById('dmList').innerHTML = '<div class="dm-empty">불러올 수 없음</div>';
  }
}

function dmOpenConv(jsonStr) {
  const c = JSON.parse(jsonStr);
  dmCurrentConv = c;
  dmMsgBefore = null;
  dmRenderConvFrame(c);
  dmLoadMessages(true);
}

async function dmOpenWith(targetNick) {
  try {
    const res = await dmFetch('create', { target: targetNick });
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    const c = { id: d.convId, type: 'dm', participants: d.participants, name: targetNick };
    dmCurrentConv = c;
    dmMsgBefore = null;
    dmRenderConvFrame(c);
    dmLoadMessages(true);
  } catch(e) { alert('서버 오류'); }
}

function dmRenderConvFrame(c) {
  const others = c.participants ? c.participants.filter(x => x !== sessionNickname) : [];
  const title = c.name || others.join(', ');
  document.getElementById('dmPanel').innerHTML = `
<div class="dm-header">
  <button class="dm-back-btn" onclick="dmLoadInbox()">‹</button>
  <span class="dm-header-title">${escHtml(title)}</span>
  ${c.type === 'group' ? `<button class="dm-invite-btn" onclick="dmInvite('${escHtml(c.id)}')">+ 초대</button>` : ''}
  <button class="dm-close-btn" onclick="closeDM()">✕</button>
</div>
<div class="dm-msgs" id="dmMsgs"><div class="dm-loading">불러오는 중...</div></div>
<div class="dm-input-row">
  <input class="dm-input" id="dmInput" placeholder="메시지 입력..." maxlength="500"
    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();dmSend()}">
  <button class="dm-send-btn" onclick="dmSend()">전송</button>
  ${c.type === 'dm' && others.length === 1 ? `<button class="dm-transfer-btn" onclick="dmOpenTransfer('${escHtml(c.id)}','${escHtml(others[0])}')">💸</button>` : ''}
</div>`;
}

async function dmLoadMessages(scrollBottom) {
  if (!dmCurrentConv) return;
  const convId = dmCurrentConv.id;
  try {
    const params = { action: 'history', convId };
    if (dmMsgBefore) params.before = dmMsgBefore;
    const res = await dmGet(params);
    const msgs = await res.json();
    const container = document.getElementById('dmMsgs');
    if (!container) return;
    if (!msgs.length && !dmMsgBefore) { container.innerHTML = '<div class="dm-empty">메시지 없음. 첫 메시지를 보내보세요!</div>'; return; }
    const html = msgs.map(m => dmMsgHTML(m)).join('');
    if (dmMsgBefore) {
      container.insertAdjacentHTML('afterbegin', html);
    } else {
      container.innerHTML = html;
    }
    if (scrollBottom) container.scrollTop = container.scrollHeight;
  } catch(e) {}
}

function dmMsgHTML(m) {
  const isMe = m.sender === sessionNickname;
  const isSys = m.sender === '__system__';
  if (isSys) return `<div class="dm-msg-sys">${escHtml(m.content)}</div>`;
  const time = new Date(m.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  if (m.type === 'transfer') {
    const isReceiver = m.target === sessionNickname;
    return `<div class="dm-msg ${isMe ? 'dm-msg-me' : 'dm-msg-other'}">
      <div class="dm-sender">${isMe ? '' : escHtml(m.sender)}</div>
      <div class="dm-bubble dm-transfer-bubble">
        💸 ${isMe ? escHtml(m.target) + '에게' : escHtml(m.sender) + '가'} <b>${shortFmt(BigInt(m.amount || '0'))}</b>칩 전송
        ${isReceiver ? '<span class="dm-transfer-got">받음 ✓</span>' : ''}
      </div>
      <div class="dm-time">${time}</div>
    </div>`;
  }
  return `<div class="dm-msg ${isMe ? 'dm-msg-me' : 'dm-msg-other'}">
    ${!isMe ? `<div class="dm-sender" onclick="showProfile('${escHtml(m.sender)}')" style="cursor:pointer">${escHtml(m.sender)}</div>` : ''}
    <div class="dm-bubble">${escHtml(m.content)}</div>
    <div class="dm-time">${time}</div>
  </div>`;
}

async function dmSend() {
  if (!dmCurrentConv) return;
  const input = document.getElementById('dmInput');
  const content = input?.value?.trim();
  if (!content) return;
  input.value = '';
  try {
    const res = await dmFetch('send', { convId: dmCurrentConv.id, content });
    const d = await res.json();
    if (!res.ok) { alert(d.error || '전송 실패'); return; }
    const container = document.getElementById('dmMsgs');
    if (container) {
      const empty = container.querySelector('.dm-empty');
      if (empty) empty.remove();
      container.insertAdjacentHTML('beforeend', dmMsgHTML(d));
      container.scrollTop = container.scrollHeight;
    }
    dmRefreshBadge();
  } catch(e) { alert('서버 오류'); }
}

// ── 토큰 전송 ──────────────────────────────
function dmOpenTransfer(convId, target) {
  const overlay = document.createElement('div');
  overlay.id = 'dmTransferOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:7100';
  overlay.innerHTML = `
<div style="background:linear-gradient(135deg,#1a2a3a,#0d1820);border:2px solid rgba(52,152,219,.5);border-radius:16px;padding:1.5rem;max-width:340px;width:90%;color:white;text-align:center">
  <h3 style="color:#3498db;margin-bottom:1rem">💸 ${escHtml(target)}에게 전송</h3>
  <p style="color:#aaa;font-size:.85rem;margin-bottom:.8rem">내 잔액: ${formatBig(chips)}칩</p>
  <input id="dmTransferAmt" class="modal-input" type="text" placeholder="금액 입력" style="margin-bottom:.8rem">
  <div style="display:flex;gap:.6rem;justify-content:center">
    <button class="btn-primary" onclick="dmDoTransfer('${convId}','${target}')">전송</button>
    <button class="btn-secondary" onclick="document.getElementById('dmTransferOverlay').remove()">취소</button>
  </div>
</div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('dmTransferAmt')?.focus(), 50);
}

async function dmDoTransfer(convId, target) {
  const input = document.getElementById('dmTransferAmt');
  let amt; try { amt = BigInt(input.value.trim()); } catch(e) { alert('숫자 입력'); return; }
  if (amt <= 0n) { alert('0보다 커야 함'); return; }
  if (amt > chips) { alert('칩 부족'); return; }
  try {
    const res = await dmFetch('transfer', { convId, target, amount: amt.toString() });
    const d = await res.json();
    if (!res.ok) { alert(d.error || '전송 실패'); return; }
    chips = BigInt(d.newChips); chipDist = computeGreedyDist(chips);
    updateChipsDisplay(); updateSlotChipsDisplay(); updateRlChipRow();
    document.getElementById('dmTransferOverlay')?.remove();
    // 메시지 새로고침
    await dmLoadMessages(true);
    sfxWin();
  } catch(e) { alert('서버 오류'); }
}

// ── 그룹 DM 생성 ────────────────────────────
async function dmNewGroup() {
  const input = prompt('초대할 닉네임들 (쉼표로 구분):');
  if (!input) return;
  const targets = input.split(',').map(s => s.trim()).filter(Boolean);
  if (!targets.length) return;
  const name = prompt('그룹 이름 (비워두면 자동):') || '';
  try {
    const res = await dmFetch('create_group', { targets, name });
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    const c = { id: d.convId, type: 'group', participants: d.participants, name: name || d.participants.join(', ') };
    dmCurrentConv = c;
    dmMsgBefore = null;
    dmRenderConvFrame(c);
    dmLoadMessages(true);
  } catch(e) { alert('서버 오류'); }
}

// ── 그룹 초대 ──────────────────────────────
async function dmInvite(convId) {
  const target = prompt('초대할 닉네임:');
  if (!target?.trim()) return;
  try {
    const res = await dmFetch('invite', { convId, target: target.trim() });
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    await dmLoadMessages(true);
  } catch(e) { alert('서버 오류'); }
}

// ── 프로필 팝업 ────────────────────────────
async function showProfile(nick) {
  // 랭킹에서 해당 유저 정보 fetch
  let rankInfo = null;
  try {
    const res = await fetchT('/api/ranking?nick=' + encodeURIComponent(nick), null, 5000);
    const d = await res.json();
    const rows = d.top100 || [];
    rankInfo = rows.find(r => r.nickname === nick) || null;
  } catch(e) {}

  const existing = document.getElementById('profileOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'profileOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:7000';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  const isMe = nick === sessionNickname;
  overlay.innerHTML = `
<div style="background:linear-gradient(135deg,#1a3a28,#0d2018);border:2px solid rgba(241,196,15,.4);border-radius:16px;padding:1.5rem;max-width:300px;width:88%;color:white;text-align:center">
  <div style="font-size:3rem;margin-bottom:.4rem">👤</div>
  <div style="font-size:1.3rem;font-weight:bold;color:#f1c40f;margin-bottom:.3rem">${escHtml(nick)}</div>
  ${rankInfo ? `<div style="font-size:.85rem;color:#aaa">최고 칩: ${shortFmt(BigInt(rankInfo.maxChips || '0'))}</div>
  <div style="font-size:.78rem;color:#666;margin-top:.15rem">랭킹 ${rankInfo.rank}위</div>` : '<div style="font-size:.78rem;color:#555">랭킹 없음</div>'}
  <div style="display:flex;gap:.6rem;justify-content:center;margin-top:1rem;flex-wrap:wrap">
    ${!isMe ? `<button class="btn-primary" onclick="document.getElementById('profileOverlay').remove();showDM('${escHtml(nick)}')">💬 DM</button>` : ''}
    <button class="btn-secondary" onclick="document.getElementById('profileOverlay').remove()">닫기</button>
  </div>
</div>`;
  document.body.appendChild(overlay);
}
