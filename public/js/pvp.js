// ═══════════════════════════════════════════
// pvp.js  –  세븐포커 multiplayer
// ═══════════════════════════════════════════
// 규칙: 앤티 설정 → 4장받고 1장버리기 → 1공개+2비공개+2공개 → 1차베팅
//       → +1공개 → 2차베팅 → +1비공개 → 3차베팅 → best5 비교

const MP_API='/api/mp';
let mpPollTimer=null,mpLastState=null;

function mpFetch(action,extra){
  return fetchT(MP_API+'?action='+action,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({nickname:sessionNickname,token:sessionToken,...(extra||{})})},8000);
}
function mpStartPolling(){mpStopPolling();mpPollTimer=setInterval(mpPoll,1600)}
function mpStopPolling(){if(mpPollTimer){clearInterval(mpPollTimer);mpPollTimer=null}}

async function mpPoll(){
  if(!sessionNickname||!sessionToken)return;
  try{
    const res=await fetchT(`${MP_API}?action=poll&nickname=${encodeURIComponent(sessionNickname)}&token=${sessionToken}`,null,5000);
    if(!res.ok)return;
    const d=await res.json();mpHandleState(d);
  }catch(e){}
}

function mpHandleState(d){
  if(d.status==='idle'){
    const wasInGame=document.getElementById('pvpGameArea').style.display!=='none';
    if(wasInGame){mpStopPolling();setTimeout(()=>mpExit(),2500);
      document.getElementById('pvpGameArea').innerHTML=`<div style="text-align:center;padding:1rem"><div style="font-size:1.4rem;color:#e67e22;margin-bottom:.5rem">⚠️ 상대방이 나갔습니다</div><div style="color:#aaa;font-size:.85rem">팟이 지급됩니다</div></div>`;}
    return;
  }
  if(d.status==='queued')return;
  if(d.status==='game_over'){mpStopPolling();mpShowGameOver(d);return}
  if(d.status==='in_game'){
    document.getElementById('pvpContent').style.display='none';
    document.getElementById('pvpGameArea').style.display='block';
    mpRenderGame(d);mpLastState=d;
  }
}

// ── Card SVG (mini, faceUp aware) ─────────────────────────────────────────────
function mpCardSVG(card,w,h,isOwner){
  if(!card)return'';
  if(!card.faceUp){
    if(isOwner){
      // Owner can see their own face-down cards, but dimmed
      const c={'♠':'rgba(30,30,80,.8)','♣':'rgba(30,30,80,.8)','♥':'rgba(120,30,30,.8)','♦':'rgba(120,30,30,.8)'}[card.suit]||'rgba(50,50,50,.8)';
      const tc={'♠':'#8888ff','♣':'#8888ff','♥':'#ff8888','♦':'#ff8888'}[card.suit]||'#aaa';
      return`<svg viewBox="0 0 80 112" xmlns="http://www.w3.org/2000/svg" style="width:${w};height:${h};border-radius:5px;box-shadow:0 2px 5px rgba(0,0,0,.4);opacity:.75"><rect width="80" height="112" rx="5" fill="${c}" stroke="#555" stroke-width="1.5"/><text x="5" y="18" font-size="13" font-weight="bold" fill="${tc}">${card.rank}</text><text x="5" y="30" font-size="14" fill="${tc}">${card.suit}</text><text x="40" y="65" font-size="26" fill="${tc}" text-anchor="middle">${card.suit}</text><text x="75" y="108" font-size="13" font-weight="bold" fill="${tc}" text-anchor="end" transform="rotate(180 75 101)">${card.rank}</text><rect width="80" height="112" rx="5" fill="rgba(0,0,0,.3)"/><text x="40" y="60" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.5)">🔒</text></svg>`;
    }
    return`<svg viewBox="0 0 80 112" xmlns="http://www.w3.org/2000/svg" style="width:${w};height:${h};border-radius:5px;box-shadow:0 2px 5px rgba(0,0,0,.4)"><rect width="80" height="112" rx="5" fill="#1a237e" stroke="#333" stroke-width="1.5"/><text x="40" y="65" text-anchor="middle" font-size="30" fill="rgba(255,255,255,.15)">🂠</text></svg>`;
  }
  const c={'♠':'#111','♣':'#111','♥':'#d32f2f','♦':'#d32f2f'}[card.suit];
  return`<svg viewBox="0 0 80 112" xmlns="http://www.w3.org/2000/svg" style="width:${w};height:${h};border-radius:5px;box-shadow:0 2px 5px rgba(0,0,0,.4)"><rect width="80" height="112" rx="5" fill="white" stroke="#ccc" stroke-width="1"/><text x="5" y="18" font-size="13" font-weight="bold" fill="${c}">${card.rank}</text><text x="5" y="30" font-size="14" fill="${c}">${card.suit}</text><text x="40" y="65" font-size="26" fill="${c}" text-anchor="middle">${card.suit}</text><text x="75" y="108" font-size="13" font-weight="bold" fill="${c}" text-anchor="end" transform="rotate(180 75 101)">${card.rank}</text></svg>`;
}

