import { LANGUAGES, QURAN_SURAHS, RECITERS, DHIKR_COLLECTIONS, KNOWLEDGE_LIBRARY, copyFor } from "./data.js?v=10";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const STORAGE = "nur.";
// Storage may be blocked in private mode or by a browser policy.
const memoryStorage = new Map();
const storage = {
  getItem(key) { try { return localStorage.getItem(key) ?? memoryStorage.get(key) ?? null; } catch { return memoryStorage.get(key) ?? null; } },
  setItem(key, value) { memoryStorage.set(key, String(value)); try { localStorage.setItem(key, String(value)); } catch {} },
  removeItem(key) { memoryStorage.delete(key); try { localStorage.removeItem(key); } catch {} },
  keys() { try { return [...new Set([...Object.keys(localStorage), ...memoryStorage.keys()])]; } catch { return [...memoryStorage.keys()]; } }
};
const DEFAULT_PREFERENCES = { sound: true, haptics: true, reducedMotion: false, soundStyle: "soft" };
const VALID_LANGUAGE_CODES = new Set(LANGUAGES.map(({ code }) => code));
const getSaved = (key, fallback) => { try { return JSON.parse(storage.getItem(STORAGE + key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => storage.setItem(STORAGE + key, JSON.stringify(value));
const getPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const interpolate = (value, vars = {}) => String(value ?? "").replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
const dayStamp = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};
const dayOfYear = () => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86_400_000);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

let language = VALID_LANGUAGE_CODES.has(storage.getItem(STORAGE + "language")) ? storage.getItem(STORAGE + "language") : "ru";
let dictionary = {};
let toastTimer;
let deferredInstall;
let audioContext;
let activeScreen = "tasbih";
let knowledgeFilter = "all";
let storiesLoaded = false;
let storiesBusy = false;
let knowledgeQuestIndex = getSaved("knowledgeQuestIndex", dayOfYear() % KNOWLEDGE_LIBRARY.length);
let scratch = { initialized: false, complete: false, drawing: false, needsLayout: true, last: null, marks: new Uint8Array(), marked: 0, cols: 0, rows: 0, context: null, rect: null, brush: 46 };
let preferences = { ...DEFAULT_PREFERENCES, ...getSaved("preferences", {}) };
let tasbihState = normalizeTasbihState(getSaved("tasbih", { collectionId: "free", current: 0, completed: 0, stepIndex: 0 }));
let scratchIndex = getSaved("scratchIndex", 0);
let quranState = { reciterIndex: 0, surahIndex: 0, ...getSaved("quran", {}) };

const elements = {
  themeToggle: $("#themeToggle"), settingsTheme: $("#settingsTheme"), soundToggle: $("#soundToggle"), hapticsToggle: $("#hapticsToggle"), motionToggle: $("#motionToggle"),
  languageSelect: $("#languageSelect"), settingsLanguageSelect: $("#settingsLanguageSelect"),
  countButton: $("#countButton"), count: $("#countValue"), clearCurrent: $("#clearCurrent"), toggleFocusMode: $("#toggleFocusMode"), saveTasbih: $("#saveTasbih"), practiceSubtitle: $("#practiceSubtitle"), practicePanel: $("#practicePanel"), practiceIcon: $("#practiceIcon"), practiceKicker: $("#practiceKicker"), practiceTitle: $("#practiceTitle"), practiceStep: $("#practiceStep"), practiceArabic: $("#practiceArabic"), practiceTransliteration: $("#practiceTransliteration"), practiceProgress: $("#practiceProgress"), practiceProgressLabel: $("#practiceProgressLabel"), tasbihStatus: $("#tasbihStatus"), practiceDialog: $("#practiceDialog"), practiceList: $("#practiceList"),
  scratchCard: $("#scratchCard"), scratchCanvas: $("#scratchCanvas"), scratchHint: $("#scratchHint"), scratchPercent: $("#scratchPercent"), scratchBar: $("#scratchBar"), sunnaContent: $("#sunnaContent"),
  knowledgeFilters: $("#knowledgeFilters"), knowledgeCards: $("#knowledgeCards"), knowledgeCount: $("#knowledgeCount"), knowledgeQuestTitle: $("#knowledgeQuestTitle"), knowledgeQuestText: $("#knowledgeQuestText"), newKnowledgeQuest: $("#newKnowledgeQuest"), dailyInsightTitle: $("#dailyInsightTitle"), dailyInsightSource: $("#dailyInsightSource"), knowledgeDialog: $("#knowledgeDialog"), knowledgeModalLabel: $("#knowledgeModalLabel"), knowledgeModalTitle: $("#knowledgeModalTitle"), knowledgeModalText: $("#knowledgeModalText"), knowledgeModalSource: $("#knowledgeModalSource"), knowledgeModalAction: $("#knowledgeModalAction"),
  reciter: $("#reciterSelect"), surah: $("#surahSelect"), nowPlaying: $("#nowPlaying"), audio: $("#quranAudio"), seek: $("#audioSeek"), currentTime: $("#currentTime"), duration: $("#duration"), play: $("#playAudio"),
  storiesStatus: $("#storiesStatus"), storiesList: $("#storiesList"), storyDialog: $("#storyDialog"), storyForm: $("#storyForm"), storyAuthor: $("#storyAuthor"), storyTitle: $("#storyTitle"), storyBody: $("#storyBody"), storyConsent: $("#storyConsent"), storyFeedback: $("#storyFeedback"), submitStory: $("#submitStory"),
  install: $("#installApp"), installHint: $("#installHint"), installDialog: $("#installDialog"), installDialogTitle: $("#installDialogTitle"), installDialogText: $("#installDialogText"), installSteps: $("#installSteps"), installPromptButton: $("#installPromptButton"),
  clearDataDialog: $("#clearDataDialog"), toast: $("#toast")
};

function t(path, fallback = "") { return getPath(dictionary, path) ?? fallback; }
function safeDialogOpen(dialog) { if (dialog && !dialog.open) dialog.showModal(); }
function closeDialog(dialog) { if (dialog?.open) dialog.close(); }
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3200);
}

