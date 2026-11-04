/**
 * Marks a data-table string for translation at render time.
 * Kept outside the React i18n module so server-side catalogue tests can import it.
 */
export const ti = (text: string): string => text
