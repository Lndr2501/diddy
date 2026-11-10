// Holds work back until the app is ready. A second launch can arrive while the first instance is
// still starting (before `whenReady`, or while the local server is not listening yet); opening a
// window then throws or creates a second 'main' window.

const createStartupGate = (run, { max = 10, onError = () => undefined } = {}) => {
  let open = false;
  const pending = [];
  const call = (item) => {
    try {
      run(item);
    } catch (error) {
      onError(error);
    }
  };
  return {
    /** Runs `item` now, or keeps it (the oldest are kept, extras dropped) until `open()`. */
    submit(item) {
      if (open) call(item);
      else if (pending.length < max) pending.push(item);
    },
    /** Marks startup finished and runs everything that was held back, in order. */
    open() {
      open = true;
      pending.splice(0).forEach(call);
    },
    isOpen: () => open,
    size: () => pending.length,
  };
};

module.exports = { createStartupGate };
