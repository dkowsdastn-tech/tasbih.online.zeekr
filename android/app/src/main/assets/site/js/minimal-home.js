/* Nur v11 UI layer: preserves existing controls and moves them below the counter. */
(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);

  const labels = {
    ru: { more: 'Ещё', basics: 'Полезно знать', items: [
      ['Простой режим', 'Первый экран оставлен спокойным: только свободный тасбих и круг-счётчик. Остальные функции находятся ниже.'],
      ['Источники', 'Если в карточке указана ссылка на источник, её можно открыть и сверить формулировку в первоисточнике.'],
      ['Приватность', 'Счётчик и настройки хранятся в этом браузере. Не добавляйте личные данные в публичные истории.'],
      ['Режим тишины', 'Дополнительные элементы можно скрыть, чтобы оставить на экране только практику счёта.'],
      ['Работа как приложение', 'Nur можно установить как PWA в поддерживаемом браузере и открывать почти как обычное приложение.'],
      ['Доступность', 'Есть тёмная тема, уменьшение анимаций, клавиатурная навигация и сенсорное управление.']
    ]},
    en: { more: 'More', basics: 'Good to know', items: [
      ['Simple mode', 'The first screen stays calm: a free tasbih and the counter circle. Extra tools remain below.'],
      ['Sources', 'When a card includes a source link, open it to check the wording in the primary source.'],
      ['Privacy', 'Counter data and preferences stay in this browser. Avoid personal details in public stories.'],
      ['Focus mode', 'Extra interface can be hidden so only the counting practice remains visible.'],
      ['Installable', 'Nur can be installed as a PWA in supported browsers and used like an app.'],
      ['Accessibility', 'Dark theme, reduced motion, keyboard navigation and touch controls are supported.']
    ]}
  };

  function copy() {
    const lang = document.documentElement.lang || 'ru';
    return labels[lang] || labels.en;
  }

  function buildHomeTools() {
    const section = $('#tasbih');
    if (!section || $('#homeTools')) return;

    const details = document.createElement('details');
    details.id = 'homeTools';
    details.className = 'home-tools';

    const summary = document.createElement('summary');
    summary.id = 'homeToolsSummary';
    summary.textContent = copy().more;

    const inner = document.createElement('div');
    inner.className = 'home-tools-inner';

    const headerActions = $('.tasbih-header-actions', section);
    const practicePanel = $('#practicePanel');
    const actions = $('.tasbih-actions', section);
    const restart = $('#restartCycle');
    const status = $('#tasbihStatus');

    [headerActions, practicePanel, actions, restart, status].forEach(node => {
      if (node) inner.append(node);
    });

    details.append(summary, inner);
    section.append(details);
  }

  function buildKnowledgeBasics() {
    const screen = $('#knowledge');
    if (!screen || $('#knowledgeBasics')) return;

    const section = document.createElement('section');
    section.id = 'knowledgeBasics';
    section.className = 'knowledge-basics';

    const title = document.createElement('h2');
    title.id = 'knowledgeBasicsTitle';

    const grid = document.createElement('div');
    grid.className = 'knowledge-basics-grid';
    grid.id = 'knowledgeBasicsGrid';

    section.append(title, grid);
    screen.append(section);
    renderKnowledgeBasics();
  }

  function renderKnowledgeBasics() {
    const title = $('#knowledgeBasicsTitle');
    const grid = $('#knowledgeBasicsGrid');
    if (!title || !grid) return;
    const data = copy();
    title.textContent = data.basics;
    const fragment = document.createDocumentFragment();
    for (const [heading, body] of data.items) {
      const card = document.createElement('article');
      const strong = document.createElement('strong');
      const p = document.createElement('p');
      strong.textContent = heading;
      p.textContent = body;
      card.append(strong, p);
      fragment.append(card);
    }
    grid.replaceChildren(fragment);
  }

  function syncHomeState() {
    const active = $('#tasbih')?.classList.contains('active');
    document.body.classList.toggle('home-minimal', Boolean(active));
  }

  function refreshLabels() {
    const summary = $('#homeToolsSummary');
    if (summary) summary.textContent = copy().more;
    renderKnowledgeBasics();
  }

  function init() {
    buildHomeTools();
    buildKnowledgeBasics();
    syncHomeState();

    document.addEventListener('click', event => {
      if (event.target.closest('.nav-item')) requestAnimationFrame(syncHomeState);
    });
    window.addEventListener('hashchange', () => requestAnimationFrame(syncHomeState));

    $('#languageSelect')?.addEventListener('change', () => setTimeout(refreshLabels, 0));
    $('#settingsLanguageSelect')?.addEventListener('change', () => setTimeout(refreshLabels, 0));

    const observer = new MutationObserver(syncHomeState);
    document.querySelectorAll('.screen').forEach(screen => observer.observe(screen, { attributes: true, attributeFilter: ['class'] }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
