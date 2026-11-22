<script setup lang="ts">
import { computed, ref } from 'vue'
import coast from '../../renderer/public/images/lioneyes-watch.webp'
import { version } from '../../main/package.json'

const repository = 'https://github.com/CyanBalloon/poe-price-checker'
const release = repository + '/releases/tag/v' + version
const downloads = repository + '/releases/download/v' + version + '/poe-price-checker-'
const screens = [
  {
    label: 'PoE1 price check', image: 'poe1-price', title: 'Price a Polaric Devastation',
    caption: 'Compare the Opal Ring’s rolls with asking prices in the same league. Above one Divine Orb, the chaos equivalent appears underneath.',
    alt: 'Polaric Devastation in the Path of Exile 1 price checker, with its market estimate, modifiers and trade results.'
  },
  {
    label: 'Item search', image: 'poe1-search', title: 'Keep a few items in view',
    caption: 'Find a unique or currency by name and keep it in your list while you look up the next item.',
    alt: 'The Item Search tab in Path of Exile 1 with selected items, original item artwork and league prices.'
  },
  {
    label: 'PoE2 welcome', image: 'poe2-welcome', title: 'The Lantern Crossing',
    caption: 'Switch to Path of Exile 2 in the same window. Your league selection is remembered separately for each game.',
    alt: 'The Path of Exile 2 welcome screen showing a lantern-lit crossing and the Paste item action.'
  }
]
const selected = ref(0)
const screen = computed(() => screens[selected.value])
</script>

<template>
  <div class="landing">
    <a class="skip" href="#main">Skip to content</a>
    <header class="mast">
      <div class="wrap mast-inner">
        <a class="brand" href="#main"><img src="/images/jeweler.png" width="34" height="34" alt="">PoE Price Checker</a>
        <nav aria-label="Main navigation">
          <a href="#screens">Screenshots</a><a href="#start">Quick start</a>
          <a :href="repository">GitHub <span aria-hidden="true">↗︎</span></a>
        </nav>
      </div>
    </header>
    <main id="main">
      <section class="hero" aria-labelledby="headline">
        <img class="coast" :src="coast" alt="" fetchpriority="high" />
        <div class="wrap hero-inner">
          <p class="edition"><span aria-hidden="true"></span>New in v{{ version }} · PoE1 support</p>
          <h1 id="headline">Price check<br><em>Path of Exile</em> 1 &amp; 2.</h1>
          <p class="intro">Check the item under your cursor, compare its rolls with trade listings, and see what it’s worth in your league.</p>
          <div class="download">
            <a class="install" :href="downloads + 'setup-' + version + '.exe'"><span aria-hidden="true">↓</span> Download for Windows</a>
            <a class="portable" :href="downloads + version + '.exe'">Portable edition <span aria-hidden="true">↗︎</span></a>
          </div>
          <a class="release" :href="release">Windows x64 <span aria-hidden="true">/</span> v{{ version }} release notes</a>
        </div>
      </section>

      <section id="screens" class="wrap gallery" aria-labelledby="gallery-title">
        <div class="gallery-heading">
          <h2 id="gallery-title">Inside the app</h2>
          <div class="switcher" role="group" aria-label="Choose a screenshot">
            <button v-for="(item, i) in screens" :key="item.image" type="button"
              :aria-pressed="selected === i" aria-controls="capture" @click="selected = i">{{ item.label }}</button>
          </div>
        </div>
        <figure id="capture">
          <a class="screen" :href="'/images/' + screen.image + '.webp'" :aria-label="'Open full-size screenshot: ' + screen.label">
            <img :src="'/images/' + screen.image + '.webp'" :alt="screen.alt" width="1280" height="800">
          </a>
          <figcaption aria-live="polite">
            <div><h3>{{ screen.title }}</h3><p>{{ screen.caption }}</p></div>
            <a :href="'/images/' + screen.image + '.webp'">View full size <span aria-hidden="true">↗︎</span></a>
          </figcaption>
        </figure>
      </section>

      <section id="start" class="guide" aria-labelledby="start-title">
        <div class="wrap guide-inner">
          <h2 id="start-title">Your first<br><em>price check.</em></h2>
          <ol>
            <li><h3>Choose your game and league</h3><p>Open PoE Price Checker and use the selectors at the top right. You can switch between PoE1 and PoE2 at any time.</p></li>
            <li><h3>Hover over an item and press <kbd>Ctrl</kbd> + <kbd>D</kbd></h3><p>PoE Price Checker opens the item in its own window. You can also choose Paste item and enter copied item text.</p></li>
            <li><h3>Compare the rolls that matter</h3><p>Expand a modifier group, select the stats you want to match, and run the search. Crafted and fractured mods get their own groups when present.</p></li>
          </ol>
        </div>
      </section>
    </main>
    <footer class="wrap foot">
      <div><strong>PoE Price Checker</strong><p>A community project for Path of Exile players.</p></div>
      <nav aria-label="Project links"><a :href="release">Releases</a><a :href="repository + '/issues'">Report an issue</a><a :href="repository + '/blob/main/LICENSE'">MIT license</a></nav>
    </footer>
  </div>
