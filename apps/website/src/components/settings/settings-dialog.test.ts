import { expect, test } from 'bun:test'

test('settings opens over the current page, supports search and nested dialogs, and preserves direct links', async () => {
  // Isolate browser globals and transport mocks from the other tests.
  const script = `
    import { mock } from 'bun:test';
    import assert from 'node:assert/strict';
    import { Window } from 'happy-dom';
    const win = new Window({ url: 'http://localhost:5173' });
    for (const key of ['window', 'document', 'navigator', 'localStorage', 'Node', 'Element', 'HTMLElement',
      'HTMLInputElement', 'HTMLButtonElement', 'HTMLTextAreaElement', 'SVGElement',
      'MutationObserver', 'ResizeObserver', 'Event', 'KeyboardEvent', 'MouseEvent', 'PointerEvent']) {
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
    const stytch = { session: { revoke: async () => {}, getTokens: () => null } };
    mock.module('@stytch/react', () => ({
      createStytchClient: () => stytch,
      useStytch: () => stytch,
      useStytchUser: () => ({ user: {
        name: { first_name: 'Test', last_name: 'Trader' },
        emails: [{ email: 'trader@example.test', verified: true }], providers: [],
      } }),
    }));
    const workspace = { id: 'w1', name: 'Trading account', createdAt: '2026-10-01T00:00:00Z' };
    const queries = [];
    const labels = [], labelWrites = [];
    let failLabelCreate = false;
    mock.module('@/lib/client/backend', () => ({ graphql: async (query, variables) => {
      queries.push(query);
      if (query.includes('query Workspaces')) return { workspaces: [workspace] };
      if (query.includes('query BrokerageStatus')) return { brokerageStatus: { available: false, oauthAvailable: false } };
      if (query.includes('query JournalLabels')) return { journalLabels: [...labels] };
      if (query.includes('mutation CreateLabel')) {
        if (failLabelCreate) throw new Error('Offline');
        labelWrites.push(variables);
        const label = { id: 'label-1', kind: variables.kind, name: variables.input.name,
          description: '', color: null, position: 0, archived: false, tradeCount: 0 };
        labels.push(label);
        return { createJournalLabel: { id: label.id } };
      }
      if (query.includes('query AuthSessions')) return { authSessions: [] };
      throw new Error('Unexpected request: ' + query);
    }, subscriptions: {} }));
    const { UserMenu } = await import('@/components/account/user-menu');
    const { WorkspaceSwitcher } = await import('@/components/workspace/workspace-switcher');
    const { Route: settings } = await import('@/routes/_authenticated/settings');
    function Shell() {
      return h('div', null, h(UserMenu), h(WorkspaceSwitcher, { workspaceId: 'w1' }), h(Outlet));
    }
    const rootRoute = createRootRoute();
    const authRoute = createRoute({ getParentRoute: () => rootRoute, id: '_authenticated', component: Shell });
    const dashboard = createRoute({ getParentRoute: () => authRoute, path: '/w/$workspaceId',
      validateSearch: search => search,
      component: () => h('textarea', { 'aria-label': 'Draft', defaultValue: 'Keep this draft' }) });
    const journal = createRoute({ getParentRoute: () => authRoute, path: '/w/$workspaceId/journal',
      component: () => h('p', null, 'Journal page') });
    const home = createRoute({ getParentRoute: () => authRoute, path: '/', component: () => h('p', null, 'Home') });
    settings.update({ id: '/settings', path: '/settings', getParentRoute: () => authRoute });
    const router = createRouter({ routeTree: rootRoute.addChildren([authRoute.addChildren([dashboard, journal, home, settings])]),
      history: createMemoryHistory({ initialEntries: ['/w/w1?period=ytd'] }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const container = document.createElement('div'); document.body.append(container);
    const root = createRoot(container);
    const wait = () => new Promise(resolve => setTimeout(resolve, 40));
    const settle = () => act(wait);
    const button = text => [...document.querySelectorAll('button, [role="menuitem"]')].find(el => el.textContent.trim() === text);
    const dialog = () => document.querySelector('[role="dialog"]');
    const settingsTabs = () => document.querySelector('[role="tablist"][aria-label="Settings sections"]');
    const tab = text => [...settingsTabs().querySelectorAll('[role="tab"]')].find(el => el.textContent === text);
    const categoryTab = text => [...document.querySelector('[aria-label="Label categories"]').querySelectorAll('[role="tab"]')]
      .find(el => el.textContent.startsWith(text));
    const labelInput = text => document.getElementById([...document.querySelectorAll('label')]
      .find(el => el.textContent.trim() === text).htmlFor);
    async function click(element) {
      assert.ok(element, 'click target exists');
      await act(async () => { element.click(); await wait(); });
      await settle();
    }
    async function setInput(input, value) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new win.Event('input', { bubbles: true })); await wait();
      });
      await settle();
    }
    const search = value => setInput(document.querySelector('[aria-label="Search settings"]'), value);
    async function escape() {
      await act(async () => {
        document.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await wait();
      });
      await settle();
    }
    try {
      await act(async () => {
        root.render(h(QueryClientProvider, { client }, h(RouterProvider, { router })));
        await router.load(); await wait();
      });
      await settle();
      const draft = document.querySelector('[aria-label="Draft"]');
      const originalLocation = router.state.location.href;
      const account = document.querySelector('[aria-label="Account menu"]');
      await click(account);
      await click(button('Settings'));
      assert.ok(dialog(), 'Settings opens in a dialog');
      assert.equal(router.state.location.href, originalLocation, 'opening settings preserves the URL and filters');
      assert.equal(document.querySelector('[aria-label="Draft"]'), draft, 'the underlying page stays mounted');
      assert.equal(draft.value, 'Keep this draft');
      assert.equal(tab('General').getAttribute('aria-selected'), 'true');
      await click(document.querySelector('#dark-mode'));
      assert.equal(document.documentElement.classList.contains('dark'), true);
      assert.equal(win.localStorage.getItem('tradstry:theme'), 'dark');
      await click(tab('Account'));
      assert.match(dialog().textContent, /trader@example.test/);
      assert.match(dialog().textContent, /Active devices/);
      await click(tab('Journal'));
      assert.match(dialog().textContent, /Journal labels/);
      assert.equal(categoryTab('Edges').getAttribute('aria-selected'), 'true');
      await setInput(labelInput('New edge'), 'Breakout edge');
      await click(categoryTab('Tags'));
      assert.equal(tab('Journal').getAttribute('aria-selected'), 'true', 'category tabs do not switch settings sections');
      assert.equal(labelInput('New edge').closest('[role="tabpanel"]').hidden, true);
      assert.equal(labelInput('New tag').closest('[role="tabpanel"]').hidden, false);
      await click(categoryTab('Edges'));
      assert.equal(labelInput('New edge').value, 'Breakout edge', 'switching label categories preserves the draft');
      failLabelCreate = true;
      await click(button('Add edge'));
      assert.ok(dialog().querySelector('[role="alert"]'), 'failed label creation reports an error');
      assert.equal(labelInput('New edge').value, 'Breakout edge', 'a failed save preserves the draft');
      failLabelCreate = false;
      await click(button('Add edge'));
      assert.equal(labelWrites.length, 1);
      assert.equal(labelWrites[0].kind, 'EDGE');
      assert.equal(labelInput('New edge').value, '');
      assert.match(dialog().querySelector('ul[aria-label="Edges"]').textContent, /Breakout edge/);
      await search('devices');
      assert.equal(tab('Account').getAttribute('aria-selected'), 'true');
      assert.equal(settingsTabs().querySelectorAll('[role="tab"]').length, 1);
      await search('no-such-setting');
      assert.match(dialog().textContent, /No settings found/);
      await click(button('Clear search'));
      assert.equal(settingsTabs().querySelectorAll('[role="tab"]').length, 4);
      await click(tab('Workspaces'));
      await click(button('New workspace'));
      assert.equal(document.querySelectorAll('[role="dialog"]').length, 2, 'workspace dialog nests inside settings');
      await escape();
      assert.equal(document.querySelectorAll('[role="dialog"]').length, 1, 'Escape closes only the child dialog');
      await click(button('Close'));
      assert.equal(dialog(), null);
      assert.equal(document.activeElement, account, 'closing returns focus to the account menu');
      assert.equal(router.state.location.href, originalLocation);
      await click(account);
      await click(button('Settings'));
      assert.equal(tab('General').getAttribute('aria-selected'), 'true', 'reopening starts in General');
      await escape();
      assert.equal(dialog(), null);

      const switcher = document.querySelector('[aria-label="Workspace: Trading account. Switch workspace"]');
      await click(switcher);
      await click(button('Manage workspaces'));
      assert.equal(tab('Workspaces').getAttribute('aria-selected'), 'true');
      const workspaceLink = [...dialog().querySelectorAll('a')].find(el => el.textContent === 'Trading account');
      await click(workspaceLink);
      assert.equal(router.state.location.pathname, '/w/w1/journal');
      assert.equal(dialog(), null, 'opening a workspace closes settings after navigation');

      await act(async () => { await router.navigate({ to: '/settings', search: { tab: 'you' } }); await wait(); });
      await settle();
      assert.equal(tab('Account').getAttribute('aria-selected'), 'true', 'existing settings links still work');
      await click(tab('Workspaces'));
      assert.equal(router.state.location.search.tab, 'workspaces');
      await click(button('Close'));
      assert.equal(router.state.location.pathname, '/');
      assert.equal(dialog(), null);
      assert.ok(queries.some(query => query.includes('query JournalLabels')));
      assert.ok(queries.some(query => query.includes('query AuthSessions')));
    } finally {
      await act(async () => { root.unmount(); await wait(); });
      client.clear(); await win.happyDOM.close();
    }
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
