import { defineConfig } from 'vitepress'
import app from '../../main/package.json'

const repo = 'https://github.com/CyanBalloon/poe-price-checker'
const site = 'https://poe2pricechecker.com/'
const title = 'PoE Price Checker · Price checker for Path of Exile 1 & 2'
const description = 'Now with Path of Exile 1 support. Compare trade listings, filter item modifiers and check league prices in a standalone Windows app for PoE1 and PoE2.'

export default defineConfig({
  title: 'PoE Price Checker',
  titleTemplate: ':title · PoE Price Checker',
  description,
  cleanUrls: true,
  appearance: 'force-dark',
  sitemap: { hostname: site },
  themeConfig: {
    logo: '/images/jeweler.png',
    socialLinks: [{ icon: 'github', link: repo }]
  },
  head: [
    ['link', { rel: 'icon', href: '/images/jeweler.png' }],
    ['meta', { name: 'theme-color', content: '#161511' }]
  ],
  transformHead({ pageData }) {
    if (pageData.relativePath !== 'index.md') return []
    return [
      ['link', { rel: 'canonical', href: site }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:url', content: site }],
      ['meta', { property: 'og:image', content: site + 'images/poe1-price.webp' }],
      ['meta', { property: 'og:image:alt', content: 'A Path of Exile 1 ring in PoE Price Checker' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['script', { type: 'application/ld+json' }, JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'PoE Price Checker',
        alternateName: 'Poe2 Price Checker',
        url: site,
        operatingSystem: 'Windows',
        applicationCategory: 'UtilitiesApplication',
        softwareVersion: app.version,
        description,
        screenshot: site + 'images/poe1-price.webp',
        downloadUrl: repo + '/releases/tag/v' + app.version,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
      })]
    ]
  }
})
