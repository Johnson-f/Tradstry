import { expect, test } from 'bun:test'

test('format buttons turn off after caret format changes and keep other formats', async () => {
  // Lexical detects DOM support on import. Isolate this mounted-component test
  // from the headless tests without adding a second test runner.
  const editorPath = new URL('./trade-note-editor.tsx', import.meta.url).href
  const documentPath = new URL('../../lib/client/trades/note-document.ts', import.meta.url).href
  const script = `
    import { Window } from 'happy-dom';
    import assert from 'node:assert/strict';
    const win = new Window({ url: 'http://localhost:5173' });
    for (const key of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement',
      'HTMLInputElement', 'HTMLSelectElement', 'MutationObserver', 'ResizeObserver',
      'DOMParser', 'Range', 'Selection', 'Event', 'KeyboardEvent', 'InputEvent',
      'MouseEvent', 'ClipboardEvent', 'DataTransfer', 'DragEvent']) {
      globalThis[key] = key === 'window' ? win : win[key];
    }
    globalThis.getComputedStyle = win.getComputedStyle.bind(win);
    globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
    globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const { createElement: h, act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { $getRoot, $getSelection, $isTextNode } = await import('lexical');
    const { TradeNoteEditor } = await import(${JSON.stringify(editorPath)});
    const { createNoteDocument } = await import(${JSON.stringify(documentPath)});
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let editor, revision = 0;
    const errors = [];
    const settle = () => new Promise(resolve => setTimeout(resolve, 10));
    const button = label => document.querySelector('button[aria-label="' + label + '"]');
    const press = label => {
      const control = button(label);
      control.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      control.click();
    };
    async function reset() {
      await act(async () => {
        root.render(h(TradeNoteEditor, { key: revision++, initialValue: createNoteDocument(),
          disabled: false, onChange() {}, onError(message) { errors.push(message); } }));
        await settle();
      });
      editor = document.querySelector('[aria-label="Trade notes"]').__lexicalEditor;
    }
    try {
      for (const [label, format] of [['Underline', 'underline'], ['Bold', 'bold'],
        ['Italic', 'italic'], ['Strikethrough', 'strikethrough'], ['Inline code', 'code']]) {
        await reset();
        await act(async () => { press(label); await settle(); });
        assert.equal(button(label).getAttribute('aria-pressed'), 'true');
        assert.equal(button(label).classList.contains('bg-primary'), true);
        // A browser focus/selection update can reset the collapsed caret's
        // format before React has repainted the still-active toolbar button.
        await act(async () => {
          editor.update(() => $getSelection().setFormat(0), { discrete: true });
          press(label);
          await settle();
        });
        assert.equal(button(label).getAttribute('aria-pressed'), 'false', label + ' must switch off');
        assert.equal(button(label).classList.contains('bg-primary'), false);
        await act(async () => {
          editor.update(() => $getSelection().insertText('Plain'), { discrete: true });
          await settle();
        });
        editor.getEditorState().read(() => {
          const text = $getRoot().getFirstDescendant();
          assert.ok($isTextNode(text));
          assert.equal(text.hasFormat(format), false, 'Typing after switch-off must be unformatted');
        });
        await act(async () => {
          editor.update(() => $getRoot().getFirstDescendant().select(0, 5), { discrete: true });
          await settle();
        });
        for (const active of [true, false]) {
          await act(async () => { press(label); await settle(); });
          editor.getEditorState().read(() => assert.equal($getRoot().getFirstDescendant().hasFormat(format), active));
          assert.equal(button(label).getAttribute('aria-pressed'), String(active));
        }
      }
      await reset();
      for (const label of ['Bold', 'Underline', 'Underline']) {
        await act(async () => { press(label); await settle(); });
      }
      editor.getEditorState().read(() => {
        assert.equal($getSelection().hasFormat('bold'), true);
        assert.equal($getSelection().hasFormat('underline'), false);
      });
      assert.deepEqual(errors, []);
    } finally {
      await act(async () => { root.unmount(); await settle(); });
      await win.happyDOM.close();
    }
  `
  const child = Bun.spawn([process.execPath, '--eval', script], {
    cwd: new URL('../../../', import.meta.url).pathname,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [code, output, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect({ code, output, errors }).toEqual({ code: 0, output: '', errors: '' })
}, 10_000)
