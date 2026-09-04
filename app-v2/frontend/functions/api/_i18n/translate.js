// SERVER-I18N (04/09): the server-side t(). Replaces functions/api/_i18n/messages.js, which held
// its OWN { fr, en, ko } table — a second translation home next to src/i18n, invisible to
// scripts/check-i18n.mjs. There is now exactly one place a translation lives: src/i18n/.
//
// The dictionaries are plain `export default { key: 'value' }` objects with no imports of their
// own, so they load unchanged in the Workers runtime — no Vite alias, no vue-i18n, no DOM.
//
// Interpolation is `{name}`, the same syntax vue-i18n uses on the front end, so one string can be
// rendered by either side without being rewritten.
import fr from '../../../src/i18n/fr.js'
import en from '../../../src/i18n/en.js'
import ko from '../../../src/i18n/ko.js'

const DICTIONARIES = { fr, en, ko }

// Same contract as the old messages.js t(): unknown key → the key itself (visible, never blank);
// unknown language → English, then the key.
export function t(key, lang = 'fr', vars = null) {
  const dictionary = DICTIONARIES[lang] || DICTIONARIES.en
  let out = dictionary[key] || DICTIONARIES.en[key] || key
  if (vars) {
    for (const name of Object.keys(vars)) {
      out = out.split('{' + name + '}').join(String(vars[name]))
    }
  }
  return out
}
