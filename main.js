import { apps, keyboard, language, ready, settings } from '/__sdk/index.js';
import { AnkiConnectSource, AnkiKeyNeeded, AnkiOffline } from './anki-connect.js';
import { CardView } from './card-view.js';
import { htmlToText, parseNotes, textToHtml } from './import.js';
import { LocalSource } from './local.js';
import { format, formatInterval, TEXTS } from './texts.js';

/** Larger files are not imported. */
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
/** Opening the island refreshes the counts at most this often. */
const REFRESH_INTERVAL = 3000;
const TOAST_TIME = 2500;
/** How long to wait for AnkiConnect after starting Anki, and when Anki was already running. */
const START_TIMEOUT = 60000;
const RUNNING_TIMEOUT = 15000;

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5M20 20v-4h-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  import: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};

const app = document.getElementById('app');
/** The card's scroll box and its view stay while the rest is drawn again. */
const cardScroll = document.createElement('div');
cardScroll.className = 'card-scroll';
const cardHost = document.createElement('div');
cardScroll.append(cardHost);
const cardView = new CardView(cardHost);

let text = TEXTS.en;
let options;
/** @type {AnkiConnectSource | LocalSource} */
let source;

const state = {
  /** loading, decks, study, done, offline, key, error, form, confirm */
  view: 'loading',
  decks: [],
  deckId: null,
  card: null,
  answerShown: false,
  counts: null,
  busy: false,
  /** Whether a card was answered since the deck was opened, for syncing when it is done. */
  answered: false,
  error: '',
  toast: '',
  /** The form or question shown in place of the deck or the card. */
  form: null,
};
/** What the card view shows now, so drawing again does not reset it. */
let shownCard = '';
let toastTimer;
let lastRefresh = 0;
let learningTimer;

// Drawing

function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else if (key in element) element[key] = value;
    else if (value !== false) element.setAttribute(key, value === true ? '' : value);
  }
  element.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return element;
}

function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

function iconButton(name, title, onclick, disabled = false) {
  return h('button', { class: 'icon-button', title, 'aria-label': title, onclick, disabled: disabled || state.busy }, icon(name));
}

function counts(c) {
  if (!c) return null;
  return h(
    'span',
    { class: 'counts', title: text.countsHint },
    h('span', { class: c.newCount ? 'new' : 'zero' }, String(c.newCount)),
    h('span', { class: c.learnCount ? 'learn' : 'zero' }, String(c.learnCount)),
    h('span', { class: c.reviewCount ? 'review' : 'zero' }, String(c.reviewCount)),
  );
}

function render() {
  document.documentElement.style.setProperty('--card-size', `${options.textSize}px`);
  const view = {
    loading: renderMessage,
    starting: renderMessage,
    decks: renderDecks,
    study: renderStudy,
    done: renderDone,
    offline: renderMessage,
    key: renderMessage,
    error: renderMessage,
    form: renderForm,
    confirm: renderConfirm,
  }[state.view]();
  app.replaceChildren(view);
}

function header(...children) {
  return h('header', {}, ...children, state.toast ? h('span', { class: 'toast' }, state.toast) : null);
}

