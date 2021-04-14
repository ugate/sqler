'use strict';

const DBS = require('./dbs');
const Utils = require('./utils');
const typedefs = require('../typedefs');

const Fs = require('fs');
const Path = require('path');

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
      await sqls.this.scan(false);
      sqls.at.db.beginTransaction = opts => sqls.at.dbs.beginTransaction(opts);
      sqls.at.isPrepared = true;
    }
    if (!isPrepared || !sqls.at.initResult) {
      sqls.at.initResult = await sqls.at.dbs.init({ numOfPreparedFuncs: sqls.this.numOfPreparedFuncs });
    } else {
      await sqls.this.scan();
    }
    await sqls.this.setCache(sqls.at.cache);
    return sqls.at.initResult;
  }

  /**
   * Scans SQL files found within the `basePath` and generates prepared functions for each.
   * @see {@link SQLS#prepared}
   * @param {Boolean} [removeOrphans=true] Truthy to remove orphaned prepared functions that no longer have an SQL file associated with them
   * @returns {Integer} The total number of prepared functions
   */
  async scan(removeOrphans = true) {
    const sqls = internal(this);
    const adds = removeOrphans && sqls.at.stms && sqls.at.stms.methods ? [] : null;
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
            nm = files[fi].replace(typedefs.FUNC_NAME_DIR_REGEXP, typedefs.FUNC_NAME_SEPARATOR);
            proms.push(prepare(cont[nm] = {}, `${pnm ? `${pnm}${typedefs.FUNC_NAME_SEPARATOR}` : ''}${nm}`, pth));
            continue;
          }
          if (!files[fi].endsWith('.sql')) continue;
          nm = files[fi].replace(typedefs.FUNC_NAME_FILE_REGEXP, typedefs.FUNC_NAME_SEPARATOR);
          ns = nm.split('.');
          ext = ns.pop();
          nm = `${sqls.at.conn.dialect}${typedefs.FUNC_NAME_SEPARATOR}${sqls.at.conn.name}${typedefs.FUNC_NAME_SEPARATOR}${
            pnm ? `${pnm}${typedefs.FUNC_NAME_SEPARATOR}` : ''}${ns.join(typedefs.FUNC_NAME_SEPARATOR)}`;
          for (let ni = 0, nl = ns.length, so = cont; ni < nl; ++ni) {
            if (ns[ni] === 'beginTransaction') throw new Error(`SQL "${fpth}" cannot contain reserved "beginTransaction"`);
            so[ns[ni]] = so[ns[ni]] || (ni < nl - 1 ? {} : await sqls.this.prepared(nm, pth, ext, so, ns[ni]));
            so = so[ns[ni]];
          }
          if (adds) adds.push(pth);
        }
        await Promise.all(proms);
      } catch (err) {
        if (sqls.at.conn.errorLogging) sqls.at.conn.errorLogging(`Failed to build SQL statements from files in directory ${pth || pdir}`, err);
        throw err;
      }
    };
    await prepare();
    if (adds) {
      for (let [ key, mtd ] of sqls.at.stms.methods) {
        if (adds.includes(mtd.path)) continue;
        if (sqls.at.conn.logging) sqls.at.conn.logging(`Removing prepared function for ${mtd.path}`);
        delete mtd.parent[mtd.propertyName]; // remove the prepared function from the parent object
        sqls.at.stms.methods.delete(key); // remove the prepared function from the methods map
      }
    }
    return sqls.this.numOfPreparedFuncs;
  }

  /**
   * Generates a function that will execute a pre-defined SQL statement contained within a SQL file (and handle caching of that file)
   * @protected
   * @param {String} name The name of the SQL (excluding the extension)
   * @param {String} fpth The path to the SQL file to execute
   * @param {String} ext The file extension that will be used
   * @param {Object} parent The parent where the perpared function will reside 
   * @param {String} propertyName The name of the paroperty that will be set on the `parent` for the perpared function
   * @returns {typedefs.SQLERPreparedFunction} an `async function` that executes SQL statement(s)
   */
  async prepared(name, fpth, ext, parent, propertyName) {
    const sqls = internal(this);
    const key = sqls.at.generateCacheKey(sqls.at.conn.dialect, sqls.at.conn.name, name, ext);
    if (sqls.at.stms && sqls.at.stms.methods.has(key)) {
      return sqls.at.stms.methods.get(key).preparedFunction;
    }
    if (sqls.at.conn.logging) sqls.at.conn.logging(`Generating prepared function for ${fpth} at name ${name}`);
    let crud = Path.parse(fpth).name.match(/[^\.]*/)[0].toUpperCase();
    if (!typedefs.CRUD_TYPES.includes(crud)) crud = null;
    if (sqls.at.conn.logging) {
      sqls.at.conn.logging(`Generating prepared function for ${fpth} at name ${name}${
        crud ? '' : ` (statement execution must include "opts.type" set to one of ${typedefs.CRUD_TYPES.join(',')} since the SQL file path is not prefixed with the type)`}`);
    }
    // cache the SQL statement capture in order to accommodate dynamic file updates on expiration
    sqls.at.stms = sqls.at.stms || { methods: new Map() };
    const mthd = { name, ext, key, parent, propertyName, path: fpth, sql: null };
    mthd.cached = async function cachedSql(opts, execFn) { // execute the SQL statement with cached statements
      const cached = await sqls.at.cache.get(this.key);
      if (!cached || !cached.item) {
        if (sqls.at.conn.logging) sqls.at.conn.logging(`Refreshing cached ${this.path} at ID ${this.key}`);
        this.sql = await readSqlFile();
        sqls.at.cache.set(this.key, this.sql); // no need to await set
      } else this.sql = cached.item;
      return await execFn(this.sql);
    };
    mthd.nocache = async function staticSql(opts, execFn) { // execute the SQL statement with static statements
      if (!this.sql) {
        if (sqls.at.conn.logging) sqls.at.conn.logging(`Setting static ${this.path} at "${this.name}"`);
        this.sql = await readSqlFile();
      }
      return await execFn(this.sql);
    };

    if (!sqls.at.cache) {
      if (sqls.at.conn.logging) sqls.at.conn.logging(`Setting static ${mthd.path} at "${mthd.name}"`);
      mthd.sql = await readSqlFile();
    }

    /**
     * @returns {String} the SQL contents from the SQL file
     */
    async function readSqlFile() {
      let data = await Fs.promises.readFile(mthd.path, { encoding: 'utf8' });
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
    async function execSqlPublic(opts, frags, errorOpts) {
      const binds = {}, mopt = { binds, opts: frags }, type = (opts && opts.type && opts.type.toUpperCase()) || crud;
      if (!type || !typedefs.CRUD_TYPES.includes(type)) {
        throw new Error(`Statement execution at "${mthd.path}" must include "opts.type" set to one of ${
          typedefs.CRUD_TYPES.join(',')} since the SQL file name was not prefixed with a valid type (found: ${type})`);
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
        autoCommit: opts && opts.hasOwnProperty('autoCommit') ? opts.autoCommit : true,
        numOfPreparedFuncs: sqls.this.numOfPreparedFuncs
      };
      if (opts && opts.driverOptions) xopts.driverOptions = opts.driverOptions;
      if (opts && opts.prepareStatement) xopts.prepareStatement = !!opts.prepareStatement;
      if (opts && opts.transactionId) xopts.transactionId = opts.transactionId;
      if (!xopts.autoCommit && !xopts.transactionId && !xopts.prepareStatement) {
        throw new Error(`SQL execution at "${mthd.path}" must include "opts.transactionId" when "opts.autoCommit = false" and` +
        ` "opts.prepareStatement = false". Try setting "const tx = await manager.${sqls.at.ns}.${sqls.at.conn.name}.beginTransaction(); opts.transactionId = tx.id"`);
      }
      return await mthd[sqls.at.cache ? 'cached' : 'nocache'](mopt, sqls.this.genExecSqlFromFileFunction(mthd.name, mthd.path, xopts, frags, errorOpts));
    };

    mthd.preparedFunction = execSqlPublic;
    sqls.at.stms.methods.set(key, mthd);
    return mthd.preparedFunction;
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
    let cached;
    for (let mthd of sqls.at.stms.methods.values()) {
      if (sqls.at.cache) {
        cached = await sqls.at.cache.get(mthd.key);
        if (cached && cached.item) {
          mthd.sql = cached.item;
        }
      }
      if (cache) {
        items.push({
          rslt: cache.set(mthd.key, mthd.sql),
          mthd: mthd
        });
      }
    }
    sqls.at.cache = cache;
    for (let item of items) { // wait for all the cache.set calls to complete
      item.rslt = await item.rslt;
      if (sqls.at.conn.logging) sqls.at.conn.logging(`Transferred cached key ${item.mthd.key} to:`, cache);
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
   * Gets a cache key for a given __absolute__ path to an SQL file
   * @param {String} path The __absolute__ path to the SQL file
   * @returns {String} The key used for caching
   */
  getCacheKey(path) {
    const sqls = internal(this);
    for (let mthd of sqls.at.stms.methods.values()) {
      if (path === mthd.path) return mthd.key;
    }
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
    const sqls = internal(this);
    return (sqls.at.stms && sqls.at.stms.methods && sqls.at.stms.methods.size) || 0;
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

module.exports = SQLS;

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