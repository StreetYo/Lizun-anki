/**
 * Shows a card's HTML in a shadow root, so the note type's CSS applies to the card and nothing
 * else. Card HTML comes from the user's decks, which may be shared decks from anyone: scripts,
 * frames, forms and event handlers are removed (the widget's CSP blocks inline scripts anyway),
 * and links do not open, since following one would replace the widget.
 */

const REMOVED = 'script, iframe, frame, object, embed, link, meta, base, form, input, textarea, select, button';

/** Tags Anki puts where a sound plays, such as `[anki:play:q:0]`; Anki plays them itself. */
const PLAY_TAG = /\[anki:play:[qa]:\d+\]|\[sound:[^\]]*\]/g;

/** Applied after the card's own CSS: the island's colors and the size from the settings. */
const OVERRIDES = `
:host { display: block; }
.card {
  margin: 0;
  padding: 6px 4px 10px;
  background: transparent !important;
  color: var(--lz-text) !important;
  font-size: var(--card-size) !important;
  line-height: 1.35;
  overflow-wrap: anywhere;
  user-select: text;
  cursor: auto;
}
img { max-width: 100%; max-height: 110px; object-fit: contain; }
hr { border: none; border-top: 1px solid var(--lz-card-raised); margin: 10px 0; }
a { color: var(--lz-accent); pointer-events: none; }
`;

export class CardView {
  /** @param {HTMLElement} host */
  constructor(host) {
    this.host = host;
    this.root = host.attachShadow({ mode: 'open' });
    this.root.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
    });
  }

  /**
   * @param {string} html the card side, possibly with its own `<style>` elements
   * @param {{ css?: string, ord?: number, resolveImage?: (name: string) => Promise<string | null> }} options
   */
  show(html, { css = '', ord = 0, resolveImage } = {}) {
    const template = document.createElement('template');
    template.innerHTML = String(html).replace(PLAY_TAG, '');
    const content = template.content;
    clean(content);

    const style = document.createElement('style');
    style.textContent = `${css}\n${OVERRIDES}`;
    const card = document.createElement('div');
    card.className = `card card${ord + 1} nightMode night_mode`;
    card.append(content);
    // `.nightMode .card` rules need an ancestor with the class.
    const night = document.createElement('div');
    night.className = 'nightMode night_mode';
    night.append(card);
    this.root.replaceChildren(style, night);

    if (resolveImage) {
      for (const image of card.querySelectorAll('img[data-src]')) {
        const name = image.getAttribute('data-src');
        resolveImage(name)
          .then((url) => url && image.isConnected && image.setAttribute('src', url))
          .catch(() => {});
      }
    }
  }

  /** Scrolls to where the answer starts, like Anki does. */
  scrollToAnswer(scroller) {
    const marker = this.root.getElementById('answer');
    scroller.scrollTop = marker ? Math.max(0, marker.offsetTop - 8) : 0;
  }

  clear() {
    this.root.replaceChildren();
  }
}

/** Removes everything that could run code or leave the widget, and defers images. */
function clean(fragment) {
  for (const element of fragment.querySelectorAll(REMOVED)) element.remove();
  for (const element of fragment.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || value.startsWith('javascript:') || name === 'srcset') {
        element.removeAttribute(attribute.name);
      }
    }
  }
  // A media file name is resolved by the deck's source; data: URLs are kept as they are.
  for (const image of fragment.querySelectorAll('img')) {
    const src = image.getAttribute('src') ?? '';
    if (src.startsWith('data:')) continue;
    image.removeAttribute('src');
    if (src && !/^[a-z][a-z0-9+.-]*:/i.test(src)) image.setAttribute('data-src', decodeName(src));
  }
}

function decodeName(src) {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}
