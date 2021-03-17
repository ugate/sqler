'use strict';

const Dialect = require('./lib/dialect');
const typedefs = require('./typedefs');

const Asynchro = require('asynchro');
const Fs = require('fs');
const { format } = require('util');
const Path = require('path');
const CRUD_TYPES = Object.freeze(['CREATE', 'READ', 'UPDATE', 'DELETE']);
const COMPARE = Object.freeze({
  '=': function eq(x, y) { return x === y; },
  '<': function lt(x, y) { return x < y; },
  '>': function gt(x, y) { return x > y; },
  '<=': function lteq(x, y) { return x <= y; },
  '>=': function gteq(x, y) { return x >= y; },
  '<>': function noteq(x, y) { return x !== y; }
});
const POS_BINDS_REGEXP = /(?<!:):(\w+)(?=([^'\\]*(\\.|'([^'\\]*\\.)*[^'\\]*'))*[^']*$)/g;
const FUNC_NAME_DIR_REGEXP = /[^0-9a-zA-Z]/g;
const FUNC_NAME_FILE_REGEXP = /[^0-9a-zA-Z\.]/g;
const FUNC_NAME_SEPARATOR = '_';
const MOD_KEY = 'sqler'; // module key used for the object namespace on errors and logging
const NS = 'db'; // namespace on Manager where SQL functions will be added

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
      value: interpolate,
      writable: false
    });
    Object.defineProperty(mgr.at.track, 'positionalBinds', {
      value: positionalBinds,
      writable: false
    });
    mgr.this[NS] = {};
    mgr.at.debug = conf.debug;
    mgr.at.privDB = conf.univ.db;
    mgr.at.dialects = conf.db.dialects;
    mgr.at.mainPath = conf.mainPath || (require.main && require.main.filename.replace(/([^\\\/]*)$/, '')) || process.cwd();
    mgr.at.privatePath = conf.privatePath || process.cwd();
    mgr.at.sqls = new Array(connCnt);
    mgr.at.logError = logging === true ? generateLogger(console.error, [MOD_KEY, 'db', 'error']) : logging && logging([MOD_KEY, 'db', 'error']);
    mgr.at.log = logging === true ? generateLogger(console.log, [MOD_KEY, 'db']) : logging && logging([MOD_KEY, 'db']);
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
   * @returns {typedefs.SQLEROperationResults} The results, each `result[connectionName]` containing the number of cached keys transferred
   */
  async setCache(cache, isTransfer, ...connNames) {
    return operation(internal(this), 'setCache', null, connNames, cache, isTransfer);
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
    return `${MOD_KEY}:${dialect}:${connName}:db:${methodName}:${ext}`;
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
      rtn[i] = sql.replace(POS_BINDS_REGEXP, match => `${match}${i}`);
    }
    return rtn;
  }

  /**
   * @returns {String[]} The operation types
   */
  static get OPERATION_TYPES() {
    return CRUD_TYPES;
  }

  /**
   * @returns {RegExp} A regular expression that globally matches each _named bind parameters_ in a SQL statement. A single capture group is defined for each parameter name (match on entire bind name
   * syntax)
   */
  static get POSITIONAL_BINDS_REGEXP() {
    return POS_BINDS_REGEXP;
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
    let ltags = [...conn.log, MOD_KEY, 'db', conn.name, dlct, conn.service, conn.id, `v${conn.version || 0}`];
    conn.logging = logging === true ? generateLogger(console.log, ltags) : logging && logging(ltags); // override dialect non-error logging
  }
  if (conn.logError !== false) {
    let ltags = [...conn.logError, MOD_KEY, 'db', conn.name, dlct, conn.service, conn.id, `v${conn.version || 0}`];
    conn.errorLogging = logging === true ? generateLogger(console.error, ltags) : logging && logging(ltags); // override dialect error logging
  }
  dialect = new mgr.at.dialects[dlct](privy, conn, mgr.at.track, conn.errorLogging || false, conn.logging || false, mgr.at.debug || false);
  // prepared SQL functions from file(s) that reside under the defined name and dialect (or "default" when dialect is flagged accordingly)
  if (mgr.this[NS][conn.name]) throw new Error(`Database connection ID ${conn.id} cannot have a duplicate name for ${conn.name}`);
  //if (reserved.includes(conn.name)) throw new Error(`Database connection name ${conn.name} for ID ${conn.id} cannot be one of the following reserved names: ${reserved}`);
  mgr.at.sqls[idx] = new SQLS(NS, mgr.at.mainPath, cache, conn, (mgr.this[NS][conn.name] = {}), new DBS(dialect, conn), mgr.this.generateCacheKey.bind(mgr.this));
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

