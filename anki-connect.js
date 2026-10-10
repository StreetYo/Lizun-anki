/**
 * Cards from Anki on this computer, through the AnkiConnect add-on
 * (https://ankiweb.net/shared/info/2055492159).
 *
 * The widget drives Anki's own reviewer, the way AnkiConnect's `gui*` actions are meant to be
 * used: Anki picks the cards, schedules them with the deck's options (FSRS or SM-2) and plays
 * their sounds; the widget shows the card and passes on the answer. Anki's window follows
 * along. Syncing is Anki's own sync, so AnkiWeb, AnkiDroid and AnkiMobile stay in step.
 */
import { LizunError, network } from '/__sdk/index.js';

const URL = 'http://127.0.0.1:8765';
const VERSION = 6;
/** How long to wait for Anki to show the next card after an answer or an undo. */
const NEXT_CARD_TIMEOUT = 1500;

/** Anki could not be reached, or AnkiConnect is missing. */
export class AnkiOffline extends Error {}

/** AnkiConnect wants the API key set in its config. */
export class AnkiKeyNeeded extends Error {}

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  ico: 'image/x-icon',
};

export class AnkiConnectSource {
  kind = 'anki';
  /** Deck names by id, from the last `decks()`. */
  deckNames = new Map();
  /** Data URLs of media files by name. */
  images = new Map();

  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async call(action, params = {}) {
    const request = { action, version: VERSION, params };
    if (this.apiKey) request.key = this.apiKey;
    let response;
    try {
      response = await network.request(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch (error) {
      if (error instanceof LizunError) throw new AnkiOffline(error.message);
      throw error;
    }
    let reply;
    try {
      reply = response.json();
    } catch {
      throw new AnkiOffline(`not AnkiConnect: HTTP ${response.status}`);
    }
    if (reply.error) {
      if (/api key/i.test(reply.error)) throw new AnkiKeyNeeded(reply.error);
      throw new Error(reply.error);
    }
    return reply.result;
  }

  /** Checks that AnkiConnect answers; throws `AnkiOffline` or `AnkiKeyNeeded` otherwise. */
  async connect() {
    await this.call('version');
  }

  /** Decks in Anki's order, parents before children, with today's counts. */
  async decks() {
    const ids = await this.call('deckNamesAndIds');
    const names = Object.keys(ids).sort(compareDeckNames);
    const stats = await this.call('getDeckStats', { decks: names });
    this.deckNames = new Map(names.map((name) => [String(ids[name]), name]));
    const decks = names.map((name) => {
      const stat = stats[ids[name]] ?? {};
      const parts = name.split('::');
      return {
        id: String(ids[name]),
        name,
        label: parts[parts.length - 1],
        depth: parts.length - 1,
        newCount: stat.new_count ?? 0,
        learnCount: stat.learn_count ?? 0,
        reviewCount: stat.review_count ?? 0,
        total: stat.total_in_deck ?? 1,
      };
    });
    // Anki hides the Default deck (id 1, named in the user's language) while it is empty and has
    // no subdecks.
    return decks.filter(
      (deck) => !(deck.id === '1' && deck.total === 0 && !names.some((n) => n.startsWith(`${deck.name}::`))),
    );
  }

  async counts(deckId) {
    const name = this.deckNames.get(deckId);
    const stats = await this.call('getDeckStats', { decks: [name] });
    const stat = stats[deckId] ?? {};
    return { newCount: stat.new_count ?? 0, learnCount: stat.learn_count ?? 0, reviewCount: stat.review_count ?? 0 };
  }

  /** Opens the deck in Anki's reviewer; returns the first card, or null when nothing is due. */
  async start(deckId) {
    const name = this.deckNames.get(deckId);
    if (!name) throw new Error('unknown deck');
    this.deckId = deckId;
    this.card = null;
    if (!(await this.call('guiDeckReview', { name }))) throw new Error(`Anki could not open ${name}`);
    return this.current();
  }

  /** The card Anki shows now, or null when the review is over. */
  async current() {
    let card;
    try {
      card = await this.call('guiCurrentCard');
    } catch (error) {
      if (/not currently active|reviewer is not available/i.test(error.message)) {
        this.card = null;
        return null;
      }
      throw error;
    }
    this.card = {
      id: card.cardId,
      question: card.question,
      answer: card.answer,
      css: card.css,
      ord: card.fieldOrder ?? 0,
      // Anki wraps the numbers in its texts in invisible direction marks.
      buttons: card.buttons.map((ease, i) => ({ ease, interval: (card.nextReviews[i] ?? '').replace(/[\u2066-\u2069]/g, '') })),
    };
    return this.card;
  }

  async showAnswer() {
    await this.call('guiShowAnswer');
  }

  /** Answers the card shown (1 Again … 4 Easy) and returns the next one, or null at the end. */
  async answer(ease) {
    const previous = this.card?.id;
    if (!(await this.call('guiAnswerCard', { ease }))) {
      throw new Error('Anki did not take the answer; it may show a different screen now');
    }
    return this.waitForNextCard(previous);
  }

  /** Undoes the last answer in Anki and returns the card it brings back. */
  async undo() {
    const previous = this.card?.id;
    await this.call('guiUndo');
    return this.waitForNextCard(previous);
  }

  /** Anki shows the next card a moment after an answer; the same card can come back too. */
  async waitForNextCard(previous) {
    const started = Date.now();
    for (;;) {
      await delay(120);
      const card = await this.current();
      if (!card || card.id !== previous || Date.now() - started > NEXT_CARD_TIMEOUT) return card;
    }
  }

  /** Leaves the reviewer, so Anki is back at its deck list. */
  async stop() {
    this.card = null;
    await this.call('guiDeckBrowser').catch(() => {});
  }

  /** Starts Anki's sync; Anki asks for the AnkiWeb sign-in itself when needed. */
  async sync() {
    await this.call('guiDeckBrowser').catch(() => {});
    await this.call('sync');
  }

  /** A media file as a data URL, for `<img>` in cards. */
  async resolveImage(name) {
    if (this.images.has(name)) return this.images.get(name);
    const base64 = await this.call('retrieveMediaFile', { filename: name });
    const extension = name.split('.').pop()?.toLowerCase() ?? '';
    const url = base64 ? `data:${MIME[extension] ?? 'application/octet-stream'};base64,${base64}` : null;
    if (this.images.size > 200) this.images.clear();
    this.images.set(name, url);
    return url;
  }
}

/** Anki sorts decks by name, comparing each `::` level on its own and ignoring case. */
function compareDeckNames(a, b) {
  const left = a.split('::');
  const right = b.split('::');
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const order = left[i].localeCompare(right[i], undefined, { sensitivity: 'base', numeric: true });
    if (order) return order;
  }
  return left.length - right.length;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
