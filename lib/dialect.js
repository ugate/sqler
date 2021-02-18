'use strict';

/**
 * Abstract class that each database vendor/driver should `extend` from
 */
class Dialect {

  /**
   * Abstract constructor that sets each passed parameter on the current instance as a property.
   * Extending classes should override the constructor using the same parameters since {@link Manager} internally invokes the constructor.
   * @param {SQLERPrivateOptions} priv The private configuration options
   * @param {SQLERConnectionOptions} connConf The individual __connection__ configuration for the given dialect that was passed into the originating {@link Manager}
   * @param {SQLERTrack} [track] A tracking mechanism that can be used to share configuration between dialect implementations
   * @param {Function} [errorLogger] A function that takes one or more arguments and logs the results as an error (similar to `console.error`)
   * @param {Function} [logger] A function that takes one or more arguments and logs the results (similar to `console.log`)
   * @param {Boolean} [debug] A flag that indicates the dialect should be run in debug mode (if supported)
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
   * @param {SQLERInitOptions} opts The initialization options
   * @returns {*} Any truthy value that indicates the initialization was successful (or an error when returning errors instead of throwing them)
   */
  async init(opts) {
    throw new Error(`${this.constructor.name}.init not implemented\nUsing options ${JSON.stringify(opts)}`);
  }

  /**
   * Starts a transaction. A transaction will typically get/open a connection from the pool and will remain open until `commit` or `rollback` are
   * called from the return {@link SQLERTransaction}. Care must be taken not to drain the pool of available connections. 
   * @param {String} txId The internally generated transaction identifier
   * @param {SQLERTransactionOptions} opts The transaction options passed in via the public API
   * @returns {SQLERTransaction} The transaction that was started
   */
  async beginTransaction(txId, opts) {
    throw new Error(`${this.constructor.name}.beginTransaction is not implemented (transaction ID: ${txId}, transaction Options: ${JSON.stringify(opts)})`);
  }

  /**
   * Executes a SQL statement
   * @param {String} sql The SQL to execute
   * @param {SQLERExecOptions} opts The execution options
   * @param {String[]} frags The frament keys within the SQL that will be retained
   * @param {SQLERExecMeta} meta The metadata used to generate the execution
   * @param {(SQLERExecErrorOptions | Boolean)} [errorOpts] The error options to use
   * @returns {SQLERExecResults} The execution results
   */
  async exec(sql, opts, frags, meta, errorOpts) {
    const dialect = this;
    throw new Error(`${dialect.constructor.name}.exec not implemented (failed on SQL:\n${sql}\nUsing options:\n${
      JSON.stringify(opts)}\nFragments: ${frags})\nMetadata:\n${JSON.stringify(meta)}\nError options:\n${JSON.stringify(errorOpts)}`);
  }

  /**
   * Closes any dialaect resources that may have been opened during {@link Dialect.init}
   * @returns {Integer} The number of connections that were closed
   */
  async close() {
    throw new Error(`${this.constructor.name}.close not implemented`);
  }

  /**
   * @returns {SQLERState} The state of the {@link Dialect}
   */
  get state() {
    return {
      pending: 0,
      connection: {
        count: 0,
        inUse: 0
      }
    }
  }

  /**
   * The driver module used by the {@link Dialect}
   * @protected
   * @returns {*} The driver module
   */
  get driver() {
    return null;
  }
}

module.exports = Dialect;