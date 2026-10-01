// ─── Translations ─────────────────────────────────────────────────────────────
//
// Every visible text of the plugin lives here, once in English and once in German.
// `de` is typed against `en`, so a missing or misspelled German key fails the build.
//
// Placeholders: {name} is replaced by vars.name. Plurals: keys ending in ".one" /
// ".other", picked by tp(base, n). Write whole sentences with placeholders rather
// than gluing fragments together — German word order differs from English.

import * as obsidian from "obsidian";

const en = {
  // Board
  "board.fallbackTitle": "Board",
  "board.displayFallback": "Kanban board",
  "board.rename": "Rename board",
  "board.addColumn": "Add column",
  "board.newColumn": "New column",
  "board.defaultBacklog": "Backlog",
  "board.defaultInProgress": "In progress",
  "board.defaultDone": "Done",
  "col.dragToReorder": "Drag to reorder",
  "col.doneTag": "Done",
  "col.doneTagTitle": "This is the done column",
  "col.duel": "Prioritise by duel",
  "col.duelNeedsTwo": "Needs at least two cards to prioritise",
  "col.delete": "Delete column",
  "col.deleteTitle": "Delete \"{name}\"?",
  "col.deleteMsg.one": "This will permanently delete 1 card.",
  "col.deleteMsg.other": "This will permanently delete {n} cards.",
  "col.archived.one": "{n} completed item archived",
  "col.archived.other": "{n} completed items archived",
  "col.addCard": "Add card",
  "card.moveLeft": "Move left",
  "card.moveRight": "Move right",
  "card.edit": "Edit",
  "card.delete": "Delete",
  "card.ehTitle": "Eisenhower: {hint}",
  "notice.duelNeedsTwo": "Add at least two cards to prioritise this column.",
  "notice.columnGone": "That column no longer exists.",
  "notice.orderConfirmed": "Order of \"{name}\" confirmed.",
  "notice.reordered": "\"{name}\" reordered.",

  // Eisenhower quadrants
  "q.do.name": "Do first",
  "q.do.hint": "Urgent · Important",
  "q.schedule.name": "Schedule",
  "q.schedule.hint": "Not urgent · Important",
  "q.delegate.name": "Delegate",
  "q.delegate.hint": "Urgent · Not important",
  "q.eliminate.name": "Eliminate",
  "q.eliminate.hint": "Not urgent · Not important",

  // All done todos
  "done.title": "All done todos",
  "done.empty": "No completed todos yet. Mark a column as 'done' on your board and complete some tasks!",
  "done.todos.one": "{n} completed todo",
  "done.todos.other": "{n} completed todos",
  "done.boards.one": "across {n} board",
  "done.boards.other": "across {n} boards",

  // Eisenhower view
  "eh.title": "Eisenhower matrix",
  "eh.noBoard": "No kanban board in this vault yet. Create one — the matrix always shows the board you last opened.",
  "eh.cannotRead": "Could not read \"{name}\".",
  "eh.boardPicker": "Board shown in the matrix",
  "eh.openTasks.one": "{n} open task",
  "eh.openTasks.other": "{n} open tasks",
  "eh.urgent": "Urgent",
  "eh.notUrgent": "Not urgent",
  "eh.important": "Important",
  "eh.notImportant": "Not important",
  "eh.notCategorised": "Not categorised",
  "eh.allCategorised": "Every open task has a category.",
  "eh.dropHere": "Drop tasks here",
  "eh.noDoneColumn": "This board has no done column. Double-click a column title to mark one.",
  "eh.completed": "Completed: {title}",
  "eh.showDesc": "Show description",
  "eh.hideDesc": "Hide description",
  "eh.markDone": "Mark as done",
  "eh.editCard": "Edit card",

  // Skill chart
  "skill.title": "Skill chart",
  "skill.compare": "Compare with period",
  "skill.from": "From",
  "skill.to": "To",
  "skill.noLabels": "No labels defined. Add labels in the plugin settings to use the skill chart.",
  "skill.now": "Now",
  "skill.total": "Total completions: ",

  // Modals
  "common.cancel": "Cancel",
  "common.ok": "OK",
  "common.delete": "Delete",
  "colModal.title": "Column settings",
  "colModal.name": "Name",
  "colModal.markDone": "Mark as done column",
  "colModal.markDoneHint": "Cards here count in skill chart and all done todos",
  "cardModal.newTitle": "New card",
  "cardModal.editTitle": "Edit card",
  "cardModal.title": "Title",
  "cardModal.titlePlaceholder": "Task title…",
  "cardModal.description": "Description",
  "cardModal.descriptionPlaceholder": "Optional details…",
  "cardModal.labels": "Labels",
  "cardModal.ehCategory": "Eisenhower category",
  "cardModal.none": "None",
  "cardModal.noneHint": "No Eisenhower category",
  "cardModal.save": "Save",
  "cardModal.create": "Create",
  "cardModal.needTitle": "Please enter a title.",

  // Plugin, commands, ribbon
  "cmd.newBoard": "New kanban board",
  "cmd.openSkill": "Open skill chart",
  "cmd.openAllDone": "Open all done todos",
  "cmd.openEisenhower": "Open eisenhower matrix",
  "ribbon.newBoard": "New kanban board",
  "ribbon.allDone": "All done todos",
  "ribbon.skill": "Skill chart",
  "ribbon.eisenhower": "Eisenhower matrix",
  "newBoard.title": "New board",
  "newBoard.default": "My board",
  "newBoard.exists": "\"{path}\" already exists.",

  // Settings
  "settings.language": "Language",
  "settings.languageDesc": "Language of the plugin. Automatic follows the language set in Obsidian. Command names and ribbon tooltips change after Obsidian is reloaded.",
  "settings.languageAuto": "Automatic ({lang})",
  "settings.labelsDesc": "Labels are assigned to cards and drive the skill chart.",
  "settings.labels": "Labels",
  "settings.addLabel": "Add label",
  "settings.newLabel": "New label",
  "settings.remove": "Remove",
  "settings.skillData": "Skill data",
  "settings.reset": "Reset skill scores",
  "settings.resetDesc": "Clears all accumulated scores and history.",
  "settings.resetButton": "Reset",
  "settings.resetDone": "Skill scores reset.",

  // Priority duel
  "duel.title": "Prioritise \"{name}\"",
  "duel.sub": "{n} cards · position 1 is what you work on next",
  "duel.settled": "Order settled",
  "duel.meterTitle": "How close the order is to stable — the ? next to the title explains it.",
  "duel.helpShow": "Explain",
  "duel.helpHide": "Hide explanation",
  "duel.question": "Which should come first?",
  "duel.or": "or",
  "duel.equal": "Equal",
  "duel.equalTitle": "Both are equally important",
  "duel.undo": "Undo",
  "duel.undoTitle": "Undo (Backspace)",
  "duel.skip": "Skip",
  "duel.skipTitle": "Show another pair (S)",
  "duel.review": "Review order",
  "duel.foot.one": "{n} duel. Without any prior order, {cards} cards would need about {guide}; starting from your current order it is usually far fewer.",
  "duel.foot.other": "{n} duels. Without any prior order, {cards} cards would need about {guide}; starting from your current order it is usually far fewer.",
  "duel.resumed.one": "Resumed with {n} earlier duel.",
  "duel.resumed.other": "Resumed with {n} earlier duels.",
  "duel.startOver": "Start over",
  "duel.cardAria": "{title} comes first",
  "duel.newChip": "New",
  "duel.newDelta": "new",
  "duel.gainTitle": "Information per duel",
  "duel.legendLine": "Expected gain (bit)",
  "duel.legendAvg": "Mean of 5",
  "duel.legendBar": "Ranks moved",
  "duel.statDuels": "duels",
  "duel.statBits": "bits expected from this pair",
  "duel.statMoved": "ranks moved, ø last 10",
  "duel.chartAria": "Information gain per duel",
  "duel.chartEmpty": "The curve builds up with your first duels",
  "duel.deltaSame": "Same position as in the column",
  "duel.deltaUp.one": "1 position up from the column",
  "duel.deltaUp.other": "{n} positions up from the column",
  "duel.deltaDown.one": "1 position down from the column",
  "duel.deltaDown.other": "{n} positions down from the column",
  "duel.ranksTitle": "Current order",
  "duel.ranksHint": "Dot: score · line: uncertainty · arrow: change vs. column",
  "duel.reviewTitle": "Review new order",
  "duel.reviewNew.one": "{n} new card placed",
  "duel.reviewNew.other": "{n} new cards placed",
  "duel.reviewUp": "{n} moved up",
  "duel.reviewDown": "{n} moved down",
  "duel.reviewSummary": "{parts} in \"{name}\"",
  "duel.reviewConfirms": "Your duels confirm the current order.",
  "duel.reviewNotSettled": "Not fully settled yet. You can still apply it — cards with few duels mostly keep their place, because the current order counts as a starting point.",
  "duel.was": "was #{n}",
  "duel.discard": "Discard duels",
  "duel.discardConfirm": "Click again to discard",
  "duel.keepDuelling": "Keep duelling",
  "duel.apply": "Apply new order",
  "duel.confirm": "Confirm order",

  // Duel verdict
  "verdict.ready": "The top {top} held their order for the last {held} duels. More duels are unlikely to change what you work on next — review and apply.",
  "verdict.start": "Pick the card that should come first. The meter fills as the order settles.",
  "verdict.uncovered.one": "1 card has not been in a duel yet.",
  "verdict.uncovered.other": "{n} cards have not been in a duel yet.",
  "verdict.placing.one": "Still finding the spot for 1 new card.",
  "verdict.placing.other": "Still finding the spot for {n} new cards.",
  "verdict.justChanged": "The top {top} just changed. They need to hold for {window} duels in a row.",
  "verdict.holding": "The top {top} have held for {held} of {window} duels.",

  // Duel explanations ("?" boxes)
  "help.intro": "Each duel asks one question: which of these two cards should you do first? From your answers the plugin estimates a priority score for every card and suggests a new order for the column. Your current order counts as a starting point, so you only need to correct it where you disagree. Nothing changes on the board until you apply the result.",
  "help.settled.term": "Order settled",
  "help.settled.text": "How close the order is to stable. It fills up as (1) every card has been in at least one duel, (2) new cards have had enough duels to find their spot and (3) the top {top} cards keep their order for several duels in a row. At 100 % more duels will rarely change what you work on next. You can stop at any time, though.",
  "help.cards.term": "The two cards",
  "help.cards.text": "Click the card that should come first, or press ← / →. Ask yourself \"what would I rather have done first?\", not \"which is bigger?\".",
  "help.equal.term": "Equal (↓)",
  "help.equal.text": "Both matter about the same. Counts as half a win for each card.",
  "help.skip.term": "Skip (S)",
  "help.skip.text": "Shows a different pair without recording anything. Use it when you cannot judge this pair right now.",
  "help.undo.term": "Undo (Backspace)",
  "help.undo.text": "Takes back your last answer and shows that pair again.",
  "help.chips.term": "Chips on a card",
  "help.chips.text": "Eisenhower category and labels, as on the board. \"New\" marks a card added since the last applied duel: it has no position yet, so it comes up more often at first.",
  "help.why.term": "Why this pair?",
  "help.why.text": "The plugin picks the pair whose answer it can predict least, so every duel teaches it as much as possible. A single inconsistent answer does not wreck the order: every answer is weighed against all the others.",
  "help.review.term": "Review order (Enter)",
  "help.review.text": "Shows the suggested order next to the current one. Nothing is written until you apply it there.",
  "help.gain.intro": "Shows whether more duels are still worth it.",
  "help.line.term": "Purple line",
  "help.line.text": "How much the plugin expected to learn from each duel, measured in bits. One bit would be a pure coin flip between two cards it knows nothing about. The line falls as the plugin becomes surer of the order.",
  "help.band.term": "Shaded band",
  "help.band.text": "Average of the last 5 duels. It smooths out single jumps so the trend is easier to see.",
  "help.bars.term": "Grey bars",
  "help.bars.text": "How many positions moved in total after each duel (right axis). A tall bar means that answer reshuffled the list. A run of short bars means the order has stopped moving.",
  "help.numbers.term": "Numbers above",
  "help.numbers.text": "Duels so far · how informative the pair on screen is expected to be · how many positions an answer moved on average over the last 10 duels.",
  "help.stop.term": "When to stop",
  "help.stop.text": "When the line is low and flat and the bars stay short, further duels change little. The box under the chart says the same in words.",
  "help.order.term": "Order",
  "help.order.text": "The order you would get if you applied now. The two cards on screen are highlighted.",
  "help.dot.term": "Dot",
  "help.dot.text": "Estimated priority score. Further right means higher priority.",
  "help.ci.term": "Line",
  "help.ci.text": "Uncertainty: the true score is probably somewhere on it. Short line = the plugin is fairly sure. Long line = few duels so far, or contradicting answers.",
  "help.delta.term": "↑2 / ↓1 / –",
  "help.delta.text": "How far the card moved compared to its position in the column today. \"new\" = added since the last applied duel, so it had no real position yet.",
  "help.reviewIntro": "Nothing has changed on the board yet.",
  "help.was.term": "was #4 and ↑ / ↓",
  "help.was.text": "The card's position in the column today and how far it moves. Greyed rows keep their place. \"new\" = card that is placed for the first time.",
  "help.apply.term": "Apply new order (Enter)",
  "help.apply.text": "Writes this order into the column and remembers it, so the next duel can tell which cards are new.",
  "help.keep.term": "Keep duelling (Backspace)",
  "help.keep.text": "Back to the duels. Your answers so far are kept.",
  "help.discard.term": "Discard duels",
  "help.discard.text": "Throws away all duels of this session and leaves the column as it is. Asks once more before it does.",
};

