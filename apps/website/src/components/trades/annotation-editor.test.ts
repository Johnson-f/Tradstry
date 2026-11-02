import { expect, test } from 'bun:test'

test('autosave preserves edits during writes, flushes navigation, and recovers from failures', async () => {
  // Keep DOM detection and the mocked transport isolated from headless tests.
  const component = new URL('./annotation-editor.tsx', import.meta.url).href
  const script = `
    import { mock } from 'bun:test';
    import assert from 'node:assert/strict';
    import { Window } from 'happy-dom';
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
    globalThis.scrollTo = () => {};
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const { createElement: h, act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const { createRouter, createRootRoute, createRoute, createMemoryHistory, RouterProvider, Outlet } =
      await import('@tanstack/react-router');
    const { $getRoot, $createParagraphNode, $createTextNode } = await import('lexical');
    const { GraphQLRequestError } = await import('@/lib/client/api');
    const { createNoteDocument, noteText } = await import('@/lib/client/trades/note-document');
    const calls = [];
    let annotation = null, writeGate = null, writeError = null, readError = false, active = 0, peak = 0;
    mock.module('@/lib/client/backend', () => ({ graphql: async (query, variables) => {
      if (query.includes('query JournalLabels')) return { journalLabels: [] };
      if (query.includes('query TradePlans')) return { tradePlans: [] };
      if (query.includes('query Trade(')) {
        if (readError) throw new Error('Offline');
        return { trade: { trade: { id: 't', avgEntry: '10', maxQuantity: '2', net: '1',
          option: null, annotation }, suggestedStop: null } };
      }
      assert.ok(query.includes('mutation SaveAnnotation'), query);
      calls.push(structuredClone(variables));
      active++; peak = Math.max(peak, active);
      try {
        if (writeGate) await writeGate;
        if (writeError) throw writeError;
        assert.equal(variables.v, annotation?.version ?? null, 'write must use the latest version');
        annotation = { id: 'a', tradeId: 't', notes: variables.input.notes,
          edges: [], entryTactics: [], tags: [], mistakes: [], initialStop: variables.input.initialStop,
          plannedRisk: variables.input.plannedRisk, version: (annotation?.version ?? 0) + 1,
          updatedAt: new Date().toISOString(), orphaned: false };
        return { saveTradeAnnotation: annotation };
      } finally { active--; }
    }, subscriptions: {} }));
    const { useTrade } = await import('@/lib/client/trades/trades');
    const { AnnotationEditor } = await import(${JSON.stringify(component)});
    let flush = null;
    const register = value => { flush = value; };
    function Note() {
      const detail = useTrade('w', 't');
      if (!detail.data) return h('p', null, 'Loading');
      return h(AnnotationEditor, { workspaceId: 'w', trade: detail.data.trade, suggestedStop: null,
        onFlushChange: register, reloadAnnotation: async () => {
          const result = await detail.refetch({ throwOnError: true });
          return result.data.trade.annotation;
        } });
    }
    const parent = createRootRoute({ component: Outlet });
    const noteRoute = createRoute({ getParentRoute: () => parent, path: '/note', component: Note });
    const awayRoute = createRoute({ getParentRoute: () => parent, path: '/away', component: () => h('p', null, 'Away') });
    const router = createRouter({ routeTree: parent.addChildren([noteRoute, awayRoute]),
      history: createMemoryHistory({ initialEntries: ['/note'] }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    const wait = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
    const settle = (ms = 30) => act(async () => { await wait(ms); });
    const editor = () => document.querySelector('[aria-label="Trade notes"]')?.__lexicalEditor;
    const button = text => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text);
    async function text(value) {
      await act(async () => {
        editor().update(() => {
          $getRoot().clear().append($createParagraphNode().append($createTextNode(value)));
          $getRoot().selectEnd();
        }, { discrete: true });
        await wait();
      });
    }
    try {
      await act(async () => {
        root.render(h(QueryClientProvider, { client }, h(RouterProvider, { router })));
        await router.load(); await wait();
      });
      await settle();
      assert.ok(editor());
      await settle(850);
      assert.equal(calls.length, 0, 'opening an empty editor must not create a note');
      assert.equal(button('Save note'), undefined);
      const originalEditor = editor();
      await text('First');
      await settle(200);
      await text('Second');
      await settle(650);
      assert.equal(calls.length, 0, 'typing resets the save delay');
      await settle(250);
      assert.equal(calls.length, 1);
      assert.equal(noteText(annotation.notes), 'Second');
      assert.equal(editor(), originalEditor, 'saving/refetching must not remount Lexical');
      assert.match(document.querySelector('[role="status"]').textContent, /Saved/);

      let release;
      writeGate = new Promise(resolve => { release = resolve; });
      await text('Saving');
      await settle(850);
      assert.equal(active, 1);
      assert.equal(editor().isEditable(), true);
      await text('Newest while saving');
      let closeResult;
      await act(async () => { closeResult = flush(); await wait(); });
      assert.equal(calls.length, 2, 'flush shares the existing write');
      await act(async () => { writeGate = null; release(); assert.equal(await closeResult, true); await wait(); });
      assert.equal(peak, 1);
      assert.equal(calls.length, 3);
      assert.equal(noteText(annotation.notes), 'Newest while saving');
      assert.equal(editor(), originalEditor);

      writeError = new Error('Offline');
      await text('Keep this draft');
      await settle(850);
      assert.ok(button('Try again'));
      const failedCount = calls.length;
      await settle(850);
      assert.equal(calls.length, failedCount, 'failure must not create a retry loop');
      await act(async () => { void router.navigate({ to: '/away' }); await wait(); });
      assert.equal(router.state.location.pathname, '/note', 'failed saves block navigation');
      assert.equal(noteText(editor().getEditorState().toJSON()), 'Keep this draft');
      writeError = null;
      await act(async () => { button('Try again').click(); await wait(); });
      await settle();
      assert.equal(noteText(annotation.notes), 'Keep this draft');

      writeError = new GraphQLRequestError('Changed elsewhere', 'CONFLICT');
      await text('Local conflict');
      await settle(850);
      assert.ok(button('Load latest version'));
      const conflictCount = calls.length;
      await text('Keep conflict edits');
      await settle(850);
      assert.equal(calls.length, conflictCount, 'editing must not retry a conflicting version');
      readError = true;
      await act(async () => { button('Load latest version').click(); await wait(); });
      await settle();
      assert.equal(noteText(editor().getEditorState().toJSON()), 'Keep conflict edits');
      assert.equal(editor().isEditable(), true, 'failed reload must leave the editor usable');
      assert.ok(button('Load latest version'));
      readError = false; writeError = null;
      annotation = { ...annotation, notes: createNoteDocument('Remote note'), version: annotation.version + 1 };
      await act(async () => { button('Load latest version').click(); await wait(); });
      await settle();
      assert.equal(noteText(editor().getEditorState().toJSON()), 'Remote note');

      await text('Before leaving');
      await act(async () => { void router.navigate({ to: '/away' }); await wait(); });
      assert.equal(router.state.location.pathname, '/away');
      assert.equal(noteText(annotation.notes), 'Before leaving', 'navigation flushes the latest edit');
      await act(async () => { void router.navigate({ to: '/note' }); await wait(); });
      await settle();
      assert.equal(noteText(editor().getEditorState().toJSON()), 'Before leaving');
      const reopenedEditor = editor();
      await act(async () => {
        editor().update(() => $getRoot().getFirstDescendant().toggleFormat('bold'), { discrete: true });
        await wait();
      });
      await settle(850);
      assert.equal(annotation.notes.root.children[0].children[0].format, 1, 'format-only edits must save');
      assert.equal(editor(), reopenedEditor);

      annotation = { ...annotation, notes: createNoteDocument('From the phone'), version: annotation.version + 1 };
      await act(async () => { await client.invalidateQueries(); await wait(); });
      await settle();
      assert.equal(noteText(editor().getEditorState().toJSON()), 'From the phone', 'an idle editor shows another device’s save');

      await text('Typed here');
      annotation = { ...annotation, notes: createNoteDocument('Phone again'), version: annotation.version + 1 };
      await act(async () => { await client.invalidateQueries(); await wait(); });
      await settle();
      assert.ok(button('Load latest version'), 'local edits are not replaced without asking');
      const pausedCount = calls.length;
      await settle(900);
      assert.equal(calls.length, pausedCount, 'no autosave over a newer version');
      await act(async () => { button('Load latest version').click(); await wait(); });
      await settle();
      assert.equal(noteText(editor().getEditorState().toJSON()), 'Phone again');

      await act(async () => { button('Trade Detail').click(); await wait(); });
      const stopLabel = [...document.querySelectorAll('label')].find(el => el.textContent.startsWith('Initial stop'));
      const stop = document.getElementById(stopLabel.htmlFor);
      async function setStop(value) {
        await act(async () => {
          Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(stop, value);
          stop.dispatchEvent(new win.Event('input', { bubbles: true }));
          await wait();
        });
      }
      const beforeRisk = calls.length;
      await setStop('-1');
      await settle(850);
      assert.equal(calls.length, beforeRisk, 'invalid risk must not save');
      await act(async () => { assert.equal(await flush(), false); });
      await setStop('9.50');
      await settle(850);
      assert.equal(annotation.initialStop, '9.50', 'valid trade details save automatically');
      await act(async () => { button('Done').click(); await wait(); });
    } finally {
      await act(async () => { root.unmount(); await wait(); });
      client.clear();
      await win.happyDOM.close();
    }
    // The router/query caches retain browser timers after all assertions pass.
    process.exit(0);
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
}, 20_000)