function renderDecks() {
  const local = source.kind === 'local';
  const tools = local
    ? [iconButton('import', text.importCards, () => openImport()), iconButton('plus', text.newDeck, () => openDeckForm())]
    : [iconButton('open', text.openAnki, () => run(openAnki)), iconButton('sync', text.sync, () => run(syncAnki))];
  const list = h(
    'ul',
    { class: 'deck-list' },
    state.decks.map((deck) =>
      h(
        'li',
        { class: 'deck', style: `--depth: ${deck.depth}` },
        h(
          'button',
          { class: 'deck-open', disabled: state.busy, title: deck.name, onclick: () => run(() => openDeck(deck.id)) },
          h('span', { class: 'deck-name' }, deck.label),
          counts(deck),
        ),
        local
          ? h(
              'span',
              { class: 'deck-tools' },
              iconButton('plus', text.addCard, () => openCardForm(deck.id)),
              iconButton('edit', text.renameDeck, () => openDeckForm(deck.id)),
              iconButton('trash', text.deleteDeck, () => confirmDeleteDeck(deck)),
            )
          : null,
      ),
    ),
  );
  const empty = state.decks.length
    ? null
    : h('p', { class: 'empty lz-secondary' }, local ? text.noDecksLocal : text.noDecksAnki);
  return h(
    'section',
    { class: 'view' },
    header(
      h('span', { class: 'lz-title' }, text.title),
      local ? h('span', { class: 'lz-secondary source' }, text.sourceLocal) : null,
      h('span', { class: 'tools' }, tools),
    ),
    empty ?? list,
  );
}

function studyHeader() {
  const local = source.kind === 'local';
  return header(
    iconButton('back', text.decks, () => run(closeDeck)),
    h('span', { class: 'deck-title', title: deckName() }, deckName()),
    counts(state.counts),
    h(
      'span',
      { class: 'tools' },
      // Anki's reviewer is closed once the deck is done (and syncing), so there is nothing to undo there.
      iconButton('undo', text.undo, () => run(undo), local ? !source.canUndo : !state.answered || state.view !== 'study'),
      local && state.card ? iconButton('edit', text.editCard, () => openCardForm(state.deckId, state.card.id)) : null,
      local && state.card ? iconButton('trash', text.deleteCard, () => confirmDeleteCard()) : null,
      local ? iconButton('plus', text.addCard, () => openCardForm(state.deckId)) : null,
    ),
  );
}

function renderStudy() {
  const card = state.card;
  const key = `${card.id}:${state.answerShown}:${card.question.length}:${card.answer.length}`;
  if (shownCard !== key) {
    shownCard = key;
    cardView.show(state.answerShown ? card.answer : card.question, {
      css: card.css,
      ord: card.ord,
      resolveImage: source.kind === 'anki' ? (name) => source.resolveImage(name) : undefined,
    });
    // The answer side starts where the answer does; the question side at the top.
    requestAnimationFrame(() => (state.answerShown ? cardView.scrollToAnswer(cardScroll) : (cardScroll.scrollTop = 0)));
  }

  const bar = state.answerShown
    ? h(
        'footer',
        { class: 'answers' },
        card.buttons.map((button) =>
          h(
            'button',
            { class: `answer ease${button.ease}`, disabled: state.busy, onclick: () => run(() => answer(button.ease)) },
            h('span', { class: 'answer-label' }, text.ease[button.ease] ?? String(button.ease)),
            options.showIntervals ? h('span', { class: 'answer-time' }, intervalText(button)) : null,
          ),
        ),
      )
    : h(
        'footer',
        { class: 'answers' },
        h('button', { class: 'show-answer', disabled: state.busy, onclick: () => run(showAnswer) }, text.showAnswer),
      );
  return h('section', { class: 'view' }, studyHeader(), cardScroll, bar);
}

function intervalText(button) {
  return button.intervalMs === undefined ? button.interval : formatInterval(button.intervalMs, text.units);
}

function renderDone() {
  const lines = [];
  if (state.emptyDeck) {
    lines.push(text.emptyDeck);
  } else {
    lines.push(text.doneText);
    const due = source.kind === 'local' ? source.nextLearningDue() : null;
    if (due) lines.push(format(text.doneLearning, { time: new Date(due).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }));
    if (state.syncing) lines.push(text.syncing);
  }
  return h(
    'section',
    { class: 'view' },
    studyHeader(),
    h(
      'div',
      { class: 'message' },
      state.emptyDeck ? null : h('p', { class: 'message-title' }, text.doneTitle),
      lines.map((line) => h('p', { class: 'lz-secondary' }, line)),
    ),
  );
}

