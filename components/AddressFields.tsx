'use client'

// A Building's province → district → subdistrict → postcode, picked in order.
//
// Only Province is open at first. Choosing one fetches that province's
// districts (app/places/[province]) and opens District; choosing a district
// fetches its subdistricts and opens Subdistrict; the subdistrict fills the
// postcode, which is read-only. Changing a level empties everything below it.
// One level at a time so the browser never loads the whole country.
//
// It posts codes; the action turns them into the Thai names it stores and takes
// the postcode from the list, not from here (lib/thai-places.ts).

import { useRef, useState } from 'react'
import type { AddressInitial, Place } from '@/lib/thai-places'
import { Combobox } from './Combobox'
import { Field } from './form'
import { Bar } from './Skeleton'
import { INPUT } from './styles'

type LevelState = Place[] | 'loading' | 'failed' | null

export function AddressFields({
  provinces,
  initial,
  disabled,
}: {
  provinces: Place[]
  initial?: AddressInitial
  disabled?: boolean
}) {
  const [province, setProvince] = useState(initial?.province ?? '')
  const [district, setDistrict] = useState(initial?.district ?? '')
  const [subdistrict, setSubdistrict] = useState(initial?.subdistrict ?? '')
  const [districts, setDistricts] = useState<LevelState>(initial?.districts ?? null)
  const [subdistricts, setSubdistricts] = useState<LevelState>(initial?.subdistricts ?? null)
  // The latest request per level; an older answer that lands late is dropped.
  const latest = useRef({ districts: '', subdistricts: '' })

  async function load(level: 'districts' | 'subdistricts', url: string, set: (l: LevelState) => void) {
    latest.current[level] = url
    set('loading')
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(String(res.status))
      const list = (await res.json()) as Place[]
      if (latest.current[level] === url) set(list)
    } catch {
      if (latest.current[level] === url) set('failed')
    }
  }

  function chooseProvince(code: string | null) {
    setProvince(code ?? '')
    setDistrict('')
    setSubdistrict('')
    setSubdistricts(null)
    latest.current.subdistricts = ''
    if (code) load('districts', `/places/${code}`, setDistricts)
    else {
      latest.current.districts = ''
      setDistricts(null)
    }
  }

  function chooseDistrict(code: string | null) {
    setDistrict(code ?? '')
    setSubdistrict('')
    if (code) load('subdistricts', `/places/${province}/${code}`, setSubdistricts)
    else {
      latest.current.subdistricts = ''
      setSubdistricts(null)
    }
  }

  const postcode =
    Array.isArray(subdistricts) ? (subdistricts.find((s) => s.code === subdistrict)?.postcode ?? '') : ''

  return (
    <>
      <Field label="Province">
        <Picker
          places={provinces}
          name="province_code"
          initialId={province}
          noun="province"
          disabled={disabled}
          onChoose={chooseProvince}
        />
      </Field>
      <Field label="District">
        <Level
          level={districts}
          parentChosen={!!province}
          parent="province"
          retry={() => chooseProvince(province)}
        >
          {(places) => (
            <Picker
              key={province}
              places={places}
              name="district_code"
              initialId={district}
              noun="district"
              disabled={disabled}
              onChoose={chooseDistrict}
            />
          )}
        </Level>
      </Field>
      <Field label="Subdistrict">
        <Level
          level={subdistricts}
          parentChosen={!!district}
          parent="district"
          retry={() => chooseDistrict(district)}
        >
          {(places) => (
            <Picker
              key={district}
              places={places}
              name="subdistrict_code"
              initialId={subdistrict}
              noun="subdistrict"
              disabled={disabled}
              onChoose={(code) => setSubdistrict(code ?? '')}
            />
          )}
        </Level>
      </Field>
      <Field label="Postcode" hint={subdistrict ? undefined : 'Filled in from the subdistrict'}>
        <input
          type="text"
          readOnly
          tabIndex={-1}
          value={postcode}
          aria-label="Postcode, filled in from the subdistrict"
          className={`${INPUT} tabular text-muted`}
        />
      </Field>
    </>
  )
}

/** One level's picker: English first, Thai beneath, either searchable. */
function Picker({
  places,
  name,
  initialId,
  noun,
  disabled,
  onChoose,
}: {
  places: Place[]
  name: string
  initialId: string
  noun: string
  disabled?: boolean
  onChoose: (code: string | null) => void
}) {
  return (
    <Combobox
      items={places.map((p) => ({ id: p.code, label: p.en, sub: p.th, terms: p.th }))}
      idName={name}
      initialId={initialId}
      disabled={disabled}
      placeholder={`Type to search the ${noun}s`}
      listLabel={`Show the ${noun} list`}
      clearLabel={`Clear the ${noun}`}
      emptyNote={(text) => (
        <>
          No {noun} matches “<span className="text-ink">{text}</span>” — try the English or the Thai name
        </>
      )}
      onChoose={onChoose}
    />
  )
}

/** A level that waits on the one above: closed until it is chosen, a skeleton
 *  line while its list loads, a retry if the load failed. */
function Level({
  level,
  parentChosen,
  parent,
  retry,
  children,
}: {
  level: LevelState
  parentChosen: boolean
  parent: string
  retry: () => void
  children: (places: Place[]) => React.ReactNode
}) {
  if (!parentChosen) {
    return <input type="text" disabled placeholder={`Choose the ${parent} first`} className={INPUT} />
  }
  if (level === 'loading' || level === null) return <Bar className="h-[38px] w-full rounded-lg" />
  if (level === 'failed') {
    return (
      <p className="flex h-[38px] items-center text-sm text-warn">
        The list did not load.&nbsp;
        <button type="button" onClick={retry} className="underline underline-offset-4">
          Try again
        </button>
      </p>
    )
  }
  return children(level)
}
