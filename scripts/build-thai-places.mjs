// Builds lib/thai-places.json — Thailand's provinces, districts and
// subdistricts with postcodes — from kongvut/thai-province-data (MIT),
// https://github.com/kongvut/thai-province-data, folder api/latest.
//
//   node scripts/build-thai-places.mjs <dir holding province.json, district.json, sub_district.json>
//
// Run it again when the source changes (a new district is rare). Codes are the
// official ones: a district's id is its province code and two digits (2007 is
// Si Racha in Chon Buri, 20), a subdistrict's id its district code and two more.
// The source's province ids are its own 1–77, so the province code is read off
// its districts.
//
// Shape, nested arrays so no key repeats 7,436 times:
//   { source, built, provinces: [[code, th, en, [[code, th, en, [[code, th, en, postcode]]]]]] }
// Each level sorted by its Thai name.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) throw new Error('Pass the folder holding the three source files')
const read = (name) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')).filter((r) => !r.deleted_at)
const provinces = read('province')
const districts = read('district')
const subdistricts = read('sub_district')

const byThai = (a, b) => a[1].localeCompare(b[1], 'th')
const code = new Map(districts.map((d) => [d.province_id, Math.floor(d.id / 100)]))

const tree = provinces
  .map((p) => [
    code.get(p.id),
    p.name.th,
    p.name.en,
    districts
      .filter((d) => d.province_id === p.id)
      .map((d) => [
        d.id,
        d.name.th,
        d.name.en,
        subdistricts
          .filter((s) => s.district_id === d.id)
          .map((s) => [s.id, s.name.th, s.name.en, String(s.zip_code).padStart(5, '0')])
          .sort(byThai),
      ])
      .sort(byThai),
  ])
  .sort(byThai)

for (const [pc, pth, , ds] of tree) {
  if (!pc) throw new Error(`${pth} has no districts to read its code from`)
  const names = new Set(ds.map((d) => d[1]))
  if (names.size !== ds.length) throw new Error(`${pth} has two districts with one name`)
  for (const [, dth, , ss] of ds) {
    if (new Set(ss.map((s) => s[1])).size !== ss.length) throw new Error(`${dth} has two subdistricts with one name`)
  }
}

const out = {
  source: 'https://github.com/kongvut/thai-province-data api/latest (MIT)',
  built: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()),
  provinces: tree,
}
writeFileSync(new URL('../lib/thai-places.json', import.meta.url), JSON.stringify(out))
console.log(`${tree.length} provinces, ${districts.length} districts, ${subdistricts.length} subdistricts`)