function renderMessage() {
  const message = {
    loading: { title: '', lines: [text.loading] },
    starting: { title: '', lines: [text.starting] },
    offline: {
      title: text.offlineTitle,
      lines: [state.ankiMissing ? text.notInstalled : text.offlineText, text.offlineHint],
      retry: true,
      open: !state.ankiMissing,
    },
    key: { title: text.keyTitle, lines: [text.keyText], retry: true },
    error: { title: text.errorTitle, lines: [state.error], retry: true },
  }[state.view];
  const retry = message.retry
    ? h(
        'span',
        { class: 'tools' },
        message.open ? h('button', { class: 'lz-button small', disabled: state.busy, onclick: () => run(openAnki) }, text.openAnki) : null,
        h('button', { class: 'lz-button small', disabled: state.busy, onclick: () => run(() => start(options.startAnki)) }, text.retry),
      )
    : null;
  return h(
    'section',
    { class: 'view' },
    header(h('span', { class: 'lz-title' }, text.title), retry),
    h(
      'div',
      { class: 'message' },
      message.title ? h('p', { class: 'message-title' }, message.title) : null,
      message.lines.map((line) => h('p', { class: 'lz-secondary' }, line)),
    ),
  );
}

function renderConfirm() {
  const { question, confirm } = state.form;
  return h(
    'section',
    { class: 'view' },
    header(h('span', { class: 'lz-title' }, text.title)),
    h(
      'div',
      { class: 'message' },
      h('p', {}, question),
      h(
        'div',
        { class: 'buttons' },
        h('button', { class: 'lz-button', onclick: closeForm }, text.cancel),
        h('button', { class: 'lz-button danger', disabled: state.busy, onclick: () => run(confirm) }, text.delete),
      ),
    ),
  );
}

/** Forms are drawn once when opened, so typing is never interrupted by drawing again. */
function renderForm() {
  return state.form.element;
}

// Forms

/**
 * Not a `<form>`: the island's sandbox has no `allow-forms`, so a form would never submit.
 * Enter in a one-line field and Ctrl+Enter in a text area submit, like in Anki's Add window.
 */
