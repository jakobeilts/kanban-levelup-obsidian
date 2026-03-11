# Kanban Todo Board – Obsidian Plugin

A full-featured Kanban board plugin for Obsidian with Skill tracking, completion history, and drag-and-drop support. Boards are stored as `.kanban` files directly in your vault.

---

## ✨ Feature Overview

| Feature | Description |
|---|---|
| **Multiple Boards** | Each board is a `.kanban` file in your vault — visible in the file list |
| **Flexible Columns** | Add, rename (double-click), delete columns. Mark any column as "Done" |
| **Drag & Drop** | Drag cards between columns with visual drop zones |
| **Arrow buttons** | Move cards left/right by clicking ◀ ▶ on each card |
| **Labels** | Assign color-coded labels to cards. Defined in plugin settings |
| **Auto-archive** | Cards in Done columns older than 1 week are hidden from the board (but preserved) |
| **All Done Todos** | A dedicated page listing every completed todo, grouped by date |
| **Skill Chart** | A radar chart that grows as you complete labeled tasks |
| **Historical comparison** | Compare your skill chart against any custom date range |

---

## 🛠 Installation

### Requirements
- [Node.js](https://nodejs.org/) ≥ 16
- npm

### Steps

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Build the plugin**
   ```bash
   npm run build
   ```
   This generates `main.js`.

3. **Copy to Obsidian**
   - Navigate to `<Your Vault>/.obsidian/plugins/`
   - Create a folder: `kanban-todo-board/`
   - Copy into it:
     - `main.js`
     - `manifest.json`
     - `styles.css`

4. **Enable the plugin**
   - Settings → Community Plugins → disable Safe Mode → enable **Kanban Todo Board**

> **Tip:** Show hidden folders in Finder with `CMD + SHIFT + .`

---

## 📋 Kanban Board

### Creating a board
- Click the **dashboard ribbon icon** or run the command `New Kanban Board`
- Enter a name — a `.kanban` file is created in your vault root and opened immediately
- The board appears in your file list like any other note

### Columns
- **Add a column**: Click the `+` icon at the right edge of the board
- **Rename a column**: Double-click the column title to open the column settings
- **Delete a column**: Click the trash icon in the column header
- **Mark as Done**: In the column settings modal, toggle "Mark as Done column"

> ⚠️ **Important:** The "Done" status is set explicitly — it is NOT inferred from the column name. This means you can rename your Done column to anything (e.g. "🎉 Completed", "Shipped", "Archiv") without breaking Skill Chart or All Done Todos tracking.

### Cards
- **Add a card**: Click `+ Add card` at the bottom of any column
- **Edit a card**: Hover over a card → click the pencil icon
- **Delete a card**: Hover over a card → click the × icon
- **Move a card**: Drag and drop, or use the ◀ ▶ arrow buttons
- Cards support a **title**, optional **description**, and one or more **labels**

### Auto-archive
Cards in Done columns that are **older than 7 days** are automatically hidden from the board view. They continue to count in the Skill Chart and appear on the All Done Todos page. A small note in the Done column shows how many items are archived.

---

## ✅ All Done Todos

Open via the ribbon (checkmark icon) or command `Open All Done Todos`.

- Aggregates **all completed cards** from all `.kanban` files in your vault
- Shows the **completion date and time** for each card
- Grouped by day, sorted newest first
- Displays the **board name** each card belongs to
- Shows assigned **labels**

Cards are tracked here regardless of whether they are still visible on the Kanban board or have been auto-archived.

---

## 📡 Skill Chart

Open via the ribbon (activity icon) or command `Open Skill Chart`.

### How it works
Every time a card is moved into a **Done column**, the Skill Chart increments by 1 for each label on that card. Moving the card back out decrements it. The chart grows over time as you complete labeled work.

### Radar chart
- One axis per label defined in settings
- The shape shows the distribution of your completed work across label types
- Long label names wrap automatically and are never clipped

### Comparison / history
The plugin takes automatic snapshots of your scores (at most once per 20 hours). You can compare your current chart against any past point:

- **Quick presets**: 1W, 2W, 1M, 3M, 6M — sets the comparison range to that many days ago
- **Custom date range**: Set a "From" and "To" date manually using the date pickers
- **Toggle**: Disable comparison entirely with the toggle switch
- The dashed polygon on the chart shows your skills at the start of the selected period
- The stats grid shows the delta (e.g. `+3`) per label

---

## 🏷 Labels

Manage labels in **Settings → Kanban Todo Board → Labels**:

- **Add** labels with `+ Add label`
- **Rename** labels inline — changes reflect immediately on all open boards
- **Change color** using the color picker — the label preview updates live
- **Delete** labels (note: cards retain the label ID, so re-adding a label with the same name won't reconnect them)

Labels assigned to a card are shown as color-coded chips on the card. They drive the Skill Chart axes.

---

## ⚙️ Settings

| Setting | Description |
|---|---|
| **Labels** | Add, rename, recolor, and delete labels |
| **Reset skill scores** | Wipes all accumulated Skill Chart scores and snapshot history |

---

## 📁 File structure

```
obsidian-kanban-plugin/
├── main.ts          # All plugin logic (TypeScript source)
├── styles.css       # Styles (uses Obsidian CSS variables — adapts to any theme)
├── manifest.json    # Plugin metadata
├── package.json     # npm config
├── tsconfig.json    # TypeScript config
└── esbuild.config.mjs  # Build config
```

Board data is stored in `.kanban` files in your vault (plain JSON).  
Label definitions and Skill Chart scores are stored in `.obsidian/plugins/kanban-todo-board/data.json`.

---

## 💻 Development

```bash
npm run dev     # Watch mode — rebuilds on file changes
npm run build   # Production build
```
