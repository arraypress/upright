/** The browser edge for settings tests: an in-memory chrome.storage. */

/**
 * chrome.storage with local and sync areas and onChanged, behaving as Chrome does: values are
 * stored as JSON, onChanged fires only for values that changed, and sync refuses an item over
 * its 8,192-byte quota and more than 120 writes (set or remove) a minute, by `now()`.
 * `sync.writes` counts the writes it took. `settled()` waits for every listener, including the
 * changes those listeners make.
 */
export function fakeChromeStorage({ local = {}, sync = {}, now = Date.now } = {}) {
  const listeners = [];
  const running = [];
  const json = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

  function area(name, initial, { quotaPerItem, writesPerMinute } = {}) {
    const data = json(initial);
    const recent = [];
    const fire = (changes) => {
      if (!Object.keys(changes).length) return;
      for (const listener of listeners) running.push(listener(json(changes), name));
    };
    return {
      data,
      writes: 0,
      /** A write, counted against the per-minute limit; refused over it, as Chrome does. */
      take() {
        if (!writesPerMinute) return void this.writes++;
        while (recent.length && recent[0] <= now() - 60_000) recent.shift();
        if (recent.length >= writesPerMinute) {
          throw new Error('This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.');
        }
        recent.push(now());
        this.writes++;
      },
      async get(keys) {
        const wanted = keys == null ? Object.keys(data) : [keys].flat();
        return Object.fromEntries(wanted.filter((k) => k in data).map((k) => [k, json(data[k])]));
      },
      async set(items) {
        for (const [key, value] of Object.entries(items)) {
          if (quotaPerItem && key.length + JSON.stringify(value).length > quotaPerItem) {
            throw new Error('Resource::kQuotaBytesPerItem quota exceeded');
          }
        }
        this.take();
        const changes = {};
        for (const [key, value] of Object.entries(items)) {
          if (JSON.stringify(data[key]) === JSON.stringify(value)) continue;
          changes[key] = { oldValue: data[key], newValue: json(value) };
          data[key] = json(value);
        }
        fire(changes);
      },
      async remove(keys) {
        this.take();
        const changes = {};
        for (const key of [keys].flat()) {
          if (!(key in data)) continue;
          changes[key] = { oldValue: data[key] };
          delete data[key];
        }
        fire(changes);
      },
    };
  }

  return {
    local: area('local', local),
    sync: area('sync', sync, { quotaPerItem: 8192, writesPerMinute: 120 }),
    onChanged: { addListener: (listener) => listeners.push(listener) },
    async settled() {
      while (running.length) await Promise.all(running.splice(0));
    },
  };
}