function formView(title, submitLabel, fields, onsubmit) {
  const submit = () => run(onsubmit);
  return h(
    'div',
    {
      class: 'view form',
      onkeydown: (event) => {
        const oneLine = event.target instanceof HTMLInputElement;
        if (event.key === 'Enter' && (oneLine || event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          submit();
        }
      },
    },
    header(
      h('span', { class: 'lz-title form-title' }, title),
      h(
        'span',
        { class: 'tools' },
        h('button', { type: 'button', class: 'lz-button small', onclick: closeForm }, text.cancel),
        h('button', { type: 'button', class: 'lz-button small primary submit', onclick: submit }, submitLabel),
      ),
    ),
    h('div', { class: 'fields' }, fields),
  );
}

function showForm(form) {
  state.form = form;
  state.view = 'form';
  render();
  form.element.querySelector('[autofocus]')?.focus();
}

function closeForm() {
  keyboard.release();
  state.form = null;
  state.view = state.returnView ?? 'decks';
  render();
}

function deckSelect(selected, withNew = false) {
  const select = h(
    'select',
    { class: 'field-input' },
    source.deckList
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((deck) => h('option', { value: deck.id, selected: deck.id === selected }, deck.name)),
    withNew ? h('option', { value: '', selected: !selected }, text.newDeckOption) : null,
  );
  return select;
}

function openDeckForm(deckId = null) {
  const input = h('input', {
    class: 'field-input',
    type: 'text',
    maxLength: 100,
    value: deckId ? source.deckName(deckId) : '',
    placeholder: text.deckName,
    autocomplete: 'off',
    spellcheck: false,
  });
  state.returnView = 'decks';
  const element = formView(deckId ? text.renameDeck : text.newDeck, deckId ? text.save : text.create, [input], async () => {
    try {
      if (deckId) await source.renameDeck(deckId, input.value);
      else await source.createDeck(input.value);
    } catch (error) {
      if (error.message === 'exists') return toast(text.deckExists);
      if (error.message === 'empty') return input.focus();
      throw error;
    }
    state.decks = await source.decks();
    closeForm();
  });
  showForm({ element });
}

function openCardForm(deckId, cardId = null) {
  const card = cardId ? source.findCard(deckId, cardId) : null;
  const field = (label, value) => {
    const area = h('textarea', { class: 'field-input', rows: 2, spellcheck: false, placeholder: label });
    area.value = value;
    return area;
  };
  const front = field(text.front, card ? htmlToText(card.front) : '');
  const back = field(text.back, card ? htmlToText(card.back) : '');
  const deck = card ? null : deckSelect(deckId);
  state.returnView = state.view === 'form' ? state.returnView : state.view;
  const element = formView(card ? text.editCard : text.addCard, card ? text.save : text.add, [front, back, deck], async () => {
    if (!front.value.trim()) return front.focus();
    if (card) {
      await source.editCard(deckId, cardId, textToHtml(front.value), textToHtml(back.value));
      if (state.card?.id === cardId) {
        state.card = source.view(source.findCard(deckId, cardId));
        shownCard = '';
      }
      closeForm();
      return;
    }
    // Like Anki's Add window, the form stays open for the next card.
    await source.addCards(deck.value, [{ front: textToHtml(front.value), back: textToHtml(back.value) }]);
    front.value = '';
    back.value = '';
    front.focus();
    await refreshCounts();
    toast(text.added);
  });
  front.autofocus = true;
  showForm({ element });
}

function openImport() {
  const paste = h('textarea', { class: 'field-input import-text', rows: 3, spellcheck: false, placeholder: text.importPlaceholder });
  const deck = deckSelect(source.deckList[0]?.id ?? '', true);
  let fileName = '';
  const file = h('input', {
    type: 'file',
    accept: '.txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values',
    hidden: true,
    onchange: async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      if (chosen.size > MAX_IMPORT_BYTES) return toast(text.fileTooLarge);
      paste.value = await chosen.text();
      fileName = chosen.name.replace(/\.[^.]+$/, '');
    },
  });
  state.returnView = 'decks';
  const element = formView(text.importCards, text.import, [
    h('div', { class: 'row' }, deck, h('button', { type: 'button', class: 'lz-button small', onclick: () => file.click() }, text.chooseFile), file),
    paste,
    h('p', { class: 'lz-secondary help' }, text.importHelp),
  ], async () => {
    const { notes } = parseNotes(paste.value);
    if (!notes.length) return toast(text.nothingToImport);
    const result = await importNotes(notes, deck.value || null, fileName || text.importedDeck);
    state.decks = await source.decks();
    closeForm();
    toast(format(result.duplicates ? text.importedDuplicates : text.imported, result));
  });
  showForm({ element });
}

/** Adds notes to the chosen deck, or to the decks the file names, creating decks as needed. */
async function importNotes(notes, deckId, newDeckName) {
  const byDeck = new Map();
  for (const note of notes) {
    let target = deckId;
    if (note.deck) target = source.findDeck(note.deck)?.id ?? (await source.createDeck(note.deck));
    if (!target) target = source.findDeck(newDeckName)?.id ?? (await source.createDeck(newDeckName));
    if (!byDeck.has(target)) byDeck.set(target, []);
    byDeck.get(target).push(note);
  }
  const total = { added: 0, duplicates: 0 };
  for (const [target, list] of byDeck) {
    const result = await source.addCards(target, list);
    total.added += result.added;
    total.duplicates += result.duplicates;
  }
  return total;
}

function confirmDeleteDeck(deck) {
  state.returnView = 'decks';
  state.form = {
    question: format(text.confirmDeleteDeck, { name: deck.name, count: deck.total }),
    confirm: async () => {
      await source.deleteDeck(deck.id);
      state.decks = await source.decks();
      closeForm();
    },
  };
  state.view = 'confirm';
  render();
}