/**
 * Reads all the perpared SQL definition files for a specified name directory and adds a function to execute the SQL file contents
 * @private
 */
class SQLS {

  /**
   * Reads all the prepared SQL definition files for a specified name directory and adds a function to execute the SQL file contents
   * @constructs SQLS
   * @param {String} ns The namespace on the {@link Manager} where all {@link typedefs.SQLERPreparedFunction} will be added
   * @param {String} sqlBasePth the absolute path that SQL files will be included
   * @param {typedefs.SQLERCache} [cache] the {@link typedefs.SQLERCache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
   * @param {typedefs.SQLERConnectionOptions} conn options for the prepared statements
   * @param {Object} db the object where SQL retrieval methods will be stored (by file name parts separated by a period- except the file extension)
   * @param {DBS} dbs the database service to use
   * @param {Function} [generateCacheKey] The function that will be used to generate cache keys for storeing SQL statements
   */
  constructor(ns, sqlBasePth, cache, conn, db, dbs, generateCacheKey) {
    const sqls = internal(this);
    sqls.at.ns = ns;
    sqls.at.numOfPreparedFuncs = 0;
    sqls.at.basePath = Path.join(sqlBasePth, conn.dir || conn.name);
    sqls.at.cache = cache;
    sqls.at.conn = conn;
    sqls.at.subs = conn.substitutes;
    sqls.at.subrxs = conn.substitutes && [];
    sqls.at.dateFormatter = conn.dateFormatter;
    sqls.at.db = db;
    sqls.at.dbs = dbs;
    sqls.at.generateCacheKey = generateCacheKey;
    if (sqls.at.subs) for (let key in sqls.at.subs) {
      sqls.at.subrxs.push({ from: new RegExp(key, 'g'), to: sqls.at.subs[key] }); // turn text value into global regexp
    }
  }

  /**
   * Initializes the SQL paths
   */
  async init() {
    const sqls = internal(this);
    const isPrepared = sqls.at.isPrepared;
    if (!isPrepared) {
      sqls.at.numOfPreparedFuncs = 0;
      const prepare = async (cont, pnm, pdir) => {
        let pth, proms = [];
        try {
          cont = cont || sqls.at.db;
          pdir = pdir || sqls.at.basePath;
          const files = await Fs.promises.readdir(pdir);
          for (let fi = 0, stat, nm, ns, ext; fi < files.length; ++fi) {
            pth = Path.resolve(pdir, files[fi]);
            stat = await Fs.promises.stat(pth);
            if (stat && stat.isDirectory()) {
              nm = files[fi].replace(FUNC_NAME_DIR_REGEXP, FUNC_NAME_SEPARATOR);
              proms.push(prepare(cont[nm] = {}, `${pnm ? `${pnm}${FUNC_NAME_SEPARATOR}` : ''}${nm}`, pth));
              continue;
            }
            if (!files[fi].endsWith('.sql')) continue;
            nm = files[fi].replace(FUNC_NAME_FILE_REGEXP, FUNC_NAME_SEPARATOR);
            ns = nm.split('.');
            ext = ns.pop();
            nm = `${sqls.at.conn.dialect}${FUNC_NAME_SEPARATOR}${sqls.at.conn.name}${FUNC_NAME_SEPARATOR}${
              pnm ? `${pnm}${FUNC_NAME_SEPARATOR}` : ''}${ns.join(FUNC_NAME_SEPARATOR)}`;
            for (let ni = 0, nl = ns.length, so = cont; ni < nl; ++ni) {
              if (ns[ni] === 'beginTransaction') throw new Error(`SQL "${fpth}" cannot contain reserved "beginTransaction"`);
              so[ns[ni]] = so[ns[ni]] || (ni < nl - 1 ? {} : await sqls.this.prepared(nm, pth, ext));
              so = so[ns[ni]];
            }
          }
          await Promise.all(proms);
        } catch (err) {
          if (sqls.at.conn.errorLogging) sqls.at.conn.errorLogging(`Failed to build SQL statements from files in directory ${pth || pdir}`, err);
          throw err;
        }
      };
      await prepare();
      sqls.at.db.beginTransaction = opts => sqls.at.dbs.beginTransaction(opts);
      sqls.at.isPrepared = true;
    }
    if (!isPrepared || !sqls.at.initResult) {
      sqls.at.initResult = await sqls.at.dbs.init({ numOfPreparedFuncs: sqls.at.numOfPreparedFuncs });
    }
    await sqls.this.setCache(sqls.at.cache);
    return sqls.at.initResult;
  }

