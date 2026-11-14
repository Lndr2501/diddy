/**
 * Like setInterval, but only while the window is visible: a hidden Diddy (minimised, other app in
 * front) no longer wakes up every few minutes for background scans. Background throttling is off
 * in both desktop shells so calls keep running; these timers would otherwise run at full rate too.
 * When the window becomes visible again an overdue run happens right away.
 */
export const setVisibleInterval = (run: () => void, ms: number): (() => void) => {
  let last = Date.now();
  const fire = () => {
    last = Date.now();
    run();
  };
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') fire();
  }, ms);
  const onVisibility = () => {
    if (document.visibilityState === 'visible' && Date.now() - last >= ms) fire();
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
};
