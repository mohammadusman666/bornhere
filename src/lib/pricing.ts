/** BornHere-style one-time SKUs — display only until payments are wired. */
export const KEEPSAKE = {
  id: 'keepsake',
  name: 'Digital keepsake',
  priceLabel: '$6.99',
  blurb: 'Full story chapters, print-ready certificate, and your sky map — one time, no subscription.',
} as const

export const GIFT = {
  id: 'gift',
  name: 'Gift a story',
  priceLabel: '$9.99',
  blurb:
    'Their certificate, full chapters, and your personal note — a link you can send (email delivery when payments go live).',
} as const

export const PAYMENTS_STATUS =
  'Payments are not live yet. You can preview unlock locally — no card is charged.'
