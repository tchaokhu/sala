# A Property is named by its Building, and the Building carries the map

The first Property form had a free-text `ชื่อทรัพย์` and three free-text location
fields. Twenty units in one condo meant the building's name typed twenty times,
spelled twenty ways, with no record that they were the same building — and the
list could not tell either. Sala already had the right noun: **Building**, "the
named development a Property sits in" (CONTEXT.md), a table since
`0001_init.sql`, unused by any screen.

**A Property's title is composed, not typed.** `composePropertyTitle` puts the
Building's name in front of the room number, and the form has no title field.
The Building's name is read from the database inside the action, never taken
from the form: the โครงการ combobox posts `building_id` and `building_name`
together, and only the id is checked against the Org, so a title assembled from
the text beside it could name one Building while pointing at another. An id that
belongs to another agency finds no row under RLS and becomes a refusal.

`properties.title` stays NOT NULL and stays the column every list renders. Rows
loaded by the Cozy Keys ETL keep the titles they were imported with; nothing
rewrites them, and nothing requires them to have a Building.

**Typing a name that is not on the list creates the Building.** The alternative —
refusing, and sending the person to จัดการโครงการ to make one — loses the form
they had half filled in. The Building created this way gets a name and nothing
else; its district and its map link are filled in later on the management page,
which is where those fields live.

**Location is one pin on the Building, not three text fields on each Property.**
`buildings.google_map_url` already existed. The Property form previews the
Building's map read-only once a โครงการ is chosen and does not offer to change
it. `properties.location`, `district` and `province` are no longer written by the
form: a copy per unit is a copy to keep in step, and the Building is where the
answer is. The columns stay — the ETL rows use them — and default to `''`.

**Short links are followed once, on save.** A link copied from the phone app is
`maps.app.goo.gl/…`, which carries no coordinates and cannot be embedded, so
`resolveMapUrl` follows the redirect in the Server Action and stores what it
lands on. Rejected: doing it in the browser (blocked by CORS), and doing it at
render time (an outbound request on every page view, to draw a map that has not
changed).

## Consequences

This is the one place Sala fetches a URL a person typed, so the walk is fenced
twice. `normaliseMapUrl` accepts only Google map hosts and only http(s) — a
paste pointing anywhere else is refused at the form, before it is ever stored.
`resolveMapUrl` then walks the redirect chain by hand, five hops maximum, five
seconds maximum, checking every hop against the same list, because
`redirect: 'follow'` would hand a shortener the choice of where our server
points. A stored link is also an iframe `src` later, which is the second reason
the host list is closed rather than advisory.

A failure to resolve is not a failure to save: the pasted link is stored, and
`MapPreview` shows a button and one line saying why there is no map, rather than
an empty frame.

The embed is Google's keyless `output=embed`, so no API key and no billing
account. `referrerPolicy="no-referrer"` keeps the Org slug in our URL out of the
request to Google. If a real Embed API key ever arrives, `mapEmbedSrc` is the
only function that changes.

`0008_buildings_name_index.sql` adds `(org_id, name)`; no column changed. The
โครงการ combobox reads up to 500 Buildings in one bounded query and filters them
in the browser — a round trip per keystroke buys nothing at that size — and says
so on screen when the cap is reached, so a missing โครงการ reads as "there are
more than this" rather than "it is gone".
