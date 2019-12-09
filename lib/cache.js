'use strict';

/**
 * The cache manager responsible for regulating the frequency in which a SQL file is read and used in generated SQL functions set on a given {@link Manager}. An internal mechanism should be in place that ensures that
 * determines how often SQL file reads are made using the supplied `conf.db.connections[].preparedSql.caching` set on an underlying {@link Manager}.
 * @typedef {Object} Cache
 * @property {Function} method an `async function(generatedSqlId, execFn, cachingOptions)` that reads a corresponding SQL file and updates the `methods` content. Once the SQL file read operation completes, the passed
 * `async execFn(rawSqlContent)` is executed to notify a {@link Manager} recipient of the change. The {@link Manager} will also set a `cachingOptions.generateKey` function that can be used within the Cache
 * implementation that can be used to uniquely identify read/stored SQL content.
 * @property {Object} [methods={}] read-only method container that holds internally used functions set by a {@link Manager} for executing SQL statements. Each method function is set via `Cache.method` and is
 * accessible via `Cache.methods[name][ext]` where `name` is the generated/assigned name of the method, `ext` is the original SQL file extension and the _value_ is the internal method set by the {@link Manager}.
 * @example
 * // simple interval cache for illustration purposes only
 * const store = {}, handles = {};
 * const cache = {
 *  method: async (name, func, opts) => {
 *    const cache = this;
 *    const cachedMethod = function(...args) {
 *      const key = opts.generateKey.bind(null, args);
 *      return store[key];
 *    };
 *    cachedMethod.cache = {
 *      drop: function(...args) {
 *        const key = opts.generateKey.bind(null, args);
 *        if (!store.hasOwnProperty(key)) return;
 *        const sql = store[key];
 *        delete store[key];
 *        return sql;
 *      }
 *    };
 *    if (handles[name]) clearInterval(handles[name]);
 *    handles[name] = setInterval(func, opts.expiresIn, opts, async (sql) => {
 *      store[key] = sql;
 *    });
 *    { // assign to cache.methods using the name path
 *      const path = name.split('.');
 *      let ref = cache.methods;
 *      for (let i = 0; i < path.length; ++i) {
 *        if (!ref[path[i]]) {
 *          ref[path[i]] = (i + 1 === path.length ? cachedMethod : {});
 *        }
 *        ref = ref[path[i]];
 *      }
 *    }
 *  }
 *  methods: {}
 * };
 * 
 * // cache usage
 * const conf = {
 *  // other required conf options here
 *  "db": {
 *    "connections": [
 *      {
 *        // other required connection conf options here
 *        "preparedSql": {
 *          "caching": {
 *            "cache": {
 *              "expiresIn": 60000
 *            }
 *          }
 *        }
 *      }
 *    ]
 *  }
 * };
 * const mgr = new Manager(conf, cache);
 * await mgr.init();
 * // use the manager to execute SQL files that will
 * // be refreshed/re-read every 60 seconds
 */

/**
 * Simple 
 */
class Cache {

  constructor() {
    const cch = internal(this);
    cch.at.store = {};
    cch.at.handles = {};
    cch.at.generateKey = function(...args) {
      let key = '';
      for (let i = 0, arg, atyp; i < args.length; ++i) {
        arg = args[i];
        atyp = typeof arg;
        if (atyp === 'object') arg = JSON.stringify(arg);
        if (!['string', 'number', 'boolean'].includes(atyp)) return null;
        key = key + (i ? ':' : '') + encodeURIComponent(arg.toString());
      }
      return key;
    };
    this.methods = {};
  }
  /*else sqls.at.cache.method(`${name}.${ext}`, async function refreshSql(opts, execFn) { // dynamically assign cache methods
    if (sqls.at.conn.sql.logging) sqls.at.conn.sql.logging(`Refreshing cached ${fpth} at ${JSON.stringify(sqls.at.copt)}`);
    data = await readSqlFile();
    return await execFn(data);
  }, sqls.at.copt);*/
  async method(name, func, opts) {
    const cch = internal(this);
    const store = cch.at.store, handles = cch.at.handles;
    const cachedMethod = function(dialectOpts, execFunc) {
      return func(opts, async (sql) => {
        store[name] = sql;
        console.log(`\nCACHE GET:\nname: ${name}\nSQL:\n${store[name]}`);
        return await execFunc(sql);
      });
    };
    cachedMethod.cache = {
      drop: function(...args) {
        const key = opts.generateKey.apply(null, args);
        if (!store.hasOwnProperty(key)) return;
        const sql = store[key];
        delete store[key];
        return sql;
      }
    };
    Cache._addMethod(cch.this, name, cachedMethod);
    if (handles[name]) clearInterval(handles[name]);
    /*handles[name] = setInterval(async (sql) => {
      console.log(`\nCACHE SET:\nname: ${name}\n`, store[name], '\n\n');
      store[name] = sql;
    }, opts.expiresIn);*/
  }

  static _addMethod(cache, name, cachedMethod) {
    if (!(cache instanceof Cache)) {
      throw new Error(`${(cache && cache.constructor && cache.constructor.name) || cache} must be an instance of ${Cache.constructor.name}`);
    }
    const path = name.split('.');
    let ref = cache.methods;
    for (let i = 0; i < path.length; ++i) {
      if (!ref[path[i]]) {
        ref[path[i]] = (i + 1 === path.length ? cachedMethod : {});
      }
      ref = ref[path[i]];
    }
  }
}

module.exports = Cache;

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