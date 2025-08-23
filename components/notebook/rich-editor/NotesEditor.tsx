"use client";

import type {JSX} from "react";

import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
  DOMConversionMap,
  TextNode,
} from "lexical";

import {LexicalComposer} from "@lexical/react/LexicalComposer";
import {FlashMessageContext} from "./context/FlashMessageContext";
import {SettingsContext, useSettings} from "./context/SettingsContext";
import {SharedHistoryContext} from "./context/SharedHistoryContext";
import {ToolbarContext} from "./context/ToolbarContext";
import Editor from "./Editor";
import PlaygroundNodes from "./nodes/PlaygroundNodes";
import {TableContext} from "./plugins/TablePlugin";
import {parseAllowedFontSize} from "./plugins/ToolbarPlugin/fontSize";
import PlaygroundEditorTheme from "./themes/PlaygroundEditorTheme";
import {parseAllowedColor} from "./ui/ColorPicker";

function prepopulatedRichText() {
  const root = $getRoot();
  if (root.getFirstChild() === null) {
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode("Start writing your notes..."));
    root.append(paragraph);
  }
}

function getExtraStyles(element: HTMLElement): string {
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
            const {forChild} = output;
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

function EditorApp(): JSX.Element {
  const {
    settings: {isCollab, emptyEditor},
  } = useSettings();

  const initialConfig = {
    editorState: isCollab
      ? null
      : emptyEditor
      ? undefined
      : prepopulatedRichText,
    html: {import: buildImportMap()},
    namespace: "NotesEditor",
    nodes: [...PlaygroundNodes],
    onError: (error: Error) => {
      throw error;
    },
    theme: PlaygroundEditorTheme,
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <SharedHistoryContext>
        <TableContext>
          <ToolbarContext>
            <div
              className="editor-shell"
              style={{height: "100%", display: "flex", flexDirection: "column"}}
            >
              <Editor />
            </div>
          </ToolbarContext>
        </TableContext>
      </SharedHistoryContext>
    </LexicalComposer>
  );
}

export default function NotesEditor(): JSX.Element {
  return (
    <SettingsContext>
      <FlashMessageContext>
        <EditorApp />
      </FlashMessageContext>
    </SettingsContext>
  );
}