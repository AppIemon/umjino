'use strict';
const k = require('./korean-cards');
let failed = 0;
function assert(cond, msg) {
  if (!cond) { failed++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}

// 섯다
const sd = (m1, g1, m2, g2, y1, y2) => k.sutdaEval([
  { month: m1, sutdaGwang: !!g1, sutdaYeol: !!y1 || !!g1 },
  { month: m2, sutdaGwang: !!g2, sutdaYeol: !!y2 || !!g2 },
]);
assert(sd(3,1,8,1).name === '삼팔광땡', '38광땡');
assert(sd(1,1,3,1).name === '13광땡', '13광땡');
assert(sd(10,0,10,0).name === '장땡', '장땡');
assert(sd(7,0,7,0).name === '7땡', '7땡');
assert(sd(1,0,2,0).name === '알리', '알리');
assert(sd(4,0,6,0).name === '세륙', '세륙');
assert(sd(9,0,8,0).name === '7끗', '7끗');
assert(sd(5,0,5,0).rank > sd(1,0,2,0).rank, '땡 > 알리');
assert(k.sutdaCompare(sd(3,1,8,1), sd(1,1,8,1)) === 1, '38 > 18광땡');
assert(k.sutdaCompare(sd(4,0,7,0,1,1), sd(1,1,8,1)) === 1, '암행어사 > 광땡');
assert(k.sutdaCompare(sd(3,1,7,0,1,1), sd(8,0,8,0)) === 1, '땡잡이 > 8땡');
assert(k.sutdaCompare(sd(3,1,7,0,1,0), sd(8,0,8,0)) !== 1, '3광+7피는 땡잡이 아님');
assert(k.sutdaCompare(sd(3,1,7,0,1,1), sd(10,0,10,0)) !== 1, '땡잡이 장땡 못잡음');
assert(k.sutdaCompare(sd(4,0,9,0), sd(1,0,2,0)) === 'rematch', '구사 재경기');

const deck = k.createSutdaDeck();
assert(deck.length === 20, '섯다 20장');
assert(k.createHwatuDeck().length === 48, '화투 48장');
assert(new Set(k.hwatuDefs().map(c => c.img)).size >= 40, '이미지 파일명 고유');

// 고스톱 점수
const C = (month, kind, extra={}) => ({ month, kind, id: month+kind+JSON.stringify(extra), ...extra });
const gwang3 = [C(1,'gwang'), C(3,'gwang'), C(8,'gwang')];
assert(k.gostopScore(gwang3).score === 3, '삼광 3점');
assert(k.gostopScore([...gwang3, C(12,'gwang',{bigwang:true})]).score === 4, '사광');
assert(k.gostopScore([...gwang3, C(11,'gwang'), C(12,'gwang',{bigwang:true})]).score === 15, '오광');
assert(k.gostopScore([C(1,'gwang'), C(3,'gwang'), C(12,'gwang',{bigwang:true})]).score === 2, '비삼광');
const godori = [C(2,'yeol',{godori:true}), C(4,'yeol',{godori:true}), C(8,'yeol',{godori:true})];
assert(k.gostopScore(godori).score === 5, '고도리 5');
const hong = [C(1,'tti',{ttiColor:'hong'}), C(2,'tti',{ttiColor:'hong'}), C(3,'tti',{ttiColor:'hong'})];
assert(k.gostopScore(hong).score === 3, '홍단 3');
const tenPi = Array.from({length:10}, (_,i) => C(1,'pi',{n:i}));
assert(k.gostopScore(tenPi).score === 1, '피 10장 1점');

// resolve
const f = (month, id) => ({ month, kind:'pi', id, img:'x' });
const r1 = k.gostopResolve([], f(1,'p'), f(2,'d'));
assert(r1.field.length === 2 && r1.captures.length === 0, '무매칭 바닥 적재');
const r2 = k.gostopResolve([f(1,'a')], f(1,'p'), f(2,'d'));
assert(r2.captures.length === 2 && r2.field.length === 1, '1매칭 가져가기');
const r3 = k.gostopResolve([], f(1,'p'), f(1,'d'));
assert(r3.events.includes('쪽') && r3.captures.length === 2, '쪽');
const r4 = k.gostopResolve([f(1,'a')], f(1,'p'), f(1,'d'));
assert(r4.events.includes('뻑') && r4.field.length === 3, '뻑');
const r5 = k.gostopResolve([f(1,'a'), f(1,'b')], f(1,'p'), f(1,'d'));
assert(r5.events.includes('따닥') && r5.captures.length === 4, '따닥');
const r6 = k.gostopResolve([f(1,'a'), f(2,'b')], f(3,'p'), f(4,'d'));
assert(r6.events.includes('싹쓸이') === false && r6.field.length === 4, '비싹쓸이');
const r7 = k.gostopResolve([f(1,'a')], f(1,'p'), f(1,'x').month===1 ? f(2,'d') : f(2,'d'));
void r7;
const r8 = k.gostopResolve([f(1,'a')], f(1,'p'), f(1,'d'));
assert(r8.peokMonths.includes(1), '뻑 월 기록');

const steal = k.stealPiCards([C(1,'pi'), C(2,'ssangpi')], 1);
assert(steal.stolen.length === 1 && steal.stolen[0].kind === 'pi', '피 한장 뺏기');

const deal = k.gostopDeal();
assert(deal.hands[0].length === 10 && deal.field.length === 8, '맞고 배분');

if (failed) { console.error(failed, 'failed'); process.exit(1); }
console.log('all tests passed');