function mpCardsRow(cards,w,h,discardable,selectedDiscard,isOwner){
  if(!cards||!cards.length)return'';
  return cards.map((c,i)=>{
    const isSelected=selectedDiscard===i;
    const border=isSelected?'border:2px solid #e74c3c;border-radius:7px;':
                 discardable?'border:2px solid rgba(231,76,60,.35);border-radius:7px;cursor:pointer;':
                 'border-radius:5px;';
    return`<div style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;${border};padding:1px"
      ${discardable?`onclick="mpSelectDiscard(${i})" ontouchend="event.preventDefault();mpSelectDiscard(${i})"`:''}>
      ${mpCardSVG(c,w,h,isOwner)}
      ${discardable?`<span style="font-size:.52rem;color:${isSelected?'#e74c3c':'rgba(231,76,60,.6)'};font-weight:bold">${isSelected?'✓ 선택':'버리기'}</span>`:''}
    </div>`;
  }).join('');
}

// ── Render game state ─────────────────────────────────────────────────────────
let _discardSelected=null;

function mpRenderGame(d){
  const g=document.getElementById('pvpGameArea');
  const phase=d.phase;
  const potStr=d.pot?shortFmt(BigInt(d.pot))+'칩':'0칩';
  const baseStr=d.baseBet?shortFmt(BigInt(d.baseBet))+'칩':'미설정';

  g.innerHTML=`
<div style="background:rgba(0,0,0,.4);border-radius:10px;padding:.55rem .75rem;margin-bottom:.45rem">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <div style="text-align:center;flex:1">
      <div style="color:#2ecc71;font-size:.75rem;font-weight:bold">${escHtml(d.myNick||'나')}${d.myFolded?'<span style="color:#e74c3c;font-size:.65rem"> [폴드]</span>':''}</div>
      <div style="font-size:.62rem;color:#aaa">${d.myChips?shortFmt(BigInt(d.myChips)):'-'}칩</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:.65rem;color:#888">팟</div>
      <div style="font-size:1rem;color:#f1c40f;font-weight:bold">${potStr}</div>
      <div style="font-size:.58rem;color:#555">앤티 ${baseStr}</div>
    </div>
    <div style="text-align:center;flex:1">
      <div style="color:#e74c3c;font-size:.75rem;font-weight:bold">${escHtml(d.opNick||'상대')}${d.opFolded?'<span style="color:#e74c3c;font-size:.65rem"> [폴드]</span>':''}</div>
      <div style="font-size:.62rem;color:#aaa">${d.opChips?shortFmt(BigInt(d.opChips)):'-'}칩</div>
    </div>
  </div>
  <div style="font-size:.65rem;color:#666;text-align:center;margin-top:.25rem">${mpPhaseLabel(phase)}</div>
</div>

<div style="margin-bottom:.4rem">
  <div style="font-size:.62rem;color:#e74c3c;margin-bottom:.2rem">상대 카드 (공개만 보임)</div>
  <div style="display:flex;gap:.25rem;flex-wrap:wrap;min-height:60px">${mpCardsRow(d.opCards,'44px','62px',false,null)}</div>
</div>

<div style="margin-bottom:.4rem">
  <div style="font-size:.62rem;color:#2ecc71;margin-bottom:.2rem">내 카드${phase==='discard'&&!d.myActed?' — 버릴 카드 선택':''}</div>
  <div id="pvpMyCardsRow" style="display:flex;gap:.25rem;flex-wrap:wrap;min-height:72px">
    ${mpCardsRow(d.myCards,'52px','73px',phase==='discard'&&!d.myActed,_discardSelected,true)}
  </div>
  ${phase==='discard'&&!d.myActed&&_discardSelected!==null?
    `<button class="btn-primary" style="font-size:.8rem;margin-top:.35rem;background:linear-gradient(135deg,#e74c3c,#c0392b)" onclick="mpConfirmDiscard()">선택한 카드 버리기 (${_discardSelected+1}번)</button>`:''}
</div>

<div id="pvpActionArea" style="text-align:center;margin-top:.35rem">${mpActionHTML(d)}</div>
<div id="pvpStatusMsg" style="text-align:center;color:#888;font-size:.75rem;margin-top:.28rem">${mpStatusLabel(d)}</div>
`;
}

