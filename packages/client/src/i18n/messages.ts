import de from './locales/de'
import en from './locales/en'
import es from './locales/es'
import fr from './locales/fr'
import ja from './locales/ja'
import ko from './locales/ko'
import pt from './locales/pt'
import zh from './locales/zh'
import zhTW from './locales/zh-TW'

export type LocaleMessages = Record<string, unknown>

export const rawMessages = {
  en,
  zh,
  'zh-TW': zhTW,
  ja,
  ko,
  fr,
  es,
  de,
  pt,
} satisfies Record<string, LocaleMessages>

function isPlainObject(value: unknown): value is LocaleMessages {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function mergeMessagesWithFallback(
  fallback: LocaleMessages,
  locale: LocaleMessages,
): LocaleMessages {
  const merged: LocaleMessages = { ...fallback }

  for (const [key, value] of Object.entries(locale)) {
    const fallbackValue = fallback[key]
    merged[key] = isPlainObject(fallbackValue) && isPlainObject(value)
      ? mergeMessagesWithFallback(fallbackValue, value)
      : value
  }

  return merged
}

export const messages = Object.fromEntries(
  Object.entries(rawMessages).map(([locale, localeMessages]) => [
    locale,
    locale === 'en'
      ? localeMessages
      : mergeMessagesWithFallback(en, localeMessages),
  ]),
) as typeof rawMessages
