<b class="jsdocp-remove-me">

# ![](https://raw.githubusercontent.com/ugate/sqler/master/jsdocp/static/favicon-32x32.png) `sqler`

[![npm version](https://badgen.net/npm/v/sqler?color=orange&icon=npm)](https://www.npmjs.com/package/sqler)
[![Build Status](https://badgen.net/travis/ugate/sqler?icon=travis)](https://travis-ci.com/ugate/sqler)
[![Dependency Status](https://badgen.net/david/dep/ugate/sqler)](https://david-dm.org/ugate/sqler)
[![Dev Dependency Status](https://badgen.net/david/dev/ugate/sqler)](https://david-dm.org/ugate/sqler?type=dev)

</b>

`npm install sqler`

Skip the ORM and simplify your SQL execution plans using plain 💯% SQL systax.<br/>
`sqler` is a Node.js manager for [RDBMS](https://en.wikipedia.org/wiki/Relational_database) systems that autogenerates/manages SQL execution functions from underlying SQL statement files. Features include:

- [Autogeneration of object paths and prepared statement functions](https://ugate.github.io/sqler/tutorial-1-manual.html) that coincide with SQL file paths
- Debugging options that allow for near real time updates to [SQL files](https://ugate.github.io/sqler/tutorial-1-manual.html#sqlf) without restarting an application
- [Expanded SQL substitutions](https://ugate.github.io/sqler/tutorial-1-manual.html#es), [fragment substitutions](https://ugate.github.io/sqler/tutorial-1-manual.html#fs), [dialect specific substitutions](https://ugate.github.io/sqler/tutorial-1-manual.html#ds) and [version specific substitutions](https://ugate.github.io/sqler/tutorial-1-manual.html#vs)
- Using SQL vs ORM/API solutions minimizes overhead and maximizes optimal utilization of SQL syntax and DBA interaction and reduces over-fetching that is commonly assocaited with ORM
- Unlike strict ORM/API based solutions, models are generated on the fly- lending itself to a more function centric design

For more details check out the tutorials and API docs!

- [Tutorials](https://ugate.github.io/sqler/tutorial-1-manual.html)
- [API Docs](https://ugate.github.io/sqler/module-sqler-Manager.html)

#### Usage <sub id="usage"></sub>:
In order to use `sqler` a simple implementation of [Dialect](https://ugate.github.io/sqler/Dialect.html) should be supplied. There are a few that have already been written for a few enteprise level applications that make use of `sqler`<sub id="dialects"></sub>:

- [SQL Server](https://github.com/ugate/sqler-mssql)
- [Oracle](https://github.com/ugate/sqler-oracle)
- [ODBC](https://github.com/ugate/sqler-odbc)

Example<sub id="example"></sub>:
```sql
-- db/finance/read.ap.companies.sql
SELECT CO.COMPANY AS "company", CO.R_NAME AS "name", CO.PAY_GROUP AS "payGroup", CO.TAX_ACCOUNT AS "taxAccount", CO.TAX_ACCT_UNIT AS "taxAcctUnit",
CO.TAX_SUB_ACCT AS "taxSubAcct"
FROM APCOMPANY CO
WHERE CO.INVOICE_AUDIT = :invoiceAudit
ORDER BY CO.COMPANY ASC
```

```js
// replace xxxx with one of the prexisiting vendor implementations
// or roll your own Dialect
const dialect = 'xxxx', dialectModule = `sqler-${dialect}`;
const { Manager } = require('sqler');
const conf = {
  "univ": {
    "db": {
      "myId": {
        "host": "myhost.example.com",
        "username": "myusername",
        "password": "mypassword"
      }
    }
  },
  "db": {
    "dialects": {
      [dialect]: dialectModule
    },
    "connections": [
      {
        "id": "myId",
        "name": "fin",
        "dir": "db/finance",
        "service": "MYSRV",
        "dialect": dialect
      }
    ]
  }
};
const mgr = new Manager(conf);
// initialize connections and set SQL functions
await mgr.init();

// execute the SQL statement and capture the results
const rslts = await mgr.db.fin.read.ap.companies({ binds: { invoiceAudit: 'Y' } });

// after we're done using the manager we should close it
process.on('SIGINT', async function sigintDB() {
  await mrg.close();
  console.log('Manager has been closed');
});
console.log('Manager is ready for use');
```