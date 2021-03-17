'use strict';

const Dialect = require('./lib/dialect');
const SQLS = require('./lib/sqls');
const DBS = require('./lib/dbs');
const Utils = require('./lib/utils');
const typedefs = require('./typedefs');

const Asynchro = require('asynchro');
const Path = require('path');

/**
 * The database(s) manager entry point that autogenerates/manages SQL execution functions from underlying SQL statement files.
 * Vendor-specific implementations should implement {@link typedefs.Dialect} and pass the class or module path into the constructor as `conf.db.dialects.myDialectClassOrModulePath`.
 * See [README.md](index.html) for more details about SQL related features.
 * A manager will contain the following properties:
 * - `db` - The database accessible object where all of the constructed connections reside. For example
 * - `db.<CONN_NAME>` - There will be a property assigned for each database connection configured during construction. For example, when _<CONN_NAME>_ is _myConn_, the
 * manager instance will be accessible via _manager.db.myConn_.
 * - `db.<CONN_NAME>.<PREPARED_FUNC_PATHS>` The generated SQL executable {@link typedefs.SQLERPreparedFunction}(s). Assuming a _<CONN_NAME>_ of _myConn_ and a path of
 * _/db/myConn/read.my.table.sql_, the accessible {@link typedefs.SQLERPreparedFunction} may be accessible via _db.myConn.read.my.table()_.
 * - `db.<CONN_NAME>.beginTransaction` - A function that accepts a single {@link typedefs.SQLERTransactionOptions} that begins a transaction for a given database connection pool.
 */
class Manager {

  /**
  * Creates a new database manager. Vendor-specific implementations should have constructors that accept properties defined by {@link typedefs.Dialect}.
  * @param {typedefs.SQLERConfigurationOptions} conf The configuration options
  * @param {typedefs.SQLERCache} [cache] the {@link typedefs.SQLERCache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
  * @param {(Function | Boolean)} [logging] the `function(dbNames)` that will return a name/dialect specific `function(obj1OrMsg [, obj2OrSubst1, ..., obj2OrSubstN]))` that will handle database logging.
  * Pass `true` to use the console. Omit to disable logging altogether.
  */
  constructor(conf, cache, logging) {
    if (!conf) throw new Error('Database configuration is required');
    if (!conf.db || !conf.db.dialects) throw new Error('Database configuration.db.dialects are required');
    if (!conf.univ || !conf.univ.db || !Object.keys(conf.univ.db).length) throw new Error('Database configuration.univ.db properties are required');
    if (!Array.isArray(conf.db.connections) || !conf.db.connections.length) throw new Error('Database configuration.db.connections must contain at least one connection');
    const connCnt = conf.db.connections.length;
    const mgr = internal(this);
    mgr.at.track = {};
    Object.defineProperty(mgr.at.track, 'interpolate', {
      value: Utils.interpolate,
      writable: false
    });
    Object.defineProperty(mgr.at.track, 'positionalBinds', {
      value: Utils.positionalBinds,
      writable: false
    });
    mgr.this[typedefs.NS] = {};
    mgr.at.debug = conf.debug;
    mgr.at.privDB = conf.univ.db;
    mgr.at.dialects = conf.db.dialects;
    mgr.at.mainPath = conf.mainPath || (require.main && require.main.filename.replace(/([^\\\/]*)$/, '')) || process.cwd();
    mgr.at.privatePath = conf.privatePath || process.cwd();
    mgr.at.sqls = new Array(connCnt);
    mgr.at.logError = logging === true ? Utils.generateLogger(console.error, [typedefs.MOD_KEY, 'db', 'error']) : logging && logging([typedefs.MOD_KEY, 'db', 'error']);
    mgr.at.log = logging === true ? Utils.generateLogger(console.log, [typedefs.MOD_KEY, 'db']) : logging && logging([typedefs.MOD_KEY, 'db']);
    mgr.at.connNames = new Array(connCnt);
    //const reserved = Object.getOwnPropertyNames(Manager.prototype);
    for (let i = 0; i < connCnt; ++i) {
      addConnectionToManager(mgr, conf.db.connections[i], i, cache, logging);
    }
  }