function confirmDeleteCard() {
  const cardId = state.card.id;
  state.returnView = 'study';
  state.form = {
    question: text.confirmDeleteCard,
    confirm: async () => {
      await source.deleteCard(state.deckId, cardId);
      state.form = null;
      await showCard(await source.current());
    },
  };
  state.view = 'confirm';
  render();
}

// Actions

/** Runs an action with the buttons disabled; Anki being away or asking for a key is shown as such. */
async function run(action) {
  if (state.busy) return;
  state.busy = true;
  // A form is not drawn again, so the field being typed in keeps the focus.
  if (state.view !== 'form') render();
  try {
    await action();
  } catch (error) {
    if (error instanceof AnkiOffline) state.view = 'offline';
    else if (error instanceof AnkiKeyNeeded) state.view = 'key';
    else if (state.view === 'form' || state.view === 'study' || state.view === 'decks') {
      console.warn(error);
      state.busy = false;
      toast(format(text.failed, { error: error.message }));
    } else {
      state.view = 'error';
      state.error = error.message;
    }
  } finally {
    state.busy = false;
    if (state.view !== 'form') render();
  }
}

function toast(message) {
  state.toast = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = '';
    if (state.view !== 'form') render();
    else state.form.element.querySelector('.toast')?.remove();
  }, TOAST_TIME);
  if (state.view === 'form') {
    const head = state.form.element.querySelector('header');
    head.querySelector('.toast')?.remove();
    head.append(h('span', { class: 'toast' }, message));
  } else {
    render();
  }
}

function deckName() {
  return source.kind === 'local' ? source.deckName(state.deckId) : (source.deckNames.get(state.deckId) ?? '');
}

/** Loads the decks; with `launch`, starts Anki in the background if it does not answer. */
async function start(launch = false) {
  clearTimeout(learningTimer);
  state.view = 'loading';
  state.deckId = null;
  state.card = null;
  state.ankiMissing = false;
  shownCard = '';
  if (options.source === 'local') {
    const local = new LocalSource();
    local.setOptions(options);
    await local.load();
    source = local;
  } else {
    source = new AnkiConnectSource(options.apiKey.trim());
    await connectAnki(launch);
  }
  state.decks = await source.decks();
  state.view = 'decks';
  lastRefresh = Date.now();
}

async function connectAnki(launch) {
  try {
    await source.connect();
    return;
  } catch (error) {
    if (!(error instanceof AnkiOffline) || !launch) throw error;
  }
  // An older Lizun or another system cannot start programs; then Anki is simply not reachable.
  const result = await apps.start('anki', { hidden: true }).catch(() => 'failed');
  if (result === 'notFound') state.ankiMissing = true;
  if (result !== 'started' && result !== 'running') throw new AnkiOffline(`Anki: ${result}`);
  await waitForAnki(result === 'started' ? START_TIMEOUT : RUNNING_TIMEOUT);
}

