# penlandllc.com — Penland LLC corporate site

Static site. No build step, no dependencies, no JavaScript beyond a copyright
year. Deploys to Netlify as its own site from the `penland/` base directory,
separate from the Men's Alliance test site in the repository root.

Its two jobs:

1. Present Penland LLC as one company with several named divisions, so no single
   line of business has to carry the whole brand.
2. Host the legal pages an A2P 10DLC brand and campaign submission is checked
   against.

---

## Before you deploy: fill in the placeholders

Every placeholder looks like `[[THIS]]`. **The site must not go live with any of
them left in** — a carrier reviewer who lands on `[[BUSINESS_PHONE]]` will
reject the campaign.

| Placeholder | What to put there |
|---|---|
| `[[BUSINESS_PHONE]]` | The business phone a person actually answers. Must match the phone on the TCR brand record. |
| `[[BUSINESS_STREET_ADDRESS]]` | Street address on file with the Virginia SCC and the IRS. Not a PO box. |
| `[[CITY]]` | City |
| `[[ZIP]]` | ZIP |
| `[[EFFECTIVE_DATE]]` | Date the policies go live, e.g. `September 1, 2026` |

Find and replace across the site:

```sh
cd penland/public
grep -rn '\[\[' .                      # list every remaining placeholder
grep -rl '\[\[BUSINESS_PHONE\]\]' . | xargs sed -i 's/\[\[BUSINESS_PHONE\]\]/(804) 555-0134/g'
```

Re-run `grep -rn '\[\[' .` until it prints nothing.

### Email addresses

The site references `info@`, `support@`, `privacy@`, `legal@`, `properties@`,
`advisory@`, and `hello@` at `penlandllc.com`. Every one of these must actually
receive mail before submission — carriers test `support@` and reject
free-webmail contacts on a brand record. Aliasing them all to one real inbox is
fine.

### Facts to verify, not assume

I wrote plausible copy from what you described. Read these and correct anything
that is not true of your business before it goes live:

- **Match Lineup's description** (`public/matchlineup/index.html`) — I described
  it as roster and lineup management for competitive team programs, with sample
  messages written for a wrestling-style lineup. If the app does something else,
  rewrite that page first; the campaign use case must match what the site says.
- **Message frequency** — stated as 2–10/month. Change it to your real expected
  volume. It must match the frequency you put on the TCR campaign.
- **Sample messages** — must resemble what the app actually sends, including the
  `Reply STOP to opt out` tail on the first message to a recipient.
- **Division descriptions** — Properties, Advisory, and Alabaster Travel pages
  describe services from your summary. Trim anything you do not want to offer
  publicly.
- **Alabaster Travel** — check whether your host agency requires specific
  disclosure or seller-of-travel language on the page.
- **Restaurant equity** — mentioned on the homepage as a passive investment of
  record, with no public offering. Remove it entirely if you would rather it not
  be public.

### One legal note

These pages are a solid, standards-aligned starting point, not legal advice.
The liability cap, indemnity, and arbitration/venue clauses in
`legal/terms.html` are ordinary but consequential — have your attorney read them
before launch.

---

## Deploy

Netlify → Add new site → Import from Git → this repo, then:

| Setting | Value |
|---|---|
| Base directory | `penland` |
| Build command | *(blank)* |
| Publish directory | `public` |

`netlify.toml` handles the rest. Then in Domain management, add `penlandllc.com`
as the primary domain and add each subdomain you want as a **domain alias**:
`matchlineup.`, `alabaster.`, `properties.`, `advisory.`.

The subdomains 301 to their canonical page on the apex. That is deliberate:
one canonical URL per page means one Privacy Policy URL and one SMS Terms URL
for carrier review, and relative links never break. If you later want a
subdomain to keep its own address bar, change that rule's `status` to `200` in
`netlify.toml` and add matching rules for `/legal/*` and `/styles.css` on that
host.

### Short URLs

Handy when a support agent or a registration form needs a link that fits:

- `penlandllc.com/privacy`
- `penlandllc.com/terms`
- `penlandllc.com/sms`
- `penlandllc.com/support`

---

## A2P 10DLC — what this site is built to satisfy

### Brand registration (The Campaign Registry)

