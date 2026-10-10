/**
 * Decks kept by the widget itself, for reviewing without Anki. Cards are scheduled with FSRS
 * (ts-fsrs, the algorithm Anki uses when FSRS is on) with Anki's default learning steps, and
 * the day starts at 4 AM like in Anki. They stay on this computer and do not sync with AnkiWeb.
 *
 * Storage: `decks` lists the decks; each deck's cards are kept in pieces of under 900 KB
 * (`cards.<deck id>.<n>`), since one stored value holds at most 1 MB; answering a card writes
 * only its piece. `today` counts the new cards and reviews done today per deck.
 */
import { storage } from '/__sdk/index.js';
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from './vendor/ts-fsrs.mjs';

const PIECE_BYTES = 900 * 1024;
/** A card's front and back together, as stored. */
export const MAX_CARD_CHARS = 100 * 1024;
const MAX_DECK_NAME = 100;
/** Learning cards due this soon are shown when nothing else is left, as Anki does. */
const LEARN_AHEAD_MS = 20 * 60 * 1000;
/** Hour the review day starts at. */
const DAY_START_HOUR = 4;
const MAX_UNDO = 30;
/** Like Anki's Basic note type. */
const CARD_CSS = '.card { text-align: center; }';

export class LocalSource {
  kind = 'local';
  /** @type {{ id: string, name: string, created: number, pieces: number }[]} */
  deckList = [];
  /** Cards by deck id. */
  cards = new Map();
  /** Which piece of its deck a card is stored in, by card id. */
  pieceOf = new Map();
  today = { day: '', new: {}, review: {} };
  undoStack = [];
  options = { newPerDay: 20, reviewsPerDay: 200, retention: 90 };

  async load() {
    const decks = await storage.get('decks');
    this.deckList = Array.isArray(decks) ? decks : [];
    for (const deck of this.deckList) {
      const cards = [];
      for (let piece = 0; piece < deck.pieces; piece++) {
        const stored = await storage.get(pieceKey(deck.id, piece));
        for (const card of Array.isArray(stored) ? stored : []) {
          cards.push(card);
          this.pieceOf.set(card.id, piece);
        }
      }
      this.cards.set(deck.id, cards);
    }
    const today = await storage.get('today');
    if (today && typeof today === 'object') this.today = today;
  }

  setOptions(options) {
    this.options = options;
    this.scheduler = fsrs(
      generatorParameters({
        request_retention: options.retention / 100,
        enable_fuzz: true,
        enable_short_term: true,
      }),
    );
  }

  // Decks

  async decks() {
    this.rollDay();
    const now = Date.now();
    return [...this.deckList]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
      .map((deck) => ({
        id: deck.id,
        name: deck.name,
        label: deck.name,
        depth: 0,
        total: this.cards.get(deck.id).length,
        ...this.countsAt(deck.id, now),
      }));
  }

  async counts(deckId) {
    this.rollDay();
    return this.countsAt(deckId, Date.now());
  }

  deckName(deckId) {
    return this.deckList.find((deck) => deck.id === deckId)?.name ?? '';
  }

  async createDeck(name) {
    name = checkDeckName(name);
    if (this.findDeck(name)) throw new Error('exists');
    const deck = { id: newId(), name, created: Date.now(), pieces: 0 };
    this.deckList.push(deck);
    this.cards.set(deck.id, []);
    await this.saveDeckList();
    return deck.id;
  }

  async renameDeck(deckId, name) {
    name = checkDeckName(name);
    const other = this.findDeck(name);
    if (other && other.id !== deckId) throw new Error('exists');
    this.deck(deckId).name = name;
    await this.saveDeckList();
  }

  async deleteDeck(deckId) {
    const deck = this.deck(deckId);
    for (const card of this.cards.get(deckId)) this.pieceOf.delete(card.id);
    this.deckList = this.deckList.filter((d) => d !== deck);
    this.cards.delete(deckId);
    this.undoStack = this.undoStack.filter((entry) => entry.deckId !== deckId);
    await this.saveDeckList();
    for (let piece = 0; piece < deck.pieces; piece++) await storage.remove(pieceKey(deckId, piece));
  }

  findDeck(name) {
    const wanted = name.toLocaleLowerCase();
    return this.deckList.find((deck) => deck.name.toLocaleLowerCase() === wanted);
  }

  // Cards