  /**
   * Adds a connection configuration to the manager and initializes the database connection
   * @param {typedefs.SQLERConnectionOptions} conn The connection options that will be added to the manager
   * @param {typedefs.SQLERPrivateOptions} [priv] The private options that contain the connection credentials that should match `priv[conn.id]`. When omitted, an attempt to use the private options passed
   * into the constructor to make a `privPassedIntoConstructor[conn.id]` match.
   * @param {typedefs.SQLERCache} [cache] the {@link typedefs.SQLERCache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
   * @param {(Function | Boolean)} [logging] the `function(dbNames)` that will return a name/dialect specific `function(obj1OrMsg [, obj2OrSubst1, ..., obj2OrSubstN]))` that will handle database logging.
   * Pass `true` to use the console. Omit to disable logging altogether.
   * @param {Boolean} [returnErrors] Truthy to return errors, otherwise, any encountered errors will be thrown
   * @returns {typedefs.SQLEROperationResults} The results
   */
  async addConnection(conn, priv, cache, logging, returnErrors) {
    const mgr = internal(this);
    addConnectionToManager(mgr, conn, null, cache, logging, priv);
    /** @type {typedefs.SQLEROperationResults} */
    const rslt = await operation(mgr, 'init', { returnErrors });
    if (returnErrors && rslt.errors && rslt.errors.length) {
      if (mgr.at.logError) {
        mgr.at.logError(`Failed to initialize connection ID ${conn.id} for ${conn.name} database`, ...errors);
      }
    } else if (mgr.at.log) {
      mgr.at.log(`Connection ID ${conn.id} for ${conn.name} database is ready for use`);
    }
    return rslt;
  }

  /**
   * Initializes the configured database connections
   * @param {Boolean} [returnErrors] Truthy to return errors, otherwise, any encountered errors will be thrown
   * @returns {typedefs.SQLEROperationResults} The results
   */
  async init(returnErrors) {
    const mgr = internal(this);
    if (mgr.at.isInit) throw new Error(`[${mgr.at.connNames.join()}] database(s) are already initialized`);
    /** @type {typedefs.SQLEROperationResults} */
    const rslt = await operation(mgr, 'init', { returnErrors });
    mgr.at.isInit = true;
    if (returnErrors && rslt.errors && rslt.errors.length) {
      if (mgr.at.logError) {
        mgr.at.logError(`Failed to initialize one or more [${mgr.at.connNames.join()}] database(s)`, ...errors);
      }
    } else if (mgr.at.log) {
      mgr.at.log(`[${mgr.at.connNames.join()}] database(s) are ready for use`);
    }
    return rslt;
  }

   /**
   * Composes the {@link typedefs.SQLERState} on either all the connections used by the manager or on the specified connection names.
   * @param {typedefs.SQLEROperationOptions} [opts] The {@link typedefs.SQLEROperationOptions} to use
   * @param {...String} [connNames] The connection names to perform the check on (defaults to all connections)  
   * @returns {typedefs.SQLEROperationResults} The results
   */
  async state(opts, ...connNames) {
    return operation(internal(this), 'state', opts, connNames);
  }
 
  /**
   * Closes all database pools/connections/etc.
   * @returns {typedefs.SQLEROperationResults} The results
   */
  async close() {
    return operation(internal(this), 'close');
  }

  /**
   * Sets the caching mechanism that will be used that will determine the frequency of reading SQL source files
   * @param {typedefs.SQLERCache} [cache] the {@link typedefs.SQLERCache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
   * @param {Boolean} [isTransfer] Truthy when the passed `cache` is present and any existing SQL (either cached or non-cached) should be transferred to it (if any)
   * @param {...String} connNames The connection names to set the cache for
   * @returns {typedefs.SQLEROperationResults} The results, each `result[connectionName]` containing the number of cached keys transferred for the given connection
   */
  async setCache(cache, isTransfer, ...connNames) {
    return operation(internal(this), 'setCache', null, connNames, cache, isTransfer);
  }

  /**
   * Gets a cache key for a given __absolute__ path to an SQL file
   * @param {String} path The __absolute__ path to the SQL file
   * @param {String} connName The connection name to get the cache key for
   * @returns {String} The cache key for the given path
   */
  async getCacheKey(path, connName) {
    /** @type {typedefs.SQLEROperationResults} */
    const rslt = await operation(internal(this), 'getCacheKey', null, [connName], path);
    return rslt.result[connName];
  }

  /**
   * Generates a key used for caching SQL methods
   * @param {String} dialect The database dialect
   * @param {String} connName The connection name
   * @param {String} methodName The SQL method name
   * @param {String} ext The SQL file extension
   * @returns {String} The key used for caching
   */
  generateCacheKey(dialect, connName, methodName, ext) {
    return `${typedefs.MOD_KEY}:${dialect}:${connName}:db:${methodName}:${ext}`;
  }

