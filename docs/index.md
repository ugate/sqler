---
layout: home

hero:
  name: sqler
  text: SQL-first execution plans for Node.js
  tagline: Skip the ORM and generate executable functions directly from SQL files.
  image:
    src: /android-chrome-192x192.png
    alt: sqler
  actions:
    - theme: brand
      text: Getting Started
      link: /guide/getting-started
    - theme: brand
      text: Manual
      link: /guide/manual
    - theme: alt
      text: API Reference
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/ugate/sqler

features:
  - icon: 🗃️
    title: File-based SQL execution
    details: Generate object paths and execution functions directly from your SQL file layout.
  - icon: 💬
    title: Dialect-aware substitutions
    details: Support dialect, version, fragment, and expansion substitutions without an ORM layer.
  - icon: ⚡
    title: Transactions and streaming
    details: Use explicit or implicit transactions plus read and write streaming for large workloads.
---

# sqler {#details}

`sqler` is a Node.js manager for RDBMS systems that autogenerates and manages SQL execution functions from underlying 💯% SQL systax within statement files.

- [Autogeneration of object paths and prepared statement functions](/guide/manual) that coincide with SQL file paths
- Debugging options that allow for near real time updates to [SQL files](/guide/manual#sqlf) without restarting an application
- [Expanded SQL substitutions](/guide/manual#es), [fragment substitutions](/guide/manual#fs), [dialect specific substitutions](/guide/manual#ds) and [version specific substitutions](/guide/manual#vs)
- [Simplified transaction management](/guide/manual#tx)
- [Simplified prepared statement management](/guide/manual#ps)
- [Fast read and write streaming support for __large reads/writes__](/guide/manual#streams)
- Using SQL vs ORM/API solutions minimizes overhead and maximizes optimal utilization of SQL syntax and DBA interaction and reduces over-fetching that is commonly assocaited with ORM
- Unlike strict ORM/API based solutions, models are generated on the fly- lending itself to a more flexible function-centric design
