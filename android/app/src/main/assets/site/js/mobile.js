(() => {
  const $ = s => document.querySelector(s);
  const img = name => { const el=document.createElement('img');el.src='./assets/'+name+'.svg';el.alt='';el.setAttribute('aria-hidden','true');return el; };
  const english=()=>document.documentElement.lang!=='ru';
  const label=(ru,en)=>window.NUR_UI_TEXT?.[document.documentElement.lang]?.[ru] || (english()?en:ru);
  const icons={tasbih:'brand',scratch:'sun',knowledge:'book',quran:'quran',settings:'settings'};
  function roundControl(button,icon,text){
    button.replaceChildren(img(icon));const caption=document.createElement('small');caption.textContent=text;button.append(caption);button.setAttribute('aria-label',text);button.title=text;
  }
  function setup(){
    document.querySelectorAll('.nav-item').forEach(button=>button.querySelector('span').replaceChildren(img(icons[button.dataset.target])));
    $('.brand').textContent='TASBIH ONLINE';
    $('.quran-art').replaceChildren();
    document.querySelectorAll('.tasbih-actions [aria-hidden],#newSunna [aria-hidden]').forEach(el=>el.remove());
    $('#clearCurrent').textContent=label('Сбросить','Reset');
    $('#toggleFocusMode').textContent=label('Только счёт','Focus');
    const choice=document.createElement('details');choice.className='practice-choice';
    const summary=document.createElement('summary');const title=document.createElement('span');title.id='choiceTitle';summary.append(title);
    const content=document.createElement('div');content.className='choice-content';
    ['.tasbih-actions','.tasbih-header-actions','#practicePanel'].forEach(s=>{const el=$(s);if(el)content.append(el)});
    choice.append(summary,content);$('#tasbih').append(choice);
    const topControls=document.createElement('div');topControls.className='top-controls';topControls.append($('#toggleFocusMode'),$('#themeToggle'));$('.topbar').append(topControls);
    $('#toggleFocusMode').addEventListener('click',()=>{if(!$('#tasbih').classList.contains('active'))$('.nav-item[data-target="tasbih"]').click();},{capture:true});
    choice.addEventListener('toggle',()=>{
      if(choice.open) requestAnimationFrame(()=>choice.scrollIntoView({block:'center',behavior:'auto'}));
    });
    const button=$('#countButton');button.addEventListener('click',()=>{if(button.getAttribute('aria-disabled')==='true')return;button.classList.remove('tap-wave');void button.offsetWidth;button.classList.add('tap-wave');});
    $('#practiceList').addEventListener('click',e=>{if(e.target.closest('[data-collection]')){choice.open=false;window.scrollTo({top:0,behavior:'auto'});}});
    ['#toggleFocusMode','#exitFocus'].forEach(selector=>$(selector).addEventListener('click',()=>requestAnimationFrame(refreshControls)));
    $('#newSunna').addEventListener('click',()=>{setTimeout(()=>{$('#revealSunna').click();const card=$('#scratchCard');card.classList.remove('sunna-enter');void card.offsetWidth;card.classList.add('sunna-enter');},0);});$('#revealSunna').click();
    window.addEventListener('hashchange',()=>window.scrollTo({top:0,behavior:'auto'}));
    document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{window.scrollTo({top:0,behavior:'auto'});if(b.dataset.target==='scratch')setTimeout(()=>$('#revealSunna').click(),0);}));
    document.querySelectorAll('.settings-card button[role="switch"]').forEach((button,i)=>{
      const heading=button.closest('.settings-card').querySelector('h3');
      if(heading){heading.id='switch-label-'+i;button.setAttribute('aria-labelledby',heading.id);}
    });
    const phrase=document.createElement('div');phrase.id='activePhrase';phrase.className='active-phrase';phrase.hidden=true;
    const arabic=document.createElement('p');arabic.lang='ar';arabic.dir='rtl';arabic.className='active-arabic';
    const transcription=document.createElement('p');transcription.className='active-transcription';phrase.append(arabic,transcription);button.after(phrase);
    function syncPhrase(){const free=$('#tasbih').classList.contains('free-practice');phrase.hidden=free;arabic.textContent=$('#practiceArabic').textContent;transcription.textContent=$('#practiceTransliteration').textContent;}
    new MutationObserver(syncPhrase).observe($('#practicePanel'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});syncPhrase();
    refresh();
    ['#languageSelect','#settingsLanguageSelect'].forEach(s=>$(s)?.addEventListener('change',()=>setTimeout(refresh,50)));
  }
  let selected=null,page=0;
  let paperAudio;
  function paperSound(){
    try {
      const prefs=JSON.parse(localStorage.getItem('nur.preferences')||'{}');if(prefs.sound===false)return;
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      paperAudio=paperAudio||new Audio();if(paperAudio.state==='suspended')paperAudio.resume().catch(()=>{});
      const length=Math.floor(paperAudio.sampleRate*.12),buffer=paperAudio.createBuffer(1,length,paperAudio.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/length);
      const source=paperAudio.createBufferSource(),filter=paperAudio.createBiquadFilter(),gain=paperAudio.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.value=1300;filter.Q.value=.65;gain.gain.value=.015;source.connect(filter);filter.connect(gain);gain.connect(paperAudio.destination);source.start();
    }catch{}
  }
  function refreshControls(){
    const focus=$('#toggleFocusMode');
    roundControl(focus,'focus',label('Фокус','Focus'));
    roundControl($('#themeToggle'),'sun',label('Тема','Theme'));
    const clear=$('#clearCurrent');
    clear.textContent=label('Сбросить','Reset');
    clear.setAttribute('aria-label',label('Сбросить счёт','Reset count'));
  }
  function refresh(){
    $('#choiceTitle').textContent=label('Выбрать зикр','Choose dhikr');
    $('#choosePractice [data-i18n]')?.removeAttribute('data-i18n');
    $('#choosePractice span').textContent=label('Список зикров','Dhikr list');
    $('#themeToggle').textContent=label('Тема','Theme');
    $('#clearCurrent').textContent=label('Сбросить','Reset');
    $('#toggleFocusMode').textContent=label('Только счёт','Focus');
    refreshControls();
    $('#settingsLanguageSelect').setAttribute('aria-label',window.NurUI.translate('settings.language','Language'));
    document.querySelectorAll('.help-links a').forEach(a=>{a.lang=document.documentElement.lang==='kk'?'kk':document.documentElement.lang==='ru'?'ru':'en';});
    const code=document.documentElement.lang;
    const help=code==='ru'?null:(code==='kk'?'help-kk.html':'help-en.html');
    document.querySelectorAll('.help-links a').forEach((a,i)=>{
      const names=code==='kk'?['Орнату','Нұсқаулық','Tasbih Online туралы']:code==='ru'?['Установка','Инструкция','О Tasbih Online']:['Install','Guide','About Tasbih Online'];
      a.textContent=names[i];a.href=help?'./'+help+'#'+['install','guide','about'][i]:['./install.html','./guide.html','./about.html'][i];
    });
    document.querySelectorAll('.modal-close').forEach(button=>button.setAttribute('aria-label',window.NurUI.translate('common.close','Close')));
    renderShelf();
  }
  function groups(){
    const all=[...(window.NurUI?.books||[]),...(window.NUR_READING||[])];
    const heart=all.filter(x=>x.category==='heart');
    return [
      {title:label('На сегодня','For today'),subtitle:label('Небольшие добрые шаги','Small good steps'),entries:all.filter(x=>x.category==='daily'||x.category==='character')},
      {title:label('Опора для сердца','Support for the heart'),subtitle:label('Надежда и терпение','Hope and patience'),icon:'book',entries:heart.length?heart:all.slice(0,3)},
      {title:label('Ближе к практике','A mindful practice'),subtitle:label('Зикр, внимание и добрые дела','Dhikr, attention and good deeds'),entries:all.filter(x=>x.category==='practice'||x.category==='daily')}
      ,{title:label('Добрый нрав','Good character'),subtitle:label('Напоминания из хадисов','Reflections on hadith'),entries:all.filter(x=>/Bukhari|Muslim|Бухари|Муслим/.test(x.source)&&['character','heart','daily'].includes(x.category))}
      ,{title:label('Сила постоянства','The strength of consistency'),subtitle:label('Малые дела каждый день','Small deeds every day'),entries:all.filter(x=>/6464|2594|6018|2626/.test(x.source))}
    ];
  }
  function renderShelf(){
    selected=null;const root=$('#bookLibrary');root.replaceChildren();const h=document.createElement('h1');h.className='library-title';h.textContent=label('Библиотека','Library');const lead=document.createElement('p');lead.className='library-lead';lead.textContent=label('Выберите небольшую книгу. Одна страница — одно напоминание.','Choose a short book. One page, one reminder.');
    const shelf=document.createElement('div');shelf.className='book-shelf';
    groups().forEach(group=>{if(!group.entries.length)return;const b=document.createElement('button');b.type='button';b.className='book-cover';const edition=document.createElement('span');edition.className='book-edition';edition.textContent='TASBIH';const title=document.createElement('strong');title.textContent=group.title;const subtitle=document.createElement('small');subtitle.textContent=group.subtitle;b.append(edition,title,subtitle);b.addEventListener('click',()=>{selected=group;page=0;paperSound();renderPage(true);openCover(group);});shelf.append(b);});root.append(h,lead,shelf);
  }
  function renderPage(opening=false){
    const root=$('#bookLibrary');root.replaceChildren();const reader=document.createElement('article');reader.className='book-reader light-page'+(opening?' book-opening':'');const head=document.createElement('div');head.className='reader-head';const back=document.createElement('button');back.type='button';back.textContent=label('← Книги','← Books');back.addEventListener('click',renderShelf);const name=document.createElement('small');name.textContent=selected.title;head.append(back,name);
    const item=selected.entries[page], copy=window.NurUI.copy;const body=document.createElement('section');body.className='reader-page';body.tabIndex=-1;body.setAttribute('aria-live','polite');const title=document.createElement('h2');title.textContent=copy(item.title);const text=document.createElement('p');text.textContent=copy(item.text);const action=document.createElement('p');action.className='book-action';action.textContent=copy(item.action);const source=document.createElement('a');source.textContent=item.source+' ↗';source.href=item.url||window.NurUI.source(item.source);source.target='_blank';source.rel='noopener';const note=document.createElement('small');note.className='reading-note';note.textContent=label('Краткое напоминание по смыслу источника','A short reflection on the source');body.append(title,text,action,source,note);
    const controls=document.createElement('nav');controls.className='reader-controls';controls.setAttribute('aria-label',label('Страницы книги','Book pages'));const prev=document.createElement('button');prev.type='button';prev.textContent=label('Назад','Back');prev.disabled=page===0;prev.addEventListener('click',()=>turn(-1));const next=document.createElement('button');next.type='button';next.textContent=page===selected.entries.length-1?label('К книгам','Library'):label('Далее','Next');next.addEventListener('click',()=>page===selected.entries.length-1?renderShelf():turn(1));controls.append(prev,next);reader.append(head,body,controls);root.append(reader);
    reader.addEventListener('pointerdown',e=>e.stopPropagation());
    reader.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();turn(1)}if(e.key==='ArrowLeft'){e.preventDefault();turn(-1)}});
    let start=null;body.addEventListener('touchstart',e=>{start={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});body.addEventListener('touchend',e=>{if(!start)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)turn(dx<0?1:-1);start=null;},{passive:true});
  }
  function reduced(){return document.documentElement.dataset.reduceMotion==='true'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
  function openCover(group){
    if(reduced())return;
    const cover=document.createElement('div');cover.className='reader-opening-cover';cover.setAttribute('aria-hidden','true');
    const brand=document.createElement('small');brand.textContent='TASBIH ONLINE';const title=document.createElement('strong');title.textContent=group.title;const subtitle=document.createElement('span');subtitle.textContent=group.subtitle;cover.append(brand,title,subtitle);$('.book-reader').append(cover);setTimeout(()=>cover.remove(),850);
  }
  function turn(delta){
    const next=page+delta;if(next<0||next>=selected.entries.length)return;
    const old=$('.reader-page').cloneNode(true);page=next;paperSound();renderPage();
    if(!reduced()){
      old.className='reader-page page-leaf '+(delta<0?'leaf-back':'leaf-forward');old.setAttribute('aria-hidden','true');old.inert=true;
      const fresh=$('.reader-page');old.style.top=fresh.offsetTop+'px';old.style.left=fresh.offsetLeft+'px';old.style.width=fresh.offsetWidth+'px';old.style.minHeight=fresh.offsetHeight+'px';$('.book-reader').append(old);setTimeout(()=>old.remove(),680);
    }
    $('.reader-page:not(.page-leaf)').focus({preventScroll:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
