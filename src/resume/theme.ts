export const THEME = {
  page: { width: 595.28, height: 841.89 },
  margin: 43.2,
  fontFamilyDocx: 'Arial',
  nameSize: 20,
  headingSize: 11,
  titleSize: 10.5,
  lineFactor: 1.22,
  bulletIndent: 6,
  textIndent: 16,
  safetyMargin: 0.07,
  color: { text: '111111', accent: '1F3A5F', muted: '444444' },
} as const;
export type Theme = typeof THEME;
export const contentWidth = (): number => THEME.page.width - 2 * THEME.margin;
export const contentHeight = (): number => THEME.page.height - 2 * THEME.margin;
