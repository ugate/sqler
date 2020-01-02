'use strict';

/**
 * Options that are passed to the {@link Dialect.init} function
 * @typedef {Object} Dialect~DialectInitOptions
 * @property {Integer} numOfPreparedStmts The total number of prepared statements registered to the {@link Dialect}
 */

/**
 * Options that contain transactional state of a {@link Dialect}
 * @typedef {Object} Dialect~DialectTxOptions
 * @property {Integer} pending The number of pending transactions in progress on the connection
 */

/**
 * Options that are passed to _all_ {@link Dialect} functions
 * @typedef {Object} Dialect~DialectOptions
 * @property {Dialect~DialectTxOptions} tx Transactional state of the {@link Dialect}
 */

 /**
  * Options that are passed to the {@link Dialect.exec} function
  * @typedef {Manager~ExecOptions} Dialect~DialectExecOptions
  * @property {Dialect~DialectTxOptions} tx Transactional state of the {@link Dialect}
  */

/**
 * Abstract class that each database vendor/driver should `extend` from
 */
class Dialect {

  /**
   * Abstract constructor that sets each passed parameter on the current instance as a property.
   * Extending classes should override the constructor using the same parameters since {@link Manager} internally invokes the constructor.
   * @param {Manager~PrivateOptions} priv The private configuration options
   * @param {Manager~ConnectionOptions} connConf The individual __connection__ configuration for the given dialect that was passed into the originating {@link Manager}
   * @param {Object} [track] an object used to share configuration between dialect implementations
   * @param {Function} [errorLogger] a function that takes one or more arguments and logs the results as an error (similar to `console.error`)
   * @param {Function} [logger] a function that takes one or more arguments and logs the results (similar to `console.log`)
   * @param {Boolean} [debug] a flag that indicates the dialect should be run in debug mode (if supported)
   */
  constructor(priv, connConf, track, errorLogger, logger, debug) {
    this.priv = priv;
    this.connConf = connConf;
    this.track = track;
    this.errorLogger = errorLogger;
    this.logger = logger;
    this.debug = debug;
  }

  /**
   * Initializes the {@link Dialect} implementation and optionally opens any resources that be need to {@link Dialect.exec}
   * @param {Dialect~DialectInitOptions} opts The initialization options
   * @returns {*} Any truthy value that indicates the initialization was successfull (or an error when returning errors instead of throwing them)
   */
  async init(opts) {
    throw new Error(`${this.constructor.name}.init not implemented\nUsing options ${JSON.stringify(opts)}`);
  }

  /**
   * Executes a SQL statement
   * @param {String} sql The SQL to execute
   * @param {Dialect~DialectExecOptions} opts The execution options
   * @param {String[]} frags The frament keys within the SQL that will be retained
   * @returns {(Object[] | null | undefined | Error)} The result set, if any (or an error when returning errors instead of throwing them)
   */
  async exec(sql, opts, frags) {
    const dialect = this;
    throw new Error(`${dialect.constructor.name}.exec not implemented (failed on SQL:\n${sql}\nUsing options:\n${JSON.stringify(opts)}\nFragments: ${frags})`);
  }

  /**
   * Commit the current transaction(s) in progress
   * @param {Dialect~DialectOptions} opts The dialect options
   * @returns {(Integer | Error)} The number of transactions that were successfully committed (or an error when returning errors instead of throwing them)
   */
  async commit(opts) {
    throw new Error(`${this.constructor.name}.commit not implemented for option: ${JSON.stringify(opts)}`);
  }

  /**
   * Rollback the current transaction(s) in progress
   * @param {Dialect~DialectOptions} opts The dialect options
   * @returns {(Integer | Error)} The number of transactions that were successfully rolled back (or an error when returning errors instead of throwing them)
   */
  async rollback(opts) {
    throw new Error(`${this.constructor.name}.commit not implemented for options: ${JSON.stringify(opts)}`);
  }

  /**
   * Closes any dialaect resources that may have been opened during {@link Dialect.init}
   * @param {Dialect~DialectOptions} opts The dialect options
   * @returns {(Integer | Error)} The number of connections that were closed (or an error when returning errors instead of throwing them)
   */
  async close(opts) {
    throw new Error(`${this.constructor.name}.close not implemented for options: ${JSON.stringify(opts)}`);
  }

  /**
   * Determines if an {@link Dialect~DialectExecOptions} is setup for [autocommit](https://en.wikipedia.org/wiki/Autocommit)
   * @param {Dialect~DialectExecOptions} opts The execution options
   * @returns {Boolean} A flag indicating that transactions are setup to autocommit
   */
  isAutocommit(opts) {
    throw new Error(`${this.constructor.name}.isAutocommit not implemented for options: ${JSON.stringify(opts)}`);
  }

  /**
   * @returns {Integer} __optonally__ returns the connection count the last time it was checked
   */
  get lastConnectionCount() {
    return 0;
  }

  /**
   * @returns {Integer} __optonally__ returns the number of connections that were in use the last time it was checked
   */
  get lastConnectionInUseCount() {
    return 0;
  }
}

module.exports = Dialect;