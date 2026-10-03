// Reading and filling a Document Template's DOCX (ADR 0017). No I/O: bytes
// in, tags or bytes out. Upload calls readTemplateTags to refuse a broken file
// while the person is still there to fix it; the fill page calls it again on
// every open — the tags live in the file, not in a column.
//
// The tags are collected through docxtemplater's `parser` hook: its inspect
// module would do the same and drag lodash in with it.

import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { EMPTY_TAG } from './template-tags'

const TAG_NAME = /^[a-z][a-z0-9_]*$/i

type Read = { ok: true; tags: string[] } | { ok: false; message: string }

interface TemplateError {
  properties?: { explanation?: string; errors?: TemplateError[] }
}

function open(bytes: ArrayBuffer | Uint8Array, tags: Set<string>, values?: Record<string, string>) {
  return new Docxtemplater(new PizZip(bytes), {
    paragraphLoop: true,
    linebreaks: true,
    // Its default prints the failing template text to stdout. The caller says
    // what went wrong; a log line never carries a contract's contents.
    errorLogging: false,
    parser: (tag) => {
      tags.add(tag)
      return { get: (scope: Record<string, string>) => scope[tag] }
    },
    // An empty tag prints as a dotted line, so it can still be written on.
    nullGetter: () => (values ? EMPTY_TAG : ''),
  })
}

/** The distinct tags in a DOCX, in the order they first appear — or why the
 *  file cannot be a template. Messages name the problem, never the values. */
export function readTemplateTags(bytes: ArrayBuffer | Uint8Array): Read {
  const tags = new Set<string>()
  let doc: Docxtemplater
  try {
    doc = open(bytes, tags)
  } catch (err) {
    const errors = (err as TemplateError).properties?.errors ?? [err as TemplateError]
    const first = errors.map((e) => e.properties?.explanation).find(Boolean)
    if (!first) return { ok: false, message: 'This is not a Word (DOCX) file Sala can read. Save it again from Word as .docx.' }
    const more = errors.length > 1 ? ` (and ${errors.length - 1} more)` : ''
    return { ok: false, message: `${first}${more}. Fix the tag in Word and upload it again.` }
  }
  if (/\{[#/^@]/.test(doc.getFullText())) {
    return { ok: false, message: 'Repeating sections ({#…} … {/…}) are not supported yet. Use single tags such as {tenant_name}.' }
  }
  const bad = [...tags].find((t) => !TAG_NAME.test(t))
  if (bad !== undefined) {
    return {
      ok: false,
      message: `{${bad}} is not a tag name Sala can fill. Use English letters, digits and _ only, with no spaces — {tenant_name}.`,
    }
  }
  return { ok: true, tags: [...tags] }
}

/** The DOCX with every tag replaced: from `values`, or a dotted line. */
export function fillTemplate(bytes: ArrayBuffer | Uint8Array, values: Record<string, string>): Uint8Array {
  const doc = open(bytes, new Set(), values)
  doc.render(values)
  return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' })
}
