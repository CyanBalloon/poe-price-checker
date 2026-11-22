import { defineConfig, type HeadConfig } from 'vitepress'
import app from '../../main/package.json'

const repo = 'https://github.com/CyanBalloon/poe-price-checker'
const site = 'https://poe2pricechecker.com/'
const name = 'PoE Price Checker'
const release = repo + '/releases/tag/v' + app.version
const installer = repo + '/releases/download/v' + app.version + '/poe-price-checker-setup-' + app.version + '.exe'
const cover = '/images/poe-price-checker-cover.jpg'

export default defineConfig({
  title: name,
  titleTemplate: false,
  description: 'A free Windows item price checker for Path of Exile 1 and Path of Exile 2.',
  cleanUrls: true,
  appearance: 'force-dark',
  sitemap: { hostname: site },
  themeConfig: {
    logo: '/images/poe-price-checker.png',
    nav: [
      { text: 'PoE1 guide', link: '/poe1-price-checker/' },
      { text: 'PoE2 guide', link: '/poe2-price-checker/' },
      { text: 'Download', link: '/#download' }
    ],
    socialLinks: [{ icon: 'github', link: repo }]
  },
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#161511' }]
  ],
  transformPageData(page) {
    if (page.isNotFound) {
      page.frontmatter.head = [['meta', { name: 'robots', content: 'noindex' }]]
      return
    }

    const home = page.relativePath === 'index.md'
    const path = page.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
    const canonical = new URL(path, site).href
    const image = new URL(page.frontmatter.socialImage ?? cover, site)
    const isCover = image.pathname === cover
    const alt = page.frontmatter.socialImageAlt ?? name
    const head: HeadConfig[] = [
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { name: 'robots', content: 'max-image-preview:large' }],
      ['meta', { property: 'og:site_name', content: name }],
      ['meta', { property: 'og:type', content: home ? 'website' : 'article' }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { property: 'og:title', content: page.title }],
      ['meta', { property: 'og:description', content: page.description }],
      ['meta', { property: 'og:image', content: image.href }],
      ['meta', { property: 'og:image:alt', content: alt }],
      ['meta', { property: 'og:image:width', content: isCover ? '1200' : '1280' }],
      ['meta', { property: 'og:image:height', content: isCover ? '630' : '800' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: page.title }],
      ['meta', { name: 'twitter:description', content: page.description }],
      ['meta', { name: 'twitter:image', content: image.href }],
      ['meta', { name: 'twitter:image:alt', content: alt }]
    ]

    if (home) {
      head.push(['script', { type: 'application/ld+json' }, JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite', '@id': site + '#website',
            name, url: site, about: { '@id': site + '#app' }
          },
          {
            '@type': 'SoftwareApplication', '@id': site + '#app',
            name, alternateName: 'Poe2 Price Checker', url: site, sameAs: repo,
            description: page.description, operatingSystem: 'Windows',
            applicationCategory: 'UtilitiesApplication', softwareVersion: app.version,
            license: repo + '/blob/main/LICENSE', downloadUrl: installer, releaseNotes: release,
            screenshot: ['poe1-price', 'poe1-search', 'poe2-welcome'].map(file => site + 'images/' + file + '.webp'),
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', url: release }
          }
        ]
      })])
    }
    page.frontmatter.head = [...(page.frontmatter.head ?? []), ...head]
  }
})