export type TranslationKey = keyof typeof en;

const de: Record<TranslationKey, string> = {
  // Board
  "board.fallbackTitle": "Board",
  "board.displayFallback": "Kanban-Board",
  "board.rename": "Board umbenennen",
  "board.addColumn": "Spalte hinzufügen",
  "board.newColumn": "Neue Spalte",
  "board.defaultBacklog": "Backlog",
  "board.defaultInProgress": "In Arbeit",
  "board.defaultDone": "Erledigt",
  "col.dragToReorder": "Ziehen zum Verschieben",
  "col.doneTag": "Erledigt",
  "col.doneTagTitle": "Das ist die Erledigt-Spalte",
  "col.duel": "Per Duell priorisieren",
  "col.duelNeedsTwo": "Zum Priorisieren braucht es mindestens zwei Karten",
  "col.delete": "Spalte löschen",
  "col.deleteTitle": "„{name}“ löschen?",
  "col.deleteMsg.one": "Dabei wird 1 Karte endgültig gelöscht.",
  "col.deleteMsg.other": "Dabei werden {n} Karten endgültig gelöscht.",
  "col.archived.one": "{n} erledigte Karte archiviert",
  "col.archived.other": "{n} erledigte Karten archiviert",
  "col.addCard": "Karte hinzufügen",
  "card.moveLeft": "Nach links verschieben",
  "card.moveRight": "Nach rechts verschieben",
  "card.edit": "Bearbeiten",
  "card.delete": "Löschen",
  "card.ehTitle": "Eisenhower: {hint}",
  "notice.duelNeedsTwo": "Füge mindestens zwei Karten hinzu, um diese Spalte zu priorisieren.",
  "notice.columnGone": "Diese Spalte gibt es nicht mehr.",
  "notice.orderConfirmed": "Reihenfolge von „{name}“ bestätigt.",
  "notice.reordered": "„{name}“ neu sortiert.",

  // Eisenhower quadrants
  "q.do.name": "Sofort erledigen",
  "q.do.hint": "Dringend · Wichtig",
  "q.schedule.name": "Einplanen",
  "q.schedule.hint": "Nicht dringend · Wichtig",
  "q.delegate.name": "Delegieren",
  "q.delegate.hint": "Dringend · Nicht wichtig",
  "q.eliminate.name": "Streichen",
  "q.eliminate.hint": "Nicht dringend · Nicht wichtig",

  // All done todos
  "done.title": "Alle erledigten Aufgaben",
  "done.empty": "Noch keine erledigten Aufgaben. Markiere auf deinem Board eine Spalte als Erledigt-Spalte und schließe ein paar Aufgaben ab!",
  "done.todos.one": "{n} erledigte Aufgabe",
  "done.todos.other": "{n} erledigte Aufgaben",
  "done.boards.one": "aus {n} Board",
  "done.boards.other": "aus {n} Boards",

  // Eisenhower view
  "eh.title": "Eisenhower-Matrix",
  "eh.noBoard": "In diesem Vault gibt es noch kein Kanban-Board. Lege eines an – die Matrix zeigt immer das zuletzt geöffnete Board.",
  "eh.cannotRead": "„{name}“ konnte nicht gelesen werden.",
  "eh.boardPicker": "Board, das die Matrix anzeigt",
  "eh.openTasks.one": "{n} offene Aufgabe",
  "eh.openTasks.other": "{n} offene Aufgaben",
  "eh.urgent": "Dringend",
  "eh.notUrgent": "Nicht dringend",
  "eh.important": "Wichtig",
  "eh.notImportant": "Nicht wichtig",
  "eh.notCategorised": "Ohne Kategorie",
  "eh.allCategorised": "Jede offene Aufgabe hat eine Kategorie.",
  "eh.dropHere": "Aufgaben hierher ziehen",
  "eh.noDoneColumn": "Dieses Board hat keine Erledigt-Spalte. Doppelklicke auf einen Spaltentitel, um eine festzulegen.",
  "eh.completed": "Erledigt: {title}",
  "eh.showDesc": "Beschreibung anzeigen",
  "eh.hideDesc": "Beschreibung ausblenden",
  "eh.markDone": "Als erledigt markieren",
  "eh.editCard": "Karte bearbeiten",

  // Skill chart
  "skill.title": "Skill-Diagramm",
  "skill.compare": "Mit Zeitraum vergleichen",
  "skill.from": "Von",
  "skill.to": "Bis",
  "skill.noLabels": "Keine Labels angelegt. Lege in den Plugin-Einstellungen Labels an, um das Skill-Diagramm zu nutzen.",
  "skill.now": "Jetzt",
  "skill.total": "Erledigt insgesamt: ",

  // Modals
  "common.cancel": "Abbrechen",
  "common.ok": "OK",
  "common.delete": "Löschen",
  "colModal.title": "Spalteneinstellungen",
  "colModal.name": "Name",
  "colModal.markDone": "Als Erledigt-Spalte markieren",
  "colModal.markDoneHint": "Karten hier zählen im Skill-Diagramm und bei den erledigten Aufgaben",
  "cardModal.newTitle": "Neue Karte",
  "cardModal.editTitle": "Karte bearbeiten",
  "cardModal.title": "Titel",
  "cardModal.titlePlaceholder": "Titel der Aufgabe …",
  "cardModal.description": "Beschreibung",
  "cardModal.descriptionPlaceholder": "Optionale Details …",
  "cardModal.labels": "Labels",
  "cardModal.ehCategory": "Eisenhower-Kategorie",
  "cardModal.none": "Keine",
  "cardModal.noneHint": "Keine Eisenhower-Kategorie",
  "cardModal.save": "Speichern",
  "cardModal.create": "Erstellen",
  "cardModal.needTitle": "Bitte gib einen Titel ein.",

  // Plugin, commands, ribbon
  "cmd.newBoard": "Neues Kanban-Board",
  "cmd.openSkill": "Skill-Diagramm öffnen",
  "cmd.openAllDone": "Alle erledigten Aufgaben öffnen",
  "cmd.openEisenhower": "Eisenhower-Matrix öffnen",
  "ribbon.newBoard": "Neues Kanban-Board",
  "ribbon.allDone": "Alle erledigten Aufgaben",
  "ribbon.skill": "Skill-Diagramm",
  "ribbon.eisenhower": "Eisenhower-Matrix",
  "newBoard.title": "Neues Board",
  "newBoard.default": "Mein Board",
  "newBoard.exists": "„{path}“ existiert bereits.",

  // Settings
  "settings.language": "Sprache",
  "settings.languageDesc": "Sprache des Plugins. „Automatisch“ folgt der in Obsidian eingestellten Sprache. Befehlsnamen und Tooltips der Seitenleiste ändern sich erst nach einem Neuladen von Obsidian.",
  "settings.languageAuto": "Automatisch ({lang})",
  "settings.labelsDesc": "Labels werden Karten zugewiesen und bestimmen das Skill-Diagramm.",
  "settings.labels": "Labels",
  "settings.addLabel": "Label hinzufügen",
  "settings.newLabel": "Neues Label",
  "settings.remove": "Entfernen",
  "settings.skillData": "Skill-Daten",
  "settings.reset": "Skill-Punkte zurücksetzen",
  "settings.resetDesc": "Löscht alle gesammelten Punkte und den Verlauf.",
  "settings.resetButton": "Zurücksetzen",
  "settings.resetDone": "Skill-Punkte zurückgesetzt.",

  // Priority duel
  "duel.title": "„{name}“ priorisieren",
  "duel.sub": "{n} Karten · Platz 1 ist das, woran du als Nächstes arbeitest",
  "duel.settled": "Reihenfolge steht",
  "duel.meterTitle": "Wie stabil die Reihenfolge schon ist – das ? neben dem Titel erklärt es.",
  "duel.helpShow": "Erklären",
  "duel.helpHide": "Erklärung ausblenden",
  "duel.question": "Was soll zuerst drankommen?",
  "duel.or": "oder",
  "duel.equal": "Gleich",
  "duel.equalTitle": "Beide sind gleich wichtig",
  "duel.undo": "Rückgängig",
  "duel.undoTitle": "Rückgängig (Backspace)",
  "duel.skip": "Überspringen",
  "duel.skipTitle": "Anderes Paar zeigen (S)",
  "duel.review": "Reihenfolge prüfen",
  "duel.foot.one": "{n} Duell. Ohne vorhandene Reihenfolge bräuchten {cards} Karten etwa {guide}; ausgehend von deiner aktuellen Reihenfolge sind es meist deutlich weniger.",
  "duel.foot.other": "{n} Duelle. Ohne vorhandene Reihenfolge bräuchten {cards} Karten etwa {guide}; ausgehend von deiner aktuellen Reihenfolge sind es meist deutlich weniger.",
  "duel.resumed.one": "Fortgesetzt mit {n} früheren Duell.",
  "duel.resumed.other": "Fortgesetzt mit {n} früheren Duellen.",
  "duel.startOver": "Neu beginnen",
  "duel.cardAria": "{title} kommt zuerst",
  "duel.newChip": "Neu",
  "duel.newDelta": "neu",
  "duel.gainTitle": "Information pro Duell",
  "duel.legendLine": "Erwarteter Gewinn (Bit)",
  "duel.legendAvg": "Mittel über 5",
  "duel.legendBar": "Bewegte Plätze",
  "duel.statDuels": "Duelle",
  "duel.statBits": "Bit erwartet von diesem Paar",
  "duel.statMoved": "Plätze bewegt, ø letzte 10",
  "duel.chartAria": "Informationsgewinn pro Duell",
  "duel.chartEmpty": "Die Kurve entsteht mit den ersten Duellen",
  "duel.deltaSame": "Gleicher Platz wie in der Spalte",
  "duel.deltaUp.one": "1 Platz weiter oben als in der Spalte",
  "duel.deltaUp.other": "{n} Plätze weiter oben als in der Spalte",
  "duel.deltaDown.one": "1 Platz weiter unten als in der Spalte",
  "duel.deltaDown.other": "{n} Plätze weiter unten als in der Spalte",
  "duel.ranksTitle": "Aktuelle Reihenfolge",
  "duel.ranksHint": "Punkt: Wertung · Linie: Unsicherheit · Pfeil: Änderung ggü. Spalte",
  "duel.reviewTitle": "Neue Reihenfolge prüfen",
  "duel.reviewNew.one": "{n} neue Karte eingeordnet",
  "duel.reviewNew.other": "{n} neue Karten eingeordnet",
  "duel.reviewUp": "{n} nach oben",
  "duel.reviewDown": "{n} nach unten",
  "duel.reviewSummary": "{parts} in „{name}“",
  "duel.reviewConfirms": "Deine Duelle bestätigen die aktuelle Reihenfolge.",
  "duel.reviewNotSettled": "Noch nicht ganz stabil. Du kannst sie trotzdem übernehmen – Karten mit wenigen Duellen behalten meist ihren Platz, weil die aktuelle Reihenfolge als Ausgangspunkt zählt.",
  "duel.was": "vorher #{n}",
  "duel.discard": "Duelle verwerfen",
  "duel.discardConfirm": "Zum Verwerfen erneut klicken",
  "duel.keepDuelling": "Weiter duellieren",
  "duel.apply": "Neue Reihenfolge übernehmen",
  "duel.confirm": "Reihenfolge bestätigen",

  // Duel verdict
  "verdict.ready": "Die oberen {top} haben ihre Reihenfolge in den letzten {held} Duellen gehalten. Weitere Duelle ändern kaum noch, woran du als Nächstes arbeitest – prüfen und übernehmen.",
  "verdict.start": "Wähle die Karte, die zuerst drankommen soll. Die Leiste füllt sich, je stabiler die Reihenfolge wird.",
  "verdict.uncovered.one": "1 Karte war noch in keinem Duell.",
  "verdict.uncovered.other": "{n} Karten waren noch in keinem Duell.",
  "verdict.placing.one": "Der Platz für 1 neue Karte wird noch gesucht.",
  "verdict.placing.other": "Der Platz für {n} neue Karten wird noch gesucht.",
  "verdict.justChanged": "Die oberen {top} haben sich gerade geändert. Sie müssen {window} Duelle in Folge halten.",
  "verdict.holding": "Die oberen {top} halten seit {held} von {window} Duellen.",

  // Duel explanations ("?" boxes)
  "help.intro": "Jedes Duell stellt eine Frage: Welche der beiden Karten solltest du zuerst erledigen? Aus deinen Antworten schätzt das Plugin für jede Karte eine Priorität und schlägt eine neue Reihenfolge für die Spalte vor. Deine aktuelle Reihenfolge zählt als Ausgangspunkt, du musst sie also nur dort korrigieren, wo du anderer Meinung bist. Am Board ändert sich nichts, bis du das Ergebnis übernimmst.",
  "help.settled.term": "Reihenfolge steht",
  "help.settled.text": "Wie stabil die Reihenfolge schon ist. Die Leiste füllt sich, wenn (1) jede Karte mindestens einmal im Duell war, (2) neue Karten genug Duelle hatten, um ihren Platz zu finden, und (3) die oberen {top} Karten ihre Reihenfolge mehrere Duelle hintereinander halten. Bei 100 % ändern weitere Duelle selten etwas daran, woran du als Nächstes arbeitest. Aufhören kannst du aber jederzeit.",
  "help.cards.term": "Die zwei Karten",
  "help.cards.text": "Klick die Karte an, die zuerst drankommen soll, oder drück ← / →. Frag dich „was will ich zuerst erledigt haben?“, nicht „was ist größer?“.",
  "help.equal.term": "Gleich (↓)",
  "help.equal.text": "Beide sind ungefähr gleich wichtig. Zählt als halber Sieg für jede Karte.",
  "help.skip.term": "Überspringen (S)",
  "help.skip.text": "Zeigt ein anderes Paar, ohne etwas zu speichern. Nützlich, wenn du dieses Paar gerade nicht beurteilen kannst.",
  "help.undo.term": "Rückgängig (Backspace)",
  "help.undo.text": "Nimmt deine letzte Antwort zurück und zeigt dieses Paar noch einmal.",
  "help.chips.term": "Chips auf einer Karte",
  "help.chips.text": "Eisenhower-Kategorie und Labels wie auf dem Board. „Neu“ markiert eine Karte, die seit dem letzten übernommenen Duell dazugekommen ist: Sie hat noch keinen Platz und kommt deshalb anfangs öfter dran.",
  "help.why.term": "Warum dieses Paar?",
  "help.why.text": "Das Plugin wählt das Paar, dessen Ausgang es am schlechtesten vorhersagen kann. So bringt jedes Duell möglichst viel. Eine einzelne widersprüchliche Antwort zerstört die Reihenfolge nicht, denn jede Antwort wird gegen alle anderen abgewogen.",
  "help.review.term": "Reihenfolge prüfen (Enter)",
  "help.review.text": "Zeigt die vorgeschlagene Reihenfolge neben der aktuellen. Gespeichert wird erst, wenn du sie dort übernimmst.",
  "help.gain.intro": "Zeigt, ob sich weitere Duelle noch lohnen.",
  "help.line.term": "Lila Linie",
  "help.line.text": "Wie viel das Plugin von jedem Duell zu lernen erwartet hat, gemessen in Bit. Ein Bit wäre ein reiner Münzwurf zwischen zwei Karten, über die es nichts weiß. Die Linie fällt, je sicherer sich das Plugin bei der Reihenfolge ist.",
  "help.band.term": "Heller Streifen",
  "help.band.text": "Mittelwert der letzten 5 Duelle. Er glättet einzelne Sprünge, damit der Trend besser zu sehen ist.",
  "help.bars.term": "Graue Balken",
  "help.bars.text": "Wie viele Plätze sich nach jedem Duell insgesamt verschoben haben (rechte Achse). Ein hoher Balken heißt, diese Antwort hat die Liste umgewürfelt. Mehrere niedrige Balken hintereinander heißen, die Reihenfolge bewegt sich nicht mehr.",
  "help.numbers.term": "Zahlen darüber",
  "help.numbers.text": "Bisherige Duelle · wie aufschlussreich das angezeigte Paar voraussichtlich ist · wie viele Plätze sich pro Antwort in den letzten 10 Duellen im Schnitt bewegt haben.",
  "help.stop.term": "Wann aufhören",
  "help.stop.text": "Wenn die Linie niedrig und flach ist und die Balken klein bleiben, ändern weitere Duelle wenig. Der Kasten unter dem Diagramm sagt dasselbe in Worten.",
  "help.order.term": "Reihenfolge",
  "help.order.text": "Die Reihenfolge, die du bekämst, wenn du jetzt übernimmst. Die beiden Karten auf dem Bildschirm sind hervorgehoben.",
  "help.dot.term": "Punkt",
  "help.dot.text": "Geschätzte Priorität. Weiter rechts heißt wichtiger.",
  "help.ci.term": "Linie",
  "help.ci.text": "Unsicherheit: Der wahre Wert liegt wahrscheinlich irgendwo auf der Linie. Kurze Linie = das Plugin ist ziemlich sicher. Lange Linie = bisher wenige Duelle oder widersprüchliche Antworten.",
  "help.delta.term": "↑2 / ↓1 / –",
  "help.delta.text": "Wie weit sich die Karte gegenüber ihrem heutigen Platz in der Spalte bewegt hat. „neu“ = seit dem letzten übernommenen Duell dazugekommen, hatte also noch keinen echten Platz.",
  "help.reviewIntro": "Am Board hat sich noch nichts geändert.",
  "help.was.term": "vorher #4 und ↑ / ↓",
  "help.was.text": "Der heutige Platz der Karte in der Spalte und wie weit sie sich bewegt. Grau dargestellte Zeilen behalten ihren Platz. „neu“ = Karte, die zum ersten Mal eingeordnet wird.",
  "help.apply.term": "Neue Reihenfolge übernehmen (Enter)",
  "help.apply.text": "Schreibt diese Reihenfolge in die Spalte und merkt sie sich, damit das nächste Duell erkennt, welche Karten neu sind.",
  "help.keep.term": "Weiter duellieren (Backspace)",
  "help.keep.text": "Zurück zu den Duellen. Deine bisherigen Antworten bleiben erhalten.",
  "help.discard.term": "Duelle verwerfen",
  "help.discard.text": "Verwirft alle Duelle dieser Sitzung und lässt die Spalte, wie sie ist. Fragt vorher noch einmal nach.",
};

