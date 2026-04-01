# Getting Started

## Install

```bash
npm install sqler
```

## Basic usage

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

## Local docs workflow

```bash
npm install
npm run docs:dev
```

Generate the API reference and build the site:

```bash
npm run docs:build
```
