export const DEFAULT_APP_THEME = 'blue'

const VALID_THEMES = ['emerald', 'blue', 'dark']
let currentAppTheme = DEFAULT_APP_THEME

export const normalizeAppTheme = (theme) => VALID_THEMES.includes(theme) ? theme : DEFAULT_APP_THEME

export const getCachedAppTheme = () => currentAppTheme

export const cacheAppTheme = (theme) => {
    currentAppTheme = normalizeAppTheme(theme)
    return currentAppTheme
}
