// hwatu-cards.js – 화투 카드 이미지 렌더
function hwatuSrc(card) {
  if (!card || card.faceUp === false || card.img === 'back') return './img/hwatu/back.svg';
  return `./img/hwatu/${card.img}.svg`;
}
function hwatuImg(card, w, h, extraClass) {
  const src = hwatuSrc(card);
  const alt = card && card.faceUp !== false && card.name ? card.name : '화투';
  return `<img class="hwatu-img ${extraClass||''}" src="${src}" alt="${alt}" draggable="false"
    style="width:${w};height:${h}">`;
}
function hwatuBack(w, h) {
  return `<img class="hwatu-img" src="./img/hwatu/back.svg" alt="뒷면" draggable="false"
    style="width:${w};height:${h}">`;
}
function capturedGroups(cards) {
  const g = { gwang: [], yeol: [], tti: [], pi: [] };
  (cards || []).forEach(c => {
    if (c.kind === 'gwang') g.gwang.push(c);
    else if (c.kind === 'yeol') g.yeol.push(c);
    else if (c.kind === 'tti') g.tti.push(c);
    else g.pi.push(c);
  });
  return g;
}
