# Interface decisions

Career Agent is a desktop application workspace. The interface pairs a compact, inspectable application table with a photographic city header and an original city illustration. The header offers working shortcuts to opportunities and review; it does not claim application progress without evidence.

## Visual direction

Ink blue (#122d51) anchors navigation, white holds application records, pale blue (#e5edfb) frames the introduction, blue (#235ad6) identifies actions, and coral (#ff8976) marks the product identity. Avenir Next falls back to platform sans-serif fonts without requesting external fonts.

The city image and overlapping illustration express the transition from university to work. Company initials provide local visual landmarks instead of requesting employer logos from tracking services. Initials are not official logos. Color adds recognition while company names, evidence and action labels remain readable without it.

## Interaction

Search, role family and status remain independent, with filters stored in the URL. Search includes company, role and location. Native buttons expose pressed state; tables retain semantic headings and cells. Documents and reusable answers have a separate working view. Recording a prior application requires explicit confirmation. Opening a form never implies submission.

Keyboard focus, the skip link, reduced motion and narrow-screen table scrolling remain available. The desktop layout keeps pay basis, sponsorship uncertainty and evidence dates visible. Original document integrity and approval rules are unchanged.

## Research references

Reviewed on October 1, 2026, with star counts obtained through the GitHub API:

- [shadcn/ui](https://github.com/shadcn-ui/ui), 124,922 stars: compact controls and clear component hierarchy; [blocks](https://ui.shadcn.com/blocks).
- [Twenty](https://github.com/twentyhq/twenty), 57,768 stars: persistent navigation and record-oriented workspace organization.
- [Actual Budget](https://github.com/actualbudget/actual), 29,239 stars: local-first ownership and a focused data workspace.

These are references, not dependencies or copied implementations. Star counts are dated observations, not a claim to a comprehensive global ranking.

## Image sources and privacy

`public/art/next-stop.svg` is original repository artwork, distributed under the repository MIT license. The city photograph loads directly from [Unsplash](https://unsplash.com) at `https://images.unsplash.com/photo-1519501025264-65ba15a82390`; it is governed by the [Unsplash license](https://unsplash.com/license), not this repository's software license. Its request uses no-referrer and contains no candidate information. The local illustration and text still work if the remote photo cannot load. No image is generated from or derived from candidate records.

The About portrait remains hosted by BanterBoost with separate attribution. No third-party photography is bundled as software source.

## Verification

The preview uses fictional records and reserved example URLs. Verify search, role filters, empty results, document navigation, header shortcuts and review controls separately from external employer form compatibility.
