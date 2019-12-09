'use strict';

/**
 * Time interval regulated {@link Cache}
 */
class IntervalCache {

  /**
   * Constructor
   * @param {Object} [opts] The caching options
   * @param {Integer} [opts.expiresIn=100] The number of milliseconds that a SQL statement will reside in cache before being re-read by a {@link Manager}
   */
  constructor(opts = {}) {
    if (!opts.expiresIn || opts.expiresIn < 100) opts.expiresIn = 100;
    const cch = internal(this);
    cch.at.opts = opts;
    cch.at.store = {};
    cch.at.handles = {};
  }

  /**
   * @see Cache
   * @param {String} key The SQL statement key
   * @returns {Object} The return object described in {@link Cache}
   */
  get(key) {
    const cch = internal(this), store = cch.at.store;
    const cached = store.hasOwnProperty(key) ? store[key] : null;
    if (cached) cached.ttl = Date.now() - cached.stored;
    return Promise.resolve(cached ? JSON.parse(JSON.stringify(cached)) : cached);
  }

  /**
   * @see Cache
   * @param {String} key The SQL statement key
   * @param {*} val The value to cache
   * @param {Integer} [ttl] The time-to-live overrride for the option value set on {@link IntervalCache}
   */
  set(key, val, ttl) {
    const cch = internal(this), store = cch.at.store, handles = cch.at.handles, opts = cch.at.opts;
    if (handles[key]) clearInterval(handles[key]);
    const calTtl = !ttl || isNaN(ttl) ? opts.expiresIn : ttl;
    store[key] = { item: val, stored: Date.now(), ttl: calTtl };
    handles[key] = setInterval(sql => delete store[key], calTtl);
    return Promise.resolve();
  }

  /**
   * Stops the interval cache
   */
  stop() {
    const cch = internal(this), handles = cch.at.handles;
    for (let key in handles) {
      clearInterval(handles[key]);
    }
  }
}

module.exports = IntervalCache;

// private mapping
let map = new WeakMap();
let internal = function(object) {
  if (!map.has(object)) {
    map.set(object, {});
  }
  return {
    at: map.get(object),
    this: object
  };
};