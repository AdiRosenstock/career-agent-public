# Interface decisions

Career Agent is a desktop application workspace with the shared agent persona Adi “The Goat” Rosenstock. The main dashboard opens directly onto saved roles, built-in filters, and the application table. A compact page header offers working shortcuts to opportunities and adding a job. Creator photography belongs on the About page. Start here displays all three submission choices as visible controls; automatic submission also displays the separate risk acknowledgment. The GitHub Star invitation is voluntary.

## Visual direction

Ink blue (#122d51) anchors navigation, white holds application records, pale blue (#e5edfb) frames the introduction, blue (#235ad6) identifies actions, and coral (#ff8976) marks the product identity. Avenir Next falls back to platform sans-serif fonts without requesting external fonts.

Company initials provide local visual landmarks instead of requesting employer logos from tracking services. Initials are not official logos. Color adds recognition while company names, evidence and action labels remain readable without it.

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

The About portrait remains hosted by BanterBoost with separate attribution. No third-party photography is bundled as software source.

## Verification

The preview uses fictional records and reserved example URLs. Verify search, role filters, empty results, document navigation, header shortcuts and review controls separately from external employer form compatibility.

## Built-in job filters

Company and location options come from the saved job list. Sponsorship filters distinguish recent, sourced role evidence from employer history, unavailable sponsorship, and unknown facts. Mismatched, future-dated, stale, or unsourced evidence never counts as confirmed sponsorship. Employer history does not imply eligibility.

Compensation filters use the saved assessment and the user's selected minimum and base/total basis. Annual USD range sorting uses each range's minimum, places unknown/hourly/non-USD values last, and preserves basis labels; it does not equate base and total compensation. The pay-floor shortcut is disabled until a positive minimum is saved.

Quick views select role sponsors, employer history, pay-floor matches, or research. All-status view allows browsing excluded or previously applied jobs without making them eligible. Search, company, location, sponsorship, pay, sort, track and status persist in the URL. Reset clears narrowing filters while retaining the status view. These controls filter saved records locally and never connect accounts, start agent work or authorize submissions.

## Opportunity search

Saved applications and Opportunities use the same search rules: terms can appear in any order across company, title, location and career track. Search ignores case, repeated whitespace and accents. Quotes require a phrase within one field; a leading minus excludes a term or quoted phrase. Search does not inspect job descriptions.

Opportunities now offers company, location, sponsorship and compensation filters, plus career priority/fit, company, annual USD minimum and newest-posting sorting. Newest uses the posting date when supplied and discovery date otherwise. Opportunity controls persist in separate `op-` URL parameters, keeping them independent from saved-application filters. Reset clears narrowing filters while keeping the current status tab and sort choice. Result counts and a reset action help recover from an empty search.

## Career targets

The dashboard asks users to confirm their experience level and career paths in Settings. Users can select new graduate, early career (0–2 years), or experienced and enter professional experience for the latter. Career paths include software, mechanical and other engineering, finance, marketing, sales, design, operations, product, data, consulting and custom title terms. Targets stay in private settings; existing workspaces keep their legacy policy until users explicitly select a level.

Discovery respects the chosen paths. Experienced matching compares required years with the saved experience and does not impose graduate cohort or senior-title exclusions. New-graduate matching checks the graduation month saved in Profile. Changing career policy re-evaluates saved jobs and revokes pending approvals. Selecting a level does not establish degree qualifications, work authorization, or sponsorship.
