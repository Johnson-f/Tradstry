/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {IS_CHROME} from '@lexical/utils';
import {
  $createParagraphNode,
  $isElementNode,
  buildImportMap,
  DOMConversionOutput,
  EditorConfig,
  ElementNode,
  LexicalEditor,
  LexicalNode,
  RangeSelection,
} from 'lexical';

import {$isCollapsibleContainerNode} from './CollapsibleContainerNode';
import {$isCollapsibleContentNode} from './CollapsibleContentNode';

export function $convertSummaryElement(
  domNode: HTMLElement,
): DOMConversionOutput | null {
  const node = $createCollapsibleTitleNode();
  return {
    node,
  };
}

/** @noInheritDoc */
export class CollapsibleTitleNode extends ElementNode {
  /** @internal */
  $config() {
    return this.config('collapsible-title', {
      $transform(node: CollapsibleTitleNode) {
        if (node.isEmpty()) {
          node.remove();
        }
      },
      extends: ElementNode,
      importDOM: buildImportMap({
        summary: () => ({
          conversion: $convertSummaryElement,
          priority: 1,
        }),
      }),
    });
  }

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = document.createElement('summary');
    dom.classList.add('cursor-pointer', 'py-1', 'px-1', 'pl-5', 'relative', 'font-bold', 'list-none', 'outline-none');
    
    // Add arrow indicator using a span element instead of CSS pseudo-elements
    const arrow = document.createElement('span');
    arrow.classList.add('absolute', 'left-2', 'top-1/2', '-translate-y-1/2', 'w-0', 'h-0', 'border-l-4', 'border-l-black', 'border-y-4', 'border-y-transparent', 'transition-transform', 'duration-200');
    arrow.setAttribute('data-collapsible-arrow', 'true');
    dom.appendChild(arrow);
    if (IS_CHROME) {
      dom.addEventListener('click', () => {
        editor.update(() => {
          const collapsibleContainer = this.getLatest().getParentOrThrow();
          if (!$isCollapsibleContainerNode(collapsibleContainer)) {
            throw new Error(
              'Expected parent node to be a CollapsibleContainerNode',
            );
          }
          collapsibleContainer.toggleOpen();
        });
      });
    }
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement): boolean {
    return false;
  }

  insertNewAfter(_: RangeSelection, restoreSelection = true): ElementNode {
    const containerNode = this.getParentOrThrow();

    if (!$isCollapsibleContainerNode(containerNode)) {
      throw new Error(
        'CollapsibleTitleNode expects to be child of CollapsibleContainerNode',
      );
    }

    if (containerNode.getOpen()) {
      const contentNode = this.getNextSibling();
      if (!$isCollapsibleContentNode(contentNode)) {
        throw new Error(
          'CollapsibleTitleNode expects to have CollapsibleContentNode sibling',
        );
      }

      const firstChild = contentNode.getFirstChild();
      if ($isElementNode(firstChild)) {
        return firstChild;
      } else {
        const paragraph = $createParagraphNode();
        contentNode.append(paragraph);
        return paragraph;
      }
    } else {
      const paragraph = $createParagraphNode();
      containerNode.insertAfter(paragraph, restoreSelection);
      return paragraph;
    }
  }
}

export function $createCollapsibleTitleNode(): CollapsibleTitleNode {
  return new CollapsibleTitleNode();
}

export function $isCollapsibleTitleNode(
  node: LexicalNode | null | undefined,
): node is CollapsibleTitleNode {
  return node instanceof CollapsibleTitleNode;
}