// ─── Runtime ──────────────────────────────────────────────────────────────────

export type Language = "en" | "de";
export type LanguageSetting = "auto" | Language;

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, de };
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", de: "Deutsch" };

let current: Language = "en";

/** Obsidian's own UI language. getLanguage() exists since Obsidian 1.8.7; older
 *  versions keep the choice in localStorage under "language". */
export function obsidianLanguage(): Language {
  let code = "en";
  const api = obsidian as unknown as { getLanguage?: () => string };
  try {
    if (typeof api.getLanguage === "function") code = api.getLanguage();
    else code = window.localStorage.getItem("language") ?? "en";
  } catch { /* fall back to English */ }
  return code.toLowerCase().startsWith("de") ? "de" : "en";
}

export function setLanguage(setting: LanguageSetting | undefined): void {
  current = !setting || setting === "auto" ? obsidianLanguage() : setting;
}

export function currentLanguage(): Language { return current; }

/** Locale for dates and times shown in the plugin. */
export function dateLocale(): string { return current === "de" ? "de-DE" : "en-GB"; }

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Translate a key, filling {placeholders} from vars. */
export function t(key: TranslationKey, vars?: Vars): string {
  return fill(dictionaries[current][key] ?? en[key], vars);
}

type PluralBase = { [K in TranslationKey]: K extends `${infer B}.one` ? B : never }[TranslationKey];

/** Plural form: picks "<base>.one" for n === 1, else "<base>.other"; {n} is filled in. */
export function tp(base: PluralBase, n: number, vars?: Vars): string {
  const key = (n === 1 ? `${base}.one` : `${base}.other`) as TranslationKey;
  return t(key, Object.assign({ n }, vars));
}