  /**
   * Generates a function that will execute a pre-defined SQL statement contained within a SQL file (and handle caching of that file)
   * @protected
   * @param {String} name the name of the SQL (excluding the extension)
   * @param {String} fpth the path to the SQL file to execute
   * @param {String} ext the file extension that will be used
   * @returns {typedefs.SQLERPreparedFunction} an `async function` that executes SQL statement(s)
   */
  async prepared(name, fpth, ext) {
    const sqls = internal(this);
    if (sqls.at.conn.logging) sqls.at.conn.logging(`Generating prepared function for ${fpth} at name ${name}`);
    let crud = Path.parse(fpth).name.match(/[^\.]*/)[0].toUpperCase();
    if (!CRUD_TYPES.includes(crud)) crud = null;
    if (sqls.at.conn.logging) {
      sqls.at.conn.logging(`Generating prepared function for ${fpth} at name ${name}${
        crud ? '' : ` (statement execution must include "opts.type" set to one of ${CRUD_TYPES.join(',')} since the SQL file path is not prefixed with the type)`}`);
    }
    // cache the SQL statement capture in order to accommodate dynamic file updates on expiration
    sqls.at.stms = sqls.at.stms || { methods: {} };
    sqls.at.stms.methods[name] = {};
    sqls.at.stms.methods[name][ext] = { sql: null, key: generateGUID() };
    sqls.at.stms.methods[name][ext].cached = async function cachedSql(opts, execFn) { // execute the SQL statement with cached statements
      const key = sqls.at.generateCacheKey(sqls.at.conn.dialect, sqls.at.conn.name, name, ext);
      const cached = await sqls.at.cache.get(key);
      if (!cached || !cached.item) {
        if (sqls.at.conn.logging) sqls.at.conn.logging(`Refreshing cached ${fpth} at ID ${key}`);
        this.sql = await readSqlFile();
        sqls.at.cache.set(key, this.sql); // no need to await set
      } else this.sql = cached.item;
      return await execFn(this.sql);
    };
    sqls.at.stms.methods[name][ext].nocache = async function staticSql(opts, execFn) { // execute the SQL statement with static statements
      if (!this.sql) {
        if (sqls.at.conn.logging) sqls.at.conn.logging(`Setting static ${fpth} at "${name}"`);
        this.sql = await readSqlFile();
      }
      return await execFn(this.sql);
    };

    if (!sqls.at.cache) {
      if (sqls.at.conn.logging) sqls.at.conn.logging(`Setting static ${fpth} at "${name}"`);
      sqls.at.stms.methods[name][ext].sql = await readSqlFile();
    }
    sqls.at.numOfPreparedFuncs++;

    /**
     * @returns {String} the SQL contents from the SQL file
     */
    async function readSqlFile() {
      let data = await Fs.promises.readFile(fpth, { encoding: 'utf8' });
      if (data && sqls.at.subrxs) for (let i = 0, l = sqls.at.subrxs.length; i < l; ++i) {
        data = data.replace(sqls.at.subrxs[i].from, sqls.at.subrxs[i].to); // substitutions
      }
      return data;
      // return ext === 'json' ? JSON.parse(data.toString('utf8').replace(/^\uFEFF/, '')) : data; // when present, replace BOM before parsing JSON result
    }

    /**
    * Sets/formats SQL parameters and executes an SQL statement
    * @see typedefs.SQLERPreparedFunction
    */
    return async function execSqlPublic(opts, frags, errorOpts) {
      const binds = {}, mopt = { binds, opts: frags }, type = (opts && opts.type && opts.type.toUpperCase()) || crud;
      if (!type || !CRUD_TYPES.includes(type)) {
        throw new Error(`Statement execution at "${fpth}" must include "opts.type" set to one of ${
          CRUD_TYPES.join(',')} since the SQL file name was not prefixed with a valid type (found: ${type})`);
      }
      if (sqls.at.conn.binds) for (let i in sqls.at.conn.binds) {
        if (!opts || !opts.binds || !opts.binds.hasOwnProperty(i)) {
          // add per connection static parameters when not overridden
          if (sqls.at.conn.binds[i] instanceof Date) {
            binds[i] = sqls.this.formatDate(sqls.at.conn.binds[i], (opts && opts.dateFormatter) || sqls.at.dateFormatter);
          } else {
            binds[i] = sqls.at.conn.binds[i]; 
          }
        }
      }
      if (opts && opts.binds) {
        for (let i in opts.binds) {
          if (opts.binds[i] instanceof Date) {
            binds[i] = sqls.this.formatDate(opts.binds[i], opts.dateFormatter || sqls.at.dateFormatter);
          } else {
            binds[i] = opts.binds[i];
          }
        }
      }
      const xopts = {
        name: opts && opts.name,
        type,
        binds,
        autoCommit: opts && opts.hasOwnProperty('autoCommit') ? opts.autoCommit : true
      };
      if (opts && opts.driverOptions) xopts.driverOptions = opts.driverOptions;
      if (opts && opts.prepareStatement) xopts.prepareStatement = !!opts.prepareStatement;
      if (opts && opts.transactionId) xopts.transactionId = opts.transactionId;
      if (!xopts.autoCommit && !xopts.transactionId && !xopts.prepareStatement) {
        throw new Error(`SQL execution at "${fpth}" must include "opts.transactionId" when "opts.autoCommit = false" and` +
        ` "opts.prepareStatement = false". Try setting "const tx = await manager.${sqls.at.ns}.${sqls.at.conn.name}.beginTransaction(); opts.transactionId = tx.id"`);
      }
      return await sqls.at.stms.methods[name][ext][sqls.at.cache ? 'cached' : 'nocache'](mopt, sqls.this.genExecSqlFromFileFunction(name, fpth, xopts, frags, errorOpts));
    };
  }

