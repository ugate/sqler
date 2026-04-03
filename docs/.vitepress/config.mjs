import { defineConfig } from 'vitepress';

export default defineConfig({
 lang: 'en-US',
 title: 'sqler',
 description: 'Skip the ORM and simplify your SQL execution plans using plain SQL syntax.',
 base: '/sqler/',
 cleanUrls: true,
 head: [
  ['link', { rel: 'icon', type: 'image/png', href: '/sqler/favicon-32x32.png' }]
 ],
//  ignoreDeadLinks: [
//   /^\/?api\/.*$/,
//   /^\.\/(SQLER|Dialect|Manager|Stream\.)/
//  ],
 themeConfig: {
  logo: '/favicon-32x32.png',
  siteTitle: 'sqler',
  nav: [
   { text: 'Guide', link: '/guide/getting-started' },
   { text: 'API', link: '/api/' },
   { text: 'GitHub', link: 'https://github.com/ugate/sqler' },
   { text: 'npm', link: 'https://www.npmjs.com/package/sqler' }
  ],
  sidebar: [
   {
    text: 'Guide',
    items: [
     { text: 'Overview', link: '/' },
     { text: 'Getting Started', link: '/guide/getting-started' },
     { text: 'Manual', link: '/guide/manual' },
     { text: 'Manager', link: '/api/manager' }
    ]
   },
   {
    text: 'API',
    items: [
     { text: 'API Reference', link: '/api/' }
    ]
   }
  ],
  socialLinks: [
   { icon: 'github', link: 'https://github.com/ugate/sqler' }
  ],
  search: {
   provider: 'local'
  },
  footer: {
   message: 'Released under the MIT License.',
   copyright: 'Copyright © ugate'
  }
 }
});
