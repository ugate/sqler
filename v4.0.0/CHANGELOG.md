## [4.0.0](https://ugate.github.io/sqler/tree/v4.0.0) (2020-01-27)
[Full Changelog](https://ugate.github.io/sqler/compare/v3.0.0...v4.0.0)


__Features:__
* [[FEATURE]: Manager.init, Manager.commit, Manager.rollback, Manager.pendingCommit and Manager.close now return a Manager~OperationResults in order to capture errors when returning errors is turned on. Manager.init now takes an optional argument to determine if errors should be thrown or just retuned via Manager~OperationResults.](https://ugate.github.io/sqler/commit/e2743abcc34e9aa1b5f4cf03495e1c77fc8532a2)