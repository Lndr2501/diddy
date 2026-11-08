// Exercise the actual standalone HTML script, including Diddy's opaque-origin bridge.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const filename = path.join(__dirname, '../../docs/plugins/github-issues.html');
const html = fs.readFileSync(filename, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise(setImmediate);
};
const issue = (overrides = {}) => ({
  number: 7,
  title: 'Fix a bug',
  state: 'open',
  user: { login: 'octocat' },
  updated_at: '2026-11-08T12:00:00Z',
  comments: 2,
  labels: [{ name: 'bug' }],
  ...overrides,
});
const response = (data = {}, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (key) => headers[key] ?? null },
  json: async () => ({ total_count: 1, incomplete_results: false, items: [issue()], ...data }),
});

function harness({ embedded = false, search = '', fetcher = async () => response() } = {}) {
  const elements = new Map();
  const messages = [];
  const requests = [];
  const listeners = {};
  const timers = new Map();
  let timerId = 0;
  class Element {
    constructor() {
      this.listeners = {};
      this.children = [];
      this.dataset = {};
      this.hidden = false;
    }
    set textContent(value) {
      this.text = String(value);
      this.children = [];
    }
    get textContent() {
      return this.text || '';
    }
    set innerHTML(_) {
      throw new Error('Untrusted HTML must never be inserted');
    }
    setAttribute(key, value) {
      this[key] = value;
    }
    addEventListener(type, callback) {
      this.listeners[type] = callback;
    }
    append(...children) {
      this.children.push(...children);
    }
    appendChild(child) {
      this.children.push(child);
    }
    replaceChildren(...children) {
      this.children = children;
    }
    getBoundingClientRect() {
      return { height: 420 };
    }
  }
  const document = {
    documentElement: new Element(),
    getElementById: (id) => {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    createElement: () => new Element(),
  };
  const window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: (name, callback) => {
      listeners[name] = callback;
    },
    postMessage: (message) => messages.push(message),
  };
  const host = embedded ? { postMessage: (message) => messages.push(message) } : window;
  window.parent = host;
  vm.runInNewContext(
    script,
    {
      window,
      document,
      location: { search },
      URL,
      URLSearchParams,
      AbortController,
      Intl,
      Date,
      TypeError,
      ResizeObserver: class {
        constructor(callback) {
          this.callback = callback;
        }
        observe() {
          this.callback();
        }
      },
      setTimeout: (callback, delay) => {
        const id = ++timerId;
        timers.set(id, { callback, delay });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
      fetch: (url, options) => {
        requests.push({ url, options });
        return fetcher(url, options);
      },
    },
    { filename }
  );
  return {
    document,
    messages,
    requests,
    timers,
    $: document.getElementById,
    message: (data, source = host) => listeners.message({ source, data }),
    click: (id) => document.getElementById(id).listeners.click({ preventDefault() {} }),
    apply: (value) => {
      document.getElementById('repository').value = value;
      document.getElementById('apply').listeners.click();
    },
    runTimer: (delay) => {
      const [id, timer] = [...timers].find(([, value]) => value.delay === delay) || [];
      assert.ok(timer, `timer ${delay} exists`);
      timers.delete(id);
      timer.callback();
    },
  };
}

test('defaults to Diddy, requests only open issues without credentials, and renders metadata', async () => {
  const h = harness();
  await flush();
  const { url, options } = h.requests[0];
  const query = new URL(url).searchParams;
  assert.equal(query.get('q'), 'repo:Lndr2501/diddy is:issue is:open');
  assert.equal(query.get('sort'), 'updated');
  assert.equal(query.get('per_page'), '20');
  assert.equal(options.credentials, 'omit');
  assert.equal(h.$('count').textContent, '1');
  const li = h.$('issues').children[0];
  assert.equal(li.children[0].textContent, 'Fix a bug');
  assert.equal(li.children[0].href, 'https://github.com/Lndr2501/diddy/issues/7');
  assert.match(li.children[1].textContent, /#7 · octocat/);
  assert.equal(h.$('refresh').disabled, false);
  assert.ok([...h.timers.values()].some((timer) => timer.delay === 300000));
});

test('accepts repository names and GitHub URLs, rejects query/URL injection without fetching', async () => {
  const h = harness();
  await flush();
  for (const input of [
    'octocat/Hello-World',
    'https://github.com/octocat/Hello-World/',
    'https://github.com/octocat/Hello-World/issues',
    'octocat/Hello-World.git',
  ]) {
    h.apply(input);
    await flush();
    assert.match(
      new URL(h.requests.at(-1).url).searchParams.get('q'),
      /^repo:octocat\/Hello-World is:issue is:open$/
    );
  }
  const count = h.requests.length;
  for (const input of [
    'x/y is:closed',
    'https://evil.test/x/y',
    'https://user:pass@github.com/x/y',
    'https://github.com/x/y?token=secret',
    'http://github.com/x/y',
    'https://github.com/x/y#fragment',
    '../y',
    'x/..',
    'x/y/z',
    '<script>/x',
  ]) {
    h.apply(input);
    assert.equal(h.requests.length, count, input);
    assert.match(h.$('error').textContent, /Bitte Besitzer/);
  }
});

test('renders titles and labels as text, ignores PRs, closed issues and unsafe issue IDs', async () => {
  const attack = '<img src=x onerror=alert(1)>';
  const h = harness({
    fetcher: async () =>
      response({
        items: [
          issue({ title: attack, labels: [{ name: attack }], html_url: 'javascript:alert(1)' }),
          issue({ pull_request: {} }),
          issue({ state: 'closed' }),
          issue({ number: '../settings' }),
        ],
      }),
  });
  await flush();
  assert.equal(h.$('issues').children.length, 1);
  const li = h.$('issues').children[0];
  assert.equal(li.children[0].textContent, attack);
  assert.equal(li.children[2].children[0].textContent, attack);
  assert.equal(li.children[0].href, 'https://github.com/Lndr2501/diddy/issues/7');
});

test('bridge validates sender/API, applies theme, layout and custom CSS without refetching', async () => {
  const h = harness({ embedded: true, search: '?repo=octocat/Hello-World' });
  await flush();
  assert.ok(
    h.messages.some((message) => message.type === 'diddy:ready' && message.apiVersion === 1)
  );
  assert.ok(
    h.messages.some((message) => message.type === 'diddy:resize' && message.height === 420)
  );
  const init = {
    type: 'diddy:init',
    apiVersion: 1,
    theme: 'dark',
    layout: 'compact',
    locale: 'en-US',
    customCss: 'body { color: red; }',
  };
  h.message(init, {});
  h.message({ ...init, apiVersion: 2 });
  assert.equal(h.document.documentElement.dataset.theme, 'light');
  h.message(init);
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  assert.equal(h.document.documentElement.dataset.layout, 'compact');
  assert.equal(h.$('diddy-custom-css').textContent, init.customCss);
  assert.doesNotThrow(() => h.message({ ...init, locale: 'not_valid_locale' }));
  assert.equal(h.requests.length, 1);
  h.$('issues').children[0].children[0].listeners.click({ preventDefault() {} });
  assert.equal(h.messages.at(-1).type, 'diddy:open');
  assert.equal(h.messages.at(-1).url, 'https://github.com/octocat/Hello-World/issues/7');
});

test('restores only matching storage replies, saves selections, and query parameter wins', async () => {
  const h = harness({ embedded: true });
  assert.equal(h.requests.length, 0);
  const value = {
    type: 'diddy:storage:value',
    id: 'github-repository',
    key: 'repository',
    value: 'octocat/Hello-World',
  };
  h.message(value, {});
  h.message({ ...value, key: 'other' });
  h.message({ ...value, id: 'other' });
  await flush();
  assert.equal(h.requests.length, 0);
  h.message(value);
  await flush();
  assert.equal(h.$('repository').value, 'octocat/Hello-World');
  h.apply('Lndr2501/diddy');
  await flush();
  assert.ok(
    h.messages.some(
      (message) => message.type === 'diddy:storage:set' && message.value === 'Lndr2501/diddy'
    )
  );
  const explicit = harness({ embedded: true, search: '?repo=some/repo' });
  explicit.message(value);
  await flush();
  assert.equal(explicit.$('repository').value, 'some/repo');
});

test('old Diddy versions fall back after two seconds and ignore late storage replies', async () => {
  const h = harness({ embedded: true });
  h.runTimer(2000);
  await flush();
  assert.equal(h.$('repository').value, 'Lndr2501/diddy');
  h.message({
    type: 'diddy:storage:value',
    id: 'github-repository',
    key: 'repository',
    value: 'late/reply',
  });
  await flush();
  assert.equal(h.requests.length, 1);
});

test('handles empty, inaccessible and malformed responses', async () => {
  for (const [result, expected] of [
    [response({ total_count: 0, items: [] }), 'Keine offenen Issues'],
    [response({}, 422), 'Repository nicht gefunden'],
    [response({}, 500), 'HTTP 500'],
    [response({ total_count: 'one' }), 'unerwartete Daten'],
  ]) {
    const h = harness({ fetcher: async () => result });
    await flush();
    assert.match(
      h.$(result.ok && expected.startsWith('Keine') ? 'status' : 'error').textContent,
      new RegExp(expected)
    );
    assert.equal(h.$('refresh').disabled, false);
  }
});

test('paginates, caps GitHub search at 1000 and handles a shrinking result set', async () => {
  let total = 1020;
  const h = harness({ fetcher: async () => response({ total_count: total }) });
  await flush();
  assert.equal(h.$('page').textContent, '1 / 50');
  assert.match(h.$('status').textContent, /1.000 Treffer/);
  h.click('next');
  await flush();
  assert.equal(new URL(h.requests.at(-1).url).searchParams.get('page'), '2');
  assert.equal(h.$('previous').disabled, false);
  total = 1;
  h.click('refresh');
  await flush();
  assert.equal(new URL(h.requests.at(-1).url).searchParams.get('page'), '1');
  assert.equal(h.$('pages').hidden, true);
  assert.equal(h.$('page').textContent, '1 / 1');
});

test('refresh failure preserves data, warns it is stale and schedules another refresh', async () => {
  let fail = false;
  const h = harness({
    fetcher: async () => {
      if (fail) throw new TypeError('offline');
      return response();
    },
  });
  await flush();
  fail = true;
  h.runTimer(300000);
  await flush();
  assert.equal(h.$('issues').children.length, 1);
  assert.match(h.$('error').textContent, /Netzwerk.*veraltet/);
  assert.equal(h.$('refresh').disabled, false);
  assert.ok([...h.timers.values()].some((timer) => timer.delay === 300000));
});

test('respects GitHub rate-limit reset/Retry-After instead of retrying immediately', async () => {
  const h = harness({ fetcher: async () => response({}, 429, { 'retry-after': '600' }) });
  await flush();
  assert.match(h.$('error').textContent, /Anfragelimit/);
  assert.equal(h.$('refresh').disabled, true);
  h.click('refresh');
  assert.equal(h.requests.length, 1);
  assert.ok([...h.timers.values()].some((timer) => timer.delay >= 600000));
});

test('a slow obsolete response cannot overwrite a newly selected repository', async () => {
  let finishFirst;
  const h = harness({
    fetcher: (url) =>
      new URL(url).searchParams.get('q').includes('Lndr2501')
        ? new Promise((resolve) => {
            finishFirst = resolve;
          })
        : Promise.resolve(
            response({ total_count: 2, items: [issue({ title: 'New repository' })] })
          ),
  });
  await flush();
  h.apply('octocat/Hello-World');
  await flush();
  assert.equal(h.requests[0].options.signal.aborted, true);
  finishFirst(response({ items: [issue({ title: 'Obsolete' })] }));
  await flush();
  assert.equal(h.$('count').textContent, '2');
  assert.equal(h.$('issues').children[0].children[0].textContent, 'New repository');
});

test('times out stalled requests and exposes a retry', async () => {
  const h = harness({
    fetcher: (_, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('timeout'), { name: 'AbortError' }))
        );
      }),
  });
  h.runTimer(20000);
  await flush();
  assert.match(h.$('error').textContent, /Zeitüberschreitung/);
  assert.equal(h.$('refresh').disabled, false);
});