function mpPhaseLabel(p){return{setting_bet:'앤티 설정',discard:'버릴 카드 선택',bet1:'1차 베팅',bet2:'2차 베팅',bet3:'3차 베팅',showdown:'패 공개',finished:'게임 종료'}[p]||p}
function mpStatusLabel(d){
  if(d.phase==='discard'){if(d.myActed)return'상대 선택 대기 중...';return'';}
  if(['bet1','bet2','bet3'].includes(d.phase)){if(!d.isMyTurn)return'상대 베팅 중...';return'';}
  return'';
}

function mpActionHTML(d){
  const {phase,isMyTurn,isSetter,myActed,roundHighBet,myRoundPaid,baseBet}=d;
  const baseNum=baseBet?Number(BigInt(baseBet)):0;
  if(phase==='setting_bet'){
    if(isSetter){
      return`<div>
<p style="color:#aaa;font-size:.78rem;margin-bottom:.38rem">게임 시작 준비<br><span style="font-size:.65rem">앤티(기본 베팅값)는 서버가 자동 계산합니다</span></p>
<button class="btn-primary" style="font-size:.88rem" onclick="mpSetBaseBet()">게임 시작 ▶</button>
</div>`;
    }
    return`<p style="color:#aaa;font-size:.82rem">상대가 게임 시작 중...</p>`;
  }

  if(phase==='discard'){
    if(myActed)return`<p style="color:#aaa;font-size:.8rem">버리기 완료. 상대 대기 중...</p>`;
    return'';
  }

  if(['bet1','bet2','bet3'].includes(phase)){
    if(!isMyTurn)return`<p style="color:#aaa;font-size:.8rem">상대 베팅 중...</p>`;
    const callNeed=(roundHighBet||0)-(myRoundPaid||0);
    const canCheck=callNeed===0;
    const pot=d.pot?BigInt(d.pot):0n;
    const base=baseBet?BigInt(baseBet):1n;

    // 버튼별 금액 계산 (단위 기준)
    const halfUnits=Math.max(1,Math.round(Number(pot/base)/2));
    const quarterUnits=Math.max(1,Math.round(Number(pot/base)/4));
    const fullUnits=Number(pot/base);
    const callUnits=callNeed;

    const betBtn=(label,units,color,title)=>{
      const disabled=units<=0&&!canCheck;
      return`<button
        title="${title||''}"
        onclick="mpBetAction('${units===callUnits?'call':'raise'}',${units})"
        style="background:${color};color:${color.includes('rgba')?'#e74c3c':'white'};border:${color.includes('rgba')?'1px solid rgba(231,76,60,.5)':'none'};padding:.42rem .75rem;border-radius:8px;font-weight:bold;cursor:pointer;font-size:.78rem;touch-action:manipulation;white-space:nowrap${disabled?';opacity:.4;cursor:not-allowed':''}"
        ${disabled?'disabled':''}>${label}</button>`;
    };

    return`<div>
<div style="font-size:.65rem;color:#777;margin-bottom:.3rem">단위 ${shortFmt(base)}칩 · 팟 ${shortFmt(pot)}칩</div>
<div style="display:flex;gap:.3rem;justify-content:center;flex-wrap:wrap">
  ${canCheck
    ? betBtn('체크 ✓', 0, 'linear-gradient(135deg,#27ae60,#1e8449)', '추가 베팅 없이 넘기기')
    : betBtn(`콜 +${callUnits}단위`, callUnits, 'linear-gradient(135deg,#27ae60,#1e8449)', `상대 베팅 따라가기 (+${shortFmt(base*BigInt(callUnits))}칩)`)}
  ${betBtn('풀 '+fullUnits+'단위', fullUnits, 'linear-gradient(135deg,#e67e22,#d35400)', `팟 전액 레이즈 (+${shortFmt(base*BigInt(fullUnits))}칩)`)}
  ${betBtn('하프 '+halfUnits+'단위', halfUnits, 'linear-gradient(135deg,#3498db,#2980b9)', `팟 절반 레이즈 (+${shortFmt(base*BigInt(halfUnits))}칩)`)}
  ${betBtn('쿼터 '+quarterUnits+'단위', quarterUnits, 'linear-gradient(135deg,#8e44ad,#6c3483)', `팟 1/4 레이즈 (+${shortFmt(base*BigInt(quarterUnits))}칩)`)}
  ${betBtn('다이 ✗', -1, 'rgba(231,76,60,.15)', '폴드 (이번 판 포기)')}
</div>
</div>`;
  }
  }
  return'';
}

