export function debounce(fn, waitMs) {
  let t;
  return function debounced() {
    const args = arguments;
    const self = this;
    clearTimeout(t);
    t = setTimeout(function () {
      fn.apply(self, args);
    }, waitMs);
  };
}

export function throttle(fn, waitMs) {
  let last = 0;
  let t;
  return function throttled() {
    const args = arguments;
    const self = this;
    const now = Date.now();
    const remain = waitMs - (now - last);
    if (remain <= 0) {
      last = now;
      fn.apply(self, args);
    } else {
      clearTimeout(t);
      t = setTimeout(function () {
        last = Date.now();
        fn.apply(self, args);
      }, remain);
    }
  };
}
