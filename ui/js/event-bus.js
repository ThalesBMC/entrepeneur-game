/** Simple pub/sub event bus */
export const bus = {
  _listeners: {},

  on(event, fn) {
    (this._listeners[event] ??= []).push(fn);
  },

  off(event, fn) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter((f) => f !== fn);
  },

  emit(event, data) {
    for (const fn of this._listeners[event] ?? []) fn(data);
  },
};
