# Anki for Lizun

Review flash cards in the [Lizun](https://github.com/StreetYo/Lizun) island: open the island,
pick a deck, look at the front, show the answer and press Again, Hard, Good or Easy, the way
you do in Anki.

The cards come from one of two places, chosen in Settings > Widgets > Anki > Cards from:

- **Anki on this computer.** Your own Anki collection, scheduled by Anki itself, with your
  deck options, FSRS or not, and synced with AnkiWeb, so AnkiDroid and AnkiMobile stay in step.
  Needs Anki with the AnkiConnect add-on; Lizun starts Anki in the background by itself.
- **Decks in the widget.** Decks the widget keeps itself, for when Anki is not installed. Cards
  are scheduled with FSRS like in Anki, but they stay on this computer and do not sync with
  AnkiWeb.

## Install

In Lizun, open Settings > Widgets > Add a widget, paste this link and press Install:

```
https://github.com/StreetYo/Lizun-anki
```

The widget needs a Lizun build with `network.request` and `apps` (see
[Writing a Lizun widget](https://github.com/StreetYo/Lizun/blob/master/docs/widgets.md#network)).

## Anki on this computer

Install [AnkiConnect](https://ankiweb.net/shared/info/2055492159) once: in Anki, Tools >
Add-ons > Get Add-ons, enter `2055492159`, then restart Anki.

That is all. When Lizun starts, the widget starts Anki in the background: no window, no
taskbar button, and the cards are there when you open the island. Anki syncs with AnkiWeb when
it starts, as usual. If Anki is already open, the widget uses it as it is.

- **Open Anki** (the arrow in the deck list) shows Anki's window, for signing in to AnkiWeb,
  adding cards or anything else. Opening Anki from its own shortcut works too. While Anki's
  window is open, the same button puts it back in the background.
- When you quit Lizun, an Anki still in the background is closed the usual way, so it syncs and
  does not keep running unseen. An Anki you opened stays open.
- If you close Anki yourself, the widget leaves it closed until you press Try again or Open
  Anki.
- To start Anki yourself instead, turn off "Start Anki in the background" in the settings.
  Anki is started only while the widget is in the island and set to Anki.

Lizun sends the widget's requests itself, so AnkiConnect's list of allowed websites stays as it
is. If you set `apiKey` in AnkiConnect's config, enter the same key in the widget's settings.

How it works: the widget drives Anki's own reviewer through AnkiConnect, so Anki picks the next
card, plays its sounds and schedules the answer, and its main window follows along.

- Deck list with the new, learning and review counts in Anki's colors; subdecks are indented.
- The card's own HTML and styling (on a dark background), images from your collection,
  Again / Hard / Good / Easy with the next review time Anki shows, and Undo.
- Sync button in the deck list. With "Sync with AnkiWeb after a deck is done" on, the widget
  also syncs when you finish a deck. The first sync asks you to sign in to AnkiWeb in Anki's
  window; Anki remembers the sign-in.
- Reviews you do in Anki itself show up when you open the island again.

Adding and editing cards is done in Anki.

## Decks in the widget

- **New deck** (+ in the deck list) and **Import** (the arrow): paste lines or choose a `.txt`,
  `.csv` or `.tsv` file. Each line is a card: the front, a tab or `;`, the back. Anki's
  File > Export > Notes in Plain Text works as it is, including its deck column, which creates
  the decks. Cards that are already in the deck are skipped.
- Add, edit and delete cards; rename and delete decks (the buttons appear when you point at a
  deck).
- Reviews like in Anki: cards in learning come back after 1 and 10 minutes, then FSRS spaces
  them out to reach the retention you set (90% by default). New cards and reviews a day are
  limited per deck (20 and 200 by default); the day starts at 4 AM.
- Undo for the last answers, until the widget is reloaded.

Not supported yet: importing `.apkg` files, images and sounds in these decks, and syncing them
anywhere.

## Settings

| Setting | For |
|---|---|
| Cards from | Anki on this computer, or decks in the widget |
| Start Anki in the background | Anki |
| Card text size | Both |
| Show next review time on the buttons | Both |
| Sync with AnkiWeb after a deck is done | Anki |
| AnkiConnect API key | Anki, only if you set one in AnkiConnect |
| New cards a day, Reviews a day, Desired retention | Decks in the widget |

## Permissions

| Permission | Why |
|---|---|
| `storage` | Keeps the decks in the widget and today's counts. They stay on this computer, in Lizun's own storage. |
| Network `http://127.0.0.1:8765` | AnkiConnect on this computer. Nothing is sent anywhere else. |
| Starts Anki | Starts Anki in the background when Lizun starts, from `%LOCALAPPDATA%\Programs\Anki` or `%PROGRAMFILES%\Anki`. |

## Development

The widget is plain HTML, CSS and JavaScript with no build step:

| File | What it is |
|---|---|
| `manifest.json` | Id, size, permission, network, settings and their Russian translation |
| `index.html`, `style.css` | Page shown in the island, built on the island theme (`--lz-*` variables) |
| `main.js` | Screens: decks, reviewing, forms, messages |
| `anki-connect.js` | Cards from Anki through AnkiConnect |
| `local.js` | Decks kept in the widget: storage, queue, day limits, undo |
| `card-view.js` | Shows a card's HTML in a shadow root, without scripts or links |
| `import.js` | Reads Anki's plain text export and CSV/TSV |
| `texts.js` | The widget's texts in English and Russian, interval formatting |
| `vendor/ts-fsrs.mjs` | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) 5.4.2, MIT License |

To try changes, choose this folder in Settings > Widgets > Add a widget, or copy it to
`%APPDATA%\app.lizun.desktop\widgets\lizun.anki\` and press Reload.

To release a version, raise `version` in `manifest.json`, then tag and publish a GitHub release
(`v1.0.1`).
