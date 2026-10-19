/** The widget's own texts by language; the manifest translates its name and settings. */
export const TEXTS = {
  en: {
    title: 'Anki',
    sourceLocal: 'In the widget',
    sync: 'Sync with AnkiWeb',
    syncStarted: 'Anki is syncing',
    newDeck: 'New deck',
    importCards: 'Import cards',
    addCard: 'Add a card',
    editCard: 'Edit the card',
    deleteCard: 'Delete the card',
    renameDeck: 'Rename',
    deleteDeck: 'Delete',
    undo: 'Undo',
    decks: 'Decks',
    countsHint: 'New, learning, to review',
    showAnswer: 'Show answer',
    ease: { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' },
    loading: 'Loading…',
    noDecksAnki: 'There are no decks in Anki.',
    noDecksLocal: 'No decks yet. Create one or import cards.',
    doneTitle: 'Congratulations!',
    doneText: 'You have finished this deck for now.',
    doneLearning: 'More cards in learning at {time}.',
    emptyDeck: 'There are no cards in this deck yet.',
    syncing: 'Anki is syncing with AnkiWeb.',
    offlineTitle: 'Anki is not reachable',
    openAnki: 'Open Anki',
    hideAnki: 'Put Anki in the background',
    starting: 'Starting Anki…',
    notInstalled: 'Anki is not installed on this computer. Get it at apps.ankiweb.net.',
    offlineText:
      'Anki does not answer. It needs the AnkiConnect add-on: in Anki, Tools > Add-ons > Get Add-ons, code 2055492159, then restart Anki.',
    offlineHint: 'No Anki? Choose "Decks in the widget" in Settings > Widgets > Anki.',
    retry: 'Try again',
    keyTitle: 'AnkiConnect asks for an API key',
    keyText: "Enter the apiKey from AnkiConnect's config in Settings > Widgets > Anki.",
    errorTitle: 'Something went wrong',
    front: 'Front',
    back: 'Back',
    deck: 'Deck',
    deckName: 'Deck name',
    save: 'Save',
    cancel: 'Cancel',
    add: 'Add',
    create: 'Create',
    delete: 'Delete',
    import: 'Import',
    added: 'Card added',
    importHelp:
      'One card per line: front, then a tab or ";", then back. From Anki: File > Export > Notes in Plain Text.',
    importPlaceholder: 'Paste cards here',
    chooseFile: 'Choose a file…',
    newDeckOption: 'New deck',
    importedDeck: 'Imported',
    imported: '{added} cards added',
    importedDuplicates: '{added} cards added, {duplicates} were already there',
    nothingToImport: 'No cards found',
    fileTooLarge: 'The file is larger than 20 MB',
    deckExists: 'There is already a deck with this name',
    confirmDeleteDeck: 'Delete "{name}" and its cards ({count})?',
    confirmDeleteCard: 'Delete this card?',
    failed: 'Could not do it: {error}',
    units: { minute: 'm', hour: 'h', day: 'd', month: 'mo', year: 'y', lessThanMinute: '<1m' },
  },
  ru: {
    title: 'Anki',
    sourceLocal: 'В виджете',
    sync: 'Синхронизировать с AnkiWeb',
    syncStarted: 'Anki синхронизируется',
    newDeck: 'Новая колода',
    importCards: 'Импорт карточек',
    addCard: 'Добавить карточку',
    editCard: 'Изменить карточку',
    deleteCard: 'Удалить карточку',
    renameDeck: 'Переименовать',
    deleteDeck: 'Удалить',
    undo: 'Отменить',
    decks: 'Колоды',
    countsHint: 'Новые, изучаемые, к повторению',
    showAnswer: 'Показать ответ',
    ease: { 1: 'Снова', 2: 'Трудно', 3: 'Хорошо', 4: 'Легко' },
    loading: 'Загрузка…',
    noDecksAnki: 'В Anki нет колод.',
    noDecksLocal: 'Колод пока нет. Создайте колоду или импортируйте карточки.',
    doneTitle: 'Поздравляем!',
    doneText: 'На сегодня эта колода пройдена.',
    doneLearning: 'Изучаемые карточки вернутся в {time}.',
    emptyDeck: 'В этой колоде пока нет карточек.',
    syncing: 'Anki синхронизируется с AnkiWeb.',
    offlineTitle: 'Anki недоступен',
    openAnki: 'Открыть Anki',
    hideAnki: 'Убрать Anki в фон',
    starting: 'Запускаю Anki…',
    notInstalled: 'Anki не установлен на этом компьютере. Скачать: apps.ankiweb.net.',
    offlineText:
      'Anki не отвечает. Ему нужен аддон AnkiConnect: в Anki Инструменты > Дополнения > Скачать дополнения, код 2055492159, затем перезапустите Anki.',
    offlineHint: 'Нет Anki? Выберите «Колоды в виджете» в Настройки > Виджеты > Anki.',
    retry: 'Повторить',
    keyTitle: 'AnkiConnect просит API-ключ',
    keyText: 'Введите apiKey из настроек AnkiConnect в Настройки > Виджеты > Anki.',
    errorTitle: 'Что-то пошло не так',
    front: 'Лицевая сторона',
    back: 'Оборот',
    deck: 'Колода',
    deckName: 'Название колоды',
    save: 'Сохранить',
    cancel: 'Отмена',
    add: 'Добавить',
    create: 'Создать',
    delete: 'Удалить',
    import: 'Импорт',
    added: 'Карточка добавлена',
    importHelp:
      'По карточке в строке: лицевая сторона, табуляция или «;», оборот. Из Anki: Файл > Экспорт > Записи в виде простого текста.',
    importPlaceholder: 'Вставьте карточки сюда',
    chooseFile: 'Выбрать файл…',
    newDeckOption: 'Новая колода',
    importedDeck: 'Импорт',
    imported: 'Добавлено карточек: {added}',
    importedDuplicates: 'Добавлено карточек: {added}, уже были: {duplicates}',
    nothingToImport: 'Карточки не найдены',
    fileTooLarge: 'Файл больше 20 МБ',
    deckExists: 'Колода с таким названием уже есть',
    confirmDeleteDeck: 'Удалить «{name}» и её карточки ({count})?',
    confirmDeleteCard: 'Удалить эту карточку?',
    failed: 'Не получилось: {error}',
    units: { minute: ' мин', hour: ' ч', day: ' д', month: ' мес', year: ' г', lessThanMinute: '<1 мин' },
  },
};

/** Fills `{name}` placeholders. */
export function format(text, values) {
  return text.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

/** A time until the next review, the way Anki writes it on its buttons: 10m, 3d, 1.5mo. */
export function formatInterval(ms, units) {
  const minutes = ms / 60000;
  if (minutes < 1) return units.lessThanMinute;
  if (minutes < 60) return `${Math.round(minutes)}${units.minute}`;
  const hours = minutes / 60;
  if (hours < 24) return `${round(hours)}${units.hour}`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}${units.day}`;
  const months = days / 30;
  if (months < 12) return `${round(months)}${units.month}`;
  return `${round(days / 365)}${units.year}`;
}

function round(value) {
  return value < 10 ? String(Math.round(value * 10) / 10) : String(Math.round(value));
}