function deepMerge(base, overlay) {
  const result = { ...base };
  if (!overlay || typeof overlay !== "object") return result;
  for (const [key, value] of Object.entries(overlay)) {
    if (value && typeof value === "object" && !Array.isArray(value) && base?.[key] && typeof base[key] === "object" && !Array.isArray(base[key])) result[key] = deepMerge(base[key], value);
    else result[key] = value;
  }
  return result;
}

async function getLocale(code) { return NUR_LOCALES[code] || {}; }

async function loadLanguage(nextLanguage) {
  const requested = VALID_LANGUAGE_CODES.has(nextLanguage) ? nextLanguage : "ru";
  const [english, russian, selected] = await Promise.all([getLocale("en"), getLocale("ru"), getLocale(requested)]);
  dictionary = deepMerge(requested === "ru" ? russian : english, selected);
  language = requested;
  storage.setItem(STORAGE + "language", language);
  document.documentElement.lang = language;
  document.documentElement.dir = ["ar", "fa", "ur"].includes(language) ? "rtl" : "ltr";
  document.title = t("meta.title", language === "ru" ? "Nur — осознанная практика" : "Nur — mindful practice");
  renderLanguageSelects();
  applyTranslations();
}

function renderLanguageSelects() {
  const fill = select => {
    const existing = document.createDocumentFragment();
    for (const item of LANGUAGES) {
      const option = document.createElement("option"); option.value = item.code; option.textContent = item.native; existing.append(option);
    }
    select.replaceChildren(existing); select.value = language;
  };
  fill(elements.languageSelect); fill(elements.settingsLanguageSelect);
}

function applyTranslations() {
  $$('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n, node.textContent); });
  $$('[data-i18n-placeholder]').forEach(node => { node.placeholder = t(node.dataset.i18nPlaceholder, node.placeholder); });
  renderTasbih(); renderSunna(); renderKnowledge(); renderQuranControls(); renderFaq(); updateSettingsControls(); renderExtraLabels();
}

function setPreference(key, value) {
  preferences = { ...preferences, [key]: value };
  save("preferences", preferences);
  document.documentElement.dataset.reduceMotion = String(Boolean(preferences.reducedMotion));
  updateSettingsControls();
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  storage.setItem(STORAGE + "theme", theme);
  document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#0d211d" : "#087a60";
  updateSettingsControls();
}
function updateSettingsControls() {
  const dark = document.documentElement.dataset.theme === "dark";
  elements.settingsTheme.setAttribute("aria-checked", String(dark));
  elements.themeToggle.setAttribute("aria-label", dark ? t("settings.lightTheme", "Use light theme") : t("settings.darkTheme", "Use dark theme"));
  elements.soundToggle.setAttribute("aria-checked", String(Boolean(preferences.sound)));
  elements.hapticsToggle.setAttribute("aria-checked", String(Boolean(preferences.haptics)));
  elements.motionToggle.setAttribute("aria-checked", String(Boolean(preferences.reducedMotion)));
}

function playSound(kind = "tab", variant = "default") {
  if (!preferences.sound || !(window.AudioContext || window.webkitAudioContext)) return;
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const tabNotes = {
      default: [[523.25, 0, .07, .032], [659.25, .055, .1, .026]],
      tasbih: [[523.25, 0, .065, .027], [659.25, .055, .09, .025]],
      scratch: [[392, 0, .075, .027], [523.25, .06, .11, .03]],
      knowledge: [[587.33, 0, .07, .028], [739.99, .055, .11, .028]],
      quran: [[329.63, 0, .08, .022], [493.88, .07, .13, .024]],
      stories: [[698.46, 0, .06, .025], [880, .06, .1, .028]],
      settings: [[466.16, 0, .065, .024], [554.37, .06, .1, .025]]
    };
    const notes = {
      tab: tabNotes[variant] || tabNotes.default,
      count: preferences.soundStyle === "bell" ? [[880, 0, .16, .032], [1320, .015, .12, .008]] : preferences.soundStyle === "wood" ? [[280, 0, .065, .06], [420, 0, .035, .018]] : [[520, 0, .09, .035]],
      goal: [[523.25, 0, .1, .04], [659.25, .1, .1, .035], [783.99, .2, .16, .04]],
      scratch: [[440, 0, .08, .03], [659.25, .075, .13, .035]],
      save: [[587.33, 0, .08, .03], [783.99, .07, .13, .035]],
      send: [[659.25, 0, .09, .03], [880, .08, .09, .026]],
      error: [[330, 0, .12, .025]]
    }[kind] || [];
    const schedule = () => {
      const now = audioContext.currentTime;
      for (const [frequency, delay, duration, volume] of notes) {
        const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.frequency.setValueAtTime(frequency, now + delay);
        gain.gain.setValueAtTime(.0001, now + delay);
        gain.gain.exponentialRampToValueAtTime(volume, now + delay + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, now + delay + duration);
        oscillator.connect(gain).connect(audioContext.destination); oscillator.start(now + delay); oscillator.stop(now + delay + duration + .02);
      }
    };
    if (audioContext.state === "suspended") audioContext.resume().then(schedule).catch(() => {}); else schedule();
  } catch { /* Sound is optional; never break the interaction. */ }
}
function haptic(pattern) { if (preferences.haptics && typeof navigator.vibrate === "function") navigator.vibrate(pattern); }