/** Waits until AnkiConnect answers: Anki takes a few seconds to start and open the collection. */
async function waitForAnki(timeout) {
  state.view = 'starting';
  render();
  const until = Date.now() + timeout;
  for (;;) {
    try {
      return await source.connect();
    } catch (error) {
      if (!(error instanceof AnkiOffline) || Date.now() > until) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** Shows Anki's window, starting Anki if needed, for signing in to AnkiWeb or editing cards. */
async function openAnki() {
  if (!(await apps.show('anki').catch(() => false))) {
    const result = await apps.start('anki');
    if (result === 'notFound') {
      state.ankiMissing = true;
      state.view = 'offline';
      return;
    }
  }
  if (state.view === 'offline') {
    await waitForAnki(START_TIMEOUT);
    state.decks = await source.decks();
    state.view = 'decks';
  }
}

async function openDeck(deckId) {
  state.deckId = deckId;
  state.answered = false;
  state.syncing = false;
  state.emptyDeck = source.kind === 'local' && source.cards.get(deckId).length === 0;
  await showCard(await source.start(deckId));
}

async function showCard(card) {
  state.card = card;
  state.answerShown = false;
  state.counts = await source.counts(state.deckId);
  clearTimeout(learningTimer);
  if (card) {
    state.view = 'study';
    return;
  }
  state.view = 'done';
  shownCard = '';
  cardView.clear();
  if (source.kind === 'local') {
    // A card in learning comes back later today; show it when it does.
    const due = source.nextLearningDue();
    if (due) learningTimer = setTimeout(() => run(async () => state.view === 'done' && showCard(await source.current())), Math.max(1000, due - Date.now() + 500));
  } else if (state.answered && options.syncWhenDone) {
    state.syncing = true;
    await source.sync();
  }
}

async function showAnswer() {
  await source.showAnswer();
  state.answerShown = true;
}

async function answer(ease) {
  state.answered = true;
  await showCard(await source.answer(ease));
}

async function undo() {
  await showCard(await source.undo());
}

async function closeDeck() {
  clearTimeout(learningTimer);
  await source.stop();
  state.card = null;
  state.deckId = null;
  shownCard = '';
  cardView.clear();
  state.decks = await source.decks();
  state.view = 'decks';
}

async function syncAnki() {
  await source.sync();
  toast(text.syncStarted);
  // Anki syncs on its own; the counts change once it is done.
  setTimeout(() => state.view === 'decks' && run(refreshCounts), 6000);
}

async function refreshCounts() {
  lastRefresh = Date.now();
  if (state.view === 'decks' || state.view === 'form') state.decks = await source.decks();
  if (state.deckId) state.counts = await source.counts(state.deckId);
}

/**
 * When the island opens, catches up with reviews done in Anki itself or a new day. It runs in
 * the background: the buttons stay usable, and the widget is drawn again only if something
 * changed and the user did nothing meanwhile.
 */
async function catchUp() {
  if (state.busy || !source || Date.now() - lastRefresh < REFRESH_INTERVAL) return;
  lastRefresh = Date.now();
  const view = state.view;
  const before = JSON.stringify([state.decks, state.card?.id]);
  try {
    if (view === 'decks') {
      const decks = await source.decks();
      if (state.busy || state.view !== view) return;
      state.decks = decks;
    } else if (view === 'study' && source.kind === 'anki') {
      const card = await source.current();
      if (state.busy || state.view !== view || card?.id === state.card?.id) return;
      return run(() => showCard(card));
    } else if (view === 'offline') {
      // Only reconnects: Anki closed by hand is not started again until asked.
      return run(() => start(false));
    } else {
      return;
    }
  } catch (error) {
    if (!state.busy && (error instanceof AnkiOffline || error instanceof AnkiKeyNeeded)) run(() => Promise.reject(error));
    return;
  }
  if (JSON.stringify([state.decks, state.card?.id]) !== before) render();
}

document.documentElement.addEventListener('pointerenter', () => void catchUp());

const context = await ready();
text = TEXTS[context.language] ?? TEXTS.en;
options = context.settings;
language.subscribe((next) => {
  text = TEXTS[next] ?? TEXTS.en;
  if (state.view !== 'form') render();
});
settings.subscribe((next) => {
  const restart = next.source !== options.source || next.apiKey !== options.apiKey;
  const launch = next.startAnki && !options.startAnki;
  options = next;
  if (restart || (launch && state.view === 'offline')) return run(() => start(options.startAnki));
  if (source?.kind === 'local') {
    source.setOptions(options);
    if (state.view !== 'form') run(refreshCounts);
    return;
  }
  if (state.view !== 'form') render();
});
// The widget loads when Lizun starts, so Anki is started with Lizun and the cards are ready by
// the time the island is opened.
run(() => start(options.startAnki));
