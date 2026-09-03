import fr from '../src/i18n/fr.js'
import en from '../src/i18n/en.js'
import ko from '../src/i18n/ko.js'

function getKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, val]) =>
    typeof val === 'object' && val !== null && !Array.isArray(val)
      ? getKeys(val, prefix ? `${prefix}.${key}` : key)
      : [prefix ? `${prefix}.${key}` : key]
  )
}

const frKeys = new Set(getKeys(fr))
const enKeys = new Set(getKeys(en))
const koKeys = new Set(getKeys(ko))

const missingEN = [...frKeys].filter(k => !enKeys.has(k))
const missingKO = [...frKeys].filter(k => !koKeys.has(k))
const extraEN = [...enKeys].filter(k => !frKeys.has(k))
const extraKO = [...koKeys].filter(k => !frKeys.has(k))

console.log(`FR: ${frKeys.size} | EN: ${enKeys.size} | KO: ${koKeys.size}`)

if (missingEN.length) { console.error(`❌ Missing in EN (${missingEN.length}):`, missingEN.slice(0, 10).join(', '), missingEN.length > 10 ? `... +${missingEN.length - 10}` : '') }
if (missingKO.length) { console.error(`❌ Missing in KO (${missingKO.length}):`, missingKO.slice(0, 10).join(', '), missingKO.length > 10 ? `... +${missingKO.length - 10}` : '') }
if (extraEN.length) { console.warn(`⚠️ Extra in EN (${extraEN.length}):`, extraEN.slice(0, 5).join(', ')) }
if (extraKO.length) { console.warn(`⚠️ Extra in KO (${extraKO.length}):`, extraKO.slice(0, 5).join(', ')) }

if (!missingEN.length && !missingKO.length && !extraEN.length && !extraKO.length) {
  console.log('✅ 100% i18n parity — all keys match across FR/EN/KO')
}
