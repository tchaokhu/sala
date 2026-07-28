// The summary row's labels, shared by the page and its skeleton so the two
// cannot disagree about how many tiles there are or how wide they sit.
// A module of its own because Next validates the exports of page.tsx.

export const TILE_LABELS = [
  'ทรัพย์ทั้งหมด',
  'สัญญาที่ใช้งาน',
  'ครบกำหนดเดือนนี้',
  'ค้างชำระ',
] as const