/* Tasbih collections */
function collectionById(id) { return DHIKR_COLLECTIONS.find(collection => collection.id === id) || DHIKR_COLLECTIONS[0]; }
function normalizeTasbihState(candidate) {
  const legacyCount = Number.isFinite(candidate?.count) ? Math.max(0, candidate.count) : 0;
  const collection = collectionById(candidate?.collectionId || "free");
  const stepIndex = clamp(Math.trunc(Number(candidate?.stepIndex)) || 0, 0, collection.steps.length - 1);
  const step = collection.steps[stepIndex];
  const current = Math.min(step.goal || Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(Number(candidate?.current ?? legacyCount)) || 0));
  const completed = collection.steps.slice(0, stepIndex).reduce((n, s) => n + (s.goal || 0), 0);
  return { done: Boolean(candidate?.done && step.goal && stepIndex === collection.steps.length - 1 && current === step.goal), collectionId: collection.id, stepIndex, current, completed, cycles: Math.max(0, Number(candidate?.cycles) || 0), unsaved: Math.max(0, Number(candidate?.unsaved ?? current + completed) || 0) };
}
function currentCollection() { return collectionById(tasbihState.collectionId); }
function currentStep() { return currentCollection().steps[tasbihState.stepIndex]; }
function totalFor(collection) { return collection.steps.reduce((total, step) => total + (step.goal || 0), 0); }
function totalCurrentCount() { return tasbihState.completed + tasbihState.current; }
function savedTodayCount() { const history = getSaved("tasbihHistory", []); return (Array.isArray(history) ? history : []).filter(item => item?.date === dayStamp()).reduce((total, item) => total + (Number(item.count) || 0), 0); }
function renderTasbih() {
  tasbihState = normalizeTasbihState(tasbihState);
  const collection = currentCollection(); const step = currentStep(); const cycleTotal = totalFor(collection);
  const isFreeCounter = collection.id === "free";
  elements.count.textContent = tasbihState.done ? cycleTotal : tasbihState.current;
  document.getElementById("counterHeading").textContent = isFreeCounter ? t("new.free", "Free tasbih") : copyFor(collection.title, language).split('·')[0].trim();
  document.getElementById("countCaption").textContent = tasbihState.done ? t("new.completed", "Completed") : (step.goal ? `${tasbihState.current} / ${step.goal}` : t("new.tap", "tap the circle"));
  document.getElementById("restartCycle").hidden = !tasbihState.done;
  elements.countButton.setAttribute("aria-label", `${t("new.count", "Count dhikr")}: ${tasbihState.done ? cycleTotal : tasbihState.current}`);
  elements.countButton.setAttribute("aria-disabled", String(tasbihState.done));
  document.getElementById("tasbih").classList.toggle("free-practice", isFreeCounter);
  elements.practiceIcon.textContent = collection.icon;
  elements.practiceKicker.textContent = t("tasbih.currentPractice", "Current practice");
  elements.practiceTitle.textContent = copyFor(collection.title, language);
  elements.practiceSubtitle.textContent = isFreeCounter ? "" : copyFor(collection.description, language);
  elements.practiceSubtitle.hidden = isFreeCounter;
  elements.practicePanel.hidden = isFreeCounter;
  elements.clearCurrent.hidden = false;
  elements.saveTasbih.hidden = true;
  elements.practiceArabic.textContent = step.arabic || t("tasbih.freeArabic", "");
  elements.practiceTransliteration.textContent = (language === "ru" ? step.ru : "") || step.transliteration || t("tasbih.freePrompt", "Choose a dhikr collection when you are ready.");
  if (!step.goal) {
    elements.practiceStep.textContent = "∞"; elements.practiceProgress.style.width = "0%"; elements.practiceProgressLabel.textContent = `${tasbihState.current}`;
  } else {
    const currentOverall = totalCurrentCount();
    elements.practiceStep.textContent = `${tasbihState.stepIndex + 1}/${collection.steps.length}`;
    elements.practiceProgress.style.width = `${clamp(currentOverall / cycleTotal * 100, 0, 100)}%`;
    elements.practiceProgressLabel.textContent = `${currentOverall}/${cycleTotal}`;
  }
  const completedToday = savedTodayCount();
  elements.tasbihStatus.hidden = isFreeCounter && tasbihState.current === 0 && !completedToday;
  elements.tasbihStatus.textContent = completedToday ? interpolate(t("tasbih.savedToday", "Saved today: {count}"), { count: completedToday }) : t("tasbih.ready", "A quiet count, saved only on this device.");
  save("tasbih", tasbihState);
}
function renderPracticeOptions() {
  const fragment = document.createDocumentFragment();
  for (const collection of DHIKR_COLLECTIONS) {
    const button = document.createElement("button"); button.type = "button"; button.className = "practice-option"; button.dataset.collection = collection.id; button.classList.toggle("active", collection.id === tasbihState.collectionId);
    const icon = document.createElement("span"); icon.textContent = collection.icon;
    const copy = document.createElement("span"); const title = document.createElement("strong"); const description = document.createElement("small"); title.textContent = copyFor(collection.title, language); description.textContent = copyFor(collection.description, language); copy.append(title, description);
    const arrow = document.createElement("b"); arrow.textContent = collection.id === tasbihState.collectionId ? "✓" : "›";
    button.append(icon, copy, arrow); fragment.append(button);
  }
  elements.practiceList.replaceChildren(fragment);
}
function choosePractice(collectionId) {
  tasbihState = { collectionId, stepIndex: 0, current: 0, completed: 0, cycles: 0, unsaved: 0 };
  renderTasbih(); closeDialog(elements.practiceDialog); playSound("tab"); haptic(8);
  showToast(interpolate(t("tasbih.practiceSelected", "Selected: {name}"), { name: copyFor(currentCollection().title, language) }));
}
function incrementTasbih() {
  if (tasbihState.done) return;
  const collection = currentCollection(); const step = currentStep();
  tasbihState.current += 1; tasbihState.unsaved += 1;
  elements.countButton.classList.remove("tap-animation", "goal-hit"); requestAnimationFrame(() => elements.countButton.classList.add("tap-animation"));
  playSound("count"); haptic(10);
  if (step.goal && tasbihState.current >= step.goal) {
    if (tasbihState.stepIndex < collection.steps.length - 1) {
      tasbihState.completed += step.goal; tasbihState.stepIndex += 1; tasbihState.current = 0;
      playSound("goal"); haptic([15, 30, 15]);
      // The visible phrase and progress change immediately; no overlay over the text.
    } else {
      tasbihState.done = true; tasbihState.cycles += 1;
      elements.countButton.classList.add("goal-hit"); playSound("goal"); haptic([25, 40, 115]);
      showToast(interpolate(t("tasbih.goalDone", "MashaAllah! {name} is complete."), { name: copyFor(collection.title, language) }));
    }
  }
  renderTasbih();
}
function clearCurrentPractice() {
  tasbihState = { ...tasbihState, done: false, stepIndex: 0, current: 0, completed: 0, cycles: 0, unsaved: 0 };
  renderTasbih(); playSound("tab"); haptic(8); showToast(t("tasbih.resetDone", "Current count cleared"));
}
function saveTasbihSession() {
  const count = Math.max(0, Number(tasbihState.unsaved) || 0);
  if (!count) return showToast(t("tasbih.nothingToSave", "Count something first, then save it."));
  const collection = currentCollection(); const history = getSaved("tasbihHistory", []);
  history.unshift({ date: dayStamp(), count, collection: collection.id, title: copyFor(collection.title, language), savedAt: new Date().toISOString() });
  save("tasbihHistory", history.slice(0, 200)); tasbihState.unsaved = 0; renderTasbih(); playSound("save"); haptic(14); showToast(t("tasbih.saved", "Saved on this device."));
}

