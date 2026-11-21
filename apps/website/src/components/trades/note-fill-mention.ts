import {
  $createTextNode, $getNearestNodeFromDOMNode, $getNodeByKey, $getState, $isTextNode, $setState, createState, getNearestEditorFromDOMNode,
  TextNode, type LexicalEditor,
} from 'lexical'
import type { TradeFill } from '@/lib/client/trades/trades'
import { FILL_ROLE_LABEL, price, quantity } from '@/lib/client/trades/trades-model'
import { formatDateTime } from '@/lib/format'

interface FillReference {
  tradeId: string
  fillKey: string
  fillNumber: number
}

export interface TaggedFill extends FillReference {
  text: string
}

export function describeFill(fill: TradeFill, number: number) {
  return {
    label: `Fill #${number} · ${FILL_ROLE_LABEL[fill.role] ?? fill.role}`,
    amount: `${quantity(fill.quantity)} at ${price(fill.price)}`,
    when: formatDateTime(fill.executedAt),
  }
}

export function taggedFillIndex(tag: TaggedFill, tradeId: string, fills: TradeFill[]): number {
  if (tag.tradeId !== tradeId) return -1
  const matches = fills.flatMap((fill, index) => fill.key === tag.fillKey ? [index] : [])
  if (matches.length === 0) return -1

  // Some executions share a broker key. Use the recorded details and, for identical fills, the original position.
  const candidates = matches.filter((index) => {
    const { label, amount } = describeFill(fills[index], tag.fillNumber)
    return tag.text.startsWith(`@${label} · ${amount} · `)
  })
  if (candidates.length === 1) return candidates[0]
  if (matches.length === 1) {
    // A broker may correct the amount. Require the same execution action and time in that case.
    const { label, when } = describeFill(fills[matches[0]], tag.fillNumber)
    return tag.text.startsWith(`@${label} · `) && tag.text.endsWith(` · ${when}`) ? matches[0] : -1
  }
  const exact = candidates.filter((index) => tag.text.endsWith(` · ${formatDateTime(fills[index].executedAt)}`))
  if (exact.length === 1) return exact[0]
  const original = tag.fillNumber - 1
  return exact.includes(original) ? original : -1
}

const fillReference = createState('fillReference', {
  parse(value): FillReference | null {
    if (typeof value !== 'object' || !value ||
      !('tradeId' in value) || typeof value.tradeId !== 'string' ||
      !('fillKey' in value) || typeof value.fillKey !== 'string' ||
      !('fillNumber' in value) || typeof value.fillNumber !== 'number' ||
      !Number.isSafeInteger(value.fillNumber) || value.fillNumber < 1) return null
    return { tradeId: value.tradeId, fillKey: value.fillKey, fillNumber: value.fillNumber }
  },
})

/** Keep a readable snapshot alongside the reference, even if a broker later regroups the fill. */
export function $insertFillMention(query: TextNode, label: string, reference: FillReference) {
  const mention = $setState($createTextNode(label).setMode('token'), fillReference, reference)
  query.replace(mention)
  const next = mention.getNextSibling()
  if ($isTextNode(next) && next.isSimpleText() && next.getTextContent().startsWith(' ')) {
    next.select(1, 1)
  } else {
    const space = $createTextNode(' ')
    mention.insertAfter(space)
    space.selectEnd()
  }
}

export function taggedFillFromTarget(target: EventTarget | null): TaggedFill | null {
  const chip = target instanceof Element ? target.closest('[data-fill-mention]') : null
  if (!chip) return null
  return getNearestEditorFromDOMNode(chip)?.read(() => {
    const node = $getNearestNodeFromDOMNode(chip)
    if (!$isTextNode(node) || !node.isToken()) return null
    const reference = $getState(node, fillReference)
    return reference ? { ...reference, text: node.getTextContent() } : null
  }) ?? null
}

export function registerFillMentions(editor: LexicalEditor) {
  return editor.registerMutationListener(TextNode, (mutations) => {
    editor.getEditorState().read(() => {
      for (const [key, change] of mutations) {
        if (change === 'destroyed') continue
        const node = $getNodeByKey(key)
        const element = editor.getElementByKey(key)
        if (!element) continue
        if ($isTextNode(node) && node.isToken() && $getState(node, fillReference)) {
          element.setAttribute('data-fill-mention', '')
          element.setAttribute('role', 'link')
          element.tabIndex = 0
          element.title = 'Show this fill in the Fills table'
        } else if (element.hasAttribute('data-fill-mention')) {
          element.removeAttribute('data-fill-mention')
          element.removeAttribute('role')
          element.removeAttribute('tabindex')
          element.removeAttribute('title')
        }
      }
    })
  }, { skipInitialization: false })
}
