#!/usr/bin/env python3
"""Rebuild netlify/functions/roster.json from a ContactsList users export.

Usage: python3 scripts/build_roster.py "/path/to/users.csv" "/path/to/tribes.csv"

The tribes CSV is the CMS tribes-entries export (columns: id, title); it
resolves the users export's internal tribe IDs to tribe names.

Field mapping (minified keys, matching what directory.js expects):
  c  <- callSign
  n  <- fullName (fallback: firstName + lastName)
  e  <- email
  p  <- phoneNumber        (the man's own phone — NOT emergencyPhoneNumber)
  r  <- leadershipPosition (slugs formatted to Title Case, comma-joined)
  t  <- tribe id(s) resolved to name(s) via the tribes CSV, comma-joined
  b  <- birthDate, YYYY-MM-DD
  pc <- patchClass (omitted when 0/blank = not patched)

Only rows with status == "active" are included. Duplicate emails keep the
first occurrence.
"""
import csv, json, re, sys, os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTER = os.path.join(REPO, "netlify", "functions", "roster.json")


def title_slug(s):  # "tribeLeader" -> "Tribe Leader"
    return re.sub(r"(?<!^)(?=[A-Z])", " ", s).strip().title()


def main(csv_path, tribes_path):
    csv.field_size_limit(10**8)
    tribe_names = {}
    for row in csv.DictReader(open(tribes_path, newline="", encoding="utf-8-sig")):
        if (row.get("id") or "").strip() and (row.get("title") or "").strip():
            tribe_names[row["id"].strip()] = row["title"].strip()
    unresolved = set()

    out, seen, skipped_status, dup = [], set(), {}, 0
    for row in csv.DictReader(open(csv_path, newline="", encoding="utf-8-sig")):
        status = (row.get("status") or "").strip()
        if status != "active":
            skipped_status[status] = skipped_status.get(status, 0) + 1
            continue
        email = (row.get("email") or "").strip()
        key = email.lower()
        if key and key in seen:
            dup += 1
            continue
        seen.add(key)

        name = (row.get("fullName") or "").strip()
        if not name:
            name = f"{(row.get('firstName') or '').strip()} {(row.get('lastName') or '').strip()}".strip()

        roles = []
        raw = (row.get("leadershipPosition") or "").strip()
        if raw and raw != "[]":
            try:
                roles = [title_slug(x) for x in json.loads(raw) if x]
            except ValueError:
                pass

        entry = {
            "c": (row.get("callSign") or "").strip(),
            "n": name,
            "e": email,
            "p": (row.get("phoneNumber") or "").strip(),
        }
        if roles:
            entry["r"] = ", ".join(roles)
        raw_tribe = (row.get("tribe") or "").strip()
        if raw_tribe and raw_tribe != "[]":
            try:
                ids = [str(i) for i in json.loads(raw_tribe)]
            except ValueError:
                ids = []
            unresolved.update(i for i in ids if i not in tribe_names)
            names = [tribe_names[i] for i in ids if i in tribe_names]
            if names:
                entry["t"] = ", ".join(names)
        bd = (row.get("birthDate") or "").strip()
        if re.match(r"^\d{4}-\d{2}-\d{2}", bd):
            entry["b"] = bd[:10]
        pc = (row.get("patchClass") or "").strip()
        if pc and pc != "0":
            entry["pc"] = pc
        out.append(entry)

    out.sort(key=lambda x: ((x["c"] or x["n"]).lower(), x["n"].lower()))
    with open(ROSTER, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    print(f"wrote {len(out)} entries to {ROSTER}")
    print(f"skipped by status: {skipped_status} | duplicate emails skipped: {dup}")
    if unresolved:
        print(f"WARNING: {len(unresolved)} tribe id(s) not in tribes list: {sorted(unresolved)[:20]}")
    for k, label in [("c", "callsign"), ("p", "phone"), ("r", "role"),
                     ("t", "tribe"), ("b", "birthdate"), ("pc", "patch class")]:
        print(f"  with {label}: {sum(1 for r in out if r.get(k))}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
