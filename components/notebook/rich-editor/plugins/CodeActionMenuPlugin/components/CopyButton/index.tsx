'use client';

import {$isCodeNode} from '@lexical/code';
import {
  $getNearestNodeFromDOMNode,
  $getSelection,
  $setSelection,
  LexicalEditor,
} from 'lexical';
import * as React from 'react';
import {useState} from 'react';

import {useDebounce} from '../../utils';

interface Props {
  editor: LexicalEditor;
  getCodeDOMNode: () => HTMLElement | null;
}

export function CopyButton({editor, getCodeDOMNode}: Props) {
  const [isCopyCompleted, setCopyCompleted] = useState<boolean>(false);

  const removeSuccessIcon = useDebounce(() => {
    setCopyCompleted(false);
  }, 1000);

  async function handleClick(): Promise<void> {
    const codeDOMNode = getCodeDOMNode();

    if (!codeDOMNode) {
      return;
    }

    let content = '';

    editor.update(() => {
      const codeNode = $getNearestNodeFromDOMNode(codeDOMNode);

      if ($isCodeNode(codeNode)) {
        content = codeNode.getTextContent();
      }

      const selection = $getSelection();
      $setSelection(selection);
    });

    try {
      await navigator.clipboard.writeText(content);
      setCopyCompleted(true);
      removeSuccessIcon();
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  }

  return (
    <button 
      className="border border-transparent rounded p-1 bg-none cursor-pointer flex-shrink-0 flex items-center text-black/50 uppercase hover:border-black/30 hover:opacity-90 active:bg-blue-100 active:border-black/45" 
      onClick={handleClick} 
      aria-label="copy"
    >
      {isCopyCompleted ? (
        <span className="h-4 w-4 opacity-60 flex text-black/50 bg-contain">✓</span>
      ) : (
        <span className="h-4 w-4 opacity-60 flex text-black/50 bg-contain">📋</span>
      )}
    </button>
  );
}
