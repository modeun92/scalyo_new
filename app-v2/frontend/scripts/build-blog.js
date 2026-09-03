#!/usr/bin/env node
/**
 * Scalyo Blog Build Script
 * Reads markdown articles from src/blog/articles/
 * Generates static HTML pages in dist/blog/[slug]/index.html
 * Generates dist/sitemap.xml
 *
 * Run after vite build: node scripts/build-blog.js
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { marked } from 'marked'
import matter from 'gray-matter'
import { L } from '../src/i18n/landing.js'

const SITE_URL = 'https://scalyo.app'
const DIST_DIR = join(process.cwd(), 'dist')
const ARTICLES_DIR = join(process.cwd(), 'src/blog/articles')
const TEMPLATE_PATH = join(process.cwd(), 'src/blog/template.html')

// ── i18n for static blog pages ──
const i18n = {
  fr: {
    nav_blog: 'Blog', nav_features: 'Fonctionnalités', nav_pricing: 'Tarifs', nav_cta: 'Essai gratuit',
    cta_title: 'Prêt à transformer votre Customer Success ?',
    cta_body: 'Scalyo aide les équipes CS à réduire le churn et augmenter la rétention nette.',
    cta_btn: 'Commencer →',
    sub_title: 'Recevez nos meilleurs contenus CS', sub_desc: 'Stratégies, frameworks et retours d\'expérience pour les leaders Customer Success. Un email par semaine, zéro spam.', sub_placeholder: 'votre@email.com', sub_btn: 'S\'inscrire', sub_privacy: 'Vos données restent privées. Désinscription en un clic.', sub_success: 'Bienvenue ! Vous recevrez notre prochain article.', sub_already: 'Vous êtes déjà inscrit(e).', sub_error: 'Une erreur est survenue, réessayez.',
  },
  en: {
    nav_blog: 'Blog', nav_features: 'Features', nav_pricing: 'Pricing', nav_cta: 'Free Trial',
    cta_title: 'Ready to transform your Customer Success?',
    cta_body: 'Scalyo helps CS teams reduce churn and boost net retention.',
    cta_btn: 'Get started →',
    sub_title: 'Get our best CS content', sub_desc: 'Strategies, frameworks and insights for Customer Success leaders. One email per week, zero spam.', sub_placeholder: 'your@email.com', sub_btn: 'Subscribe', sub_privacy: 'Your data stays private. Unsubscribe in one click.', sub_success: 'Welcome! You\'ll receive our next article.', sub_already: 'You\'re already subscribed.', sub_error: 'Something went wrong, please try again.',
  },
  ko: {
    nav_blog: '블로그', nav_features: '기능', nav_pricing: '요금', nav_cta: '무료 체험',
    cta_title: 'Customer Success를 혁신할 준비가 되셨나요?',
    cta_body: 'Scalyo는 CS 팀의 이탈률 감소와 순유지율 향상을 지원합니다.',
    cta_btn: '시작하기 →',
    sub_title: '최고의 CS 콘텐츠를 받아보세요', sub_desc: 'Customer Success 리더를 위한 전략, 프레임워크, 인사이트. 주 1회 이메일, 스팸 없음.', sub_placeholder: 'your@email.com', sub_btn: '구독하기', sub_privacy: '개인정보는 안전하게 보호됩니다. 원클릭 구독 해지.', sub_success: '환영합니다! 다음 기사를 보내드리겠습니다.', sub_already: '이미 구독 중입니다.', sub_error: '오류가 발생했습니다. 다시 시도해주세요.',
  },
}

// ── Read template ──
const template = readFileSync(TEMPLATE_PATH, 'utf-8')

// ── Read and parse all articles ──
if (!existsSync(ARTICLES_DIR)) {
  console.log('[blog] No articles directory found, skipping blog build')
  process.exit(0)
}

const mdFiles = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.md'))
if (mdFiles.length === 0) {
  console.log('[blog] No articles found, skipping blog build')
  process.exit(0)
}

console.log(`[blog] Building ${mdFiles.length} article(s)...`)

const articles = mdFiles.map(file => {
  const raw = readFileSync(join(ARTICLES_DIR, file), 'utf-8')
  const { data: meta, content } = matter(raw)
  const slug = meta.slug || basename(file, '.md')
  const html = marked(content)

  return { ...meta, slug, html, file }
}).sort((a, b) => new Date(b.date) - new Date(a.date))

// ── Generate HTML for each article ──
for (const article of articles) {
  const {
    slug, title, description, date, category, keywords,
    lang = 'fr', author = 'Scalyo', og_image,
    hreflang_fr, hreflang_en, hreflang_ko,
    html
  } = article

  const articleUrl = `${SITE_URL}/blog/${slug}/`
  const formattedDate = new Date(date).toLocaleDateString(lang === 'ko' ? 'ko-KR' : lang === 'en' ? 'en-US' : 'fr-FR', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  let hreflangTags = ''
  if (hreflang_fr) hreflangTags += `<link rel="alternate" hreflang="fr" href="${SITE_URL}/blog/${hreflang_fr}/" />\n    `
  if (hreflang_en) hreflangTags += `<link rel="alternate" hreflang="en" href="${SITE_URL}/blog/${hreflang_en}/" />\n    `
  if (hreflang_ko) hreflangTags += `<link rel="alternate" hreflang="ko" href="${SITE_URL}/blog/${hreflang_ko}/" />\n    `

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article', headline: title, description,
    author: { '@type': 'Organization', name: author, url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'Scalyo', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/scalyo-logo.png` } },
    datePublished: date, dateModified: article.updated || date,
    mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
    image: og_image || `${SITE_URL}/og-default.png`, keywords: (keywords || []).join(', '), inLanguage: lang,
  })

  const breadcrumbLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Scalyo', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
      { '@type': 'ListItem', position: 3, name: title, item: articleUrl },
    ]
  })

  const t = i18n[lang] || i18n.fr
  const page = template
    .replace(/{{title}}/g, title).replace(/{{description}}/g, description)
    .replace(/{{url}}/g, articleUrl).replace(/{{og_image}}/g, og_image || `${SITE_URL}/og-default.png`)
    .replace(/{{lang}}/g, lang).replace(/{{date}}/g, formattedDate).replace(/{{date_iso}}/g, date)
    .replace(/{{category}}/g, category || '').replace(/{{author}}/g, author)
    .replace(/{{keywords}}/g, (keywords || []).join(', '))
    .replace(/{{hreflang_tags}}/g, hreflangTags).replace(/{{json_ld}}/g, jsonLd)
    .replace(/{{breadcrumb_ld}}/g, breadcrumbLd).replace(/{{content}}/g, html)
    .replace(/{{nav_blog}}/g, t.nav_blog).replace(/{{nav_features}}/g, t.nav_features)
    .replace(/{{nav_pricing}}/g, t.nav_pricing).replace(/{{nav_cta}}/g, t.nav_cta)
    .replace(/{{cta_title}}/g, t.cta_title).replace(/{{cta_body}}/g, t.cta_body)
    .replace(/{{cta_btn}}/g, t.cta_btn)
    .replace(/{{sub_title}}/g, t.sub_title).replace(/{{sub_desc}}/g, t.sub_desc)
    .replace(/{{sub_placeholder}}/g, t.sub_placeholder).replace(/{{sub_btn}}/g, t.sub_btn)
    .replace(/{{sub_privacy}}/g, t.sub_privacy).replace(/{{sub_success}}/g, t.sub_success)
    .replace(/{{sub_already}}/g, t.sub_already).replace(/{{sub_error}}/g, t.sub_error)

  const outDir = join(DIST_DIR, 'blog', slug)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), page)
  console.log(`  ✓ /blog/${slug}`)
}

const BRAND_IMAGES = [
  '/scalyo-logo.png',
  '/scalyo-logo-wordmark.png',
  '/scalyo-logo-wordmark-fond-sombre.png',
  '/scalyo-dashboard.webp',
  '/scalyo-portefeuille-health-scores.webp',
  '/scalyo-planning.webp',
  '/scalyo-playbook-retention.webp',
  '/scalyo-agent-ia.webp',
  '/scalyo-oxygen-bien-etre.webp',
]
const BLOG_THUMBS = []  // rempli plus bas, une fois les articles lus
const PRESS_ALTERNATES = { fr: '/presse/', en: '/press/', ko: '/press-ko/', 'x-default': '/presse/' }
// SEO-I18N : la landing existe a trois URLs. 'ko' est le code ISO 639-1 de la
// langue ; 'kr' (code pays) reste une cle interne de landing.js et ne sort
// jamais dans une URL, un hreflang ou un sitemap.
const LANDING_ALTERNATES = { fr: '/', en: '/en/', ko: '/ko/', 'x-default': '/' }
const STATIC_PAGES = [
  { path: '/',         changefreq: 'weekly',  priority: '1.0', alternates: LANDING_ALTERNATES },
  { path: '/en/',      changefreq: 'weekly',  priority: '0.9', alternates: LANDING_ALTERNATES },
  { path: '/ko/',      changefreq: 'weekly',  priority: '0.9', alternates: LANDING_ALTERNATES },
  { path: '/blog/',    changefreq: 'weekly',  priority: '0.8', images: BLOG_THUMBS },
  { path: '/presse/',  changefreq: 'monthly', priority: '0.6', alternates: PRESS_ALTERNATES, images: BRAND_IMAGES },
  { path: '/press/',   changefreq: 'monthly', priority: '0.6', alternates: PRESS_ALTERNATES, images: BRAND_IMAGES },
  { path: '/press-ko/', changefreq: 'monthly', priority: '0.6', alternates: PRESS_ALTERNATES, images: BRAND_IMAGES },
  { path: '/support',  changefreq: 'monthly', priority: '0.5' },
  { path: '/cgu',      changefreq: 'yearly',  priority: '0.3' },
  { path: '/privacy',  changefreq: 'yearly',  priority: '0.3' },
  { path: '/dpa',      changefreq: 'yearly',  priority: '0.3' },
]
// Pas de <lastmod> sur les pages statiques : une date recalculee a chaque build
// est un signal faux, Google deprecie les lastmod non fiables. Seuls les
// articles, qui portent une vraie date de publication, en declarent un.
// L'extension image du protocole sitemap donne a Google Images les visuels de
// marque : la landing ne contient aucune balise <img>, le kit presse si.
for (const a of articles) BLOG_THUMBS.push(`/scalyo-blog-${a.slug}.webp`)
let sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`
for (const p of STATIC_PAGES) {
  sitemap += `  <url>\n    <loc>${SITE_URL}${p.path}</loc>\n`
  for (const [lang, href] of Object.entries(p.alternates || {})) {
    sitemap += `    <xhtml:link rel="alternate" hreflang="${lang}" href="${SITE_URL}${href}" />\n`
  }
  for (const img of p.images || []) {
    sitemap += `    <image:image><image:loc>${SITE_URL}${img}</image:loc></image:image>\n`
  }
  sitemap += `    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`
}
for (const a of articles) {
  sitemap += `  <url>\n    <loc>${SITE_URL}/blog/${a.slug}/</loc>\n    <lastmod>${a.updated || a.date}</lastmod>\n`
  if (a.og_image) sitemap += `    <image:image><image:loc>${a.og_image.startsWith('http') ? a.og_image : SITE_URL + a.og_image}</image:loc></image:image>\n`
  sitemap += `    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`
}
sitemap += `</urlset>`
writeFileSync(join(DIST_DIR, 'sitemap.xml'), sitemap)
console.log(`  ✓ sitemap.xml (${articles.length + STATIC_PAGES.length} URLs)`)

// ── Index du blog : page statique ──
// La route Vue /blog ne servait aux crawlers que le title statique d'index.html,
// d'où le résultat n°2 mal titré sur la requête de marque « scalyo ». Cette page
// porte son propre title, sa description, ses articles en HTML et son JSON-LD.
// Les libellés d'interface basculent côté client selon navigator.language ;
// le HTML servi reste français, c'est lui que Google indexe.
const IDX = {
  fr: {
    title: 'Blog Customer Success — Scalyo',
    desc: 'Stratégies, playbooks et retours de terrain pour les équipes Customer Success B2B. Le blog de Scalyo.',
    kicker: 'Blog', h1: 'Le blog Scalyo',
    subtitle: 'Stratégies, playbooks et retours de terrain pour les équipes Customer Success.',
    back: '← Retour au site', tagline: 'La plateforme Customer Success',
    nav_home: 'Accueil', nav_press: 'Kit presse', nav_cgu: 'CGU', nav_privacy: 'Confidentialité',
  },
  en: {
    title: 'Customer Success Blog — Scalyo',
    desc: 'Strategies, playbooks and field insights for B2B Customer Success teams. The Scalyo blog.',
    kicker: 'Blog', h1: 'The Scalyo blog',
    subtitle: 'Strategies, playbooks and field insights for Customer Success teams.',
    back: '← Back to site', tagline: 'The Customer Success platform',
    nav_home: 'Home', nav_press: 'Press kit', nav_cgu: 'Terms', nav_privacy: 'Privacy',
  },
  ko: {
    title: 'Customer Success 블로그 — Scalyo',
    desc: 'B2B Customer Success 팀을 위한 전략, 플레이북, 현장 인사이트. Scalyo 블로그.',
    kicker: '블로그', h1: 'Scalyo 블로그',
    subtitle: '고객 성공 팀을 위한 전략, 플레이북 및 베스트 프랙티스',
    back: '← scalyo.app 돌아가기', tagline: 'Customer Success 플랫폼',
    nav_home: '홈', nav_press: '프레스 킷', nav_cgu: '이용약관', nav_privacy: '개인정보처리방침',
  },
}
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cards = articles.map(a => {
  const d = new Date(a.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
  return `    <a class="post" href="/blog/${a.slug}/">
      <img src="/scalyo-blog-${a.slug}.webp" alt="${esc(a.title)} — article du blog Scalyo" width="1200" height="630" loading="lazy" />
      <div class="body">
        <span class="cat">${esc(a.category || 'Customer Success')}</span>
        <h2>${esc(a.title)}</h2>
        <p>${esc(a.description)}</p>
        <time datetime="${a.date}">${d}</time>
      </div>
    </a>`
}).join('\n')

const indexLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Blog',
  '@id': `${SITE_URL}/blog/#blog`,
  url: `${SITE_URL}/blog/`,
  name: IDX.fr.title,
  description: IDX.fr.desc,
  inLanguage: 'fr',
  publisher: { '@id': `${SITE_URL}/#organization` },
  blogPost: articles.map(a => ({
    '@type': 'BlogPosting',
    headline: a.title,
    description: a.description,
    url: `${SITE_URL}/blog/${a.slug}/`,
    datePublished: a.date,
    dateModified: a.updated || a.date,
    image: `${SITE_URL}/og-${a.slug}.png`,
    author: { '@type': 'Organization', name: 'Scalyo', url: SITE_URL },
  })),
}, null, 2)

const i18nScript = `(function(){var D=${JSON.stringify(IDX)};` +
  `var n=(navigator.language||'fr').toLowerCase();` +
  `var l=n.indexOf('ko')===0?'ko':n.indexOf('en')===0?'en':'fr';` +
  `if(l==='fr')return;var t=D[l];` +
  `document.documentElement.lang=l;document.title=t.title;` +
  `var m=document.querySelector('meta[name=\\"description\\"]');if(m)m.setAttribute('content',t.desc);` +
  `document.querySelectorAll('[data-i18n]').forEach(function(e){var k=e.getAttribute('data-i18n');if(t[k])e.textContent=t[k];});` +
  `})();`

const indexHtml = readFileSync(join(process.cwd(), 'src/blog/index-template.html'), 'utf-8')
  .replace(/{{lang}}/g, 'fr')
  .replace(/{{title}}/g, IDX.fr.title)
  .replace(/{{description}}/g, IDX.fr.desc)
  .replace(/{{url}}/g, `${SITE_URL}/blog/`)
  .replace(/{{og_image}}/g, `${SITE_URL}/og-default.png`)
  .replace(/{{kicker}}/g, IDX.fr.kicker)
  .replace(/{{h1}}/g, IDX.fr.h1)
  .replace(/{{subtitle}}/g, IDX.fr.subtitle)
  .replace(/{{back}}/g, IDX.fr.back)
  .replace(/{{tagline}}/g, IDX.fr.tagline)
  .replace(/{{nav_home}}/g, IDX.fr.nav_home)
  .replace(/{{nav_press}}/g, IDX.fr.nav_press)
  .replace(/{{nav_cgu}}/g, IDX.fr.nav_cgu)
  .replace(/{{nav_privacy}}/g, IDX.fr.nav_privacy)
  .replace(/{{cards}}/g, cards)
  .replace(/{{json_ld}}/g, indexLd)
  .replace(/{{i18n_script}}/g, i18nScript)

mkdirSync(join(DIST_DIR, 'blog'), { recursive: true })
writeFileSync(join(DIST_DIR, 'blog', 'index.html'), indexHtml)
console.log(`  ✓ /blog (index statique, ${articles.length} article(s))`)

const indexData = articles.map(({ slug, title, description, date, category, lang, keywords }) => ({ slug, title, description, date, category, lang, keywords }))
mkdirSync(join(DIST_DIR, 'blog'), { recursive: true })
writeFileSync(join(DIST_DIR, 'blog', 'articles.json'), JSON.stringify(indexData, null, 2))
console.log(`  ✓ blog/articles.json`)

// ── FAQPage : donnees structurees de la FAQ de la landing ──
// Les onze questions vivent dans src/i18n/landing.js et ne sont rendues qu'apres
// hydratation : invisibles pour un crawler qui n'execute pas de JS, et surtout
// pour les moteurs de reponse. Le schema les expose en clair dans le HTML servi.
// Source unique : landing.js. Ne jamais recopier une question ici.
const faqPairs = []
for (let i = 1; ; i++) {
  const q = L.fr['faq_q' + i], a = L.fr['faq_a' + i]
  if (!q || !a) break
  faqPairs.push({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })
}
if (faqPairs.length) {
  const faqLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${SITE_URL}/#faq`,
    inLanguage: 'fr',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    mainEntity: faqPairs,
  }, null, 2)
  const indexPath = join(DIST_DIR, 'index.html')
  let html = readFileSync(indexPath, 'utf-8')
  if (html.includes('"@type": "FAQPage"')) {
    console.log('  ! FAQPage deja present dans dist/index.html, injection ignoree')
  } else {
    html = html.replace('</head>', `<script type="application/ld+json">\n${faqLd}\n</script>\n</head>`)
    writeFileSync(indexPath, html)
    console.log(`  ✓ FAQPage injecte dans index.html (${faqPairs.length} questions)`)
  }
}

// ── SEO-I18N : les trois landings ──
// Une route SPA ne sert aux crawlers que le <head> statique d'index.html. Sans
// ces variantes, /en/ et /ko/ porteraient le titre et le canonical francais :
// Google verrait trois fois la meme page et n'en indexerait qu'une.
// Le corps reste la SPA — le routeur lit la langue dans le prefixe d'URL.
// Source unique des libelles : src/i18n/landing.js. Rien n'est recopie ici.
const LANDINGS = [
  { dir: null,  key: 'fr', iso: 'fr', ogLocale: 'fr_FR', url: `${SITE_URL}/` },
  { dir: 'en',  key: 'en', iso: 'en', ogLocale: 'en_US', url: `${SITE_URL}/en/` },
  { dir: 'ko',  key: 'kr', iso: 'ko', ogLocale: 'ko_KR', url: `${SITE_URL}/ko/` },
]

// hreflang reciproques, identiques sur les trois pages.
const hreflangBlock = LANDINGS
  .map(l => `  <link rel="alternate" hreflang="${l.iso}" href="${l.url}" />`)
  .join('\n') + `\n  <link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />`

// Un remplacement qui ne trouve pas sa cible doit casser le build, jamais passer
// en silence : une balise non substituee produirait un canonical francais sur la
// page coreenne, invisible a la compilation et fatal au referencement.
function sub(html, re, replacement, label, file) {
  if (!re.test(html)) throw new Error(`[seo-i18n] ${file} : ${label} introuvable — build interrompu`)
  return html.replace(re, replacement)
}

const faqLdFor = (key, url, iso) => {
  const pairs = []
  for (let i = 1; ; i++) {
    const q = L[key]['faq_q' + i], a = L[key]['faq_a' + i]
    if (!q || !a) break
    pairs.push({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })
  }
  if (!pairs.length) return null
  return JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage', '@id': `${url}#faq`,
    inLanguage: iso, isPartOf: { '@id': `${SITE_URL}/#website` }, mainEntity: pairs,
  }, null, 2)
}

const baseHtml = readFileSync(join(DIST_DIR, 'index.html'), 'utf-8')
const frFaq = faqLdFor('fr', `${SITE_URL}/`, 'fr')

for (const l of LANDINGS) {
  const S = L[l.key]
  for (const k of ['seo_title', 'seo_desc', 'seo_og_desc']) {
    if (!S || !S[k]) throw new Error(`[seo-i18n] cle ${k} absente de landing.js pour "${l.key}" — build interrompu`)
  }
  const file = l.dir ? `dist/${l.dir}/index.html` : 'dist/index.html'
  let html = baseHtml

  html = sub(html, /<html lang="[^"]*">/, `<html lang="${l.iso}">`, '<html lang>', file)
  html = sub(html, /<title>[^<]*<\/title>/, `<title>${S.seo_title}</title>`, '<title>', file)
  html = sub(html, /(<meta name="description" content=")[^"]*(")/, `$1${S.seo_desc}$2`, 'meta description', file)
  html = sub(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${l.url}$2`, 'canonical', file)
  html = sub(html, /(<meta property="og:title" content=")[^"]*(")/, `$1${S.seo_title}$2`, 'og:title', file)
  html = sub(html, /(<meta property="og:description" content=")[^"]*(")/, `$1${S.seo_og_desc}$2`, 'og:description', file)
  html = sub(html, /(<meta property="og:url" content=")[^"]*(")/, `$1${l.url}$2`, 'og:url', file)
  html = sub(html, /(<meta property="og:locale" content=")[^"]*(")/, `$1${l.ogLocale}$2`, 'og:locale', file)
  // og:locale:alternate ne doit pas contenir la locale de la page elle-meme.
  const alts = LANDINGS.filter(o => o.ogLocale !== l.ogLocale)
    .map(o => `  <meta property="og:locale:alternate" content="${o.ogLocale}" />`).join('\n')
  if (!/<meta property="og:locale:alternate"[^>]*>/.test(html)) throw new Error(`[seo-i18n] ${file} : og:locale:alternate introuvable — build interrompu`)
  html = html.replace(/[ \t]*<meta property="og:locale:alternate"[^>]*>\n?/g, '')
  html = sub(html, /([ \t]*<meta property="og:locale" content="[^"]*" \/>)/, `$1\n${alts}`, 'ancrage og:locale:alternate', file)
  html = sub(html, /(<meta name="twitter:title" content=")[^"]*(")/, `$1${S.seo_title}$2`, 'twitter:title', file)
  html = sub(html, /(<meta name="twitter:description" content=")[^"]*(")/, `$1${S.seo_og_desc}$2`, 'twitter:description', file)

  // hreflang : absents du index.html source, ajoutes ici sur les trois pages.
  // Purge d'abord : sans elle, relancer le script sur un dist deja traite
  // empilerait les balises sans qu'aucune erreur ne le signale.
  html = html.replace(/[ \t]*<link rel="alternate" hreflang="[^"]*"[^>]*>\n?/g, '')
  html = sub(html, /(<link rel="canonical"[^>]*>)/, `$1\n${hreflangBlock}`, 'ancrage hreflang', file)

  // FAQPage dans la langue de la page. Sur dist/index.html le bloc francais a
  // deja ete injecte plus haut ; sur les variantes on le remplace.
  const faq = faqLdFor(l.key, l.url, l.iso)
  if (faq && frFaq && l.dir) {
    if (!html.includes(frFaq)) throw new Error(`[seo-i18n] ${file} : bloc FAQPage francais introuvable — build interrompu`)
    html = html.replace(frFaq, faq)
  }

  if (l.dir) {
    mkdirSync(join(DIST_DIR, l.dir), { recursive: true })
    writeFileSync(join(DIST_DIR, l.dir, 'index.html'), html)
  } else {
    writeFileSync(join(DIST_DIR, 'index.html'), html)
  }
  console.log(`  ✓ ${l.dir ? '/' + l.dir + '/' : '/'} — lang=${l.iso}, hreflang x4, FAQPage ${faq ? 'ok' : 'absent'}`)
}

console.log(`[blog] Done — ${articles.length} article(s) built`)
