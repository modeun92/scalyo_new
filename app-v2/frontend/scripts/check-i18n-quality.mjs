// I18N-QUALITY (04/09): check-i18n.mjs proves every key EXISTS in the three files. It says nothing
// about whether the three values mean the same thing. This script checks that — the "cracked
// translation" class: a value that is present, so no check fails, and wrong, so a user reads it.
//
// Every rule below fired on real content when it was written. Run it next to check-i18n.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fr from '../src/i18n/fr.js'
import en from '../src/i18n/en.js'
import ko from '../src/i18n/ko.js'

const HANGUL = /[\uAC00-\uD7A3]/
const variables = s => [...String(s).matchAll(/\{[a-zA-Z0-9_]+\}/g)].map(m => m[0]).sort().join(',')
const latinWords = s => String(s).replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).filter(Boolean)

// PLURAL-FORM: vue-i18n `t(key, count)` picks a branch from 'one | many'. Korean has no plural, so
// a single branch there is CORRECT and must not be reported as a variable mismatch.
const isPluralPair = (a, b) => a.includes('|') && !b.includes('|')

const findings = []
const add = (rule, key, detail) => findings.push({ rule, key, detail })

// 0. SOURCE-LEVEL: a value written as \uXXXX escapes instead of the character itself. It renders
//    correctly, so every rule below is blind to it — but the file stops being reviewable by a
//    translator: a Korean sentence spelled as \uc790\uaca9\uc99d\uba85 cannot be proof-read.
//    Escapes are kept ONLY for characters invisible on screen (NBSP, narrow NBSP, thin space, BOM,
//    combining marks) — there the escape IS the readable form.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const INVISIBLE = new Set([0x00a0, 0x202f, 0x2009, 0xfeff])
const isInvisible = cp => INVISIBLE.has(cp) || cp < 0x20 || (cp >= 0x0300 && cp <= 0x036f)
const I18N_DIR = path.join(HERE, '../src/i18n')
for (const file of fs.readdirSync(I18N_DIR).filter(f => f.endsWith('.js'))) {
  fs.readFileSync(path.join(I18N_DIR, file), 'utf8').split('\n').forEach((line, i) => {
    const escaped = [...line.matchAll(/\\u([0-9a-fA-F]{4})/g)].filter(m => !isInvisible(parseInt(m[1], 16)))
    if (escaped.length) add('escaped-source', file + ':' + (i + 1), escaped.length + ' escape(s) — write the character itself')
  })
}

for (const key of Object.keys(fr)) {
  const f = fr[key], e = en[key], k = ko[key]
  if (typeof f !== 'string' || typeof e !== 'string' || typeof k !== 'string') continue

  // 1. An interpolation present in one language and missing in another: the value silently
  //    disappears from the sentence (fr 'Maximum 8 KPIs' vs en 'Maximum {n} KPIs').
  if (!isPluralPair(f, k) && !isPluralPair(e, k)) {
    if (variables(f) !== variables(e) || variables(f) !== variables(k)) {
      add('interpolation', key, `fr[${variables(f)}] en[${variables(e)}] ko[${variables(k)}]`)
    }
  }

  // 2. Wrong script for the file: Korean prose sitting in the French or English dictionary.
  if (HANGUL.test(f)) add('hangul-in-fr', key, f)
  if (HANGUL.test(e)) add('hangul-in-en', key, e)

  // 3. Korean identical to French while English differs: the Korean was never translated.
  if (f === k && f !== e) add('ko-untranslated', key, f)

  // 4. Korean with no Hangul that is exactly the English string, 3+ words: English left in place.
  //    Short values are skipped — product names and acronyms legitimately repeat ('NPS', 'Slack').
  if (!HANGUL.test(k) && k === e && k !== f && latinWords(k).length >= 3) {
    add('ko-is-english', key, k)
  }

  // 5. A multi-line value whose languages have a different number of lines: a translated
  //    procedure that lost or gained a step.
  const lines = s => String(s).split('\n').length
  if (lines(f) !== lines(e) || lines(f) !== lines(k)) {
    add('line-count', key, `fr:${lines(f)} en:${lines(e)} ko:${lines(k)}`)
  }
}

const byRule = {}
for (const f of findings) (byRule[f.rule] ||= []).push(f)

console.log(`i18n quality — ${Object.keys(fr).length} keys checked`)
for (const [rule, list] of Object.entries(byRule)) {
  console.error(`\n❌ ${rule} (${list.length})`)
  for (const f of list.slice(0, 20)) console.error(`   ${f.key}: ${f.detail}`)
  if (list.length > 20) console.error(`   ... +${list.length - 20} more`)
}
if (!findings.length) console.log('✅ no cracked translations found')
process.exit(findings.length ? 1 : 0)
