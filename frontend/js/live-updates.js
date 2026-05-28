(function attachLiveUpdates(global) {
  function createVisibilityAwarePoller(options) {
    const intervalMs = Math.max(1000, Number(options?.intervalMs || 30000));
    const onTick = typeof options?.onTick === 'function' ? options.onTick : async () => {};
    const runImmediately = options?.runImmediately !== false;

    let timerId = null;
    let running = false;
    let disposed = false;

    const executeTick = async () => {
      if (disposed || running || document.hidden) return;
      running = true;
      try {
        await onTick();
      } finally {
        running = false;
      }
    };

    const start = () => {
      if (disposed || timerId) return;
      timerId = global.setInterval(executeTick, intervalMs);
      if (runImmediately) {
        void executeTick();
      }
    };

    const stop = () => {
      if (timerId) {
        global.clearInterval(timerId);
        timerId = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) return;
      void executeTick();
    };

    const dispose = () => {
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
      global.removeEventListener('beforeunload', dispose);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    global.addEventListener('beforeunload', dispose);

    return {
      start,
      stop,
      dispose,
      tick: executeTick,
      isRunning: () => running
    };
  }

  global.LiveUpdates = {
    createVisibilityAwarePoller
  };
})(window);