  /**
   * Duplicates a SQL statement by sequentially incrementing _named bind parameters_ by appending an increacing numeric count to each bind parameter
   * @example
   * Manager.namedBindSequence('SELECT * FROM EXAMPLE X WHERE X.A = :a AND X.B = :b AND X.C = :c', 2);
   * // produces:
   * [
   *   'SELECT * FROM EXAMPLE X WHERE X.A = :a1 AND X.B = :b1 AND X.C = :c1',
   *   'SELECT * FROM EXAMPLE X WHERE X.A = :a2 AND X.B = :b2 AND X.C = :c2'
   * ]
   * @param {String} sql The SQL statement that contains the bind names that will be sequenced
   * @param {Integer} count The total number of duplicates to make
   * @returns {String[]} The SQL statements that have been duplicated with sequentially numeric suffixes
   */
  static namedBindSequence(sql, count) {
    const rtn = new Array(count);
    for (let i = 1; i <= count; i++) {
      rtn[i] = sql.replace(typedefs.POS_BINDS_REGEXP, match => `${match}${i}`);
    }
    return rtn;
  }

  /**
   * @returns {String[]} The operation types
   */
  static get OPERATION_TYPES() {
    return typedefs.CRUD_TYPES;
  }

  /**
   * @returns {RegExp} A regular expression that globally matches each _named bind parameters_ in a SQL statement. A single capture group is defined for each parameter name (match on entire bind name
   * syntax)
   */
  static get POSITIONAL_BINDS_REGEXP() {
    return typedefs.POS_BINDS_REGEXP;
  }
}

/**
 * Adds a connection configuration to a manager
 * @private
 * @param {Manager} mgr The manager to add the connection to
 * @param {typedefs.SQLERConnectionOptions} conn The connection options that will be added to the manager
 * @param {Integer} [index] The index at which the connection options will be added to
 * @param {typedefs.SQLERCache} [cache] the {@link typedefs.SQLERCache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
 * @param {(Function | Boolean)} [logging] the `function(dbNames)` that will return a name/dialect specific `function(obj1OrMsg [, obj2OrSubst1, ..., obj2OrSubstN]))` that will handle database logging.
 * Pass `true` to use the console. Omit to disable logging altogether.
 * @param {typedefs.SQLERPrivateOptions} [priv] The private options that contain the connection credentials that should match `priv[conn.id]`. When omitted, an attempt to use the private options passed
 * into the constructor to make a `privPassedIntoConstructor[conn.id]` match.
 */
function addConnectionToManager(mgr, conn, index, cache, logging, priv) {
  const isExpand = !index && !Number.isInteger(index);
  let idx = index, dlct;
  /** @type {typedefs.Dialect} */
  let dialect;
  /** @type {typedefs.SQLERPrivateOptions} */
  let privy;
  if (isExpand) { // expand connections
    idx = mgr.at.sqls.length;
    mgr.at.connNames.length = ++mgr.at.sqls.length;
  }
  if (!conn.id) throw new Error(`Connection must have an "id" at: ${JSON.stringify(conn)}`);
  if (!conn.name) throw new Error(`Connection must have have a valid "name" at: ${JSON.stringify(conn)}`);
  if (!conn.dialect || typeof conn.dialect !== 'string') throw new Error(`Connection ID ${conn.id} must have have a valid "dialect" name at: ${JSON.stringify(conn)}`);
  privy = priv || mgr.at.privDB[conn.id]; // pull host/credentials from external conf resource
  if (!privy) throw new Error(`Connection ID ${conn.id} has an "id" that cannot be found within the Manager constructor provided "conf.univ.db" at: ${JSON.stringify(conn)}`);
  privy = JSON.parse(JSON.stringify(privy)); // need to make a clone since additional properties will be added
  privy.privatePath = mgr.at.privatePath;
  conn.host = conn.host || privy.host;
  dlct = conn.dialect.toLowerCase();
  if (!mgr.at.dialects.hasOwnProperty(dlct)) {
    throw new Error(`Database configuration.db.dialects does not contain an implementation definition/module for ${dlct} and connection ID ${conn.id} for host ${conn.host} at: ${JSON.stringify(conn)}`);
  }
  if (typeof mgr.at.dialects[dlct] === 'string') {
    if (/^[a-z@]/i.test(mgr.at.dialects[dlct])) mgr.at.dialects[dlct] = require(mgr.at.dialects[dlct]);
    else mgr.at.dialects[dlct] = require(Path.join(process.cwd(), mgr.at.dialects[dlct]));
  }
  //if (!(mgr.at.dialects[dlct] instanceof Dialect)) throw new Error(`Database dialect for ${dlct} is not an instance of a sqler "${Dialect.constructor.name}" at connection ID ${conn.id} for host ${conn.host}`);
  if (conn.log !== false && !conn.log) conn.log = [];
  if (conn.logError !== false && !conn.logError) conn.logError = [];
  if (conn.log !== false) {
    let ltags = [...conn.log, typedefs.MOD_KEY, 'db', conn.name, dlct, conn.service, conn.id, `v${conn.version || 0}`];
    conn.logging = logging === true ? Utils.generateLogger(console.log, ltags) : logging && logging(ltags); // override dialect non-error logging
  }
  if (conn.logError !== false) {
    let ltags = [...conn.logError, typedefs.MOD_KEY, 'db', conn.name, dlct, conn.service, conn.id, `v${conn.version || 0}`];
    conn.errorLogging = logging === true ? Utils.generateLogger(console.error, ltags) : logging && logging(ltags); // override dialect error logging
  }
  dialect = new mgr.at.dialects[dlct](privy, conn, mgr.at.track, conn.errorLogging || false, conn.logging || false, mgr.at.debug || false);
  // prepared SQL functions from file(s) that reside under the defined name and dialect (or "default" when dialect is flagged accordingly)
  if (mgr.this[typedefs.NS][conn.name]) throw new Error(`Database connection ID ${conn.id} cannot have a duplicate name for ${conn.name}`);
  //if (reserved.includes(conn.name)) throw new Error(`Database connection name ${conn.name} for ID ${conn.id} cannot be one of the following reserved names: ${reserved}`);
  mgr.at.sqls[idx] = new SQLS(typedefs.NS, mgr.at.mainPath, cache, conn, (mgr.this[typedefs.NS][conn.name] = {}), new DBS(dialect, conn), mgr.this.generateCacheKey.bind(mgr.this));
  mgr.at.connNames[idx] = conn.name;
}

