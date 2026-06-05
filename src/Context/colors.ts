export const getColors = (dark: boolean) => ({
  bg:           dark ? '#111827' : '#f3f4f6',
  card:         dark ? '#1f2937' : '#ffffff',
  cardAlt:      dark ? '#111827' : '#f9fafb',
  border:       dark ? 'rgba(255,255,255,0.05)' : '#e5e7eb',
  borderInput:  dark ? 'rgba(255,255,255,0.1)'  : '#d1d5db',
  toolbar:      dark ? '#1f2937' : '#1e3a5f',
  textPrimary:  dark ? '#f9fafb' : '#111827',
  textSecondary:dark ? '#6b7280' : '#6b7280',
  textMuted:    dark ? '#4b5563' : '#9ca3af',
  inputBg:      dark ? '#1f2937' : '#ffffff',
  iconBg:       dark ? 'rgba(59,130,246,0.15)' : 'rgba(37,99,235,0.1)',
  arrow:        dark ? '#374151' : '#d1d5db',
});