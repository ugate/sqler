## [5.13.0](https://ugate.github.io/sqler/tree/v5.13.0) (2020-06-16)
[Full Changelog](https://ugate.github.io/sqler/compare/v5.12.2...v5.13.0)


__Features:__
* [[FEATURE]:  AND/OR conjunctive expansions. For example, `sql = '[[OR UPPER(SOME_COL) =  UPPER(:myBind)]]'` and `binds = { myBind: [1,2] }` would result in `UPPER(SOME_COL) = UPPER(:myBind) OR UPPER(SOME_COL) = UPPER(:myBind1)` with `binds = { myBind: 1, myBind1: 2 }`.](https://ugate.github.io/sqler/commit/e58202bb0b38516ac229ffaec1b0be4d7247195d)