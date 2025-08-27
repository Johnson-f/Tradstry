/**
 * Custom hook to provide editor action functions that were previously in ActionsPlugin
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { exportFile, importFile } from "@lexical/file";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import { mergeRegister } from "@lexical/utils";
import {
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  CLEAR_EDITOR_COMMAND,
} from "lexical";
import {
  SPEECH_TO_TEXT_COMMAND,
  SUPPORT_SPEECH_RECOGNITION,
} from "../plugins/SpeechToTextPlugin";
import { PLAYGROUND_TRANSFORMERS } from "../plugins/MarkdownTransformers";
import useFlashMessage from "../hooks/useFlashMessage";
import { useDeleteNote } from "@/lib/hooks/use-notes";

async function shareDoc(): Promise<void> {
  const url = new URL(window.location.toString());
  // For now, just copy the current URL - can be enhanced later
  await window.navigator.clipboard.writeText(url.toString());
}

async function sendEditorState(editor: {
  getEditorState: () => unknown;
}): Promise<void> {
  const stringifiedEditorState = JSON.stringify(editor.getEditorState());
  try {
    await fetch("http://localhost:1235/setEditorState", {
      body: stringifiedEditorState,
      headers: {
        Accept: "application/json",
        "Content-type": "application/json",
      },
      method: "POST",
    });
  } catch {
    // NO-OP
  }
}

export function useEditorActions(
  noteId: string | undefined,
  shouldPreserveNewLinesInMarkdown: boolean = false,
) {
  const [editor] = useLexicalComposerContext();
  const [isEditable, setIsEditable] = useState(() => editor.isEditable());
  const [isSpeechToText, setIsSpeechToText] = useState(false);
  const [isEditorEmpty, setIsEditorEmpty] = useState(true);
  const showFlashMessage = useFlashMessage();
  const { mutate: deleteNote } = useDeleteNote();

  useEffect(() => {
    return mergeRegister(
      editor.registerEditableListener((editable) => {
        setIsEditable(editable);
      }),
    );
  }, [editor]);

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      editor.getEditorState().read(() => {
        const root = $getRoot();
        const children = root.getChildren();

        if (children.length > 1) {
          setIsEditorEmpty(false);
        } else {
          if ($isParagraphNode(children[0])) {
            const paragraphChildren = children[0].getChildren();
            setIsEditorEmpty(paragraphChildren.length === 0);
          } else {
            setIsEditorEmpty(false);
          }
        }
      });
    });
  }, [editor]);

  const handleSpeechToText = useCallback(() => {
    if (SUPPORT_SPEECH_RECOGNITION) {
      editor.dispatchCommand(SPEECH_TO_TEXT_COMMAND, !isSpeechToText);
      setIsSpeechToText(!isSpeechToText);
    }
  }, [editor, isSpeechToText]);

  const handleImport = useCallback(() => {
    importFile(editor);
  }, [editor]);

  const handleExport = useCallback(() => {
    exportFile(editor, {
      fileName: `Note ${new Date().toISOString()}`,
      source: "Tradistry",
    });
  }, [editor]);

  const handleSend = useCallback(() => {
    shareDoc().then(
      () => showFlashMessage("URL copied to clipboard"),
      () => showFlashMessage("URL could not be copied to clipboard"),
    );
  }, [showFlashMessage]);

  const handleLock = useCallback(() => {
    // Send latest editor state to commenting validation server
    if (isEditable) {
      sendEditorState(editor);
    }
    editor.setEditable(!editor.isEditable());
  }, [editor, isEditable]);

  const handleMarkdownToggle = useCallback(() => {
    editor.update(() => {
      const root = $getRoot();
      const firstChild = root.getFirstChild();
      if ($isCodeNode(firstChild) && firstChild.getLanguage() === "markdown") {
        $convertFromMarkdownString(
          firstChild.getTextContent(),
          PLAYGROUND_TRANSFORMERS,
          undefined, // node
          shouldPreserveNewLinesInMarkdown,
        );
      } else {
        const markdown = $convertToMarkdownString(
          PLAYGROUND_TRANSFORMERS,
          undefined, //node
          shouldPreserveNewLinesInMarkdown,
        );
        const codeNode = $createCodeNode("markdown");
        codeNode.append($createTextNode(markdown));
        root.clear().append(codeNode);
        if (markdown.length === 0) {
          codeNode.select();
        }
      }
    });
  }, [editor, shouldPreserveNewLinesInMarkdown]);

  const handleClear = useCallback(() => {
    if (!isEditorEmpty) {
      if (window.confirm("Are you sure you want to clear the editor?")) {
        editor.dispatchCommand(CLEAR_EDITOR_COMMAND, undefined);
        editor.focus();
      }
    }
  }, [editor, isEditorEmpty]);

  const handleDelete = useCallback(async () => {
    if (window.confirm("Are you sure you want to delete this note?")) {
      if (noteId) {
        try {
          await deleteNote({ noteId });
          console.log(`Note ${noteId} deleted successfully from useEditorActions`);
        } catch (error) {
          console.error('Failed to delete note from useEditorActions:', error);
          return; // Don't clear editor if delete failed
        }
      }
      editor.dispatchCommand(CLEAR_EDITOR_COMMAND, undefined);
      editor.focus();
    }
  }, [editor, noteId, deleteNote]);

  const handlePdfDownload = useCallback(() => {
    // Get the editor content as HTML
    editor.getEditorState().read(() => {
      const root = $getRoot();
      const htmlString = root.getTextContent();

      // Create a new window for PDF generation
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Note - PDF Export</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  line-height: 1.6;
                  max-width: 800px;
                  margin: 0 auto;
                  padding: 20px;
                  color: #333;
                }
                h1, h2, h3, h4, h5, h6 {
                  color: #2c3e50;
                  margin-top: 1.5em;
                  margin-bottom: 0.5em;
                }
                p {
                  margin-bottom: 1em;
                }
                @media print {
                  body { margin: 0; }
                }
              </style>
            </head>
            <body>
              <div style="white-space: pre-wrap;">${htmlString}</div>
              <script>
                window.onload = function() {
                  window.print();
                  setTimeout(() => window.close(), 1000);
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    });
  }, [editor]);

  const handlePrint = useCallback(() => {
    // Get the editor content for printing
    editor.getEditorState().read(() => {
      const root = $getRoot();
      const htmlString = root.getTextContent();

      // Create a new window for printing
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Print Note</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  line-height: 1.6;
                  max-width: 800px;
                  margin: 0 auto;
                  padding: 20px;
                  color: #333;
                }
                h1, h2, h3, h4, h5, h6 {
                  color: #2c3e50;
                  margin-top: 1.5em;
                  margin-bottom: 0.5em;
                }
                p {
                  margin-bottom: 1em;
                }
                @media print {
                  body {
                    margin: 0;
                    padding: 15px;
                  }
                  @page {
                    margin: 1in;
                  }
                }
              </style>
            </head>
            <body>
              <div style="white-space: pre-wrap;">${htmlString}</div>
              <script>
                window.onload = function() {
                  window.print();
                  window.onafterprint = function() {
                    window.close();
                  };
                };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    });
  }, [editor]);

  return {
    // Action handlers
    handleSpeechToText,
    handleImport,
    handleExport,
    handleSend,
    handleLock,
    handleMarkdownToggle,
    handleClear,
    handleDelete,
    handlePdfDownload,
    handlePrint,

    // State
    isLocked: !isEditable,
    isSpeechActive: isSpeechToText,
    isEditorEmpty,
  };
}
