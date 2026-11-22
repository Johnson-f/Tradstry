import { expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Dialog } from '@/components/ui/dialog'
import { CalculatorTab } from './calculator-tab'

test('reopening a cached trade sizes it from the saved workspace rule', () => {
  const win = new Window({ url: 'http://localhost:4005' })
  win.localStorage.setItem('tradstry.position-calculator.test', JSON.stringify({
    symbol: 'AAPL', entry: '20', stop: '19.5', riskMode: 'DOLLARS', risk: '1',
  }))
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: win.localStorage })
  try {
    win.document.body.innerHTML = renderToStaticMarkup(
      createElement(Dialog, { open: true }, createElement(CalculatorTab, {
        workspaceId: 'test',
        rule: {
          balance: '2195.68', riskPercent: '0.4', maxStopPercent: '3',
          source: 'MANUAL', asOf: null, manualBalance: '2195.68', linked: false,
        },
        onPlan: () => {},
      })),
    )
    expect(Array.from(win.document.querySelectorAll('label'), (label) => label.textContent)).toEqual([
      'Symbol', 'Entry price', 'Stop loss',
    ])
    expect(win.document.querySelector('[aria-label="Calculated position"]')?.textContent).toContain('17 shares')
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
    else Reflect.deleteProperty(globalThis, 'localStorage')
    void win.happyDOM.close()
  }
})
