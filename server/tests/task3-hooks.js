// Interpose at Prisma's transaction boundary; every read/write still reaches MongoDB.
// Hooks exist only in tests, never in the HTTP or service implementation.
function instrument(prisma, hook) {
  return new Proxy(prisma, {
    get(target, property) {
      if (property !== '$transaction') {
        const value = target[property];
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (operation) => target.$transaction((tx) => operation(new Proxy(tx, {
        get(transaction, model) {
          const delegate = transaction[model];
          if (!delegate || typeof delegate !== 'object') return delegate;
          return new Proxy(delegate, {
            get(object, method) {
              const value = object[method];
              if (typeof value !== 'function') return value;
              return (...args) => hook({ model, method, args, run: () => value.apply(object, args) });
            },
          });
        },
      })));
    },
  });
}

function barrier(parties = 2) {
  let arrivals = 0, release;
  const ready = new Promise((resolve) => { release = resolve; });
  const timer = setTimeout(() => release(new Error('Race barrier timed out')), 10000);
  return async () => {
    arrivals++;
    if (arrivals === parties) { clearTimeout(timer); release(); }
    const error = await ready;
    if (error) throw error;
  };
}

module.exports = { instrument, barrier };
