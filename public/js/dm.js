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
  const investHTML = !isMe ? `
    <div style="margin-top:.6rem;border-top:1px solid rgba(255,255,255,.1);padding-top:.6rem">
      <div style="font-size:.78rem;color:#aaa;margin-bottom:.35rem">💹 투자하기</div>
      <div style="display:flex;gap:.4rem;justify-content:center">
        <input id="profileInvestAmt" class="slot-bet-inp" placeholder="투자액" style="width:110px">
        <button class="btn-primary" onclick="doInvest('${nick}')">투자</button>
      </div>
    </div>` : '';

  overlay.innerHTML = `
<div style="background:linear-gradient(135deg,#1a3a28,#0d2018);border:2px solid rgba(241,196,15,.4);border-radius:16px;padding:1.5rem;max-width:320px;width:90%;color:white;text-align:center">
  <div style="font-size:3rem;margin-bottom:.3rem">👤</div>
  <div style="font-size:1.3rem;font-weight:bold;color:#f1c40f">${nick}</div>
  ${rankInfo?.title ? `<div style="color:${rankInfo.titleColor||'#f1c40f'};font-size:.85rem;margin-bottom:.25rem">[${rankInfo.title}]${isMe ? ' <button onclick="changeMyTitleColor()" style="background:none;border:none;cursor:pointer;font-size:.7rem;color:#888">색상</button>' : ''}</div>` : ''}
  ${rankInfo ? `<div style="font-size:.85rem;color:#aaa;margin-top:.3rem">최고 칩: ${shortFmt(BigInt(rankInfo.maxChips||'0'))}</div><div style="font-size:.78rem;color:#666;margin-top:.12rem">랭킹 ${rankInfo.rank}위</div>` : '<div style="font-size:.78rem;color:#555;margin-top:.3rem">랭킹 없음</div>'}
  ${investHTML}
  <div style="display:flex;gap:.6rem;justify-content:center;margin-top:.9rem;flex-wrap:wrap">
    ${!isMe ? `<button class="btn-primary" onclick="document.getElementById('profileOverlay').remove();showDM('${nick}')">💬 DM</button>` : ''}
    <button class="btn-secondary" onclick="document.getElementById('profileOverlay').remove()">닫기</button>
  </div>
</div>`;
  document.body.appendChild(overlay);
}

async function doInvest(target) {
  const amtStr = document.getElementById('profileInvestAmt')?.value?.trim();
  let amt; try { amt = BigInt(amtStr); } catch(e) { alert('금액 입력'); return; }
  if (amt <= 0n) { alert('0보다 커야 함'); return; }
  if (amt > chips) { alert('칩 부족'); return; }
  try {
    const res = await fetchT('/api/invest', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: sessionNickname, token: sessionToken, target, amount: amt.toString() }) }, 8000);
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    chips = BigInt(d.newChips); chipDist = computeGreedyDist(chips);
    updateChipsDisplay(); updateSlotChipsDisplay();
    document.getElementById('profileOverlay')?.remove();
    alert(target + '에게 ' + formatBig(amt) + '칩 투자 완료!');
  } catch(e) { alert('오류'); }
}

// ═══════════════════════════════════════════
// DM 추가 기능: 최근 플레이 저장/전송, 메시지 조작
// ═══════════════════════════════════════════

// ── 최근 플레이 저장 (항상 최대 10개) ─────────
const RECENT_PLAYS_KEY = 'recentPlays';
function saveRecentPlay(play) {
  // play: { type, desc, amount, result, ts }
  let plays = [];
  try { plays = JSON.parse(localStorage.getItem(RECENT_PLAYS_KEY) || '[]'); } catch(e) {}
  plays.unshift({ ...play, ts: Date.now() });
  if (plays.length > 10) plays = plays.slice(0, 10);
  localStorage.setItem(RECENT_PLAYS_KEY, JSON.stringify(plays));
}
function getRecentPlays() {
  try { return JSON.parse(localStorage.getItem(RECENT_PLAYS_KEY) || '[]'); } catch(e) { return []; }
}