  /**
   * Sets the caching mechenism
   * @param {typedefs.SQLERCache} [cache] the {@link typedefs.SQLERCache} __like__ instance that will handle the logevity of the SQL statement before the SQL statement is re-read from the SQL file
   * @param {Boolean} [isTransfer] Truthy when the passed `cache` is present and any existing SQL (either cached or non-cached) should be transferred to it (if any)
   * @returns {Integer} The number of transferred cached SQL statements
   */
  async setCache(cache, isTransfer) {
    const sqls = internal(this);
    if (sqls.at.conn.logging) {
      sqls.at.conn.logging(`Setting cache for base path ${sqls.at.basePath} from:`, sqls.at.cache, 'to:', cache);
    }
    const items = [];
    if (!isTransfer || cache === sqls.at.cache) {
      sqls.at.cache = cache;
      return items.length;
    }
    let key, cached;
    for (let name in sqls.at.stms.methods) {
      for (let ext in sqls.at.stms.methods[name]) {
        key = sqls.at.generateCacheKey(sqls.at.conn.dialect, sqls.at.conn.name, name, ext);
        if (sqls.at.cache) {
          cached = await sqls.at.cache.get(key);
          if (cached && cached.item) {
            sqls.at.stms.methods[name][ext].sql = cached.item;
          }
        }
        if (cache) {
          items.push({ rslt: cache.set(key, sqls.at.stms.methods[name][ext].sql), key });
        }
      }
    }
    sqls.at.cache = cache;
    for (let item of items) {
      item.rslt = await item.rslt;
      if (sqls.at.conn.logging) sqls.at.conn.logging(`Transferred cached key ${item.key} to:`, cache);
    }
    if (sqls.at.conn.logging) sqls.at.conn.logging(`Transferred ${items.length} cached keys to:`, cache);
    return items.length;
  }

  formatDate(bind, dfunc) {
    if (dfunc === true) {
      return bind.toISOString(); // convert dates to ANSI format for use in SQL
    } else if (dfunc && typeof dfunc === 'function') {
      dfunc = dfunc(bind);
      return typeof dfunc === 'string' ? dfunc : bind;
    } else return bind;
  }

