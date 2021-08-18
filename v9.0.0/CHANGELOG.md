## [9.0.0](https://ugate.github.io/sqler/tree/v9.0.0) (2021-08-18)
[Full Changelog](https://ugate.github.io/sqler/compare/v8.1.1...v9.0.0)


__Breaking Changes:__
* [[BREAK]: typedefs.SQLERTransaction state.isCommitted is now state.committed and contains a numeric value of how many transactions have been committed. typedefs.SQLERTransaction state.isRolledback is now state.rolledback and contains a numeric value of how many transactions have been rolledback. [FEATURE]: typedefs.SQLERTransaction can now pass an isRelease boolean flag into commit or rollback that will finalize the transaction and release the connection back to the pool. typedefs.SQLERTransaction now has a state.isReleased and contains a boolean value indicating if the connection has been released.](https://ugate.github.io/sqler/commit/2db1b36ae826bad65e283acf5a295121ca4ba8cc)

__Features:__
* [[BREAK]: typedefs.SQLERTransaction state.isCommitted is now state.committed and contains a numeric value of how many transactions have been committed. typedefs.SQLERTransaction state.isRolledback is now state.rolledback and contains a numeric value of how many transactions have been rolledback. [FEATURE]: typedefs.SQLERTransaction can now pass an isRelease boolean flag into commit or rollback that will finalize the transaction and release the connection back to the pool. typedefs.SQLERTransaction now has a state.isReleased and contains a boolean value indicating if the connection has been released.](https://ugate.github.io/sqler/commit/2db1b36ae826bad65e283acf5a295121ca4ba8cc)