  /** Adds new cards to a deck; returns how many were added and how many were already there. */
  async addCards(deckId, notes) {
    const cards = this.cards.get(deckId);
    const existing = new Set(cards.map((card) => `${card.front}\u001f${card.back}`));
    let added = 0;
    let duplicates = 0;
    const now = Date.now();
    for (const { front, back } of notes) {
      checkCard(front, back);
      const key = `${front}\u001f${back}`;
      if (existing.has(key)) {
        duplicates++;
        continue;
      }
      existing.add(key);
      cards.push({ id: newId(), front, back, created: now + added, ...fromFsrs(createEmptyCard(new Date(now))) });
      added++;
    }
    if (added) await this.saveDeck(deckId);
    return { added, duplicates };
  }

  async editCard(deckId, cardId, front, back) {
    checkCard(front, back);
    const card = this.findCard(deckId, cardId);
    card.front = front;
    card.back = back;
    await this.saveCard(deckId, card);
  }

  async deleteCard(deckId, cardId) {
    const cards = this.cards.get(deckId);
    this.cards.set(
      deckId,
      cards.filter((card) => card.id !== cardId),
    );
    this.pieceOf.delete(cardId);
    this.undoStack = this.undoStack.filter((entry) => entry.card.id !== cardId);
    await this.saveDeck(deckId);
  }

  // Reviewing

  async start(deckId) {
    this.deck(deckId);
    this.deckId = deckId;
    this.sinceNew = 0;
    return this.current();
  }

  /** The next card to show, or null when the deck is done for now. */
  async current() {
    this.rollDay();
    this.card = this.pick(Date.now());
    return this.card && this.view(this.card);
  }

