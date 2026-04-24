# Product-Truth Review - PDF Evidence

Last updated: 2026-04-24 by Codex

## Source Handling

The PDFs were available locally and were rendered to temporary PNGs for visual inspection. The raw PDFs were not committed.

Committed aliases:

- `pdf-company-01`: first PDF evidence screenshot
- `pdf-company-02`: second PDF evidence screenshot

The screenshots are visual evidence only. They show the Creative UI state, not the full source of truth.

## pdf-company-01

Visible context:

- Creative page, Last 30 days.
- A campaign/test-campaign filter is visible.
- Benchmark control is visible with account-wide and within-campaign options; within-campaign appears selected.
- Top filters use the intended taxonomy.

Visible segment counts:

| Segment | Count |
| --- | ---: |
| Scale | 0 |
| Scale Review | 1 |
| Test More | 2 |
| Protect | 1 |
| Watch | 3 |
| Refresh | 3 |
| Retest | 0 |
| Cut | 0 |
| Campaign Check | 0 |
| Not Enough Data | 4 |

Visible product evidence:

- The UI does surface one `Scale Review` row in this screenshot.
- The visible `Scale Review` card is one of the highest-spend cards and shows strong positive ROAS.
- A visible `Protect` card also shows strong ROAS, but the screenshot alone does not prove whether it is correctly protected or should be reviewable for scale.
- Several visible `Watch` rows have meaningful spend but lower ROAS than the strongest row.
- Several `Not Enough Data` rows have low or zero ROAS; that label looks plausible for thin rows, but the screenshot does not prove whether any should be `Cut`.
- `Cut` is zero despite visible low-performing rows, which is a product-truth concern to compare with live row metrics.

Media-buyer read:

- This screenshot is not a complete failure because it does show `Scale Review`.
- It still asks the buyer to inspect the table to understand why some strong-looking rows are `Protect` or `Refresh`.
- The UI is partially useful but not self-evidently expert from the screenshot alone.

## pdf-company-02

Visible context:

- Creative page, Last 30 days.
- A campaign/test-campaign filter is visible.
- Benchmark control is visible with account-wide and within-campaign options; within-campaign appears selected.
- Top filters use the intended taxonomy.

Visible segment counts:

| Segment | Count |
| --- | ---: |
| Scale | 0 |
| Scale Review | 0 |
| Test More | 1 |
| Protect | 5 |
| Watch | 4 |
| Refresh | 1 |
| Retest | 0 |
| Cut | 0 |
| Campaign Check | 0 |
| Not Enough Data | 9 |

Visible product evidence:

- No `Scale` or `Scale Review` rows are visible.
- Multiple visible `Protect` cards have meaningful spend and positive ROAS.
- Several visible `Watch` rows have moderate spend with weak ROAS.
- Multiple visible `Not Enough Data` rows show weak or zero ROAS, including rows with visible spend.
- `Cut` is zero, even though the screenshot shows several rows a buyer would likely want flagged as weak.

Media-buyer read:

- This screenshot supports the supervisor concern more strongly than `pdf-company-01`.
- The page classifies many rows, but it does not clearly answer the buyer's question: which creative should I push, which one should I stop, and why?
- The absence of `Scale Review` in this context is not defensible from the screenshot alone.

## PDF-Level Conclusions

What the PDFs prove:

- The UI taxonomy is now present and visible.
- `Scale` is zero in both screenshots.
- `Scale Review` is not universally absent; `pdf-company-01` shows one `Scale Review`.
- `pdf-company-02` still shows a credibility problem: no `Scale Review`, no `Cut`, and many rows in `Protect`, `Watch`, and `Not Enough Data`.

What the PDFs do not prove:

- They do not prove the exact account/campaign baseline values for each creative.
- They do not prove whether commercial truth was configured.
- They do not prove whether the visible strong-looking `Protect` rows are shipped evergreen winners or missed scale-review candidates.
- They do not prove whether the low-performing rows clear the deterministic `Cut` floor.

Product-truth implication:

- The PDFs justify a live row-level audit.
- They do not justify policy tuning by themselves.