  genExecSqlFromFileFunction(name, fpth, opts, frags, errorOpts) {
    const sqls = internal(this);
    return async function execSqlFromFile(sql) {
      return await sqls.at.dbs.exec(name, fpth, sql, opts, frags, errorOpts);
    };
  }

  /**
   * Iterates through and terminates the different database connection pools
   */
  async close() {
    return internal(this).at.dbs.close();
  }

  /**
   * @returns {typedefs.SQLERState} The current managed state of the {@link DBS}
   */
  get state() {
    return internal(this).at.dbs.state;
  }

  /**
   * @returns {Integer} the number of prepared statements found in SQL files
   */
  get numOfPreparedFuncs() {
    return internal(this).at.numOfPreparedFuncs;
  }

  /**
   * @returns {String} the connection name associated with the {@link SQLS} instance
   */
  get connectionName() {
    return internal(this).at.conn.name;
  }

  /**
   * @returns {Boolean} True when all of the SQL functions have been prepared
   */
  get isPrepared() {
    return internal(this).at.isPrepared;
  }

  /**
   * @returns {*} Any truthy value that indicates the initialization was successful (or an error when returning errors instead of throwing them)
   */
  get isInitialized() {
    return internal(this).at.initResult;
  }
}

/**
 * Database service
 * @private
 */
class DBS {

  /**
   * Database service constructor
   * @constructs DBS
   * @param {typedefs.Dialect} dialect the database dialect implementation/executor to use
   * @param {typedefs.SQLERConnectionOptions} conn the connection options
   */
  constructor(dialect, conn) {
    const dbs = internal(this);
    dbs.at.dialect = dialect;
    dbs.at.dialectName = conn.dialect.toLowerCase();
    dbs.at.errorLogging = conn.errorLogging;
    dbs.at.logging = conn.logging;
    dbs.at.version = conn.version || 0;
  }

  /**
   * Initializes the database service
   * @param {Object} [opts] initializing options passed into the underlying database implementation/executor
   * @returns {*} Any truthy value that indicates the initialization was successful
   */
  async init(opts) {
    const dbs = internal(this);
    return await dbs.at.dialect.init(opts);
  }

  /**
   * Begins a transaction
   * @param {typedefs.SQLERTransactionOptions} [opts={}] The passed transaction options
   * @returns {typedefs.SQLERTransaction} The transaction that has been started
   */
  async beginTransaction(opts) {
    const dbs = internal(this);
    return dbs.at.dialect.beginTransaction(generateGUID(), opts || {});
  }

  /**
  * Executes SQL using the underlying framework API
  * @param {String} name The name given to the SQL file
  * @param {String} fpth The originating file path where the SQL resides
  * @param {String} sql The SQL to execute with optional substitutions {@link DBS#frag}
  * @param {typedefs.SQLERExecOptions} opts The eectution options
  * @param {String[]} frags The frament keys within the SQL that will be retained
  * @param {(typedefs.SQLERExecErrorOptions | Boolean)} [errorOpts] Truthy to return any errors thrown during execution rather than throwing them.
  * Can also pass {@link typedefs.SQLERExecErrorOptions} for more control over execution errors.
  * @returns {typedefs.SQLERExecResults} The execution results
  */
  async exec(name, fpth, sql, opts, frags, errorOpts) {
    const dbs = internal(this);
    const sqlf = dbs.this.segmentSubs(sql, opts.binds, frags);
    // framework that executes SQL may output SQL, so, we dont want to output it again if logging is on
    if (dbs.at.logging) {
      dbs.at.logging(`Executing SQL ${fpth} with options ${JSON.stringify(opts)}${frags ? ` framents used ${JSON.stringify(frags)}` : ''}`);
    }
    /** @type {typedefs.SQLERExecResults} */
    let rslt;
    try {
      const meta = { name, path: fpth };
      rslt = await dbs.at.dialect.exec(sqlf, opts, frags, meta, errorOpts); // execute the prepared SQL statement
    } catch (err) {
      try {
        /** @type {typedefs.SQLERExecOptions} */
        const eopts = JSON.parse(JSON.stringify(opts));
        eopts.binds = errorOpts && errorOpts.includeBindValues ? eopts.binds : Object.keys(opts.binds);
        if (dbs.at.errorLogging) {
          dbs.at.errorLogging(`SQL ${eopts.name ? `named "${eopts.name}" at ` : ''
          }${fpth} failed ${err.message || JSON.stringify(err)} (options: ${JSON.stringify(eopts)}, state: ${
            JSON.stringify(dbs.at.dialect.state)
          })`);
        }
        err[MOD_KEY] = err[MOD_KEY] || {};
        err[MOD_KEY].name = name;
        err[MOD_KEY].file = fpth;
        err[MOD_KEY].sql = sqlf;
        err[MOD_KEY].options = eopts;
        err[MOD_KEY].fragments = frags;
        err.message = `${err.message}\n${JSON.stringify(err[MOD_KEY], null, ' ')}`;
      } catch (frmtErr) {
        if (dbs.at.errorLogging) {
          dbs.at.errorLogging(`Failed to set ${MOD_KEY} error properties for error at SQL: ${fpth}`, frmtErr);
        }
      }
      if (errorOpts && errorOpts.handler && typeof errorOpts.handler === 'function') {
        errorOpts.handler(err);
      }
      if (errorOpts === true || (errorOpts && errorOpts.returnErrors)){
        return { error: err };
      }
      throw err;
    }
    if (dbs.at.logging) {
      dbs.at.logging(`SQL ${fpth} returned with ${(rslt && rslt.rows && rslt.rows.length) || 0} records (options: ${JSON.stringify(opts)}, state: ${
        JSON.stringify(dbs.at.dialect.state)
      })`);
    }
    return rslt;
  }

