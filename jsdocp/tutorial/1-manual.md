### 🔧 The Manager
The [Manager](Manager.html) is the entry point for one or more databases/connections. The manager basically consolidates each database connection(s) into a single API. One of the major advantages to this simplistic approach is that service calls from javascript to SQL and back can have no vendor-specific references. That translates into a clean seperation of concerns between the two, allowing SQL changes (or even database swapping) to be made without changing any javascript. In contrast to typical ORM solutions, optimations can be applied directly to the SQL scripts, eliminates javascript edits as SQL scripts evolve, removes the need to generate entity definitions and reduces the complexity of the supporting API (thus making it easier to implement and support additional database vendors/drivers).

> TOC
- [👀 Globals](global.html)
- [⚙️ Setup &amp; Configuration](#conf)
- [🗃️ SQL Files](#sqlf)
  - [1️⃣ Expanded SQL Substitutions](#es)
  - [2️⃣ Fragment Substitutions](#fs)
  - [3️⃣ Dialect Substitutions](#ds)
  - [4️⃣ Version Susbstitutions](#vs)
  - [5️⃣ Raw Substitutions](#rs)
- [💧 Read/Write Streams](#streams)
- [🎬 Transactions](#tx)
- [🍽️ Prepared Statements](#ps)
- [🗄️ Caching SQL](#cache)

#### ⚙️ Setup &amp; Configuration <sub id="conf"></sub>:
There are two types of configuration, _public_ and _private_. Public configurations contain one or more `connections` that will be established during initialization and typically vary depending upon the environment being used (e.g. development, test, ci, production, etc.). See the [manager.connections in the database manager constructor](Manager.html) for a complete listing of public configuration options. Private or _universal_ (`univ`) configuration, on the other hand, is intended to carry sensitive information like connection credentials. Each public connection should contain a `conf.db.connections[].id` that matches a property name in the private configuration `conf.univ.db `. __Both public and private configurations are combined when passed into the [Manager](Manager.html), but shoud be loaded from separate sources__. The following example illustrates this using a matching `myId`:
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
        // global bind variables for all SQLs on connection
        "binds": {
          "blankDate": "01-jan-1700",
          "dateFormat": "yyyy-mm-dd\"T\"hh24:mi:ss.ff3\"Z\""
        },
        "sql": {
          "dialect": dialect
        }
      }
    ]
  }
};
const mgr = new Manager(conf);
// initialize connections and set SQL functions
await mgr.init();

console.log('Manager is ready for use');

// execute the SQL source and capture the results
const rslts = await mgr.db.fin.read.ap.companies({ binds: { invoiceAudit: 'Y' } });

// after we're done using the manager we should close it
process.on('SIGINT', async function sigintDB() {
  await mrg.close();
  console.log('Manager has been closed');
});
```
Each `conf.db.dialect` property should contain all of the [Dialect](Dialect.html) vendor/driver implmentations used by the manager and can be set to either an extending Dialect class or a _path_ to an extended Dialect module. Many Dialects have already been implemented in separate modules that [listed in the README.md](index.html#dialects). The prior example calls `mgr.db.fin.ap.list.companies()` that uses the `conf.db.connections[].name = "fin"` as the property namespace under `db` on the manager instance.

> 💡 TIP: Thrown errors from SQL execution will contain a property called `sqler` that will contain more descriptive error details pertaining to the SQL error.

#### 🗃️ <u>SQL Files</u> <sub id="sqlf"></sub>:
Every SQL file used by `sqler` should be organized in a directory under the directory assigned to `conf.mainPath` (defaults to `process.main` or `process.cwd()`). Each subdirectory used should be _unique_ to an individual `conf.db.connections[].name` (default) or `conf.db.connections[].dir`. When the [Manager](Manager.html) is initialized (i.e. [Manager.init](Manager.html#init)) the directory is scanned for files with an `.sql` extension and generates an [Prepared Function](global.html#SQLERPreparedFunction) for each file that is found. Each [generated SQL function](global.html#SQLERPreparedFunction) will be accessible as a property path of the manager. For instance, a `mainPath` of `/some/sql/path` and a connection with a `conf.db.connections[].name` of `conn1` would look for SQL files under `/some/sql/path/conn1`. If `conf.db.connections[].dir` was set to `otherDir` then SQL files would be prepared from `some/sql/path/otherDir` instead. In either case the [generated prepared SQL function](global.html#SQLERPreparedFunction) would be accessible via `manager.db.conn1.read.something()`, assuming that `read.something.sql` resides in the forementioned directory path. To better visualize path computation, consider the following directory structure and the configuration from the previous example:

```
.
+ -- db
|    + -- finance
|    |    + -- ap
|    |    |    + -- delete.audits.sql
|    |    |    + -- update.audits.sql
|    |    + -- ar
|    |    |    + -- delete.audits.sql
|    |    |    + -- update.audits.sql
|    |    + -- create.annual.report.sql
|    |    + -- read.annual.report.sql
```

The subsequent SQL prepared functions would be gernerated on the manager instance:

- `mgr.db.fin.ap.delete.audits()`
- `mgr.db.fin.ap.update.audits()`
- `mgr.db.fin.ar.delete.audits()`
- `mgr.db.fin.ar.update.audits()`
- `mgr.db.fin.create.annual.report()`
- `mgr.db.fin.read.annual.report()`

Functions are always added to the `db` object within the manager instance. There are two ways to indicate the type of SQL execution that is being performed:

- __An SQL file name can be prefixed with the [CRUD](https://en.wikipedia.org/wiki/Create,_read,_update_and_delete) operation that is being performed (i.e. `create`, `read`, `update` or `delete`)__
- __A [CRUD](https://en.wikipedia.org/wiki/Create,_read,_update_and_delete) operation can be passed into the [generated SQL function](global.html#SQLERPreparedFunction}) using the [`type` option](global.html#SQLERExecOptions)__

Defining the _type_ of CRUD operation helps assist implementing [Dialect](Dialect.html) to determine any supplemental processing that may need to take place (like transactional state).

Most RDMS drivers support _bind variables_ in some form or fashion. The most common of which is the typical syntax commonly associated with unamed or named bind parameters within an SQL source. However, `sqler` provides a few substitutional encapsulators that help with SQL function composition. Each SQL file can define multiple encapsulators that indicates what portions of an SQL source will be present before execution takes place. Substitutions use an openening `[[` and closing `]]` that can also be optionally prefixed with a SQL line comment `--[[`. The following sections discuss the differnt type of substitutions in more detail.

The order of precedence in which substitutions are made:

1. __[Raw Substitutions](#rs)__ - Set when an SQL file is read/cached
1. __[Expanded SQL Substitutions](#es)__ - Set during [prepared function execution](global.html#SQLERPreparedFunction)
1. __[Dialect Substitutions](#ds)__ - Set during [prepared function execution](global.html#SQLERPreparedFunction)
1. __[Version Susbstitutions](#vs)__ - Set during [prepared function execution](global.html#SQLERPreparedFunction)
1. __[Fragment Substitutions](#fs)__ - Set during [prepared function execution](global.html#SQLERPreparedFunction)

#### 1️⃣ Expanded SQL Substitutions <sub id="es"></sub>:
Depending on the underlying dialect support, named parameters typically follow some form of syntactic grammar like `:someParam`, where `someParam` is a parameter passed in to the `sqler` [generated SQL function](global.html#SQLERPreparedFunction}) as the [bind variables](global.html#SQLERExecOptions). There may be instances where _any_ number of variables need to be substituded when an SQL function is executed, but the actual number of variables is unknown at the time the SQL script is written. This can be accomplished in `sqler` by simply adding a single variable to the SQL bind variables and passing them into the prepared function. For instance, passing the following [bind variables](global.html#SQLERExecOptions) JSON into the `sqler` [generated SQL function](global.html#SQLERPreparedFunction}):
<br/><br/>__[bind variables](global.html#SQLERExecOptions):__
```json
{
  "someParam": ["one","two","three"]
}
```
__read.some.query.sql__
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE SOME_COL IN (:someParam)
```
Would result in the following parameters and SQL execution
<br/><br/>__[bind variables](global.html#SQLERExecOptions) passed into the driver used by the implementing [Dialect](Dialect.html):__
```json
{
  "someParam": "one",
  "someParam1": "two",
  "someParam2": "three"
}
```
__read.some.query.sql ---> read.some.query({ binds })__
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE SOME_COL IN (:someParam, :someParam1, :someParam2)
```

🆚 Expansions can also use conjunctive `AND` or `OR` instead of the previous _comma separated_ expansions.
```json
{
  "someParam": ["one","two","three"]
}
```
__read.some.query.sql__
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE [[OR UPPER(SOME_COL) = UPPER(:someParam)]]
```
Would result in the following parameters and SQL execution
<br/><br/>__[bind variables](global.html#SQLERExecOptions) passed into the driver used by the implementing [Dialect](Dialect.html):__
```json
{
  "someParam": "one",
  "someParam1": "two",
  "someParam2": "three"
}
```
__read.some.query.sql ---> read.some.query({ binds })__
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE UPPER(SOME_COL) = UPPER(:someParam) OR UPPER(SOME_COL) = UPPER(:someParam1) OR UPPER(SOME_COL) = UPPER(:someParam2)
```

The normal driver driven variable substitutions would then be handled/applied external to `sqler`.

#### 2️⃣ Fragment Substitutions <sub id="fs"></sub>:
The second type of replacement involves SQL script segments that are fragmented by use case. An example would be where only a portion of the SQL script will be included when `frags` is passed into the [generated SQL function](global.html#SQLERPreparedFunction}) that matches a key found in the SQL script that's surrounded by an open (e.g. `[[? someKey]]`) and closing (i.e. `[[?]]`) fragment definition. For instance if `frags` is passed into a managed SQL function that contains `['someKey']` for a SQL script:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE SOME_COL = 'test'
[[? someKey]] AND SOME_COL2 IS NOT NULL [[?]]
```
the resulting SQL script will become:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE SOME_COL = 'test'
AND SOME_COL2 IS NOT NULL
```
When `frags` is omitted or `frags` contains an array that does not contain a `somekey` value, then the resulting SQL script would become:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE SOME_COL = 'test'
```

> __NOTE: Fragment substitutions cannot be nested__

#### 3️⃣ Dialect Substitutions <sub id="ds"></sub>:
A third type of replacement is dialect specific and allows for SQL files that, for the most part are ANSI compliant, but may have slight deviations in syntax that's specific to an individual database vendor. SQL files can coexist between database vendors, but segments of the SQL script will only be included when executed under a database within a defined dialect. An example would be the use of `SUBSTR` in Oracle versus the ANSI* use of `SUBSTRING`. A SQL file may contain:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE
[[! oracle]]
SOME_COL = SUBSTR(SOME_COL, 1, 1)
[[!]]
[[! mssql]]
SOME_COL = SUBSTRING(SOME_COL FROM 1 FOR 1)
[[!]]
```
If an `oracle` dialect were to be used the resulting SQL would become:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE
SOME_COL = SUBSTR(SOME_COL, 1, 1)
```
If a `mssql` dialect were to be used the resulting SQL would become:
```sql
SELECT SOME_COL
FROM SOME_TABLE
WHERE
SOME_COL = SUBSTRING(SOME_COL FROM 1 FOR 1)
```

> __NOTE: Dialect substitutions cannot be nested__

#### 4️⃣ Version Susbstitutions <sub id="vs"></sub>:
Sometimes programs connect to DBs that are shared accross one or more applications. Some portions of a program may need to execute SQL scripts that are similar in nature, but have some versioning discrepancies between database instances. Say we have a database instance for an up-and-coming version that has some modifications made to it's structure, but is not enough to warrent two separate copies of the same SQL script file. It may make more sense to maintain one copy of a SQL file and account for the discrepancies within the SQL file. We can do so by encapsulating the SQL segment by surrounding it with an opening `[[version = 1]]` and closing `[[version]]` key (valid version quantifiers can be `=`, `<`, `>`, `<=`, `>=` or `<>`). So, if there were a SQL file that contained:
```sql
SELECT
[[version <= 1]]
SOME_OLD_COL
[[version]]
[[version > 1]]
SOME_NEW_COL
[[version]]
FROM SOME_TABLE
```
When the `sqler` managed connection configuration contained `version` with a value of `1` (or any value less than one) then the resulting SQL would become:
```sql
SELECT
SOME_OLD_COL
FROM SOME_TABLE
```
Likewise, a `version` of `1.5` would result in the following SQL:
```sql
SELECT
SOME_NEW_COL
FROM SOME_TABLE
```

> __NOTE: Version substitutions cannot be nested__

#### 5️⃣ Raw Susbstitutions <sub id="rs"></sub>:
There are some occasions where substitutions need to be made directly on the SQL unconditionally. One such case would be environmental conditions that may warrant the use of raw substitutions. Lets consider a scenario where a SQL file contains a [schema](https://en.wikipedia.org/wiki/Database_schema) that is differnt for a _production_ environment than it is in a _test_ environment since they occupy the same [tablespace](https://en.wikipedia.org/wiki/Tablespace). Assuming the SQL is referencing a schema that is not the the default schema where it can be ommitted from the SQL altogether, there would be some challanges to overcome to achieve consistecy in a single SQL file. The subsequent example illustrates how this can be accomplished via the [Manager constructor `conf.db.connections[].substitutes`](Manager.html):

__Test environment configuration:__
```json
{
  // other config here
  "db": {
    // other config here
    "connections": [
      {
        // other config here
        "substitutes": {
          "SOME_DB": "SOME_DB_TEST"
        }
      }
    ]
  }
}
```

```sql
SELECT ST.COME_COL
FROM SOME_DB.SOME_TABLE ST
```
When the `sqler` managed connection configuration contained the previously defined `conf.db.connections[].substitutes` the resulting SQL would become:
```sql
SELECT ST.COME_COL
FROM SOME_DB_TEST.SOME_TABLE ST
```

#### 💧 Read/Write Streams <sub id="streams"></sub>:
[Streaming](https://nodejs.org/api/stream.html) is a useful technique for reading/writting a large number of records and is very similar to normal reads/writes using the [`stream` option](global.html#SQLERExecOptions):

Example reads:
```js
// tell sqler to return stream.Readable
const rslts = await mgr.db.read.something({ stream: true });
// rows are one or more stream.Readable
for (let readStream of rslts.rows) {
  // aync iterate over the stream.Readable to capture the rows
  for await (const row of readStream) {
    console.log('My read row', row);
  }
}
```

Example writes:
```js
const Stream = require('stream');
// node >= v16 :
// const { pipeline } = require('stream/promises');
// node < 16 :
const Util = require('util');
const pipeline = Util.promisfy(Stream.pipeline);

// tell sqler to return stream.Writable
const rslts = await mgr.db.update.something({ stream: true });
// rows are one or more stream.Writable
for (let writeStream of rslts.rows) {
  await pipeline(
    Stream.Readable.from(async function* reads() {
      for (let i = 0; i < 10000 /* lets generates some records */; i++) {
        yield { myField: i };
      }
    }()),
    writeStream
  );
}
```

> NOTE : Read streams expect [`objectMode = true`](https://nodejs.org/api/stream.html#stream_readable_readableobjectmode). Write streams expect [`objectMode = true`](https://nodejs.org/api/stream.html#stream_writable_writableobjectmode).

#### 🎬 Transactions <sub id="tx"></sub>:
[Transactions](https://en.wikipedia.org/wiki/Database_transaction) are managed by [Dialect.beginTransaction](Dialect.html#beginTransaction) and are accessible via `await manager.db[myConnectionName].beginTransaction()`. Each call to `beginTransaction` accepts an _optional_ [Transaction Options](global.html#SQLERTransactionOptions) argument and returns a unique [Transaction](global.html#SQLERTransaction) with an ID that can be passed as the `transactionId` option in subsequent [Prepared Function](global.html#SQLERPreparedFunction) calls. Generated transaction IDs helps to isolate executions to a single open connection in order to prevent inadvertently making changes on database connections used by other transactions that may also be in progress. Amoung other properties, each [Transaction](global.html#SQLERTransaction) contains the following functions used to finalize a transaction:

- `commit` - Commits any pending changes from one or more previously invoked SQL script
- `rollback` - Rolls back any pending changes from one or more previously invoked SQL script

 Calling the the forementioned `commit` is not always necessary since there are a few different techniques for handling transactions. The simplest form is when executing a single SQL script where the _default_ setting is used for `autoCommit = true`.

 ```js
 // autoCommit = true is the default
const coOpts = {
  binds: {
    id: 123,
    name: 'Company 1'
  }
};

// begins/commits a transaction in a
// single step (i.e. autoCommit = true)
const exec1 = await mgr.db.fin.create.ap.company(coOpts);
 ```

 Lets say there are multiple SQL scripts that need to be included in a single transaction. To do so, the `autoCommit` flag can be set to _true_ on the last transaction being executed. Also, to ensure every SQL script that is executed be performed within the same transaction scope, a `transactionId` should be set to the same value for every SQL execution that needs to be included within the same transaction. Calling `const tx = await manager.db.myConnectionName.beginTransaction()` will generate/return a [transaction](global.html#SQLERTransaction) that contains a unique `id` that can be passed into each [prepared function](global.html#SQLERPreparedFunction) [options](global.html#SQLERExecOptions).

```js
// autCommit = false requires a transaction to be set
const coOpts = {
  autoCommit: false,
  binds: {
    id: 123,
    name: 'Company 1'
  }
};
// autCommit = true will cause the transaction to be
// automatically committed after execution
const acctOpts = {
  autoCommit: true,
  binds: {
    id: 456,
    name: 'Account 1'
  }
};

let tx;
try {
  // start a transaction
  tx = await mgr.db.fin.beginTransaction();

  // set the transaction ID on the execution options
  // so the company/account SQL execution is invoked
  // within the same transaction scope
  coOpts.transactionId = tx.id;
  acctOpts.transactionId = tx.id;

  // execute within a transaction scope
  // (i.e. autoCommit = false and transactionId = tx.id)
  const exc1 = await mgr.db.fin.create.ap.company(coOpts);

  // execute within the same transaction scope
  // and commit after the satement has executed
  // (i.e. autoCommit = true and transactionId = tx.id)
  const exc2 = await mgr.db.fin.create.ap.account(acctOpts);
} catch (err) {
  if (tx) {
    // use the transaction to rollback the changes
    await tx.rollback();
  }
  throw err;
}
```

We could of explicity called commit instead of setting `autoCommit` to _true_ on the final SQL script execution:

```js
// autCommit = false will cause a transaction to be started
const coOpts = {
  autoCommit: false,
  binds: {
    id: 123,
    name: 'Company 1'
  }
};
// autCommit = false will cause a transaction to be continued
const acctOpts = {
  autoCommit: false,
  binds: {
    id: 456,
    name: 'Account 1'
  }
};

let tx;
try {
  // start a transaction
  tx = await mgr.db.fin.beginTransaction();

  // set the transaction ID on the execution options
  // so the company/account SQL execution is invoked
  // within the same transaction scope
  coOpts.transactionId = tx.id;
  acctOpts.transactionId = tx.id;

  // execute within the a transaction scope
  // (i.e. autoCommit = false and transactionId = tx.id)
  const exc1 = await mgr.db.fin.create.ap.company(coOpts);

  // execute within the same transaction scope
  // (i.e. autoCommit = false and transactionId = tx.id)
  const exc2 = await mgr.db.fin.create.ap.account(acctOpts);

  // use the transaction to commit the changes
  await tx.commit();
} catch (err) {
  if (tx) {
    // use the transaction to rollback the changes
    await tx.rollback();
  }
  throw err;
}
```

The previous transaction examples execute the SQL script in _series_, but they can also be executed in _parallel_. However, doing so requires that all the SQL executions use the same `transaction` and that `autoCommit` is set to _false_ since __executing in _parallel_ does not guarantee the order in which the SQL scripts are executed__.

```js
// autCommit = false will cause a transaction to be started
const coOpts = {
  autoCommit: false,
  binds: {
    id: 123,
    name: 'Company 1'
  }
};
// autCommit = false will cause a transaction to be continued
const acctOpts = {
  autoCommit: false,
  binds: {
    id: 456,
    name: 'Account 1'
  }
};

let tx;
try {
  // start a transaction
  tx = await mgr.db.fin.beginTransaction();

  // set the transaction ID on the execution options
  // so the company/account SQL execution is invoked
  // within the same transaction scope
  coOpts.transactionId = tx.id;
  acctOpts.transactionId = tx.id;

  // execute within the same transaction scope
  // (i.e. autoCommit = false and transactionId = tx.id)
  const coProm = mgr.db.fin.create.ap.company(coOpts);

  // execute within the same transaction scope
  // (i.e. autoCommit = false and transactionId = tx.id)
  const acctProm = mgr.db.fin.create.ap.account(acctOpts);

  // wait for the parallel executions to complete
  const exc1 = await coProm;
  const exc2 = await acctProm;

  // use the transaction to commit the changes
  await tx.commit();
} catch (err) {
  if (tx) {
    // use the transaction to rollback the changes
    await tx.rollback();
  }
  throw err;
}
```
> __It's imperative that `commit` or `rollback` be called when using `beginTransaction()` and [`autoCommit = false` option](global.html#SQLERExecOptions) is set within a transaction since the underlying connection is typically left open until one of those functions are invoked. Not doing so could quickly starve available connections! It's also equally important not to have more transactions in progress than what is available in the connection pool that is being used by the underlying dialect.__

#### 🍽️ Prepared Statements <sub id="ps"></sub>
[Prepared statements](https://en.wikipedia.org/wiki/Prepared_statement) __may__ optimize SQL execution when invoking the same SQL script multiple times. When bind parameters are used, different values can also be passed into the [prepared function](global.html#SQLERPreparedFunction).

In `sqler`, prepared statements are handled internally via a chosen [Dialect](Dialect.html) vendor implementation. Only the [`prepareStatement = true` flag](global.html#SQLERExecOptions) needs to be set to indicate the underlying SQL script should be executed within a __dedicated request and/or connection__ from the pool. Once all of the SQL invokations are complete a call to `unprepare` from the [execution result](global.html#SQLERExecResults) will ensure the statement/connection is closed.

Lets consider the following examples:

```js
// prepareStatemnt = true will create a prepared statement
const coOpts1 = {
  prepareStatemnt: true,
  binds: {
    id: 1,
    name: 'Company 1'
  }
};
// prepareStatemnt = true will use the in-progress prepared statement
const coOpts2 = {
  prepareStatemnt: true,
  binds: {
    id: 2,
    name: 'Company 2'
  }
};

let exc1, exc2;
try {
  // prpare statement and execute the SQL script
  // (i.e. prepareStatement = true)
  const coProm1 = mgr.db.fin.create.ap.company(coOpts1);
  const coProm2 = mgr.db.fin.create.ap.company(coOpts2);

  // wait for the parallel executions to complete
  exc1 = await coProm1;
  exc2 = await coProm2;
} finally {
  if (exc1) {
    // can call either exc1.unprepare() or exc2.unprepare()
    await exc1.unprepare();
  }
}
```

Prepared statements can also be contained within a [transaction](#tx). When doing so, calls to `commit` or `rollback` on the [transaction](global.html#SQLERTransaction) will _implicitly_ call `unprepare` for each [execution result](global.html#SQLERExecResults) that used the same [transaction](global.html#SQLERTransaction) on the [execution options](global.html#SQLERExecOptions) that is passed into the [prepared function](global.html#SQLERPreparedFunction).

```js
// autCommit = false will cause a transaction to be started
// prepareStatemnt = true will create a prepared statement
const coOpts1 = {
  autoCommit: false,
  prepareStatemnt: true,
  binds: {
    id: 1,
    name: 'Company 1'
  }
};
// autCommit = false will cause a transaction to be continued
// prepareStatemnt = true will use the in-progress prepared statement
const coOpts2 = {
  autoCommit: false,
  prepareStatemnt: true,
  binds: {
    id: 2,
    name: 'Company 2'
  }
};

let tx;
try {
  // start a transaction
  tx = await mgr.db.fin.beginTransaction();

  // set the transaction ID on the execution options
  // so the company/account SQL execution is invoked
  // within the same transaction scope
  coOpts1.transactionId = tx.id;
  coOpts2.transactionId = tx.id;

  // execute within the same transaction scope
  // (i.e. autoCommit === false, transactionId = tx.id, prepareStatement = true)
  const coProm1 = mgr.db.fin.create.ap.company(coOpts1);
  const coProm2 = mgr.db.fin.create.ap.account(coOpts2);

  // wait for the parallel executions to complete
  const exc1 = await coProm1;
  const exc2 = await coProm2;

  // use the transaction to commit the changes
  // (commit will implicitly invoke unprepare)
  await tx.commit();
} catch (err) {
  if (tx) {
    // use the transaction to commit the changes
    // (rollback will implicitly invoke unprepare)
    await tx.rollback();
  }
  throw err;
}
```

> __It's imperative that `unprepare` (or `commit`/`rollback` when using a [transaction](#tx)) is called when using [`prepareStatement = true` is set](global.html#SQLERExecOptions) since the underlying connection is typically left open until the `unprepare` function is invoked. Not doing so could quickly starve available connections! It's also equally important not to have more __active__ prepared statements in progress than what is available in the connection pool that is being used by the underlying dialect.__

#### 🗄️ Caching SQL <sub id="cache"></sub>:
By default all SQL files are read once during [Manager.init](Manager.html#init), but there are other options for controlling the frequency of the SQL file reads by passing a [cache container (see example)](global.html#SQLERCache) into the [Manager constructor](Manager.html#Manager) or by calling [Manager.setCache](Manager.html#setCache).

Since `sqler` expects SQL files to be defined prior to [initialization](Manager.html#init), there are several techniques that can be used to produce and maintain evolving SQL statements:
 1. Add/generate SQL files before [Manager.init](Manager.html#init)
 1. Add/generate SQL files, then add the connection for them later using [Manager.addConnection](Manager.html#addConnection)

If using any of the forementioned strategies isn't enough, SQL files can be changed and either the SQL key can be dropped from the cache or the entire cache can be removed (and alternately set back):
```js
// see SQLERCache for setting up a cache
const mgr = new Manager(conf, cache);
await mgr.init();
// ... make some changes to the SQL files here

// ===== Option 1 =====
// drop the key from the cache for the SQL file
// being changed
const key = await mgr.getCacheKey('/absolute/path/to/sql/file.sql', 'myConnName');
cache.drop(key);

// ===== Option 2 =====
// clear the entire cache so that all SQL
// files will be read on the next execution
await mgr.setCache(null, 'myConnName');
// set the cache back?
await mgr.setCache(cache, 'myConnName');
```