</template>

<style scoped>
@font-face { font-family: Fontin; src: url('../../renderer/src/assets/font/Fontin-Regular-Hinted.ttf') format('truetype'); font-display: swap; }
@font-face { font-family: Fontin; src: url('../../renderer/src/assets/font/Fontin-Italic-Hinted.ttf') format('truetype'); font-style: italic; font-display: swap; }
.landing { --ink:#161511; --cream:#f5efe5; --muted:#bbb5a9; --amber:#e3ae72; color-scheme:dark; background:var(--ink); color:var(--cream); font:16px/1.55 var(--vp-font-family-base),sans-serif; }
.wrap { width:min(1160px, calc(100% - clamp(40px, 10vw, 160px))); margin-inline:auto; }
h1,h2,h3,p,figure,ol { margin:0; }
h1,h2,.brand,.foot strong,figcaption h3 { font-family:Fontin,Georgia,serif; font-weight:400; }
a,button { color:inherit; }
a:focus-visible,button:focus-visible { outline:2px solid #ffd6a1; outline-offset:4px; }
.skip { position:fixed; transform:translateY(-140%); background:var(--cream); color:var(--ink); padding:8px 16px; z-index:5; }
.skip:focus { transform:translateY(0); }
.mast { background:#13120f; border-bottom:1px solid #322f29; }
.mast-inner,.foot,.gallery-heading,figcaption { display:flex; align-items:center; justify-content:space-between; gap:24px; }
.mast-inner { min-height:70px; }
.brand { display:inline-flex; align-items:center; gap:10px; font-size:25px; }
.brand img { object-fit:contain; }
.brand, nav a { white-space:nowrap; }
nav { display:flex; align-items:center; gap:clamp(14px,3vw,36px); font-size:14px; }
nav a,.release,.portable,figcaption a { text-underline-offset:4px; }
nav a:hover,.release:hover,.portable:hover,figcaption a:hover { text-decoration:underline; }
.hero { position:relative; isolation:isolate; background:#1a1812; overflow:hidden; }
.coast { position:absolute; z-index:-2; inset:0 0 0 auto; width:88%; height:100%; object-fit:cover; object-position:center 49%; }
.hero::before { content:''; position:absolute; z-index:-1; inset:0; background:linear-gradient(90deg,#161511 0%,rgba(22,21,17,.97) 18%,rgba(22,21,17,.82) 37%,rgba(22,21,17,.18) 67%,transparent),linear-gradient(0deg,#161511 0%,rgba(22,21,17,.2) 25%,transparent 60%); }
.hero-inner { padding-block:clamp(74px,8vw,122px) clamp(84px,9vw,140px); }
.edition { display:flex; align-items:center; gap:10px; margin-bottom:20px; color:#f1c28a; font-size:12px; font-weight:650; text-transform:uppercase; letter-spacing:.12em; }
.edition span { width:25px; height:1px; background:currentColor; }
h1 { font-size:clamp(54px,6.5vw,98px); line-height:1.04; letter-spacing:-.045em; }
h1 em,h2 em { color:#f0cf9a; font-style:italic; }
.intro { max-width:435px; color:#e5dfd3; font-size:clamp(16px,1.6vw,19px); margin:22px 0 30px; }
.download { display:flex; gap:clamp(16px,2.5vw,30px); align-items:center; flex-wrap:wrap; }
.install { display:inline-flex; justify-content:center; gap:10px; align-items:center; border-radius:6px; background:#efc98e; color:#231a10; padding:13px 20px; font-size:15px; font-weight:650; }
.install:hover { background:#ffdda9; }
.install span { font-size:20px; line-height:1; }
.portable { font-size:14px; font-weight:550; }
.release { display:inline-block; color:#c4b8a7; font-size:12px; margin-top:16px; }
.release span { margin:0 6px; }
.gallery { padding-block:clamp(34px,5vw,74px) clamp(50px,7vw,100px); }
.gallery-heading { align-items:flex-end; padding-bottom:20px; }
h2 { font-size:clamp(38px,4vw,62px); line-height:1.08; letter-spacing:-.035em; }
.switcher { display:flex; flex-wrap:wrap; gap:4px; }
.switcher button { cursor:pointer; border-radius:5px; font-size:14px; padding:8px 14px; color:var(--muted); }
.switcher button:hover { color:var(--cream); }
.switcher button[aria-pressed="true"] { background:#302a22; color:#f4cf99; }
.screen { display:block; overflow:hidden; border-radius:8px; box-shadow:0 18px 60px #0005; background:#171512; }
.screen img { display:block; width:100%; height:auto; }
figcaption { align-items:flex-start; padding-top:22px; }
figcaption h3 { font-size:26px; line-height:1.25; }
figcaption p,.guide li p,.foot p { margin-top:6px; color:var(--muted); }
figcaption p { max-width:680px; }
figcaption a { color:var(--amber); font-size:14px; white-space:nowrap; margin-top:5px; }
.guide { background:#201e18; padding-block:clamp(48px,7vw,96px); }
.guide-inner { display:grid; grid-template-columns:.9fr 1.3fr; gap:48px; }
.guide ol { list-style:decimal-leading-zero; padding-left:34px; }
.guide li { padding-left:12px; }
.guide li + li { margin-top:24px; padding-top:22px; border-top:1px solid #ffffff16; }
.guide li::marker { color:var(--amber); font-size:13px; font-variant-numeric:tabular-nums; }
.guide h3 { font-size:18px; font-weight:600; line-height:1.5; }
kbd { padding:1px 5px; border-radius:4px; background:#3e3930; font:600 .81em var(--vp-font-family-base); }
.foot { padding-block:32px; }
.foot strong { font-size:22px; }
.foot p { margin-top:2px; font-size:13px; }
.foot nav { color:#d0c6b5; }
@media(max-width:760px) {
  .gallery-heading,.foot { flex-direction:column; align-items:flex-start; gap:15px; }
  .guide-inner { grid-template-columns:1fr; gap:26px; }
  .guide h2 br { display:none; }
  .guide h2 em::before { content:' '; }
  .coast { width:100%; }
  .hero::before { background:linear-gradient(90deg,#161511f0,#161511a8 55%,#16151142),linear-gradient(0deg,#161511,transparent 75%); }
}
@media(max-width:520px) {
  .mast-inner { min-height:62px; gap:12px; }
  .mast nav { gap:14px; font-size:13px; }
  .mast nav a[href^="#"] { display:none; }
  .brand { gap:6px; font-size:21px; }
  .brand img { width:25px; height:25px; }
  .hero-inner { padding-block:78px 54px; }
  .edition { font-size:10px; }
  h1 { font-size:clamp(42px,10.5vw,54px); }
  .switcher { gap:2px; }
  .switcher button { padding:8px; font-size:13px; }
  figcaption { flex-direction:column; gap:6px; }
  .foot nav { flex-wrap:wrap; }
}
</style>