  /**
  * Replaces or removes tagged substitution segments that appear in an SQL statement
  * - __Expansions__ - Expands _bind_ variables that contain an array of values when they appear in the SQL statement. For example, an SQL statement with a section that contains
  * `IN (:someParam)` and _binds_ of `{ someParam: [1,2,3] }` would become `IN (:someParam, :someParam1, :someParam2)` with _binds_ of `{ someParam: 1, someParam1: 2, SomeParam2: 3 }`
  * - __Dialects__ - Replaces SQL segments that contain an open `[[! myDialectName]]` and closing `[[!]]` with the SQL content that is between the opening and closing _dialect_ tags
  * when the {@link typedefs.SQLERConnectionOptions} contains the designated _dialect_ name (`myDialectName` in this case). For example, 
  * `[[! oracle]] SOME_COL = SUBSTR(SOME_COL, 1, 1) [[!]] [[! mssql]] SOME_COL = SUBSTRING(SOME_COL FROM 1 FOR 1) [[!]]`
  * would become `SOME_COL = SUBSTR(SOME_COL, 1, 1)` when using an `oracle` dialect, `SOME_COL = SUBSTRING(SOME_COL FROM 1 FOR 1)` when using an `mssql` dialect and omitted using any
  * other dialect.
  * - __Versions__ - Replaces SQL segments that contain an open `[[version = 1]]` and closing `[[version]]` with the SQL content that is between the opening and closing _version_ tags
  * when the {@link typedefs.SQLERConnectionOptions} contains a _version_ that satisfys the comparative operator for the version within the tag designator. For example,
  * `[[version <= 1]] SOME_OLD_COL [[version]] [[version > 1]] SOME_NEW_COL [[version]]` would become `SOME_OLD_COL` using a {@link typedefs.SQLERConnectionOptions} _version_ that is
  * less than or equal to `1`, but woud become `SOME_NEW_COL` when the _version_ is greater than `1`.
  * - __Fragments__ - Replaces SQL segments that contain an open `[[? someKey]]` and closing `[[?]]` with the SQL content that is between the opening and closing _fragment_ tags when
  * the `keys` contain the designated fragment identifier. For example, `WHERE SOME_COL1 = 1 [[? someKey]] AND SOME_COL2 = 2 [[?]]` would become `WHERE SOME_COL1 = 1 AND SOME_COL2 = 2`
  * when `keys` contains `[ 'someKey' ]`. If `keys` does not contain `someKey`, the statement would just become `WHERE SOME_COL1 = 1`.
  * @param {String} sql The SQL to defragement
  * @param {Object} [binds] An object that contains the SQL parameterized `binds` that will be used for parameterized array composition
  * @param {String[]} [frags] Fragment keys which will remain intact within the SQL
  * @returns {String} The defragmented SQL
  */
 segmentSubs(sql, binds, frags) {
    const dbs = internal(this);
    // expansion substitutes
    if (binds) {
      // AND/OR conjunction expansions
      sql = sql.replace(/\[\[(OR|AND)([\S\s]*?)(:)(\w+)([\S\s]*?)\s*\]\]/gi, function sqlExpandConjRpl(match, conjunction, prefix, bindKey, bindName, suffix) {
        return DBS.segmentSubExpanded(binds, bindKey, bindName, ` ${conjunction}`, prefix, suffix);
      });
      // simple expansions using comma separations
      sql = sql.replace(/(:)([a-z]+[0-9]*?)/gi, function sqlArrayRpl(match, bindKey, bindName) {
        return DBS.segmentSubExpanded(binds, bindKey, bindName);
      });
    }
    // dialect substitutes
    sql = sql.replace(/((?:\r?\n|\n)*)-{0,2}\[\[\!(?!\[\[\!)\s*(\w+)\s*\]\](?:\r?\n|\n)*([\S\s]*?)-{0,2}\[\[\!\]\]((?:\r?\n|\n)*)/g, function sqlDiaRpl(match, lb1, key, fsql, lb2) {
      return (key && key.toLowerCase() === dbs.at.dialectName && fsql && (lb1 + fsql)) || ((lb1 || lb2) && ' ') || '';
    });
    // version substitutes
    sql = sql.replace(/((?:\r?\n|\n)*)-{0,2}\[\[version(?!\[\[version)\s*(=|<=?|>=?|<>)\s*[+-]?(\d+\.?\d*)\s*\]\](?:\r?\n|\n)*([\S\s]*?)-{0,2}\[\[version\]\]((?:\r?\n|\n)*)/gi, function sqlVerRpl(match, lb1, key, ver, fsql, lb2) {
      return (key && ver && !isNaN(ver = parseFloat(ver)) && COMPARE[key](dbs.at.version, ver) && fsql && (lb1 + fsql)) || ((lb1 || lb2) && ' ') || '';
    });
    // fragment substitutes
    sql = sql.replace(/((?:\r?\n|\n)*)-{0,2}\[\[\?(?!\[\[\?)\s*(\w+)\s*\]\](?:\r?\n|\n)*([\S\s]*?)-{0,2}\[\[\?\]\]((?:\r?\n|\n)*)/g, function sqlFragRpl(match, lb1, key, fsql, lb2) {
      return (key && frags && frags.indexOf(key) >= 0 && fsql && (lb1 + fsql)) || ((lb1 || lb2) && ' ') || '';
    });
    return sql;
  }

  /**
   * Expenads a bind parameter using surrounding separators and expands the binds to reflect multiple values.
   * @param {Object} binds The key/value bind parameters to use
   * @param {String} bindKey The key that will be used when expanding the binding parameter names (e.g. `:`)
   * @param {String} bindName The bound parameter that will be expanded
   * @param {String} [conjunction=', '] The conjunction that will be used to separate the expanded binds
   * (e.g. conjunction = ', '; bindKey = ':'; bindName = 'myBind'; binds = { myBind: [1,2] };` would result in
   * `:myBind, :myBind1` with `binds = { myBind: 1, myBind1: 2 }`)
   * @param {String} prefix The prefix that will be used before each expanded bind parameter
   * (e.g. `prefix = 'UPPER('; suffix = ')'; conjunction = ' OR'; bindKey = ':'; bindName = 'myBind'; binds = { myBind: [1,2] };` would result in
   * `UPPER(:myBind) OR UPPER(:myBind1)` with `binds = { myBind: 1, myBind1: 2 }`)
   * @param {String} suffix The suffix that will be used after each expended bind parameter
   * (e.g. `prefix = 'UPPER('; suffix = ')'; conjunction = ' OR'; bindKey = ':'; bindName = 'myBind'; binds = { myBind: [1,2] };` would result in
   * `UPPER(:myBind) OR UPPER(:myBind1)` with `binds = { myBind: 1, myBind1: 2 }`)
   */
  static segmentSubExpanded(binds, bindKey, bindName, conjunction = ', ', prefix = '', suffix = '') {
    let newKeys = '';
    for (let i = 0, vals = bindName && Array.isArray(binds[bindName]) && binds[bindName], l = vals && vals.length; i < l; ++i) {
      newKeys += `${(newKeys && conjunction) || ''}${prefix}${bindKey}${bindName}${i || ''}${suffix}`; // set SQL expanded binds
      binds[bindName + (i || '')] = vals[i]; // set expanded binds
    }
    return newKeys || (bindKey + bindName); // replace with new key(s) or leave as-is
  }

  /**
   * Iterates through and terminates the different database connection pools
   */
  async close() {
    const dbs = internal(this);
    return dbs.at.dialect.close();
  }

  /**
   * @returns {typedefs.SQLERState} The managed state of the {@link Dialect}
   */
  get state() {
    const dbs = internal(this);
    return dbs.at.dialect.state;
  }
}

/**
 * Generate a {@link Manager} _logger_
 * @private
 * @param {Function} log The `function(...args)` that will log out the arguments
 * @param {Sring[]} [tags] The tags that will prefix the log output
 */
function generateLogger(log, tags) {
  return function dbManagerLogger(o) {
    const logs = typeof o === 'string' ? [format.apply(null, arguments)] : arguments;
    for (let i = 0, l = logs.length; i < l; ++i) {
      log(`[${tags ? tags.join() : ''}] ${logs[i]}`);
    }
  };
}

/**
 * Generates formats a GUID formatted identifier
 * @private
 * @param {String} [value] when present, will add any missing hyphens (if `hyphenate=true`) instead of generating a new value
 * @param {Boolean} [hyphenate=true] true to include hyphens in generated result
 * @returns {String} the generated GUID formatted identifier
 */
function generateGUID(value, hyphenate = true) {
  const hyp = hyphenate ? '-' : '';
  if (value) return hyphenate ? value.replace(/(.{8})-?(.{4})-?(.{4})-?(.{4})-?(.{12})/gi, `$1${hyp}$2${hyp}$3${hyp}$4${hyp}$5`) : value;
  return `xxxxxxxx${hyp}xxxx${hyp}4xxx${hyp}yxxx${hyp}xxxxxxxxxxxx`.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * @see typedefs.SQLERInterpolateFunction
 * @private
 */
function interpolate(dest, source, interpolator, validator, onlyInterpolated, _vpths) {
  let val, typ, vfunc = typeof validator === 'function' && validator, pole = interpolator || dest, isPole;
  for (let srcProp in source) {
    if (!source.hasOwnProperty(srcProp)) continue;
    isPole = false;
    typ = typeof source[srcProp];
    if (typ === 'object' && !(source[srcProp] instanceof Date) && !(source[srcProp] instanceof RegExp)) {
      if (_vpths) _vpths.push(srcProp);
      else if (vfunc) _vpths = [srcProp];
      dest[srcProp] = interpolate(source[srcProp], source[srcProp], interpolator, validator, onlyInterpolated, _vpths);
      if (_vpths) _vpths.shift();
      continue;
    }
    if (typ === 'string') {
      // actual interpolation
      val = undefined;
      source[srcProp].replace(/\${\s*([A-Z_]+)\s*}/i, (match, interpolated) => {
        if (interpolated in pole) {
          isPole = true;
          val = pole[interpolated];
        } else {
          val = match; // leave as is
        }
      });
      if (typeof val === 'undefined') {
        val = source[srcProp];
      }
    } else {
      val = source[srcProp];
    }
    if (vfunc) {
      if (_vpths) _vpths.push(srcProp);
      else _vpths = [srcProp];
      if (!vfunc(_vpths, val)) {
        _vpths.pop();
        continue;
      }
    }
    if (!onlyInterpolated || isPole) dest[srcProp] = val;
    if (_vpths) _vpths.pop();
  }
  return dest;
}

/**
 * @see typedefs.SQLERPositionalBindsFunction
 * @private
 */
function positionalBinds(sql, bindsObject, bindsArray, placeholder = '?') {
  const func = typeof placeholder === 'function' ? placeholder : null;
  return sql.replace(POS_BINDS_REGEXP, (match, pname) => {
    if (!bindsObject.hasOwnProperty(pname)) throw new Error(`sqler: Unbound "${pname}" at position ${
      bindsArray.length
    } found during positional bind formatting`);
    bindsArray.push(bindsObject[pname]);
    return func ? func(pname, bindsArray.length - 1) : placeholder;
  });
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