| Field | Value to submit |
|---|---|
| Entity type | **Private for-profit company** — not Sole Proprietor |
| Legal company name | Copy character-for-character from your IRS EIN letter (CP 575). `LLC` vs `L.L.C.` vs a trailing period will fail the match. This is the single most common cause of brand rejection. |
| EIN | Penland LLC's federal EIN |
| DBA / brand name | `Match Lineup` |
| Website | `https://penlandllc.com` |
| Support email | An `@penlandllc.com` address, never Gmail |
| Address / phone | Must match the SCC and IRS records, and must match this site |

Also worth doing before you submit: file `Match Lineup` as a fictitious name
with the Virginia SCC (about $10). It gives you a filed document tying the brand
name to the EIN if a reviewer asks.

### Campaign registration

| Requirement | Where this site satisfies it |
|---|---|
| Campaign description matches a real, live website | `/matchlineup/` |
| Opt-in flow described and visible | `/matchlineup/` — "How consent is collected", showing the actual unchecked checkbox and its exact wording |
| Consent language shown verbatim | `/matchlineup/` and `/legal/sms.html` §2 |
| Consent not a condition of purchase | Stated on `/matchlineup/` and `/legal/sms.html` §2 |
| Message frequency disclosed | `/matchlineup/` program table, `/legal/sms.html` §3 |
| "Message and data rates may apply" | `/matchlineup/`, `/legal/sms.html` §4 |
| STOP opt-out + confirmation text | `/legal/sms.html` §5 |
| HELP reply text | `/legal/sms.html` §6 |
| Carriers not liable for delayed/undelivered messages | `/legal/sms.html` §7 |
| Sample messages | `/matchlineup/` — must match what the app sends |
| Privacy policy live on the brand's website | `/legal/privacy.html` |
| Privacy policy excludes SMS opt-in data from sharing | `/legal/privacy.html` §3, restated in §4 and `/legal/sms.html` §10 |
| Privacy policy entity matches campaign entity | Penland LLC named on every page, in every footer |
| Terms of service | `/legal/terms.html` |

The sharing-exclusion paragraph in `privacy.html` §3 is the sentence reviewers
grep for. Do not reword it:

> No mobile information will be shared with third parties or affiliates for
> marketing or promotional purposes. Information sharing to subcontractors in
> support services, such as customer service or message delivery, is permitted.
> All other use case categories exclude text messaging originator opt-in data
> and consent; this information will not be shared with any third parties.

### Still on you, outside this repo

The site is necessary but not sufficient. A campaign also fails if:

- The **app's actual opt-in screen** does not match what `/matchlineup/`
  describes. Screenshot the real checkbox — reviewers ask for it.
- The consent checkbox is **pre-checked**, or bundled with the terms-of-service
  checkbox. It must be its own unchecked box.
- The first message to a recipient omits the brand name or the opt-out tail.
- `STOP` and `HELP` are not actually wired up in the sending code.
- The phone, address, or legal name on TCR disagrees with this site.

### Before you resubmit

Get the **specific rejection code** from your messaging provider rather than
guessing. Providers can pull the TCR reason string, and the fix for
`BRAND_EIN_MISMATCH` has nothing to do with the fix for `INSUFFICIENT_OPT_IN`.

---

## Structure

```
penland/
  netlify.toml                 site config, subdomain + short-URL redirects
  README.md                    this file
  public/
    index.html                 parent company — divisions, structure, contact
    styles.css                 shared stylesheet, light + dark
    _headers                   security headers
    robots.txt
    sitemap.xml
    matchlineup/index.html     Match Lineup division + SMS opt-in disclosure
    properties/index.html      Penland Properties division
    advisory/index.html        Penland Advisory division
    alabaster/index.html       Alabaster Travel division
    legal/
      privacy.html             Privacy Policy (carrier-compliant SMS section)
      terms.html               Terms of Service
      sms.html                 SMS Terms & Conditions (10DLC program terms)
```

Every page is standalone HTML with its header and footer inline. To add a
division, copy `alabaster/index.html`, change the content, and add the link to
the nav and footer of each page.

## Local preview

```sh
cd penland/public && python3 -m http.server 8080
```

Then open http://localhost:8080. Note that the `netlify.toml` redirects
(`/privacy`, `/sms`, subdomains) do not apply under `http.server`; use
`netlify dev` from the `penland/` directory to test those.
