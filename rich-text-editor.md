# Lexical Rich Text Editor

A fully-featured rich text editor built with Lexical packages for React.

## Features

- Rich text editing (bold, italic, underline, code blocks, links, lists, tables, hashtags)
# Description
Support for bold, italic, underline, strikethrough, inline code, links, lists (ordered/unordered/checkbox), tables, and hashtags. These are the building blocks of text formatting — Lexical provides nodes (TextNode, ListNode, TableNode) that handle this natively.

- Syntax highlighted code blocks with Shiki
# Description 
When inserting a code block, Lexical integrates with Shiki (a syntax highlighter) to colorize code based on programming language. This is huge for developer-focused editors.

- Clipboard support (copy, cut, paste)
# Description
Using @lexical/clipboard, the editor supports copy–paste across different contexts:
Pasting plain text
Pasting rich text (with formatting preserved)
Pasting images into the editor from the clipboard 
Copying from the editor into other apps (and vice versa)

- Markdown support for quick formatting
# Description
With @lexical/markdown, users can type Markdown shorthand (**bold**, # Heading, - list item) and it will automatically convert to rich text formatting.

- Undo/Redo history management
# Description
@lexical/history keeps track of user changes so you can navigate back and forth safely, like in Google Docs or Notion.

- File upload and insertion support (via copy and paste)
# Description
Using @lexical/file, you can paste or drag files (images, PDFs, videos, etc.) into the editor and have them show up as embedded nodes.

- Real-time collaborative editing with Yjs
# Description
The @lexical/yjs integration brings Google Docs–style live collaboration:
Multiple cursors
Conflict-free editing
Offline-first syncing

- Custom input handling with Dragon and Headless mode
# Description
@lexical/dragon integrates with Dragon NaturallySpeaking (speech-to-text), so users can dictate text.

@lexical/headless allows programmatic use of Lexical’s editor state without a DOM — useful for testing, automation, or custom rendering.

- Extensive debugging with Devtools
# Description
@lexical/devtools-core gives you a DevTools panel where you can inspect nodes, editor state, and updates in real-time.

- Semantic HTML import/export
# Description
Using @lexical/html, you can:

Import content written in plain HTML into Lexical

Export Lexical editor state back to semantic HTML
This is crucial for SEO, CMS integration, and saving content cleanly.


- Slash commands menu (e.g. typing / opens insert options: table, image, divider, code block, etc.)
# Description
Typing / triggers a floating menu that lets you quickly insert content blocks like:
Paragraph
Heading 1 
Heading 2
Heading 3
Table
Numbered list
Bulletd list
Check list
Quote
Code
Divider
Page Break
Embed X(Tweet)
Embed YouTube Video
Embed Figma Document
Date
Images
GIF
Equation
Collapsible
Align left
Align Center 

- Text highlighting colors (background + font color picker)
# Description
Users can apply background colors or text colors using @lexical/mark. This enables highlighter-style annotations.

## Content Structures

- Embeds for media (YouTube, Twitter/X, Figma, charts, etc.)

- Collapsible blocks / toggle lists (like Notion’s toggle block)

- Callout/Info boxes with icons & colored backgrounds
Styled blocks with icons (ℹ️, ⚠️, ✅) and background colors for highlighting info. Great for documentation or journaling apps.

- Block drag-and-drop reordering (move paragraphs, lists, or sections up/down)
Enables moving blocks (paragraphs, lists, images) around via drag handles. Improves UX for long-form content.

- Keyboard shortcuts everywhere (⌘+B, ⌘+K, ⌘+/, etc.)
Common shortcuts (⌘+B for bold, ⌘+K for links, ⌘+/ for slash menu) — essential for power users.

## Packages installed 
-   "@lexical/clipboard": "^0.34.0",
-   "@lexical/code": "^0.34.0",
-   "@lexical/code-shiki": "^0.34.0",
-   "@lexical/devtools-core": "^0.34.0",
-   "@lexical/dragon": "^0.34.0",
-   "@lexical/file": "^0.34.0",
-   "@lexical/hashtag": "^0.34.0",
-   "@lexical/headless": "^0.34.0",
-   "@lexical/history": "^0.34.0",
-   "@lexical/html": "^0.34.0",
-   "@lexical/link": "^0.34.0",
-   "@lexical/list": "^0.34.0",
-   "@lexical/mark": "^0.34.0",
-   "@lexical/markdown": "^0.34.0",
-   "@lexical/offset": "^0.34.0",
-   "@lexical/overflow": "^0.34.0",
-   "@lexical/plain-text": "^0.34.0",
-   "@lexical/react": "^0.34.0",
-   "@lexical/rich-text": "^0.34.0",
-   "@lexical/selection": "^0.34.0",
-   "@lexical/table": "^0.34.0",
-   "@lexical/text": "^0.34.0",
-   "@lexical/utils": "^0.34.0",
-   "@lexical/yjs": "^0.34.0",
    
