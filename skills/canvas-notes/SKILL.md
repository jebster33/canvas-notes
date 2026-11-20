---
name: canvas-notes
description: Read and edit Canvas Notes boards (the 2D canvas notes app). Use when the user asks about their notes, boards, tasks, mind maps or cards in a Canvas Notes vault, or wants cards created, summarized, reorganized or turned into tasks.
---

# Canvas Notes

Canvas Notes keeps everything as plain files in a **vault** folder (by default
`Documents\Canvas Notes`). There is no server and no database, so you can read the files directly.

```
<vault>/
  boards/<id>.json     one file per board (the format is described below)
  assets/              images, attachments, fonts and covers that boards point to
  .history/<id>/       automatic snapshots (read-only, don't edit)
  workspaces.json      the workspaces the boards are grouped into
  templates.json       templates the user saved
  .ai/                 these instructions (you are probably running here)
```

When the app runs you from its assistant panel, your working folder is `<vault>/.ai/`, so the boards are in `../boards/`.

## Two ways to help

1. **Answer in the chat** (preferred inside the app). The app sends you the board's content as Markdown
   with the request. When the user wants cards back, reply with **one fenced `json` block** in this shape:

   ```json
   {
     "cards": [
       { "type": "note", "title": "Short title", "body": "Markdown body" },
       { "type": "task", "title": "Do the thing", "body": "Details", "due": "2026-12-01", "priority": "high" }
     ],
     "links": [[0, 1]]
   }
   ```

   - `type` is `note`, `task` or `sticky`. `body` is Markdown (lists, `- [ ]` checklists, **bold**, headings).
   - `due` (YYYY-MM-DD) and `priority` (`low`, `medium`, `high` or `critical`) only apply to tasks.
   - `links` connects cards by their index in `cards`. `-1` means "the card the user selected".
   - Keep titles under about 60 characters. Use 3 to 12 cards unless the user asked for more.
   - Text outside the block is shown to the user, so keep it short.

2. **Edit board files directly** (when the user runs you in the vault on purpose). Only do this when
   the app is closed, or tell the user to reopen the board afterwards, because the app saves its own
   copy and can overwrite your change. Always keep a valid JSON file, and never delete `.history`.

## Board file format (`boards/<id>.json`)

```jsonc
{
  "id": "abc123",            // matches the file name
  "name": "Launch plan",
  "color": "#8B7CF6",
  "workspace": "ws1",        // id from workspaces.json
  "createdAt": 1731000000000, "updatedAt": 1731000000000,
  "order": 0,
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "theme": { /* colors and fonts; leave it alone unless asked */ },
  "statuses": [ { "id": "todo", "label": "To do", "color": "#6B6E80" }, { "id": "done", "label": "Done", "color": "#3FC58A", "done": true } ],
  "nodes": [ /* cards */ ],
  "edges": [ /* lines between cards */ ],
  "strokes": [ /* pen drawings; leave alone */ ]
}
```

### Cards (`nodes[]`)

Every card has `id` (10 random characters), `type`, `x`, `y`, `w`, `h` (world pixels, y grows downward),
`title`, `html`, `style` (`{}` = board defaults), `comments` (`[]`) and `z` (stacking order).
Optional: `tags` (string array), `icon` (an emoji), `cover` (`{ "color": "#hex" }`), `collapsed`.

| type | extra field | notes |
|------|-------------|-------|
| `note` | `html` | rich text as HTML: `<p>`, `<h1>`-`<h3>`, `<ul>`, `<ol>`, `<blockquote>`, `<pre><code>`. Checklists: `<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Item</p></div></li></ul>` |
| `sticky` | `html` | short text on a colored note |
| `task` | `task` | `{ "status": "<status id>", "owner": "", "due": "YYYY-MM-DD", "time": "HH:MM", "priority": "medium", "progress": 0, "remind": "due" }` plus `html` for details |
| `table` | `table` | `{ "cells": [["Item","Qty"],["Domain","1"]], "colWidths": [140,90], "header": true }`. Cells starting with `=` are formulas (`=SUM(B2:B4)`) |
| `frame` | `frame` | `{ "color": "#8B7CF6" }`: a tinted area; cards inside its rectangle belong to it |
| `link` | `link` | `{ "boardId": "<id>" }`: opens another board |
| `code` | `code` | `{ "lang": "ts", "text": "..." }` |
| `web` | `web` | `{ "url": "...", "title": "...", "description": "...", "image": "", "site": "" }` |
| `image`, `file`, `voice`, `chart` | | point at files in `assets/` or at a table card; don't invent these |

Typical sizes: note 280×200, task 280×220, sticky 200×200. Leave about 40px between cards.
`[[Board or card name]]` inside note text becomes a link the app understands.

### Lines (`edges[]`)

`{ "id": "...", "from": "<card id>", "to": "<card id>", "label": "" }`. Optional: `shape`
(`curved`, `straight` or `elbow`), `color`, `dashed`, `arrow`, and `points` (bend points as `[{ "x", "y" }]`).

## Good habits

- Keep the user's wording. Summarize instead of rewriting their notes unless they ask.
- Never remove cards, boards or comments unless the user clearly asked for it.
- Dates are local, written YYYY-MM-DD. Today's date comes with the request.
- Don't put secrets, API keys or personal data the user didn't give you into cards.
