'use strict';
class IntervalCache {
 constructor(opts = {}) {
  if (!opts.expiresIn || opts.expiresIn < 100) opts.expiresIn = 100;
  const cch = internal(this);
  cch.at.opts = opts;
  cch.at.store = {};
  cch.at.handles = {};
 }
 async start() {
  const cch = internal(this);
  const handles = cch.at.handles;
  const store = cch.at.store;
  const opts = cch.at.opts;
  for (const key of Object.keys(handles)) {
   clearInterval(handles[key]);
   const cached = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
   const calTtl = !cached || isNaN(cached.ttl) ? opts.expiresIn : cached.ttl;
   handles[key] = setInterval(() => {
    delete store[key];
    clearInterval(handles[key]);
    delete handles[key];
   }, calTtl);
  }
 }
 async stop() {
  const cch = internal(this);
  const handles = cch.at.handles;
  for (const key of Object.keys(handles)) {
   clearInterval(handles[key]);
   delete handles[key];
  }
 }
 async get(key) {
  const cch = internal(this);
  const store = cch.at.store;
  const cached = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
  if (cached) cached.ttl = Date.now() - cached.stored;
  return cached ? JSON.parse(JSON.stringify(cached)) : cached;
 }
 async set(key, val, ttl) {
  const cch = internal(this);
  const store = cch.at.store;
  const handles = cch.at.handles;
  const opts = cch.at.opts;
  if (handles[key]) clearInterval(handles[key]);
  const calTtl = !ttl || isNaN(ttl) ? opts.expiresIn : ttl;
  store[key] = { item: val, stored: Date.now(), ttl: calTtl };
  handles[key] = setInterval(() => {
   delete store[key];
   clearInterval(handles[key]);
   delete handles[key];
  }, calTtl);
 }
 async drop(key) {
  const cch = internal(this);
  const store = cch.at.store;
  const handles = cch.at.handles;
  if (handles[key]) {
   clearInterval(handles[key]);
   delete handles[key];
  }
  if (store[key]) delete store[key];
 }
}
module.exports = IntervalCache;
let map = new WeakMap();
let internal = function(object) {
 if (!map.has(object)) map.set(object, {});
 return { at: map.get(object), this: object };
};