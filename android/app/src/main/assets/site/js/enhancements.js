// Included in the distributable bundle before app startup.
function sourceUrl(source = '') {
  const match = source.match(/(?:Bukhari|Бухари)[,،]?\s*(\d+[a-z]?)/i);
  if (match) return `https://sunnah.com/bukhari:${match[1]}`;
  const muslim = source.match(/(?:Muslim|Муслим)[,،]?\s*(\d+[a-z]?)/i);
  if (muslim) return `https://sunnah.com/muslim:${muslim[1]}`;
  const quran = source.match(/(?:Qur.?an|Коран)[,،]?\s*(\d+):(\d+)/i);
  return quran ? `https://quran.com/${quran[1]}/${quran[2]}` : 'https://sunnah.com/';
}
function renderExtraLabels() {
  const labels = { clearCurrent:'reset', toggleFocusMode:'focus', exitFocus:'exit', knowledgeSearch:'search', soundStyle:'soundStyle', countButton:'count' };
  for (const [id,key] of Object.entries(labels)) {
    const node = document.getElementById(id);
    node.title = t(`new.${key}`, node.title);
    if (id !== 'countButton') node.setAttribute('aria-label', node.title);
  }
  $('#knowledgeSearch').placeholder = t('new.search', 'Find a reminder');
  $('#restartCycle').textContent = t('new.restart', 'Another round');
  $('#soundStyle').value = preferences.soundStyle;
  [...$('#soundStyle').options].forEach(o => o.textContent = t(`new.${o.value}`, o.textContent));
}
function bindExtras() {
  $('#exitFocus').addEventListener('click', toggleFocusMode);
  $('#restartCycle').addEventListener('click', clearCurrentPractice);
  $('#knowledgeSearch').addEventListener('input', renderKnowledge);
  $('#soundStyle').addEventListener('change', e => { setPreference('soundStyle', e.target.value); playSound('count'); });
  // A swipe starts only on reading space, never on controls, filters or scratch canvas.
  const order = ['tasbih','scratch','knowledge','quran','settings'];
  let swipe = null;
  const main = $('#appMain');
  main.addEventListener('pointerdown', e => {
    swipe = null;
    if (e.pointerType !== 'touch' || !e.isPrimary || $('.app-shell').classList.contains('focus-mode') || $('dialog[open]')) return;
    if (e.clientX < 24 || e.clientX > innerWidth - 24 || e.target.closest('button,a,input,textarea,select,canvas,summary,.knowledge-filters')) return;
    swipe = { x:e.clientX, y:e.clientY, time:performance.now(), id:e.pointerId };
  }, {passive:true});
  main.addEventListener('pointerup', e => {
    if (!swipe || swipe.id !== e.pointerId) return;
    const dx=e.clientX-swipe.x, dy=e.clientY-swipe.y, elapsed=performance.now()-swipe.time;
    swipe=null;
    if (elapsed > 700 || Math.abs(dx)<70 || Math.abs(dx)<Math.abs(dy)*2) return;
    const direction = (dx<0 ? 1:-1)*(document.documentElement.dir==='rtl' ? -1:1);
    const target=order[order.indexOf(activeScreen)+direction];
    if(target) { activateScreen(target); haptic(6); }
  }, {passive:true});
  main.addEventListener('pointercancel',()=>{swipe=null;},{passive:true});
  // Back/forward and links from the help page address the actual tab.
  const fromHash=()=>{const target=location.hash.slice(1);if(order.includes(target))activateScreen(target);};
  window.addEventListener('hashchange',fromHash);
  fromHash();
}