// ── 플레이 전송 팝업 ──────────────────────────
function dmOpenSendPlay() {
  if (!dmCurrentConv) return;
  const plays = getRecentPlays();
  const existing = document.getElementById('dmPlayOverlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'dmPlayOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:7200';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
<div style="background:#1a2a1a;border:2px solid rgba(46,204,113,.3);border-radius:14px;padding:1.2rem;max-width:360px;width:90%;color:white;max-height:70vh;overflow-y:auto">
  <div style="font-weight:bold;color:#f1c40f;margin-bottom:.8rem">📊 최근 플레이 전송</div>
  ${plays.length ? plays.map((p, i) => `
  <div style="background:rgba(255,255,255,.07);border-radius:8px;padding:.5rem .7rem;margin-bottom:.4rem;cursor:pointer;transition:background .15s"
       onclick="dmSendPlay(${i})" onmouseover="this.style.background='rgba(255,255,255,.13)'" onmouseout="this.style.background='rgba(255,255,255,.07)'">
    <div style="font-size:.8rem;color:#2ecc71">${escHtml(p.type)}</div>
    <div style="font-size:.75rem;color:#aaa">${escHtml(p.desc)}</div>
    <div style="font-size:.7rem;color:#888">${new Date(p.ts).toLocaleString('ko-KR')}</div>
  </div>`).join('') : '<div style="color:#555;font-size:.85rem">최근 플레이 없음</div>'}
  <button class="btn-secondary" style="width:100%;margin-top:.7rem" onclick="document.getElementById('dmPlayOverlay').remove()">닫기</button>
</div>`;
  document.body.appendChild(overlay);
}

async function dmSendPlay(idx) {
  const plays = getRecentPlays();
  const p = plays[idx]; if (!p) return;
  const content = `[플레이 공유] ${p.type}\n${p.desc}`;
  document.getElementById('dmPlayOverlay')?.remove();
  if (!dmCurrentConv) return;
  try {
    const res = await dmFetch('send', { convId: dmCurrentConv.id, content });
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    const container = document.getElementById('dmMsgs');
    if (container) {
      container.insertAdjacentHTML('beforeend', dmMsgHTML(d));
      container.scrollTop = container.scrollHeight;
    }
  } catch(e) { alert('오류'); }
}

// ── 메시지 컨텍스트 메뉴 (복사/삭제/수정) ─────
let _ctxMsgId = null;
function dmShowMsgCtx(e, msgId, isMe, content) {
  e.preventDefault();
  const existing = document.getElementById('dmMsgCtx');
  if (existing) existing.remove();
  _ctxMsgId = msgId;
  const menu = document.createElement('div');
  menu.id = 'dmMsgCtx';
  menu.style.cssText = `position:fixed;left:${Math.min(e.clientX, window.innerWidth-160)}px;top:${Math.min(e.clientY, window.innerHeight-120)}px;background:#222;border:1px solid #444;border-radius:9px;padding:.35rem 0;z-index:8000;min-width:140px;box-shadow:0 4px 16px rgba(0,0,0,.6)`;
  const items = [
    { label: '📋 복사', fn: `dmCopyMsg(${JSON.stringify(content)})` },
    ...(isMe ? [
      { label: '✏️ 수정', fn: `dmEditMsg(${JSON.stringify(msgId)}, ${JSON.stringify(content)})` },
      { label: '🗑 삭제', fn: `dmDeleteMsg(${JSON.stringify(msgId)})`, danger: true },
    ] : []),
    { label: '✕ 닫기', fn: `document.getElementById('dmMsgCtx')?.remove()` },
  ];
  menu.innerHTML = items.map(it => `<div class="dm-ctx-item${it.danger?' danger':''}" onclick="${it.fn};document.getElementById('dmMsgCtx')?.remove()">${it.label}</div>`).join('');
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 10);
}

function dmCopyMsg(content) {
  navigator.clipboard?.writeText(content).catch(() => {
    const el = document.createElement('textarea');
    el.value = content; document.body.appendChild(el); el.select();
    document.execCommand('copy'); el.remove();
  });
}

async function dmEditMsg(msgId, oldContent) {
  const newContent = prompt('수정할 내용:', oldContent);
  if (!newContent || newContent === oldContent) return;
  try {
    const res = await dmFetch('edit_msg', { msgId, content: newContent });
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    await dmLoadMessages(false);
    const container = document.getElementById('dmMsgs');
    if (container) container.scrollTop = container.scrollHeight;
  } catch(e) { alert('서버 오류'); }
}

async function dmDeleteMsg(msgId) {
  if (!confirm('메시지를 삭제하시겠습니까?')) return;
  try {
    const res = await dmFetch('delete_msg', { msgId });
    const d = await res.json();
    if (!res.ok) { alert(d.error || '오류'); return; }
    await dmLoadMessages(false);
    const container = document.getElementById('dmMsgs');
    if (container) container.scrollTop = container.scrollHeight;
  } catch(e) { alert('서버 오류'); }
}

// dmMsgHTML 오버라이드 — 우클릭/롱프레스 추가
const _origDmMsgHTML = dmMsgHTML;
function dmMsgHTML(m) {
  const isMe = m.sender === sessionNickname;
  const isSys = m.sender === '__system__';
  if (isSys || m.type === 'transfer') return _origDmMsgHTML(m);
  const time = new Date(m.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const mid = m._id?.toString() || '';
  const safeContent = JSON.stringify(m.content || '');
  const safeMid = JSON.stringify(mid);
  const ctxAttr = `oncontextmenu="dmShowMsgCtx(event,${safeMid},${isMe},${safeContent})" ontouchstart="dmTouchStart(event,${safeMid},${isMe},${safeContent})" ontouchend="dmTouchEnd()"`;
  const editedMark = m.edited ? '<span style="font-size:.58rem;color:#555;margin-left:.3rem">(수정됨)</span>' : '';
  return `<div class="dm-msg ${isMe ? 'dm-msg-me' : 'dm-msg-other'}">
    ${!isMe ? `<div class="dm-sender" onclick="showProfile('${escHtml(m.sender)}')" style="cursor:pointer">${escHtml(m.sender)}</div>` : ''}
    <div class="dm-bubble" ${ctxAttr}>${escHtml(m.content)}${editedMark}</div>
    <div class="dm-time">${time}</div>
  </div>`;
}

// 롱프레스
let _ltTimer = null;
function dmTouchStart(e, mid, isMe, content) {
  _ltTimer = setTimeout(() => { e.preventDefault(); dmShowMsgCtx(e.touches[0], mid, isMe, content); }, 500);
}
function dmTouchEnd() { clearTimeout(_ltTimer); }

// dmRenderConvFrame 오버라이드 — 📊 버튼 추가
const _origRenderConvFrame = dmRenderConvFrame;
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
  <button class="dm-transfer-btn" title="최근 플레이 전송" onclick="dmOpenSendPlay()">📊</button>
  <input class="dm-input" id="dmInput" placeholder="메시지 입력..." maxlength="500"
    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();dmSend()}">
  <button class="dm-send-btn" onclick="dmSend()">전송</button>
  ${c.type === 'dm' && others.length === 1 ? `<button class="dm-transfer-btn" onclick="dmOpenTransfer('${escHtml(c.id)}','${escHtml(others[0])}')">💸</button>` : ''}
</div>`;
}
