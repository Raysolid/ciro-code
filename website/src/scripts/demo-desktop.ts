type DemoState = 'term' | 'web' | 'tui';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setPreviewActive(root: HTMLElement, view: 'web' | 'tui' | null) {
  root.querySelectorAll<HTMLElement>('[data-cw], [data-tv]').forEach((el) => {
    const inWeb = Boolean(el.closest('[data-demo-app="web"]'));
    const inTui = Boolean(el.closest('[data-demo-app="tui"]'));
    const on =
      (view === 'web' && inWeb) || (view === 'tui' && inTui);
    el.dataset.active = on ? '1' : '0';
  });
}

export function initDemoDesktop() {
  const desktop = document.querySelector<HTMLElement>('[data-demo-desktop]');
  if (!desktop || desktop.dataset.bound === '1') return;
  desktop.dataset.bound = '1';

  const term = desktop.querySelector<HTMLElement>('[data-demo-term]');
  const apps = {
    web: desktop.querySelector<HTMLElement>('[data-demo-app="web"]'),
    tui: desktop.querySelector<HTMLElement>('[data-demo-app="tui"]'),
  };
  const items = [...desktop.querySelectorAll<HTMLButtonElement>('[data-demo-open]')];
  let state: DemoState = 'term';
  let animating = false;

  const syncItems = (activeIdx: number) => {
    items.forEach((item, idx) => {
      const on = idx === activeIdx;
      item.classList.toggle('is-active', on);
      item.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  };

  const showApp = (view: 'web' | 'tui') => {
    const app = apps[view];
    if (!app) return;
    app.hidden = false;
    void app.offsetWidth;
    app.classList.add('is-open');
    setPreviewActive(desktop, view);
  };

  const hideApp = (view: 'web' | 'tui') => {
    const app = apps[view];
    if (!app) return;
    app.classList.remove('is-open');
    setPreviewActive(desktop, null);
    const finish = () => {
      app.hidden = true;
    };
    if (reduceMotion()) {
      finish();
      return;
    }
    window.setTimeout(finish, 280);
  };

  const setState = (next: DemoState) => {
    if (next === state || animating) return;
    const prev = state;
    state = next;
    desktop.dataset.state = next;

    if (next === 'term') {
      animating = true;
      if (prev === 'web' || prev === 'tui') hideApp(prev);
      term?.classList.remove('is-exit');
      window.setTimeout(() => {
        animating = false;
      }, reduceMotion() ? 0 : 280);
      return;
    }

    animating = true;
    term?.classList.add('is-exit');
    window.setTimeout(
      () => {
        showApp(next);
        animating = false;
      },
      reduceMotion() ? 0 : 160,
    );
  };

  items.forEach((item, idx) => {
    item.addEventListener('pointerenter', () => syncItems(idx));
    item.addEventListener('focus', () => syncItems(idx));
    item.addEventListener('click', () => {
      const view = item.dataset.demoOpen;
      if (view === 'web' || view === 'tui') setState(view);
    });
  });

  desktop.querySelectorAll<HTMLButtonElement>('[data-demo-close]').forEach((btn) => {
    btn.addEventListener('click', () => setState('term'));
  });

  desktop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state !== 'term') {
      e.preventDefault();
      setState('term');
      return;
    }
    if (state !== 'term') return;
    const activeIdx = Math.max(
      0,
      items.findIndex((item) => item.classList.contains('is-active')),
    );
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      syncItems((activeIdx + 1) % items.length);
      items[(activeIdx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (activeIdx - 1 + items.length) % items.length;
      syncItems(next);
      items[next]?.focus();
    } else if (e.key === 'Enter') {
      const item = items[activeIdx];
      const view = item?.dataset.demoOpen;
      if (view === 'web' || view === 'tui') {
        e.preventDefault();
        setState(view);
      }
    }
  });

  setPreviewActive(desktop, null);
  syncItems(0);
}
