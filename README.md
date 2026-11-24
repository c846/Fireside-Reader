# Fireside Reader

A local reader for ePub and plain-text books, built with Tauri 2 and Svelte 5.

## Running

Prerequisites: Node.js, Rust and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for Windows (WebView2 comes with Windows 11).

```sh
npm install
npm run tauri dev      # run in development
npm run tauri build    # build an installer into src-tauri/target/release/bundle
```

`npm run check` type-checks the frontend.

## Using it

- **Dashboard:** every book you've opened, most recent first. Search by title at the top. Right-click a book to remove it. **Start a new book!** opens an `.epub` or `.txt` file.
- **Turning pages:** Space or Shift+Space, the arrow keys, PageUp/PageDown, or click the left or right third of the page. Home and End jump to the start and end.
- **Page bookmark:** click the page number in the top right. A book has one page bookmark at a time; setting a new one replaces the old one. It shows as a notch on the bottom bar's slider, which you can click to jump to it.
- **Bottom bar:** hover over or click the bottom edge. It has home, settings, a slider for moving through the book, and the current page out of the total. Click the page number to type a page.
- **Chapters:** hover over or click the left edge. Click a chapter to go to it, or click the square beside it to bookmark the chapter.
- **Resume:** your place is saved as you read and when you close the book or the window. This is separate from the page bookmark.
- **Settings:** theme (Default, Paper, Night), font (your book's own fonts or any installed font), font size, and single page or double column.
- **Fullscreen:** use the button under Window in Settings, or press F11. The app remembers it next time it opens.
- **Background image:** choose one in Settings and it shows behind the dashboard. With **Show behind the page while reading** turned on, the book is placed on a smaller page pane with the image around it.

Page numbers depend on the window size, font and layout, the same way they do in other ePub readers. Bookmarks and your reading position are saved as places in the text, so they stay put when the page count changes.

## Where data lives

`%APPDATA%\com.fireside.reader\`

| Path | Contents |
| --- | --- |
| `books/` | Copies of every book opened, so they survive the original file being deleted |
| `covers/` | Cover thumbnails |
| `library.json` | Titles, reading positions, bookmarks |
| `settings.json` | Theme, font, layout and background options |
| `background/` | A copy of the chosen background image |

## How it's put together

- `src-tauri/src/lib.rs`: file storage, the system font list and the Windows user name.
- `src/lib/book/`: ePub parsing (JSZip and DOMParser) and TXT parsing. TXT parsing finds chapter headings and strips Project Gutenberg boilerplate.
- `src/lib/reader/paginator.ts`: lays the whole book out as CSS columns inside a shadow root. Each column is a page, and turning a page slides the column strip sideways.
- `src/components/`: the welcome screen, dashboard, reader, bars and settings menu.
