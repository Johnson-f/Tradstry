"use client";

import type {Option, Options, PollNode} from './PollNode';
import type {JSX} from 'react';


import {useCollaborationContext} from '@lexical/react/LexicalCollaborationContext';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {useLexicalNodeSelection} from '@lexical/react/useLexicalNodeSelection';
import {mergeRegister} from '@lexical/utils';
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  BaseSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  NodeKey,
} from 'lexical';
import * as React from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';

import Button from '../ui/Button';
import joinClasses from '../utils/joinClasses';
import {$isPollNode, createPollOption} from './PollNode';

function getTotalVotes(options: Options): number {
  return options.reduce((totalVotes, next) => {
    return totalVotes + next.votes.length;
  }, 0);
}

function PollOptionComponent({
  option,
  index,
  options,
  totalVotes,
  withPollNode,
}: {
  index: number;
  option: Option;
  options: Options;
  totalVotes: number;
  withPollNode: (
    cb: (pollNode: PollNode) => void,
    onSelect?: () => void,
  ) => void;
}): JSX.Element {
  const {clientID} = useCollaborationContext();
  const checkboxRef = useRef(null);
  const votesArray = option.votes;
  const checkedIndex = votesArray.indexOf(clientID);
  const checked = checkedIndex !== -1;
  const votes = votesArray.length;
  const text = option.text;

  return (
    <div className="flex flex-row mb-2.5 items-center">
      <div
        className={joinClasses(
          'relative flex w-5.5 h-5.5 border border-gray-400 mr-2.5 rounded',
          checked && 'border-blue-500 bg-blue-500',
        )}>
        {checked && (
          <div className="absolute top-1 left-2 w-1.5 h-2.5 border-white border-r-2 border-b-2 rotate-45 pointer-events-none" />
        )}
        <input
          ref={checkboxRef}
          className="border-0 absolute block w-full h-full opacity-0 cursor-pointer"
          type="checkbox"
          onChange={(e) => {
            withPollNode((node) => {
              node.toggleVote(option, clientID);
            });
          }}
          checked={checked}
        />
      </div>
      <div className="flex flex-1 border border-blue-500 rounded relative overflow-hidden cursor-pointer">
        <div
          className="bg-blue-50 h-full absolute top-0 left-0 transition-all duration-1000 ease-in-out z-0"
          style={{width: `${votes === 0 ? 0 : (votes / totalVotes) * 100}%`}}
        />
        <span className="text-blue-500 absolute right-4 text-xs top-1.5">
          {votes > 0 && (votes === 1 ? '1 vote' : `${votes} votes`)}
        </span>
        <input
          className="flex flex-1 border-0 p-2 text-blue-500 bg-transparent font-bold outline-0 z-0 placeholder:font-normal placeholder:text-gray-400"
          type="text"
          value={text}
          onChange={(e) => {
            const target = e.target;
            const value = target.value;
            const selectionStart = target.selectionStart;
            const selectionEnd = target.selectionEnd;
            withPollNode(
              (node) => {
                node.setOptionText(option, value);
              },
              () => {
                target.selectionStart = selectionStart;
                target.selectionEnd = selectionEnd;
              },
            );
          }}
          placeholder={`Option ${index + 1}`}
        />
      </div>
      <button
        disabled={options.length < 3}
        className={joinClasses(
          'relative flex w-7 h-7 ml-1.5 border-0 bg-transparent bg-no-repeat z-0 cursor-pointer rounded opacity-30 hover:opacity-100 hover:bg-gray-100',
          options.length < 3 && 'cursor-not-allowed hover:opacity-30 hover:bg-transparent',
        )}
        aria-label="Remove"
        onClick={() => {
          withPollNode((node) => {
            node.deleteOption(option);
          });
        }}>
        <div className="absolute top-1.5 left-3 w-0.5 h-4 bg-gray-400 -rotate-45" />
        <div className="absolute top-1.5 left-3 w-0.5 h-4 bg-gray-400 rotate-45" />
      </button>
    </div>
  );
}

export default function PollComponent({
  question,
  options,
  nodeKey,
}: {
  nodeKey: NodeKey;
  options: Options;
  question: string;
}): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const totalVotes = useMemo(() => getTotalVotes(options), [options]);
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  const [selection, setSelection] = useState<BaseSelection | null>(null);
  const ref = useRef(null);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({editorState}) => {
        setSelection(editorState.read(() => $getSelection()));
      }),
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        (payload) => {
          const event = payload;

          if (event.target === ref.current) {
            if (!event.shiftKey) {
              clearSelection();
            }
            setSelected(!isSelected);
            return true;
          }

          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [clearSelection, editor, isSelected, nodeKey, setSelected]);

  const withPollNode = (
    cb: (node: PollNode) => void,
    onUpdate?: () => void,
  ): void => {
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if ($isPollNode(node)) {
          cb(node);
        }
      },
      {onUpdate},
    );
  };

  const addOption = () => {
    withPollNode((node) => {
      node.addOption(createPollOption());
    });
  };

  const isFocused = $isNodeSelection(selection) && isSelected;

  return (
    <div
      className={`border border-gray-200 bg-gray-50 rounded-lg max-w-[600px] min-w-[400px] cursor-pointer select-none ${isFocused ? 'outline outline-2 outline-blue-500' : ''}`}
      ref={ref}>
      <div className="m-4 cursor-default">
        <h2 className="ml-0 mt-0 mr-0 mb-4 text-gray-700 text-center text-lg">{question}</h2>
        {options.map((option, index) => {
          const key = option.uid;
          return (
            <PollOptionComponent
              key={key}
              withPollNode={withPollNode}
              option={option}
              index={index}
              options={options}
              totalVotes={totalVotes}
            />
          );
        })}
        <div className="flex justify-center">
          <Button onClick={addOption} small={true}>
            Add Option
          </Button>
        </div>
      </div>
    </div>
  );
}
