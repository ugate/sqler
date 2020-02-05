'use strict';

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
   * @param {Manager~InitOptions} opts The initialization options
   * @returns {*} Any truthy value that indicates the initialization was successful (or an error when returning errors instead of throwing them)
   */
  async init(opts) {
    throw new Error(`${this.constructor.name}.init not implemented\nUsing options ${JSON.stringify(opts)}`);
  }

  /**
   * Starts a transaction
   * @param {String} txId The transaction identifier
   */
  async beginTransaction(txId) {
    throw new Error(`${this.constructor.name}.beginTransaction not implemented (transaction ID: ${txId})`);
  }

  /**
   * Executes a SQL statement
   * @param {String} sql The SQL to execute
   * @param {Manager~ExecOptions} opts The execution options
   * @param {String[]} frags The frament keys within the SQL that will be retained
   * @returns {Manager~ExecResults} The execution results
   */
  async exec(sql, opts, frags) {
    const dialect = this;
    throw new Error(`${dialect.constructor.name}.exec not implemented (failed on SQL:\n${sql}\nUsing options:\n${JSON.stringify(opts)}\nFragments: ${frags})`);
  }

  /**
   * Closes any dialaect resources that may have been opened during {@link Dialect.init}
   * @returns {Integer} The number of connections that were closed
   */
  async close() {
    throw new Error(`${this.constructor.name}.close not implemented`);
  }

  /**
   * @returns {Manager~State} The state of the {@link Dialect}
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