  /** What the widget shows for a card, with the next review time for each answer. */
  view(card) {
    const now = new Date();
    const preview = this.scheduler.repeat(toFsrs(card), now);
    return {
      id: card.id,
      question: card.front,
      answer: `${card.front}<hr id="answer">${card.back}`,
      css: CARD_CSS,
      ord: 0,
      buttons: [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((rating) => ({
        ease: rating,
        intervalMs: preview[rating].card.due.getTime() - now.getTime(),
      })),
    };
  }

  async showAnswer() {}

  async answer(ease) {
    const card = this.card;
    if (!card) return null;
    this.undoStack.push({ deckId: this.deckId, card: { ...card }, today: structuredClone(this.today), sinceNew: this.sinceNew });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();

    const counter = card.state === State.New ? 'new' : card.state === State.Review ? 'review' : null;
    if (counter) this.today[counter][this.deckId] = (this.today[counter][this.deckId] ?? 0) + 1;
    this.sinceNew = card.state === State.New ? 0 : this.sinceNew + 1;
    const next = this.scheduler.next(toFsrs(card), new Date(), ease);
    Object.assign(card, fromFsrs(next.card));

    await Promise.all([this.saveCard(this.deckId, card), storage.set('today', this.today)]);
    return this.current();
  }

  get canUndo() {
    return this.undoStack.some((entry) => entry.deckId === this.deckId);
  }

  /** Puts the last answered card back as it was and shows it again. */
  async undo() {
    const index = this.undoStack.findLastIndex((entry) => entry.deckId === this.deckId);
    if (index < 0) return this.current();
    const [entry] = this.undoStack.splice(index, 1);
    const card = this.cards.get(entry.deckId).find((c) => c.id === entry.card.id);
    if (card) Object.assign(card, entry.card);
    this.today = entry.today;
    this.sinceNew = entry.sinceNew;
    await Promise.all([card && this.saveCard(entry.deckId, card), storage.set('today', this.today)]);
    if (!card) return this.current();
    // Like Anki, the undone card is shown again even if another one is due first.
    this.card = card;
    return this.view(card);
  }

  async stop() {
    this.card = null;
  }

  /** When the next learning card of the deck comes back today, or null. */
  nextLearningDue() {
    const end = dayEnd(Date.now());
    let next = null;
    for (const card of this.cards.get(this.deckId) ?? []) {
      if (isLearning(card) && card.due < end && (next === null || card.due < next)) next = card.due;
    }
    return next;
  }

  // Queue

  pick(now) {
    const cards = this.cards.get(this.deckId) ?? [];
    const end = dayEnd(now);
    const { newLeft, reviewLeft } = this.limitsLeft(this.deckId);
    let learning = null;
    let review = null;
    let fresh = null;
    let ahead = null;
    let reviewsDue = 0;
    let newAvailable = 0;
    for (const card of cards) {
      if (isLearning(card)) {
        if (card.due <= now && (!learning || card.due < learning.due)) learning = card;
        else if (card.due <= now + LEARN_AHEAD_MS && (!ahead || card.due < ahead.due)) ahead = card;
      } else if (card.state === State.Review && card.due < end) {
        reviewsDue++;
        if (!review || card.due < review.due) review = card;
      } else if (card.state === State.New) {
        newAvailable++;
        if (!fresh || card.created < fresh.created) fresh = card;
      }
    }
    if (learning) return learning;
    if (reviewLeft <= 0) review = null;
    if (newLeft <= 0) fresh = null;
    if (review && fresh) {
      // Mix new cards in among the reviews, spread over the day's reviews like Anki.
      const reviewsPerNew = Math.max(1, Math.floor(Math.min(reviewsDue, reviewLeft) / Math.min(newAvailable, newLeft)));
      return this.sinceNew >= reviewsPerNew ? fresh : review;
    }
    return review ?? fresh ?? ahead;
  }

  countsAt(deckId, now) {
    const end = dayEnd(now);
    const { newLeft, reviewLeft } = this.limitsLeft(deckId);
    let newCount = 0;
    let learnCount = 0;
    let reviewCount = 0;
    for (const card of this.cards.get(deckId) ?? []) {
      if (isLearning(card)) learnCount += card.due < end ? 1 : 0;
      else if (card.state === State.Review) reviewCount += card.due < end ? 1 : 0;
      else if (card.state === State.New) newCount++;
    }
    return {
      newCount: Math.min(newCount, newLeft),
      learnCount,
      reviewCount: Math.min(reviewCount, reviewLeft),
    };
  }

  limitsLeft(deckId) {
    return {
      newLeft: Math.max(0, this.options.newPerDay - (this.today.new[deckId] ?? 0)),
      reviewLeft: Math.max(0, this.options.reviewsPerDay - (this.today.review[deckId] ?? 0)),
    };
  }

  /** Starts counting again when a new day began. */
  rollDay() {
    const day = dayKey(Date.now());
    if (this.today.day === day) return;
    this.today = { day, new: {}, review: {} };
    storage.set('today', this.today).catch((error) => console.warn('could not save today', error));
  }

  // Storage

  deck(deckId) {
    const deck = this.deckList.find((d) => d.id === deckId);
    if (!deck) throw new Error('unknown deck');
    return deck;
  }

  findCard(deckId, cardId) {
    const card = this.cards.get(deckId)?.find((c) => c.id === cardId);
    if (!card) throw new Error('unknown card');
    return card;
  }

  saveDeckList() {
    return storage.set('decks', this.deckList);
  }

  /** Writes the piece a card is in; packs the whole deck again when the piece got too big. */
  async saveCard(deckId, card) {
    const piece = this.pieceOf.get(card.id);
    if (piece === undefined) return this.saveDeck(deckId);
    const cards = this.cards.get(deckId).filter((c) => this.pieceOf.get(c.id) === piece);
    if (JSON.stringify(cards).length > PIECE_BYTES) return this.saveDeck(deckId);
    await storage.set(pieceKey(deckId, piece), cards);
  }

  /** Writes all of a deck's cards, in pieces that fit one stored value. */
  async saveDeck(deckId) {
    const deck = this.deck(deckId);
    const pieces = [];
    let piece = [];
    let size = 2;
    for (const card of this.cards.get(deckId)) {
      const cardSize = JSON.stringify(card).length + 1;
      if (piece.length && size + cardSize > PIECE_BYTES) {
        pieces.push(piece);
        piece = [];
        size = 2;
      }
      piece.push(card);
      size += cardSize;
      this.pieceOf.set(card.id, pieces.length);
    }
    if (piece.length) pieces.push(piece);

    for (let i = 0; i < pieces.length; i++) await storage.set(pieceKey(deckId, i), pieces[i]);
    const before = deck.pieces;
    deck.pieces = pieces.length;
    await this.saveDeckList();
    for (let i = pieces.length; i < before; i++) await storage.remove(pieceKey(deckId, i));
  }
}

function pieceKey(deckId, piece) {
  return `cards.${deckId}.${piece}`;
}

function isLearning(card) {
  return card.state === State.Learning || card.state === State.Relearning;
}

function toFsrs(card) {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  };
}

function fromFsrs(card) {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}

/** Start of the review day that `now` is in. */
function dayStart(now) {
  const start = new Date(now);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  if (start.getTime() > now) start.setDate(start.getDate() - 1);
  return start;
}

function dayEnd(now) {
  const end = dayStart(now);
  end.setDate(end.getDate() + 1);
  return end.getTime();
}

function dayKey(now) {
  const start = dayStart(now);
  return `${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`;
}

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function checkDeckName(name) {
  name = String(name).trim();
  if (!name) throw new Error('empty');
  return name.slice(0, MAX_DECK_NAME);
}

function checkCard(front, back) {
  if (!String(front).trim()) throw new Error('empty');
  if (front.length + back.length > MAX_CARD_CHARS) throw new Error('too long');
}