/**
 * Executes one or more {@link SQLS} functions
 * @private
 * @param {Manager} mgr The _internal_/private {@link Manager} store
 * @param {String} funcName The async function name to call on each {@link SQLS} instance
 * @param {typedefs.SQLEROperationOptions} [opts] The {@link typedefs.SQLEROperationOptions} to use
 * @param {String[]} [connNames] The connection names to perform the opearion on (defaults to all connections)
 * @param {...any} [args] The arguments to pass into the function being called on the {@link SQLS} instance
 * @returns {typedefs.SQLEROperationResults} The results
 */
async function operation(mgr, funcName, opts, connNames, ...args) {
  opts = opts || {};
  const cnl = (connNames && connNames.length) || 0;
  const ax = new Asynchro({}, opts.returnErrors ? false : true);
  const queue = sqli => {
    const func = (...args) => {
      const rtn = typeof sqli[funcName] === 'function' ? sqli[funcName](...args) : sqli[funcName];
      return rtn instanceof Promise ? rtn : Promise.resolve(rtn);
    };
    const name = sqli.connectionName;
    const hasConnOpts = opts.connections && opts.connections[name] && typeof opts.connections[name] === 'object';
    const hasSeriesOverride = hasConnOpts && opts.connections[name].hasOwnProperty('executeInSeries');
    const hasErrorOverride = hasConnOpts && opts.connections[name].hasOwnProperty('returnErrors');
    const throws = hasErrorOverride && opts.connections[name].returnErrors ? false : true;
    if (hasSeriesOverride ? opts.connections[name].executeInSeries : opts.executeInSeries) {
      if (hasErrorOverride) ax.seriesThrowOverride(name, throws, func, ...args);
      else ax.series(name, func, ...args);
    } else {
      if (hasErrorOverride) ax.parallelThrowOverride(name, throws, func, ...args);
      else ax.parallel(name, func, ...args);
    }
  };
  for (let i = 0, l = mgr.at.sqls.length; i < l; ++i) {
    if (funcName === 'init' && mgr.at.sqls[i].isInitialized && mgr.at.sqls[i].isPrepared) continue;
    if (cnl) {
      if (!connNames.includes(mgr.at.sqls[i].connectionName)) continue;
      queue(mgr.at.sqls[i]);
    } else {
      queue(mgr.at.sqls[i]);
    }
  }
  const result = await ax.run();
  /** @type {typedefs.SQLEROperationResults} */
  const rtn = { result, errors: ax.errors };
  return rtn;
}

module.exports = Object.freeze({ Manager, Dialect, typedefs });

// private mapping
let map = new WeakMap();
let internal = function (object) {
  if (!map.has(object)) {
    map.set(object, {});
  }
  return {
    at: map.get(object),
    this: object
  };
};