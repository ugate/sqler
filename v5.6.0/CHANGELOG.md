## [5.6.0](https://ugate.github.io/sqler/tree/v5.6.0) (2020-02-28)
[Full Changelog](https://ugate.github.io/sqler/compare/v5.5.0...v5.6.0)


__Features:__
* [[FEATURE]: Generated SQL functions (PreparedFunction) can be executed with different Manager~ExecErrorOptions rather than just a boolean for returning errors vs throwing them. By default, bind parameters are no longer included in errors or logging output. Use Manager~ExecErrorOptions.includeBindValues to turn them on.](https://ugate.github.io/sqler/commit/3b813989b60a8ee3fd8b0b8ed09b236651fbfad6)