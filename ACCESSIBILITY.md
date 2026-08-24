# Accessibility contract

The target is WCAG 2.2 AA, with usability testing by people who are not data specialists.

Current draft commitments:

- Native HTML controls, headings, labels, fieldsets, tables, captions, details, and status messages.
- A skip link and visible keyboard focus.
- Reflow into a single column on narrow screens and at high zoom.
- No result is communicated by a chart alone.
- Tables contain the exact result values.
- Chart colour is not used to distinguish multiple series in this first draft.
- Reduced-motion preferences are respected.
- Dark colour preferences are supported without making them a requirement.
- Dynamic status changes use a polite live region.
- Controls are revealed when they become relevant instead of being presented as large disabled groups.

Before a public release:

- Run automated checks with axe-core and Lighthouse.
- Test keyboard-only use at 200% and 400% zoom.
- Test NVDA with Firefox, JAWS with Chrome, and VoiceOver with Safari.
- Verify Vega-generated SVG names and descriptions in each supported browser.
- Add a persistent textual chart description for trends, extrema, missing values, and filters.
- Confirm touch target size and high-contrast mode behaviour.
- Test error recovery for CORS, unsupported formats, low memory, and interrupted model downloads.
