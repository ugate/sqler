# Getting Started

## Install {#install}

```bash
npm install sqler
```

## Setup {#setup}

```js
const { Manager } = require('sqler');

const conf = {
  univ: {
    db: {
      myId: {
        host: 'myhost.example.com',
        username: 'myusername',
        password: 'mypassword'
      }
    }
  },
  db: {
    dialects: {
      postgres: 'sqler-postgres'
    },
    connections: [
      {
        id: 'myId',
        name: 'fin',
        dir: 'db/finance',
        service: 'MYSRV',
        dialect: 'postgres'
      }
    ]
  }
};

const mgr = new Manager(conf);
await mgr.init();

const results = await mgr.db.fin.read.ap.companies({
  binds: { invoiceAudit: 'Y' }
});

await mgr.close();
```

## Usage {#usage}
In order to use `sqler` a simple implementation of [Dialect](/api/lib/dialect) should be supplied. There are a few that have already been written for a few enteprise level applications that make use of `sqler`:

- [SQL Server - `sqler-mssql`](https://ugate.github.io/sqler-mssql)
- [Oracle - `sqler-oracle`](https://ugate.github.io/sqler-oracle)
- [MariaDB and/or MySQL - `sqler-mdb`](https://ugate.github.io/sqler-mdb)
- [PostgreSQL - `sqler-postgres`](https://ugate.github.io/sqler-postgres)
- [ODBC - `sqler-odbc`](https://ugate.github.io/sqler-odbc)

### Example Read {#exampleread}
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

console.log('Manager is ready for use');

// execute the SQL statement and capture the results
const rslts = await mgr.db.fin.read.ap.companies({ binds: { invoiceAudit: 'Y' } });

// after we're done using the manager we should close it
process.on('SIGINT', async function sigintDB() {
  await mgr.close();
  console.log('Manager has been closed');
});
```

### Example Write (with implicit transaction) {#examplewrite1}
```sql
-- db/finance/create.ap.companies.sql
INSERT INTO APCOMPANY (COMPANY, R_NAME, PAY_GROUP, TAX_ACCOUNT, TAX_ACCT_UNIT)
VALUES (:company, :name, :payGroup, :taxAccount, :taxAcctUnit);
```

```js
// using the same setup as the read example...

// execute within the an implicit transaction scope
// (i.e. autoCommit === true w/o transaction)
const rslts = await mgr.db.fin.create.ap.company({
  autoCommit: true, // <--- could omit since true is default
  binds: {
    company: 1,
    name: 'Company 1',
    payGroup: 'MYCO1',
    taxAccount: 1234,
    taxAcctUnit: 10000000
  }
});
```

### Example Write (with explicit transaction) {#examplewrite2}
```sql
-- db/finance/create.ap.companies.sql
INSERT INTO APCOMPANY (COMPANY, R_NAME, PAY_GROUP, TAX_ACCOUNT, TAX_ACCT_UNIT)
VALUES (:company, :name, :payGroup, :taxAccount, :taxAcctUnit);
```

```js
// using the same setup as the read example...

// autCommit = false will cause a transaction to be started
const coOpts = {
  autoCommit: false,
  binds: {
    company: 1,
    name: 'Company 1',
    payGroup: 'MYCO1',
    taxAccount: 1234,
    taxAcctUnit: 10000000
  }
};
// autCommit = false will cause a transaction to be continued
const acctOpts = {
  autoCommit: false,
  binds: {
    company: 2,
    name: 'Company 2',
    payGroup: 'MYCO2',
    taxAccount: 5678,
    taxAcctUnit: 20000000
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
  // (i.e. autoCommit === false and transaction = tx)
  const exc1 = await mgr.db.fin.create.ap.company(coOpts);

  // execute within the same transaction scope
  // (i.e. autoCommit === false and transaction = tx)
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