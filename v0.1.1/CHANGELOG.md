## [0.1.1](https://github.com/ugate/sqler/tree/v0.1.1) (2019-12-18)
[Full Changelog](https://github.com/ugate/sqler/compare/v0.1.0...v0.1.1)


__Fixes:__
* [[FIX]: When using a directory path in `conf.dialects`, the path will be prefixed with `process.cwd()` before loading (e.g. `{ dialects: { "myDialect": "./my-dialect.js" } }` resolves to `${process.cwd()}/./my-dialect.js`)](https://github.com/ugate/sqler/commit/ac81a33558abd4476d16654fb2733bf86d1d6dc9)