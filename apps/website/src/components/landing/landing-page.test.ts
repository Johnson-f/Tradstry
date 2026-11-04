import { expect, test } from 'bun:test'

test('signed-out visitors get the landing page with every section and image slot; signed-in ones go to the app', async () => {
  // Isolate browser globals from the other tests.
  const script = `
    import assert from 'node:assert/strict';
    import { Window } from 'happy-dom';
    const win = new Window({ url: 'http://localhost:5173' });
    for (const key of ['window', 'document', 'navigator', 'localStorage', 'Node', 'Element', 'HTMLElement',
      'SVGElement', 'MutationObserver', 'ResizeObserver', 'Event', 'MouseEvent', 'PointerEvent']) {
      globalThis[key] = key === 'window' ? win : win[key];
    }
    globalThis.getComputedStyle = win.getComputedStyle.bind(win);
    globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
    globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
    globalThis.scrollTo = () => {};
    const scrolledSections = [];
    win.HTMLElement.prototype.scrollIntoView = function () { scrolledSections.push(this.id); };
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const { createElement: h, act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { QueryClient } = await import('@tanstack/react-query');
    const { createRouter, createRootRoute, createRoute, createMemoryHistory, RouterProvider } =
      await import('@tanstack/react-router');
    const { Route: landing } = await import('@/routes/index');
    const { LANDING_IMAGES, SOCIAL_PREVIEW } = await import('@/components/landing/images');
    const wait = () => new Promise(resolve => setTimeout(resolve, 40));

    async function visit(isSignedIn, url = '/') {
      const rootRoute = createRootRoute();
      landing.update({ id: '/', path: '/', getParentRoute: () => rootRoute });
      const signIn = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', component: () => h('p', null, 'Sign in') });
      const app = createRoute({ getParentRoute: () => rootRoute, path: '/app', component: () => h('p', null, 'App') });
      const router = createRouter({
        routeTree: rootRoute.addChildren([landing, signIn, app]),
        history: createMemoryHistory({ initialEntries: [url] }),
        context: { auth: { isSignedIn }, queryClient: new QueryClient() },
      });
      const container = document.createElement('div'); document.body.append(container);
      const root = createRoot(container);
      await act(async () => { root.render(h(RouterProvider, { router })); await wait(); });
      return { router, root };
    }

    const signedOut = await visit(false, '/?source=landing#ai');
    assert.equal(signedOut.router.state.location.pathname, '/');
    assert.equal(signedOut.router.state.location.hash, '');
    assert.equal(signedOut.router.state.location.search.source, 'landing');
    assert.equal(signedOut.router.history.length, 1, 'hash cleanup must replace the history entry');
    assert.equal(document.querySelector('h1')?.textContent, 'The trading journal that builds itself.');
    for (const id of ['product', 'journal', 'analytics', 'plans', 'ai', 'security', 'faq']) {
      assert.ok(document.getElementById(id), 'missing section #' + id);
    }
    const slots = [...document.querySelectorAll('[aria-label^="Image placeholder:"]')];
    const waiting = Object.values(LANDING_IMAGES).filter(image => !image.ready);
    assert.equal(slots.length, waiting.length);
    for (const image of waiting) {
      assert.ok(slots.some(slot => slot.textContent.includes('public/landing/' + image.file)), image.file + ' not marked');
    }
    for (const image of Object.values(LANDING_IMAGES).filter(image => image.ready)) {
      const element = document.querySelector('img[src="/landing/' + image.file + '"]');
      assert.ok(element, image.file + ' not rendered');
      assert.equal(element.alt, image.alt);
    }
    for (const image of [...Object.values(LANDING_IMAGES), SOCIAL_PREVIEW].filter(image => image.ready)) {
      assert.ok(await Bun.file('public/landing/' + image.file).exists(), image.file + ' missing from public assets');
    }
    assert.equal(document.querySelector('img[src="/landing/' + LANDING_IMAGES.hero.file + '"]')?.loading, 'eager');
    const getStarted = [...document.querySelectorAll('a')].filter(link => link.textContent === 'Get started');
    assert.ok(getStarted.length >= 3);
    assert.ok(getStarted.every(link => link.getAttribute('href') === '/sign-in'));
    assert.equal(document.title, 'Tradstry — the trading journal that builds itself');
    for (const link of document.querySelectorAll('a[href^="#"]')) {
      const click = new win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      await act(async () => { link.dispatchEvent(click); });
      assert.ok(click.defaultPrevented, link.getAttribute('href') + ' should scroll without navigation');
      assert.equal(scrolledSections.at(-1), link.getAttribute('href').slice(1));
      assert.equal(signedOut.router.state.location.hash, '');
    }
    await act(async () => { signedOut.root.unmount(); await wait(); });

    const signedIn = await visit(true);
    assert.equal(signedIn.router.state.location.pathname, '/app');
    await act(async () => { signedIn.root.unmount(); await wait(); });

    await win.happyDOM.close();
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
