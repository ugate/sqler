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
  - title: File-based SQL execution
    details: Generate object paths and execution functions directly from your SQL file layout.
  - title: Dialect-aware substitutions
    details: Support dialect, version, fragment, and expansion substitutions without an ORM layer.
  - title: Transactions and streaming
    details: Use explicit or implicit transactions plus read and write streaming for large workloads.
---

# sqler

`sqler` is a Node.js manager for RDBMS systems that autogenerates and manages SQL execution functions from underlying SQL statement files.