/* Scratch canvas: canvas coordinates, coverage grid, pointer safety, and an explicit reveal fallback. */
function renderSunna() {
  const sunnahs = t("scratch.sunnahs", []);
  if (!Array.isArray(sunnahs) || !sunnahs.length) return;
  scratchIndex = ((Number(scratchIndex) || 0) % sunnahs.length + sunnahs.length) % sunnahs.length;
  const item = sunnahs[scratchIndex];
  const cardType = document.createElement("span"); cardType.className = "card-type"; cardType.textContent = t("scratch.eyebrow", "A small Sunnah for today");
  const quote = document.createElement("blockquote"); quote.textContent = item.quote;
  const source = document.createElement("a"); source.className = "sunna-source"; source.textContent = item.source;
  source.href = item.url || sourceUrl(item.source); source.target = "_blank"; source.rel = "noopener";
  source.tabIndex = scratch.complete ? 0 : -1;
  elements.scratchCard.setAttribute("aria-label", `${scratchIndex + 1} / ${sunnahs.length}`);
  elements.sunnaContent.replaceChildren(cardType, quote, source);
}
function updateScratchMeter(percent) { const rounded = Math.round(percent); elements.scratchPercent.textContent = `${rounded}%`; elements.scratchBar.style.width = `${rounded}%`; }
function prepareScratch(force = false) {
  if (activeScreen !== "scratch") { scratch.needsLayout = true; return; }
  if (force) elements.scratchCard.classList.remove("revealed");
  const canvas = elements.scratchCanvas; const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) { scratch.needsLayout = true; return; }
  if (scratch.complete && !force) return;
  if (!force && scratch.initialized && !scratch.needsLayout) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
  const context = canvas.getContext("2d", { willReadFrequently: false }); if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const gradient = context.createLinearGradient(0, 0, rect.width, rect.height); gradient.addColorStop(0, "#d9b55a"); gradient.addColorStop(.48, "#ae7b24"); gradient.addColorStop(1, "#725215"); context.fillStyle = gradient; context.fillRect(0, 0, rect.width, rect.height);
  context.strokeStyle = "rgba(255,248,211,.38)"; context.lineWidth = 1;
  for (let x = -rect.height; x < rect.width + rect.height; x += 34) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x + rect.height, rect.height); context.stroke(); context.beginPath(); context.moveTo(x + rect.height, 0); context.lineTo(x, rect.height); context.stroke(); }
  context.fillStyle = "rgba(255,255,255,.27)"; context.font = "700 45px Amiri"; context.textAlign = "center"; context.fillText("نور", rect.width / 2, rect.height / 2 + 16);
  const cols = clamp(Math.round(rect.width / 11), 26, 44); const rows = clamp(Math.round(rect.height / 11), 28, 48);
  scratch = { initialized: true, complete: false, drawing: false, needsLayout: false, last: null, marks: new Uint8Array(cols * rows), marked: 0, cols, rows, context, rect, brush: clamp(rect.width * .125, 43, 62) };
  elements.scratchCard.classList.remove("revealed"); elements.scratchHint.hidden = false; canvas.style.pointerEvents = "auto"; updateScratchMeter(0);
}
function scratchPoint(event) { const rect = elements.scratchCanvas.getBoundingClientRect(); return { x: clamp(event.clientX - rect.left, 0, rect.width), y: clamp(event.clientY - rect.top, 0, rect.height) }; }
function markScratchCoverage(point) {
  const radius = scratch.brush * .48; const colStart = clamp(Math.floor((point.x - radius) / scratch.rect.width * scratch.cols), 0, scratch.cols - 1); const colEnd = clamp(Math.ceil((point.x + radius) / scratch.rect.width * scratch.cols), 0, scratch.cols - 1); const rowStart = clamp(Math.floor((point.y - radius) / scratch.rect.height * scratch.rows), 0, scratch.rows - 1); const rowEnd = clamp(Math.ceil((point.y + radius) / scratch.rect.height * scratch.rows), 0, scratch.rows - 1);
  for (let row = rowStart; row <= rowEnd; row++) for (let col = colStart; col <= colEnd; col++) {
    const centerX = (col + .5) / scratch.cols * scratch.rect.width; const centerY = (row + .5) / scratch.rows * scratch.rect.height;
    if ((centerX - point.x) ** 2 + (centerY - point.y) ** 2 > radius ** 2) continue;
    const index = row * scratch.cols + col; if (!scratch.marks[index]) { scratch.marks[index] = 1; scratch.marked += 1; }
  }
}
function eraseScratch(from, to = from) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y); const stamps = Math.max(1, Math.ceil(distance / (scratch.brush * .32))); const context = scratch.context;
  context.save(); context.globalCompositeOperation = "destination-out"; context.fillStyle = "#000"; context.strokeStyle = "#000"; context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = scratch.brush;
  // A zero-length stroked line is not painted consistently by all mobile canvas engines.
  // Stamp both endpoints, then join them when the finger has moved.
  context.beginPath(); context.arc(from.x, from.y, scratch.brush / 2, 0, Math.PI * 2); context.fill();
  if (distance > 0) { context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke(); context.beginPath(); context.arc(to.x, to.y, scratch.brush / 2, 0, Math.PI * 2); context.fill(); }
  context.restore();
  for (let index = 0; index <= stamps; index++) markScratchCoverage({ x: from.x + (to.x - from.x) * index / stamps, y: from.y + (to.y - from.y) * index / stamps });
  const percent = scratch.marked / scratch.marks.length * 100; updateScratchMeter(percent);
  // Reveal after a comfortable partial swipe, without hunting for edge pixels.
  if (percent >= 45) revealScratch(false);
}
function revealScratch(manual = true) {
  if (!scratch.initialized) prepareScratch();
  if (!scratch.initialized || scratch.complete) return;
  scratch.complete = true; scratch.drawing = false;
  elements.sunnaContent.querySelector("a")?.setAttribute("tabindex", "0"); scratch.context.clearRect(0, 0, scratch.rect.width, scratch.rect.height); elements.scratchCanvas.style.pointerEvents = "none"; elements.scratchHint.hidden = true; elements.scratchCard.classList.add("revealed"); updateScratchMeter(100); playSound("scratch"); haptic([18, 24, 65]); showToast(t(manual ? "scratch.manualComplete" : "scratch.complete", manual ? "Card revealed ✦" : "The reminder is fully revealed ✦"));
}
function newScratchCard() {
  const sunnahs = t("scratch.sunnahs", []); if (!Array.isArray(sunnahs) || !sunnahs.length) return;
  scratch.complete = false; scratchIndex = (scratchIndex + 1) % sunnahs.length; save("scratchIndex", scratchIndex); renderSunna(); requestAnimationFrame(() => prepareScratch(true)); playSound("tab"); haptic(8);
}
function startScratch(event) {
  if (!scratch.initialized || scratch.complete || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
  event.preventDefault(); event.stopPropagation(); scratch.drawing = true; scratch.last = scratchPoint(event); eraseScratch(scratch.last); elements.scratchHint.hidden = true;
  try { elements.scratchCanvas.setPointerCapture(event.pointerId); } catch { /* Capture is a convenience, not a dependency. */ }
}
function moveScratch(event) { if (!scratch.drawing || scratch.complete) return; event.preventDefault(); event.stopPropagation(); const point = scratchPoint(event); eraseScratch(scratch.last, point); scratch.last = point; }

/* Knowledge */
function knowledgeFilters() { return [{ id: "all", label: t("knowledge.filterAll", "All") }, { id: "daily", label: t("knowledge.filterDaily", "Daily") }, { id: "heart", label: t("knowledge.filterHeart", "Heart") }, { id: "practice", label: t("knowledge.filterPractice", "Practice") }]; }
function renderKnowledge() {
  const insight = KNOWLEDGE_LIBRARY[dayOfYear() % KNOWLEDGE_LIBRARY.length];
  knowledgeQuestIndex = clamp(Number(knowledgeQuestIndex) || 0, 0, KNOWLEDGE_LIBRARY.length - 1);
  const quest = KNOWLEDGE_LIBRARY[knowledgeQuestIndex];
  elements.knowledgeQuestTitle.textContent = copyFor(quest.title, language);
  elements.knowledgeQuestText.textContent = copyFor(quest.action, language);
  elements.dailyInsightTitle.textContent = copyFor(insight.title, language); elements.dailyInsightSource.textContent = insight.source; elements.knowledgeCount.textContent = String(KNOWLEDGE_LIBRARY.length);
  const filterFragment = document.createDocumentFragment();
  for (const filter of knowledgeFilters()) { const button = document.createElement("button"); button.type = "button"; button.className = "knowledge-filter"; button.dataset.filter = filter.id; button.textContent = filter.label; button.classList.toggle("active", knowledgeFilter === filter.id); filterFragment.append(button); }
  elements.knowledgeFilters.replaceChildren(filterFragment);
  const query = ($("#knowledgeSearch")?.value || "").trim().toLocaleLowerCase(language);
  const entries = KNOWLEDGE_LIBRARY.filter(item => (knowledgeFilter === "all" || item.category === knowledgeFilter) && [copyFor(item.title, language), copyFor(item.text, language), item.source].join(" ").toLocaleLowerCase(language).includes(query)); const cards = document.createDocumentFragment();
  for (const item of entries) {
    const card = document.createElement("button"); card.type = "button"; card.className = `knowledge-card${item.wide ? " wide-card" : ""}`; card.dataset.knowledgeId = item.id; card.dataset.glyph = item.glyph; card.style.setProperty("--card-bg", item.color);
    const icon = document.createElement("span"); icon.className = "knowledge-icon"; icon.textContent = item.icon; const label = document.createElement("span"); label.className = "label"; label.textContent = copyFor(item.label, language); const title = document.createElement("h3"); title.textContent = copyFor(item.title, language); const text = document.createElement("p"); text.textContent = copyFor(item.text, language); const source = document.createElement("footer"); source.textContent = item.source;
    card.append(icon, label, title, text, source); cards.append(card);
  }
  if (!entries.length) { const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = t("new.noResults", "No reminders found. Try another word."); cards.append(empty); }
  elements.knowledgeCount.textContent = `${entries.length}`;
  elements.knowledgeCards.replaceChildren(cards);
}
function openKnowledge(item) {
  if (!item) return; elements.knowledgeModalLabel.textContent = copyFor(item.label, language); elements.knowledgeModalTitle.textContent = copyFor(item.title, language); elements.knowledgeModalText.textContent = copyFor(item.text, language); elements.knowledgeModalSource.textContent = item.source + " ↗"; elements.knowledgeModalSource.href = item.url || sourceUrl(item.source); elements.knowledgeModalAction.textContent = copyFor(item.action, language); safeDialogOpen(elements.knowledgeDialog); playSound("tab");
}

/* Quran audio */
function renderQuranControls() {
  quranState.reciterIndex = clamp(Number(quranState.reciterIndex) || 0, 0, RECITERS.length - 1); quranState.surahIndex = clamp(Number(quranState.surahIndex) || 0, 0, QURAN_SURAHS.length - 1);
  elements.reciter.replaceChildren(...RECITERS.map((reciter, index) => { const option = document.createElement("option"); option.value = index; option.textContent = reciter.name; return option; }));
  elements.surah.replaceChildren(...QURAN_SURAHS.map((surah, index) => { const option = document.createElement("option"); option.value = index; option.textContent = `${surah.arabic} — ${copyFor(surah.names, language)}`; return option; }));
  elements.reciter.value = String(quranState.reciterIndex); elements.surah.value = String(quranState.surahIndex); updateNowPlaying(false);
}
function updateNowPlaying(reload = true) {
  const surah = QURAN_SURAHS[quranState.surahIndex]; const reciter = RECITERS[quranState.reciterIndex]; elements.nowPlaying.textContent = `${surah.arabic} · ${copyFor(surah.names, language)}`; save("quran", quranState);
  if (reload) { elements.audio.pause(); elements.audio.src = reciter.url(surah.number); elements.audio.load(); elements.play.textContent = "▶"; elements.seek.value = "0"; elements.currentTime.textContent = "0:00"; elements.duration.textContent = "0:00"; }
}
function formatTime(seconds) { if (!Number.isFinite(seconds)) return "0:00"; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }
async function toggleAudio() { if (!elements.audio.src) updateNowPlaying(true); if (elements.audio.paused) { try { await elements.audio.play(); playSound("tab"); } catch { showToast(t("quran.audioError", "Audio is unavailable. Check your connection or choose another reciter.")); } } else elements.audio.pause(); }
function changeSurah(delta, autoPlay = false) { quranState.surahIndex = (quranState.surahIndex + delta + QURAN_SURAHS.length) % QURAN_SURAHS.length; elements.surah.value = String(quranState.surahIndex); updateNowPlaying(true); if (autoPlay) elements.audio.play().catch(() => showToast(t("quran.audioError", "Audio is unavailable. Check your connection or choose another reciter."))); }

/* Stories: same-origin only, no stored client secrets, and explicit moderation consent. */
function storyEndpoint() { return new URL("./api/stories", location.href).toString(); }
function formatStoryDate(value) { try { return new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); } catch { return ""; } }
function setStoriesStatus(message = "", state = "") { elements.storiesStatus.textContent = message; elements.storiesStatus.dataset.state = state; }
function renderStories(stories) {
  if (!stories.length) { const empty = document.createElement("div"); empty.className = "empty-stories"; empty.textContent = t("stories.empty", "No published stories yet. The first approved story will appear here."); elements.storiesList.replaceChildren(empty); return; }
  const fragment = document.createDocumentFragment();
  for (const story of stories) {
    const card = document.createElement("article"); card.className = "community-story"; const title = document.createElement("h3"); title.textContent = story.title; const body = document.createElement("p"); body.textContent = story.body; const footer = document.createElement("footer"); footer.textContent = `${story.author} · ${formatStoryDate(story.publishedAt || story.createdAt)}`; card.append(title, body, footer); fragment.append(card);
  }
  elements.storiesList.replaceChildren(fragment);
}
async function loadStories({ silent = false } = {}) {
  if (storiesBusy) return; storiesBusy = true; if (!silent) setStoriesStatus(t("stories.loading", "Loading stories…"));
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(storyEndpoint(), { headers: { Accept: "application/json" }, signal: controller.signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const payload = await response.json(); const stories = Array.isArray(payload.stories) ? payload.stories : [];
    save("storiesCache", stories); renderStories(stories); storiesLoaded = true; setStoriesStatus(stories.length ? interpolate(t("stories.publishedCount", "Published: {count}"), { count: stories.length }) : "");
  } catch {
    const cached = getSaved("storiesCache", []); renderStories(Array.isArray(cached) ? cached : []); setStoriesStatus(t("stories.serverUnavailable", "Stories need the included Nur server. Start it, then open the app at localhost or your HTTPS domain."), "error");
  } finally { clearTimeout(timer); storiesBusy = false; }
}
function openStoryForm() { elements.storyFeedback.textContent = ""; elements.storyFeedback.classList.remove("success"); safeDialogOpen(elements.storyDialog); }
function storyErrorFrom(responsePayload) { const details = responsePayload?.error?.details; if (Array.isArray(details) && details.length) return details.join(" "); return responsePayload?.error?.message || t("stories.sendError", "Could not send the story. Check the server and try again."); }
async function submitStory(event) {
  event.preventDefault(); const author = elements.storyAuthor.value.trim(); const title = elements.storyTitle.value.trim(); const body = elements.storyBody.value.trim();
  const invalid = !elements.storyConsent.checked || [...author].length < 2 || [...title].length < 3 || [...body].length < 20;
  if (invalid) { elements.storyFeedback.textContent = t("stories.formInvalid", "Add a name, a title, at least 20 characters, and confirm the privacy notice."); elements.storyFeedback.classList.remove("success"); return; }
  elements.submitStory.disabled = true; elements.storyFeedback.textContent = t("stories.sending", "Sending for review…");
  try {
    const response = await fetch(storyEndpoint(), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ author, title, body }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(storyErrorFrom(payload));
    elements.storyFeedback.textContent = payload.message || t("stories.sent", "Thank you. Your story has been sent for moderation."); elements.storyFeedback.classList.add("success"); elements.storyForm.reset(); playSound("save"); haptic([14, 20, 42]); setTimeout(() => closeDialog(elements.storyDialog), 1050);
  } catch (error) { elements.storyFeedback.textContent = error.message || t("stories.sendError", "Could not send the story. Check the server and try again."); elements.storyFeedback.classList.remove("success"); playSound("error"); }
  finally { elements.submitStory.disabled = false; }
}

/* PWA installation and local data */
function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function installGuidance() {
  if (isStandalone()) return { title: t("settings.installedTitle", "Nur is already installed"), text: t("settings.installedText", "You are using the standalone app."), steps: [], canPrompt: false };
  if (location.protocol === "file:") return { title: t("settings.serverRequiredTitle", "Open Nur through its server"), text: t("settings.serverRequiredText", "A file opened directly from your computer cannot register a service worker, so a browser cannot install it as a PWA."), steps: [t("settings.serverStep1", "Open the backend folder in a terminal."), t("settings.serverStep2", "Run: npm start"), t("settings.serverStep3", "Open http://localhost:8080, then return here to install.")], canPrompt: false };
  if (deferredInstall) return { title: t("settings.readyInstallTitle", "Nur is ready to install"), text: t("settings.readyInstallText", "Install it for a full-screen, app-like experience."), steps: [t("settings.readyInstallStep", "Use the Install now button below.")], canPrompt: true };
  if (isIOS()) return { title: t("settings.iosInstallTitle", "Add Nur to your Home Screen"), text: t("settings.iosInstallText", "Safari installs web apps from its Share menu."), steps: [t("settings.iosStep1", "Open this page in Safari."), t("settings.iosStep2", "Tap Share."), t("settings.iosStep3", "Choose Add to Home Screen, then Add.")], canPrompt: false };
  return { title: t("settings.browserInstallTitle", "Install from your browser"), text: t("settings.browserInstallText", "If the native prompt is not ready yet, use your browser menu: Install app or Add to Home screen."), steps: [t("settings.browserStep1", "Make sure the page is opened through HTTPS or localhost."), t("settings.browserStep2", "Open the browser menu and choose Install app / Add to Home screen."), t("settings.browserStep3", "If you just opened the page, wait a moment for the service worker to finish installing.")], canPrompt: false };
}
function updateInstallHint() { if (!elements.installHint) return {}; const info = installGuidance(); elements.installHint.textContent = isStandalone() ? t("settings.installedHint", "Installed on this device") : (deferredInstall ? t("settings.readyToInstall", "Ready to install") : t("settings.installHint", "Use it like an app on your phone")); return info; }
function openInstallDialog() { const info = updateInstallHint(); elements.installDialogTitle.textContent = info.title; elements.installDialogText.textContent = info.text; elements.installSteps.replaceChildren(...info.steps.map(step => { const item = document.createElement("li"); item.textContent = step; return item; })); elements.installPromptButton.hidden = !info.canPrompt; safeDialogOpen(elements.installDialog); }
async function promptInstall() { if (!deferredInstall) return; try { await deferredInstall.prompt(); await deferredInstall.userChoice; } catch { /* Browser owns this prompt; a failure is non-fatal. */ } finally { deferredInstall = undefined; elements.installPromptButton.hidden = true; updateInstallHint(); } }
function exportLocalData() { const snapshot = {}; for (const key of storage.keys()) { if (key?.startsWith(STORAGE)) snapshot[key.slice(STORAGE.length)] = getSaved(key.slice(STORAGE.length), null); }
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: "Nur", data: snapshot }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `nur-backup-${dayStamp()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1_000); playSound("save"); showToast(t("settings.exported", "Local backup downloaded."));
}
function clearAllLocalData() { storage.keys().filter(key => key.startsWith(STORAGE)).forEach(key => storage.removeItem(key)); location.reload(); }

function renderFaq() { const items = t("faq.items", []); const fragment = document.createDocumentFragment(); for (const item of items) { const detail = document.createElement("details"); detail.className = "faq-item"; const summary = document.createElement("summary"); summary.textContent = item.q; const answer = document.createElement("p"); answer.textContent = item.a; detail.append(summary, answer); fragment.append(detail); } $("#faqList").replaceChildren(fragment); }
function activateScreen(target) {
  const next = document.getElementById(target) ? target : "tasbih";
  activeScreen = next;
  $$(".screen").forEach(screen => screen.classList.toggle("active", screen.id === next));
  $$(".nav-item").forEach(button => { button.classList.toggle("active", button.dataset.target === next); button.setAttribute("aria-current", button.dataset.target === next ? "page" : "false"); });
  const appMain = $("#appMain");
  if (appMain) appMain.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
  if (next === "scratch") requestAnimationFrame(() => prepareScratch());
  if (next === "stories") loadStories();
}
function toggleFocusMode() {
  const shell = $(".app-shell"); const next = !shell.classList.contains("focus-mode"); shell.classList.toggle("focus-mode", next); elements.toggleFocusMode.textContent = next ? "×" : "⛶"; elements.toggleFocusMode.setAttribute("aria-label", next ? "Exit focus mode" : "Focus mode"); $("#exitFocus").hidden = !next;
}
function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register("./sw.js").then(() => updateInstallHint()).catch(error => console.warn("Service worker unavailable", error));
}

function bindEvents() {
  $$(".nav-item").forEach(button => {
    let touchStart = null, lastTouch = -Infinity;
    const go = () => { activateScreen(button.dataset.target); history.replaceState(null, '', `#${button.dataset.target}`); playSound("tab", button.dataset.target); haptic(6); };
    // Chrome can suppress a compatibility click immediately after a horizontal
    // gesture. Accept a stationary touch release, then ignore its duplicate click.
    button.addEventListener('pointerdown', event => { if (event.pointerType === 'touch' && event.isPrimary) touchStart = { x:event.clientX, y:event.clientY, id:event.pointerId }; }, {passive:true});
    button.addEventListener('pointercancel', () => { touchStart = null; });
    button.addEventListener('pointerup', event => {
      if (!touchStart || touchStart.id !== event.pointerId) return;
      const moved = Math.hypot(event.clientX-touchStart.x, event.clientY-touchStart.y); touchStart=null;
      if (moved > 12) return;
      lastTouch=performance.now(); event.preventDefault(); go();
    });
    button.addEventListener('click', event => { if (event.detail !== 0 && performance.now()-lastTouch < 700) return; go(); });
  });
  elements.themeToggle.addEventListener("click", () => { setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); playSound("tab"); }); elements.settingsTheme.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  elements.soundToggle.addEventListener("click", () => { const next = !preferences.sound; setPreference("sound", next); if (next) playSound("tab"); }); elements.hapticsToggle.addEventListener("click", () => { const next = !preferences.haptics; setPreference("haptics", next); if (next) haptic(12); }); elements.motionToggle.addEventListener("click", () => setPreference("reducedMotion", !preferences.reducedMotion));
  [elements.languageSelect, elements.settingsLanguageSelect].forEach(select => select.addEventListener("change", event => { loadLanguage(event.target.value); playSound("tab"); }));
  elements.countButton.addEventListener("click", incrementTasbih); elements.clearCurrent.addEventListener("click", clearCurrentPractice); elements.toggleFocusMode.addEventListener("click", toggleFocusMode); $("#saveTasbih").addEventListener("click", saveTasbihSession); $("#choosePractice").addEventListener("click", () => { renderPracticeOptions(); safeDialogOpen(elements.practiceDialog); playSound("tab"); }); elements.practiceList.addEventListener("click", event => { const button = event.target.closest("button[data-collection]"); if (button) choosePractice(button.dataset.collection); });
  elements.scratchCanvas.addEventListener("pointerdown", startScratch, { passive: false }); elements.scratchCanvas.addEventListener("pointermove", moveScratch, { passive: false }); ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => elements.scratchCanvas.addEventListener(type, () => { scratch.drawing = false; }, { passive: true })); $("#revealSunna").addEventListener("click", () => revealScratch(true)); $("#newSunna").addEventListener("click", newScratchCard);
  elements.knowledgeFilters.addEventListener("click", event => { const button = event.target.closest("button[data-filter]"); if (!button) return; knowledgeFilter = button.dataset.filter; renderKnowledge(); playSound("tab"); }); elements.knowledgeCards.addEventListener("click", event => { const id = event.target.closest("button[data-knowledge-id]")?.dataset.knowledgeId; if (id) openKnowledge(KNOWLEDGE_LIBRARY.find(item => item.id === id)); }); $("#openDailyInsight").addEventListener("click", () => openKnowledge(KNOWLEDGE_LIBRARY[dayOfYear() % KNOWLEDGE_LIBRARY.length])); elements.newKnowledgeQuest.addEventListener("click", () => { knowledgeQuestIndex = (knowledgeQuestIndex + 1) % KNOWLEDGE_LIBRARY.length; save("knowledgeQuestIndex", knowledgeQuestIndex); renderKnowledge(); playSound("tab", "knowledge"); });
  elements.reciter.addEventListener("change", event => { quranState.reciterIndex = Number(event.target.value); updateNowPlaying(true); }); elements.surah.addEventListener("change", event => { quranState.surahIndex = Number(event.target.value); updateNowPlaying(true); }); elements.play.addEventListener("click", toggleAudio); $("#previousSurah").addEventListener("click", () => changeSurah(-1)); $("#nextSurah").addEventListener("click", () => changeSurah(1));
  elements.audio.addEventListener("play", () => { elements.play.textContent = "Ⅱ"; }); elements.audio.addEventListener("pause", () => { elements.play.textContent = "▶"; }); elements.audio.addEventListener("timeupdate", () => { elements.seek.value = elements.audio.duration ? String(elements.audio.currentTime / elements.audio.duration * 100) : "0"; elements.currentTime.textContent = formatTime(elements.audio.currentTime); }); elements.audio.addEventListener("loadedmetadata", () => { elements.duration.textContent = formatTime(elements.audio.duration); }); elements.audio.addEventListener("ended", () => changeSurah(1, true)); elements.audio.addEventListener("error", () => { if (elements.audio.src) showToast(t("quran.audioError", "Audio is unavailable. Check your connection or choose another reciter.")); }); elements.seek.addEventListener("input", () => { if (elements.audio.duration) elements.audio.currentTime = elements.audio.duration * Number(elements.seek.value) / 100; });
  $("#refreshStories").addEventListener("click", () => { loadStories(); playSound("tab"); });
  $("#openSettingsFromMore").addEventListener("click", () => { activateScreen("settings"); playSound("tab"); });
  $("#openInstallFromMore")?.addEventListener("click", () => { openInstallDialog(); playSound("tab"); }); $("#openStoryForm").addEventListener("click", openStoryForm); $("#closeStoryDialog").addEventListener("click", () => closeDialog(elements.storyDialog)); elements.storyForm.addEventListener("submit", submitStory);
  elements.install?.addEventListener("click", openInstallDialog); elements.installPromptButton.addEventListener("click", promptInstall); $("#exportData")?.addEventListener("click", exportLocalData); $("#openClearData").addEventListener("click", () => safeDialogOpen(elements.clearDataDialog)); $("#confirmClearData").addEventListener("click", event => { event.preventDefault(); clearAllLocalData(); });
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstall = event; updateInstallHint(); }); window.addEventListener("appinstalled", () => { deferredInstall = undefined; updateInstallHint(); showToast(t("settings.installed", "Nur is installed.")); });
  document.addEventListener("dblclick", event => { if (!event.target.closest("input, textarea, select, a")) event.preventDefault(); }, { passive: false });
  // touch-action: manipulation blocks double-tap zoom while preserving pinch accessibility.
  const focusPointers = new Set();
  document.addEventListener("pointerdown", event => { const shell = $(".app-shell"); if (!shell.classList.contains("focus-mode")) return; focusPointers.add(event.pointerId); if (focusPointers.size >= 2) { focusPointers.clear(); toggleFocusMode(); } }, { passive: true });
  ["pointerup", "pointercancel"].forEach(type => document.addEventListener(type, event => focusPointers.delete(event.pointerId), { passive: true }));
  document.addEventListener("keydown", event => { if (event.key === "Escape" && $(".app-shell").classList.contains("focus-mode")) toggleFocusMode(); });
  if (window.ResizeObserver) new ResizeObserver(() => { scratch.needsLayout = true; if (activeScreen === "scratch") requestAnimationFrame(() => prepareScratch()); }).observe(elements.scratchCard);
  window.addEventListener("orientationchange", () => { scratch.needsLayout = true; if (activeScreen === "scratch") setTimeout(() => prepareScratch(), 60); });
}

async function init() {
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  setTheme(storage.getItem(STORAGE + "theme") || (prefersDark ? "dark" : "light"));
  document.documentElement.dataset.reduceMotion = String(Boolean(preferences.reducedMotion));
  renderLanguageSelects();
  bindEvents();
  bindExtras();
  try { await loadLanguage(language); } catch (error) { console.error("Nur language startup failed", error); }
  registerServiceWorker();
}
init().catch(error => { console.error(error); showToast("Не удалось запустить Nur. Обновите страницу."); });
