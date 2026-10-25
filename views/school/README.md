# views/school/ – Skischul-Ansicht

Für Skilehrer: die eigene Kursgruppe live. Jedes Kind trägt einen Chip, der Kreis um den Lehrer heißt
„Gruppe beisammen“. Wer länger draußen ist, wird orange gemeldet – zuerst nur **anpiepsen** (Vibration
am Chip), erst danach die Bergbahn um eine **Suche** bitten. Kein Notruf aus Versehen.

| Datei | Inhalt |
|---|---|
| `school-view.js` | Hauptseite: Karte (Lehrer, Kreis, Kinder, andere Gruppen), Kopfleiste „7/8“, Banner |
| `kids-panel.js` | Tab „Gruppe“: Durchzählen, alle anpiepsen, Kinder mit Eltern-Telefon und Hinweisen |
| `course-panel.js` | Tab „Kurs“: Abholung, Tagesplan, Nachricht an alle Eltern, Anwesenheitsliste (CSV) |
| `school-panel.js` | Tab „Skischule“: alle Gruppen live, Büro anrufen, Unfall-Hinweis |
| `school.css` | Aussehen nur dieser Ansicht |

**Zum Testen** (Code `SKUL38`): Nach ~35 s fällt Felix zurück – Banner oben, „Anpiepsen“ holt ihn zurück.
