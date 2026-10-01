# Interface decisions

The interface is a working application desk, not a marketing landing page. Its main task is comparing roles and opening the next form with enough context to avoid a mistake.

## Visual hierarchy

- Light gray navigation, white work surfaces and a restrained violet selection accent.
- System fonts, modest corner radii and flat borders; no external font requests.
- A semantic desktop table separates company/role, location, compensation, sponsorship and actions into stable columns. Annual pay basis and evidence dates remain visible.
- Status color communicates research or confirmed application state, rather than decorating every label.
- Profile setup appears as an actionable notice. There is no oversized motivational hero.
- Documents/answers live in their own view, so the application list stays focused.

## Interaction decisions

Role family and status filters are independent. Search includes company, title and location. Filter controls use native buttons with pressed state, rather than claiming tab semantics without a full tabpanel keyboard model. Empty results provide a clear explanation and search reset.

Opening a form does not mark it submitted. Recording a prior application requires a second explicit click on the exact role, because it changes duplicate blocking. Packet readiness is labelled separately from form completion.

Native disclosure controls reveal progress and unresolved evidence. Keyboard focus remains visible, a skip link bypasses navigation, narrow layouts preserve the comparison table with horizontal scrolling, and reduced-motion preferences disable decorative transitions.

## References

[GitHub Primer](https://primer.style/product/) provides a useful reference for product navigation, component hierarchy and disclosure patterns. [GOV.UK table guidance](https://design-system.service.gov.uk/components/table/) emphasizes comparison and scanning; its [tabs guidance](https://design-system.service.gov.uk/components/tabs/) discusses repeated-use interfaces. These informed the design judgment here; no third-party component implementation was copied or installed.

## Verification

The documented preview uses an isolated fictional candidate and reserved example URLs. Check desktop and narrow layouts, role filtering, search, document navigation, and the non-mutating cancel path for recording an application. Real browser-form compatibility remains a separate concern from dashboard layout.

## External design skills

The desktop revision used [Anthropic frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) for subject-specific hierarchy and restraint, and [Vercel web-design-guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) for semantic controls, focus, content handling and large-list rendering. Both are development guidance, not application dependencies. Their code is not vendored here.

The primary design target is desktop: a single table replaces repeated cards and oversized counters. Search and role/status filters persist in the URL across refreshes. Empty states and unknown evidence remain explicit. The table keeps native semantics and keyboard controls.