// ── User interactions ─────────────────────────────────────────────────────────
async function mpSetBaseBet(){
  try{const res=await mpFetch('set_bet',{});const d=await res.json();
    if(!res.ok){alert(d.error||'오류');return}mpHandleState(d);mpLastState=d;}
  catch(e){alert('서버 오류')}
}

function mpSelectDiscard(idx){
  _discardSelected=_discardSelected===idx?null:idx;
  // re-render just the cards + confirm button
  if(!mpLastState)return;
  const d=mpLastState;
  document.getElementById('pvpMyCardsRow').innerHTML=mpCardsRow(d.myCards,'52px','73px',true,_discardSelected,true);
  // Show/hide confirm button
  let confirmBtn=document.getElementById('pvpDiscardConfirm');
  if(_discardSelected!==null){
    if(!confirmBtn){
      confirmBtn=document.createElement('button');confirmBtn.id='pvpDiscardConfirm';
      confirmBtn.className='btn-primary';confirmBtn.style.cssText='font-size:.8rem;margin-top:.35rem;background:linear-gradient(135deg,#e74c3c,#c0392b);display:block;margin:0 auto .3rem';
      document.getElementById('pvpMyCardsRow').after(confirmBtn);
    }
    confirmBtn.textContent=`선택한 카드 버리기 (${_discardSelected+1}번)`;
    confirmBtn.onclick=mpConfirmDiscard;
    confirmBtn.addEventListener('touchend',e=>{e.preventDefault();mpConfirmDiscard()},{passive:false});
  }else if(confirmBtn){confirmBtn.remove();}
}

async function mpConfirmDiscard(){
  if(_discardSelected===null){alert('버릴 카드를 선택하세요');return}
  const idx=_discardSelected;
  try{const res=await mpFetch('discard',{discardIdx:idx});const d=await res.json();
    if(!res.ok){alert(d.error||'오류');return}
    _discardSelected=null;mpHandleState(d);mpLastState=d;}
  catch(e){alert('서버 오류')}
}




async function mpBetAction(act, units){
  const raiseUnits = (act === 'raise' && units > 0) ? units : (parseInt(units) || 1);
  const finalAct = (act === 'raise' && units === -1) ? 'fold' : act;
  try{const res=await mpFetch('bet_action',{betAction:finalAct,raiseUnits});const d=await res.json();
    if(!res.ok){alert(d.error||'오류');return}mpHandleState(d);mpLastState=d;}
  catch(e){alert('서버 오류')}
}

