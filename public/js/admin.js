// ═══════════════════════════════════════════
// admin.js – 관리자 탭 + 칭호 + 공지
// ═══════════════════════════════════════════
const ADMIN_NICK = '애플몬';

function isAdmin() { return sessionNickname === ADMIN_NICK; }

// ── 공지사항 배너 ────────────────────────────
async function checkAnnouncements() {
  try {
    const res = await fetchT('/api/announcements', null, 5000);
    const anns = await res.json();
    if (!anns.length) return;
    const lastSeen = localStorage.getItem('lastSeenAnnounce') || '';
    const newest = anns[0];
    if (newest._id !== lastSeen) {
      showAnnouncementBanner(newest.content);
      localStorage.setItem('lastSeenAnnounce', newest._id);
    }
  } catch(e) {}
}

function showAnnouncementBanner(content) {
  const existing = document.getElementById('announceBanner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'announceBanner';
  banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:linear-gradient(135deg,#e74c3c,#c0392b);color:white;padding:.8rem 1.2rem;z-index:9500;display:flex;align-items:center;gap:.8rem;font-weight:bold;box-shadow:0 3px 12px rgba(0,0,0,.5);animation:slideDown .4s ease';
  banner.innerHTML = `<span style="font-size:1.1rem">📢</span><span style="flex:1">관리자 공지: ${escHtml(content)}</span><button onclick="this.parentElement.remove()" style="background:rgba(255,255,255,.2);border:none;color:white;border-radius:5px;padding:.25rem .6rem;cursor:pointer">✕</button>`;
  document.body.prepend(banner);
  setTimeout(() => banner?.remove(), 10000);
}

// ── 관리자 탭 렌더 ──────────────────────────
async function renderAdminTab() {
  const el = document.getElementById('adminContent');
  if (!el) return;
  if (!isAdmin()) { renderPublicAdminView(el); return; }
  el.innerHTML = '<div class="toto-loading">로딩 중...</div>';
  try {
    const res = await fetchT(`/api/admin?action=users&nick=${encodeURIComponent(sessionNickname)}&token=${sessionToken}`, null, 8000);
    const users = await res.json();
    renderAdminUserList(el, users);
  } catch(e) { el.innerHTML = '<div class="toto-err">로드 실패</div>'; }
}

function renderAdminUserList(el, users) {
  el.innerHTML = `
<div class="admin-panel">
  <h3 style="color:#f1c40f;margin-bottom:.8rem">👑 관리자 패널</h3>
  <div class="admin-announce-row">
    <input id="adminAnnounceInput" class="slot-bet-inp" placeholder="전체 공지 내용..." style="flex:1">
    <button class="btn-primary" onclick="adminAnnounce()">📢 공지</button>
  </div>
  <div style="margin:.6rem 0;font-size:.78rem;color:#888">유저 ${users.length}명</div>
  <div class="admin-user-list">
    ${users.map(u => `
    <div class="admin-user-row">
      <div class="admin-user-nick">
        ${u.banned ? '🚫' : ''}
        <span>${escHtml(u.nickname)}</span>
        ${u.title ? `<span style="color:${u.titleColor||'#f1c40f'};font-size:.72rem">[${escHtml(u.title)}]</span>` : ''}
      </div>
      <div class="admin-user-chips">${shortFmt(BigInt(u.chips||'0'))}</div>
      <div class="admin-user-time">${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-'}</div>
      <div class="admin-user-actions">
        <button class="admin-btn" onclick="adminSetChips('${escHtml(u.nickname)}')">칩</button>
        <button class="admin-btn" onclick="adminSetTitle('${escHtml(u.nickname)}')">칭호</button>
        <button class="admin-btn admin-btn-danger" onclick="adminBan('${escHtml(u.nickname)}',${u.banned})">${u.banned?'언밴':'밴'}</button>
        <button class="admin-btn" onclick="showDM();dmOpenWith('${escHtml(u.nickname)}')">DM</button>
      </div>
    </div>`).join('')}
  </div>
</div>`;
}

async function renderPublicAdminView(el) {
  el.innerHTML = '<div class="toto-loading">공지사항 로딩...</div>';
  try {
    const res = await fetchT('/api/announcements', null, 5000);
    const anns = await res.json();
    el.innerHTML = `<div class="admin-public">
      <h3 style="color:#f1c40f;margin-bottom:.8rem">📢 공지사항</h3>
      ${anns.length ? anns.map(a => `<div class="announce-item">
        <div class="announce-content">${escHtml(a.content)}</div>
        <div class="announce-time">${new Date(a.createdAt).toLocaleString('ko-KR')}</div>
      </div>`).join('') : '<div class="toto-empty">공지사항 없음</div>'}
    </div>`;
  } catch(e) { el.innerHTML = '<div class="toto-err">로드 실패</div>'; }
}

async function adminAnnounce() {
  const content = document.getElementById('adminAnnounceInput')?.value?.trim();
  if (!content) return;
  try {
    const res = await fetchT('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'announce', nickname: sessionNickname, token: sessionToken, content }) }, 8000);
    const d = await res.json();
    if (!res.ok) { alert(d.error); return; }
    document.getElementById('adminAnnounceInput').value = '';
    alert('공지 발송 완료');
  } catch(e) { alert('오류'); }
}

async function adminSetChips(target) {
  const amount = prompt(`${target}의 칩 설정:`);
  if (!amount) return;
  const res = await fetchT('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set_chips', nickname: sessionNickname, token: sessionToken, target, amount }) }, 8000);
  const d = await res.json();
  if (!res.ok) { alert(d.error); return; }
  alert('완료'); renderAdminTab();
}

async function adminSetTitle(target) {
  const title = prompt(`${target}에게 부여할 칭호:`);
  if (title === null) return;
  const titleColor = prompt('칭호 색상 (예: #ff4444, 비워두면 기본)') || '#f1c40f';
  const res = await fetchT('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set_title', nickname: sessionNickname, token: sessionToken, target, title, titleColor }) }, 8000);
  const d = await res.json();
  if (!res.ok) { alert(d.error); return; }
  alert('칭호 부여 완료'); renderAdminTab();
}

async function adminBan(target, isBanned) {
  if (isBanned) {
    const res = await fetchT('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unban', nickname: sessionNickname, token: sessionToken, target }) }, 8000);
    const d = await res.json(); if (!res.ok) { alert(d.error); return; }
    alert('언밴 완료'); renderAdminTab(); return;
  }
  const durInput = prompt('밴 시간 (초, 비워두면 영구):');
  const duration = durInput ? Number(durInput) : null;
  const res = await fetchT('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ban', nickname: sessionNickname, token: sessionToken, target, duration }) }, 8000);
  const d = await res.json(); if (!res.ok) { alert(d.error); return; }
  alert('밴 완료'); renderAdminTab();
}

// ── 칭호 색상 변경 (본인) ────────────────────
async function changeMyTitleColor() {
  const color = prompt('칭호 색상 (예: #ff4444):');
  if (!color) return;
  const res = await fetchT('/api/title', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: sessionNickname, token: sessionToken, titleColor: color }) }, 8000);
  const d = await res.json();
  if (!res.ok) { alert(d.error); return; }
  alert('색상 변경 완료');
}

// ── 칭호 표시 (공통) ─────────────────────────
function titleBadgeHTML(user) {
  if (!user?.title) return '';
  return `<span class="title-badge" style="color:${user.titleColor||'#f1c40f'}">[${escHtml(user.title)}]</span>`;
}
