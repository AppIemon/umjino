// ═══════════════════════════════════════════
// stickman.js  –  online presence stickmen
// ═══════════════════════════════════════════

let stickmanData={};
const SM_COLORS=['#3498db','#e74c3c','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#e91e63','#00bcd4','#ff9800'];
function nickColor(nick){let h=0;for(let i=0;i<nick.length;i++)h=(h*31+nick.charCodeAt(i))>>>0;return SM_COLORS[h%SM_COLORS.length]}

function createStickmanEl(nick){
  const wrap=document.createElement('div');wrap.className='stickman-wrap';
  const nameEl=document.createElement('div');nameEl.className='stickman-nick';nameEl.textContent=nick;
  const color=nickColor(nick);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 22 50');svg.setAttribute('class','stickman-body');
  svg.innerHTML=`
<circle cx="11" cy="5" r="4.5" fill="none" stroke="${color}" stroke-width="1.8"/>
<line x1="11" y1="10" x2="11" y2="32" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
<line x1="11" y1="16" x2="4" y2="26" stroke="${color}" stroke-width="1.8" stroke-linecap="round" class="al"/>
<line x1="11" y1="16" x2="18" y2="26" stroke="${color}" stroke-width="1.8" stroke-linecap="round" class="ar"/>
<line x1="11" y1="32" x2="4" y2="48" stroke="${color}" stroke-width="1.8" stroke-linecap="round" class="ll"/>
<line x1="11" y1="32" x2="18" y2="48" stroke="${color}" stroke-width="1.8" stroke-linecap="round" class="lr"/>`;
  wrap.appendChild(nameEl);wrap.appendChild(svg);
  return wrap;
}
function animateStickman(el,t){
  const svg=el.querySelector('.stickman-body');if(!svg)return;
  const ph=Math.sin(t*0.09)*0.9;
  const al=svg.querySelector('.al'),ar=svg.querySelector('.ar'),ll=svg.querySelector('.ll'),lr=svg.querySelector('.lr');
  if(al)al.setAttribute('x2',String(4+ph*3));if(ar)ar.setAttribute('x2',String(18-ph*3));
  if(ll)ll.setAttribute('x2',String(4+ph*2.5));if(lr)lr.setAttribute('x2',String(18-ph*2.5));
}
let _smFrame=0;
function smAnimLoop(){
  _smFrame++;const W=window.innerWidth;
  Object.values(stickmanData).forEach(s=>{
    if(!s.el)return;
    s.x+=s.speed*s.dir;
    if(s.x>W+10){s.x=W+10;s.dir=-1;s.el.querySelector('.stickman-body').style.transform='scaleX(-1)'}
    if(s.x<-22){s.x=-22;s.dir=1;s.el.querySelector('.stickman-body').style.transform='scaleX(1)'}
    s.el.style.left=s.x+'px';
    animateStickman(s.el,_smFrame);
  });
  requestAnimationFrame(smAnimLoop);
}
function updateStickmen(onlineNicks){
  const layer=document.getElementById('stickmanLayer'),W=window.innerWidth;
  onlineNicks.forEach(nick=>{
    if(!stickmanData[nick]){
      const el=createStickmanEl(nick),x=Math.random()*W,dir=Math.random()<.5?1:-1,speed=0.4+Math.random()*0.6;
      stickmanData[nick]={x,dir,speed,el};el.style.left=x+'px';
      if(dir<0)el.querySelector('.stickman-body').style.transform='scaleX(-1)';
      layer.appendChild(el);
    }
  });
  Object.keys(stickmanData).forEach(nick=>{
    if(!onlineNicks.includes(nick)){stickmanData[nick].el&&stickmanData[nick].el.remove();delete stickmanData[nick]}
  });
}
let presenceTimer=null;
async function presenceTick(){
  if(!sessionNickname||!sessionToken)return;
  try{
    const res=await fetchT('/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:sessionNickname,token:sessionToken})},5000);
    if(!res.ok)return;const data=await res.json();updateStickmen(data.online||[]);
  }catch(e){}
}
function startPresence(){if(presenceTimer)return;presenceTick();presenceTimer=setInterval(presenceTick,14000)}