// ── Game over ─────────────────────────────────────────────────────────────────
function mpShowGameOver(d){
  const g=document.getElementById('pvpGameArea');
  const isWin=d.winner==='me',isTie=d.winner==='tie';
  const color=isWin?'#2ecc71':isTie?'#f1c40f':'#e74c3c';
  const msg=isWin?'🎉 승리!':isTie?'🤝 무승부':'😢 패배';
  const potStr=d.stakeAmount?shortFmt(BigInt(d.stakeAmount))+'칩':'?';
  const sr=d.showdownResult||(mpLastState&&mpLastState.showdownResult);
  let handInfo='';
  if(sr&&!sr.byFold&&sr.p0HandName)handInfo=`<div style="font-size:.75rem;color:#aaa;margin:.3rem 0">나: ${sr.p0HandName} / 상대: ${sr.p1HandName}</div>`;
  else if(sr?.byFold)handInfo=`<div style="font-size:.75rem;color:#aaa;margin:.3rem 0">폴드로 종료</div>`;
  const myCards=(d.myCards||(mpLastState?.myCards)||[]).map(c=>({...c,faceUp:true}));
  const opCards=(d.opCards||(mpLastState?.opCards)||[]).map(c=>({...c,faceUp:true}));
  g.innerHTML=`<div style="text-align:center;padding:.5rem">
<div style="font-size:2rem;font-weight:bold;color:${color};margin:.4rem 0">${msg}</div>
<div style="font-size:.95rem;color:#f1c40f;margin:.25rem 0">팟 ${potStr}</div>
${handInfo}
<div style="display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap;margin:.5rem 0">
  <div><div style="font-size:.6rem;color:#2ecc71;margin-bottom:.15rem">내 패</div><div style="display:flex;gap:.18rem">${mpCardsRow(myCards,'42px','59px',false,null,true)}</div></div>
  <div><div style="font-size:.6rem;color:#e74c3c;margin-bottom:.15rem">상대 패</div><div style="display:flex;gap:.18rem">${mpCardsRow(opCards,'42px','59px',false,null)}</div></div>
</div>
<button class="btn-primary" onclick="mpExit()" style="margin-top:.6rem">나가기</button>
</div>`;
  if(isWin)sfxWin();else if(!isTie)sfxLose();
  reloadMyChips();
}

// ── Queue / Exit ──────────────────────────────────────────────────────────────
async function mpJoinQueue(){
  if(!sessionNickname){document.getElementById('authModal').classList.add('show');return}
  document.getElementById('pvpContent').innerHTML=`<div class="loading-spinner" style="margin:1rem auto;width:34px;height:34px"></div><p style="color:#f1c40f;margin-top:.7rem">매칭 대기 중...</p><button class="btn-secondary" onclick="mpCancelQueue()" style="margin-top:.7rem">취소</button>`;
  try{const res=await mpFetch('queue');const d=await res.json();
    if(!res.ok){document.getElementById('pvpContent').innerHTML=`<p style="color:#e74c3c">${escHtml(d.error)}</p><button class="btn-primary" onclick="mpJoinQueue()" style="margin-top:.9rem">다시 시도</button>`;return}
    if(d.status==='in_game'||d.status==='game_over')mpHandleState(d);
    mpStartPolling();
  }catch(e){document.getElementById('pvpContent').innerHTML=`<p style="color:#e74c3c">서버 연결 실패</p><button class="btn-primary" onclick="mpJoinQueue()" style="margin-top:.9rem">다시 시도</button>`}
}
async function mpCancelQueue(){mpStopPolling();try{await mpFetch('cancel_queue')}catch(e){}document.getElementById('pvpContent').innerHTML=`<p style="color:#aaa;margin-bottom:.9rem">취소됨</p><button class="btn-primary" onclick="mpJoinQueue()">다시 매칭</button>`}
function mpExit(){
  mpStopPolling();mpLastState=null;_discardSelected=null;
  document.getElementById('pvpGameArea').style.display='none';
  document.getElementById('pvpContent').innerHTML=`<p style="color:#aaa;margin-bottom:.9rem">실시간 1:1 세븐 포커!</p><button class="btn-primary" onclick="mpJoinQueue()">매칭 시작</button>`;
  document.getElementById('pvpContent').style.display='block';
}
window.addEventListener('beforeunload',()=>{if(sessionNickname&&sessionToken&&mpPollTimer)try{navigator.sendBeacon('/api/mp?action=leave',new Blob([JSON.stringify({nickname:sessionNickname,token:sessionToken})],{type:'application/json'}))}catch(e){}});
