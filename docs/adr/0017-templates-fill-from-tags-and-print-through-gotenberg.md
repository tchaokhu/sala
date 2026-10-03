# Document Templates are filled from tags, and print to PDF through Gotenberg

Document Templates exist as a library (list, add, retitle, delete). Filling one
in per Rental is the half CONTEXT.md promised. None of the twelve files the ETL
brought over carries a placeholder: the blanks are dotted lines, about 26–68 per
file, and the rental contracts are PDF-to-Word conversions of 88–120 text boxes
set in Angsana New and Yu Mincho. Cozy Keys filled one hard-coded contract,
whose dotted lines a developer's script had turned into tags by position, and
typed every value into a long form by hand.

Decided with the user, 2026-10-03:

- **The Org puts the tags in, in Word.** `{tenant_name}`, `{monthly_rent}` and
  the rest replace the dotted lines in a DOCX the Org uploads as usual. Sala
  fills it on the server with docxtemplater. Any template, any Org, no
  developer in the loop. Only the one pilot file (the TH rental contract,
  saved as a new file beside the original) is tagged by a script.
- **Tag names are English and follow CONTEXT.md.** Dates come as `{x}` (Thai,
  Buddhist year), `{x_en}`, and `{x_day}` / `{x_month}` / `{x_year}` for
  contracts that split them. Money comes as `{x}` (digits), `{x_words}` (Thai
  baht text) and `{x_words_en}`. **A tag Sala does not know becomes a blank
  field on the fill form**, so an Org adds `{late_fee}` without waiting for us.
  Single values only: loops such as an inventory table are not supported yet.
- **Filling starts from one page, `/templates/[id]/fill`**, which can fill from
  a Rental (everything), a Property (Property, Building and Owner), or nothing.
  The Templates list links to it from every DOCX row; a Rental page links to
  it with the Rental chosen.
- **The form shows only the tags in that file**, prefilled from Sala and
  editable. What is typed is used for that file only and never written back.
  Missing data — an Owner's ID or address, a bank account — is typed each
  time until a field earns a column.
- **The output is downloaded, not kept.** DOCX, or PDF. Sala does not store the
  unsigned draft: the signed scan is uploaded as a Rental Document of kind
  `contract`, as now, so "No contract" keeps meaning no signed contract.
- **Tags are read from the file, not stored.** Upload parses a DOCX and refuses
  one with a broken tag, saying where. The fill page parses again each time.
  No migration.
- **PDF is converted by Gotenberg (LibreOffice), run by us.** A custom image
  from `gotenberg/gotenberg:8` adds `fonts-thai-tlwg`, whose own fontconfig
  rules already stand in Kinnari for Angsana New, Umpush for Cordia New and
  Laksaman (TH SarabunPSK's metric twin) for TH SarabunPSK and TH Sarabun
  New — no aliases of ours, no font downloaded at build. It runs in
  `docker-compose.yml` for now; Sala calls it at `GOTENBERG_URL`, and
  without that the PDF button says so and DOCX still works. When a
  deployment target is chosen, the same image moves there and only the URL
  changes.
- **The PDF is longer than Word's, and that is accepted** (user, after the
  pilot). Angsana New is narrow and short; every free Thai face is wider and
  taller, so the pilot contract prints on 12 pages to Word's 8 — all of it,
  text boxes and watermark in place. A Word-exact PDF comes from saving the
  DOCX in Word. A template set in TH Sarabun New prints alike in both.
- **A tag left empty prints as a dotted line**, so the blank can still be
  filled by hand. Without that the pilot lost every unfilled line.

Rejected: tags inserted by a developer's script per template (breaks when a
dotted line moves; no Org can do it alone); text drawn onto the PDF at measured
coordinates (Cozy Keys' other path; every template needs its own map); storing
the draft as a Rental Document (an unsigned draft would count as the contract);
rendering the DOCX in the browser and printing it (watermark, text boxes and
page breaks drift from Word); a hosted converter such as CloudConvert (the
Tenant's ID number would leave for a third party); copying Windows' Angsana New
and Yu Mincho into the image (their licence is for Windows); storing each
template's tags in a column (a migration and a backfill for a list the file
already holds); Thai tag names (Word's AutoCorrect and Thai vowel marks split
them into runs).

The filled values carry a Tenant's ID number. They are never logged. A failed
fill or conversion logs the template id. Gotenberg is reached only from the
server, never exposed to the browser.
