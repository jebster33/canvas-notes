<p align="center"><img src="docs/icon.png" width="96" alt="Canvas Notes icon"></p>

<h1 align="center">Canvas Notes</h1>

<p align="center">A dark 2D brainstorming workspace for Windows: infinite canvas boards with cards, connectors, drawing, tables, charts, task boards, reminders and workspaces. Built with Tauri 2 (Rust) + React.</p>

![Canvas with notes, tasks, a budget table, a chart and a frame](docs/screenshots/canvas.png)

## Download

Grab the latest version from [Releases](https://github.com/jebster33/canvas-notes/releases/latest):

- **`CanvasNotes-portable.exe`**: a single file, no install. Put it anywhere and run it.
- **`Canvas.Notes_x.y.z_x64-setup.exe`**: a normal installer with a Start menu entry.

The app can update itself from GitHub Releases (App settings → Updates). Turn on **Update automatically** to install new versions when the app starts.

## Screenshots

| | |
| --- | --- |
| ![Trello-style board view](docs/screenshots/board-view.png) | ![Task detail card](docs/screenshots/task-detail.png) |
| **Board view**: your own lists, drag tasks between them | **Task detail**: everything about a task, with Go to canvas |
| ![Timeline view](docs/screenshots/timeline.png) | ![Graph view](docs/screenshots/graph.png) |
| **Timeline**: drag bars to reschedule | **Graph**: how cards and boards link together |
| ![Sheet settings with board themes](docs/screenshots/themes.png) | ![Start menu](docs/screenshots/start-menu.png) |
| **Themes and sheet settings** for the whole board | **Start menu** with workspaces and recent boards |

## Build it yourself

```powershell
npm install
npm run app        # dev window with hot reload
npm run release    # builds the app into src-tauri/target/release (and an installer in bundle/nsis)
npm run dev        # browser-only preview at http://localhost:1420 (uses browser storage)
```

Screenshots are made by `node scripts/screenshots.mjs` (with `npm run dev` running): it builds a demo workspace in a hidden Edge window and saves `docs/screenshots/*.png`.

## Where your notes live

A vault folder, `Documents\Canvas Notes` by default (change it in the sidebar or Sheet settings → Board):

- `boards/<id>.json`: one file per board
- `assets/`: images, attached files and voice notes
- `.history/<board>/`: automatic snapshots for version history (every 10 minutes, last 60 kept)

**Export board** (Sheet settings → Board, or a board's menu in the sidebar) writes one `.canvasboard` file with every card, line, drawing, comment, image and the board's settings. **Import board** adds it back as a new board. **Export / Import settings only** moves just the look (`.canvastheme`).

## Cards

| Card | Key | What it holds |
| --- | --- | --- |
| Note | N | Rich text: headings, lists, checklists, colors, highlights, `[[wiki links]]` |
| Task | T | Status, progress, owner, due date and time, reminder, start date, priority, details |
| Table | B | Spreadsheet grid. `=SUM(B2:B5)`, `AVG`, `MIN`, `MAX`, `COUNT`, `ROUND`, `ABS`, `IF`, `+ - * / ^` |
| Image | I | Paste (Ctrl V), drag in, or choose a picture |
| Sticky | S | Quick colored note |
| Board link | K | Jumps to another board |
| Frame | F | Named area that groups cards; drag its name tag to move everything inside; present with F5 |
| Chart | C | Bar, line or donut chart fed live from a table card |
| Web link | W | Page preview (title, image, description); YouTube links play inline. Paste or drop a link too |
| Code | X | Code with color highlighting (Lua, Python, JS/TS, Rust, C#, …) |
| File | U | Any attachment; opens in its Windows app, PDFs preview inside the card |
| Voice note | Y | Record from your mic and play back; dropped audio files become voice notes |

### Tables

- **+ at the right edge** (or **Add column…**) asks what you want: text, numbers, checkboxes, or a column calculated from others (add up, subtract, multiply, divide, percentage, share of total, average, highest, lowest). Pick the columns, name it, done. Calculated columns update by themselves.
- **New row** adds a row above any totals. **Add row…** also offers Total, Average, Highest, Lowest and Count rows.
- **Right-click a box**: calculate this box (pick the boxes to use by clicking them), box color, row color, insert or delete rows and columns.
- **Checkboxes** adds a tick box at the start of every row; ticked rows fade out.
- Drag the edge of a column letter to resize it. Typing `=` still works for hand-written formulas.

### Tasks, views and reminders

- **Board / Calendar / Timeline** (top bar) show the board's tasks Trello-style, on a month calendar, or as bars on a timeline. Switch to **All boards** to see every task.
- On **Board**, add your own lists (**Add another list**), double-click a list name to rename it, and use its ⋯ menu for color, order, delete and "count as done". Drag tasks between lists, or drag a list's header to reorder.
- Click any task in those views to open its **detail card**: edit everything, add tags and comments, or press **Go to canvas**.
- **Reminders**: each task picks when to remind you. You get a Windows notification plus an entry under the bell, and a nudge when it's overdue. Settings live in Sheet settings → App.
- Closing the window keeps the app in the **system tray** so reminders and quick capture keep working (quit from the tray icon). Optionally start with Windows.

### More

- **Quick capture**: press **Ctrl Shift Space** anywhere in Windows to jot a note or task into the Inbox board (change the shortcut in Sheet settings → App).
- **Tags**: tag cards from their toolbar; filter the board by tag from the top bar.
- **Align / arrange**: select several cards for align, even spacing and tidy grid.
- **Minimap** (button by the zoom controls), **Export as image or PDF** and **Version history** (⋯ menu in the top bar).

Comments live in the right-hand Comments panel; cards with comments show a count badge.

## Styling

- **On the card:** select it and use the bar above it (font, size, bold/italic/underline, alignment, text, fill, accent and border colors). While editing text, the bar switches to formatting the selected words.
- **Sheet settings:** fonts, sizes, colors, radius, shadow for all cards or one card type, plus canvas background/grid, default line style and wheel behavior.
- Cards styled by hand show a small violet dot. Click it (or "Apply settings to all cards") to go back to the sheet settings.

## Shortcuts

| Action | Keys |
| --- | --- |
| Search everything | Ctrl K |
| Graph view | Ctrl G |
| Sheet settings | Ctrl , |
| Toggle sidebar | Ctrl \ |
| Select / Pan | V / H (or hold Space) |
| Pen, highlighter, rectangle, ellipse, arrow, line, eraser | P, M, R, O, A, L, E |
| Edit selected card | Enter or double-click |
| Move around | Left-drag empty canvas (or middle mouse / Space + drag) |
| Make a card in a box | Right-drag over empty canvas, let go, pick a card type |
| Select several | Right-drag (or Shift + left-drag) a box over cards and drawings |
| Add a card anywhere | Double-click or right-click empty canvas |
| Connect cards | Drag a dot on a card edge to another card; drop on empty space to create a connected card |
| Snap to grid on/off | G (or the magnet by the zoom controls) |
| Present frames | F5 (arrows to move, Esc to stop) |
| Undo / Redo | Ctrl Z / Ctrl Y |
| Duplicate, copy, paste | Ctrl D, Ctrl C, Ctrl V |
| Zoom | Wheel (or Ctrl + wheel), Ctrl + / Ctrl -, Ctrl 0, Shift 1 to fit |
| Delete | Delete |

## License

MIT, see [LICENSE](LICENSE).
