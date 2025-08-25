"use client";

import type { JSX } from "react";
import { useCallback } from "react";
import { debounce } from "lodash";

import { $createListItemNode, $createListNode } from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
  DOMConversionMap,
  TextNode,
  EditorState,
} from "lexical";

import { FlashMessageContext } from "./context/FlashMessageContext";
import { SettingsContext, useSettings } from "./context/SettingsContext";
import { SharedHistoryContext } from "./context/SharedHistoryContext";
import { ToolbarContext } from "./context/ToolbarContext";
import Editor from "./Editor";
import PlaygroundNodes from "./nodes/PlaygroundNodes";
import { TableContext } from "./plugins/TablePlugin";
import { parseAllowedFontSize } from "./plugins/ToolbarPlugin/fontSize";
import Settings from "./Settings";
import PlaygroundEditorTheme from "./themes/PlaygroundEditorTheme";
import { parseAllowedColor } from "./ui/ColorPicker";

import { useNote, useUpdateNote } from "../../../lib/hooks/use-notes";

// Import custom CSS overrides

// ... (rest of the code remains the same)

function $prepopulatedRichText() {
  const root = $getRoot();
  if (root.getFirstChild() === null) {
    const heading = $createHeadingNode("h1");
    heading.append($createTextNode("Welcome to Your Notepad"));
    root.append(heading);

    const paragraph = $createParagraphNode();
    paragraph.append(
      $createTextNode(
        "Start writing your thoughts, ideas, and notes here. This rich text editor supports ",
      ),
      $createTextNode("bold").toggleFormat("bold"),
      $createTextNode(" and "),
      $createTextNode("italic").toggleFormat("italic"),
      $createTextNode(" formatting, as well as many other features."),
    );
    root.append(paragraph);

    const heading2 = $createHeadingNode("h2");
    heading2.append($createTextNode("Features"));
    root.append(heading2);

    const list = $createListNode("bullet");
    list.append(
      $createListItemNode().append(
        $createTextNode("Rich text formatting with "),
        $createTextNode("bold").toggleFormat("bold"),
        $createTextNode(", "),
        $createTextNode("italic").toggleFormat("italic"),
        $createTextNode(", and "),
        $createTextNode("underline").toggleFormat("underline"),
      ),
      $createListItemNode().append($createTextNode("Multiple heading levels")),
      $createListItemNode().append($createTextNode("Lists and bullet points")),
      $createListItemNode().append($createTextNode("Tables and images")),
      $createListItemNode().append(
        $createTextNode("Code blocks and syntax highlighting"),
      ),
    );
    root.append(list);

    const quote = $createQuoteNode();
    quote.append(
      $createTextNode(
        "This notepad automatically saves your work as you type. Focus on your ideas, and let the technology handle the rest.",
      ),
    );
    root.append(quote);

    const paragraph2 = $createParagraphNode();
    paragraph2.append(
      $createTextNode(
        "Ready to start? Simply click anywhere and begin typing. Use the toolbar above to format your text and add rich content.",
      ),
    );
    root.append(paragraph2);
  }
}

function getExtraStyles(element: HTMLElement): string {
  // Parse styles from pasted input, but only if they match exactly the
  // sort of styles that would be produced by exportDOM
  let extraStyles = "";
  const fontSize = parseAllowedFontSize(element.style.fontSize);
  const backgroundColor = parseAllowedColor(element.style.backgroundColor);
  const color = parseAllowedColor(element.style.color);
  if (fontSize !== "" && fontSize !== "15px") {
    extraStyles += `font-size: ${fontSize};`;
  }
  if (backgroundColor !== "" && backgroundColor !== "rgb(255, 255, 255)") {
    extraStyles += `background-color: ${backgroundColor};`;
  }
  if (color !== "" && color !== "rgb(0, 0, 0)") {
    extraStyles += `color: ${color};`;
  }
  return extraStyles;
}

function buildImportMap(): DOMConversionMap {
  const importMap: DOMConversionMap = {};

  // Wrap all TextNode importers with a function that also imports
  // the custom styles implemented by the playground
  for (const [tag, fn] of Object.entries(TextNode.importDOM() || {})) {
    importMap[tag] = (importNode) => {
      const importer = fn(importNode);
      if (!importer) {
        return null;
      }
      return {
        ...importer,
        conversion: (element) => {
          const output = importer.conversion(element);
          if (
            output === null ||
            output.forChild === undefined ||
            output.after !== undefined ||
            output.node !== null
          ) {
            return output;
          }
          const extraStyles = getExtraStyles(element);
          if (extraStyles) {
            const { forChild } = output;
            return {
              ...output,
              forChild: (child, parent) => {
                const textNode = forChild(child, parent);
                if ($isTextNode(textNode)) {
                  textNode.setStyle(textNode.getStyle() + extraStyles);
                }
                return textNode;
              },
            };
          }
          return output;
        },
      };
    };
  }

  return importMap;
}

interface AppProps {
  noteId: string;
}

function App({ noteId }: AppProps): JSX.Element {
  const {
    settings: { isCollab, emptyEditor, measureTypingPerf },
  } = useSettings();

  const { data: note, isLoading } = useNote(noteId || "");
  const updateNoteMutation = useUpdateNote();

  // Debounced save function to prevent excessive API calls
  const debouncedSave = useCallback(
    debounce((content: any) => {
      if (noteId && note) {
        updateNoteMutation.mutate({
          noteId,
          note: { content },
        });
      }
    }, 300000),
    [noteId, note, updateNoteMutation]
  );

  const handleContentChange = useCallback((editorState: EditorState) => {
    const content = editorState.toJSON();
    debouncedSave(content);
  }, [debouncedSave]);

  const getInitialEditorState = () => {
    if (isCollab) return null;
    if (emptyEditor) return undefined;
    if (noteId && note?.content && typeof note.content === 'object') {
      try {
        // Return the content object directly, not as JSON string
        return note.content;
      } catch (error) {
        console.warn('Failed to parse note content:', error);
        return $prepopulatedRichText;
      }
    }
    return $prepopulatedRichText;
  };

  const initialConfig = {
    editorState: getInitialEditorState(),
    html: { import: buildImportMap() },
    namespace: "Playground",
    nodes: [...PlaygroundNodes],
    onError: (error: Error) => {
      throw error;
    },
    theme: PlaygroundEditorTheme,
  };

  // Show loading state while note is being fetched
  if (noteId && isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading note...</div>
      </div>
    );
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <SharedHistoryContext>
        <TableContext>
          <ToolbarContext>
            <div className="editor-shell h-full">
              <Editor onContentChange={handleContentChange} />
            </div>
            <Settings />
          </ToolbarContext>
        </TableContext>
      </SharedHistoryContext>
    </LexicalComposer>
  );
}

export default function PlaygroundApp({ noteId }: { noteId?: string }): JSX.Element {
  if (!noteId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Select a note to start editing</div>
      </div>
    );
  }

  return (
    <SettingsContext>
      <FlashMessageContext>
        <App noteId={noteId} />
      </FlashMessageContext>
    </SettingsContext>
  );
}
