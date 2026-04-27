# Raw View Diagnostic

CHATGPT_REVIEW_READY: YES
SANITIZED: YES
MERGE_REQUESTED: NO
MAIN_PUSHED: NO

# Branch

Current branch:
`wip/creative-decision-os-v2-integration-candidate-2026-04-27`

Current HEAD:
`ac7220666b99d0b507ed58651ccd2374d014b275`

Remote branch ref:

```text
ac7220666b99d0b507ed58651ccd2374d014b275
refs/heads/wip/creative-decision-os-v2-integration-candidate-2026-04-27
```

Worktree status at diagnosis: clean.

# Script Note

The requested `python3 -c ... urllib.request.urlopen(...)` script was run
exactly first. It failed at the first public Raw fetch because the local
Framework Python 3.13 install could not verify the TLS certificate chain:

```text
ssl.SSLCertVerificationError: [SSL: CERTIFICATE_VERIFY_FAILED]
certificate verify failed: unable to get local issuer certificate
```

The same script body was then run with `/usr/bin/python3` and succeeded.

# Byte Comparison

All four target files matched byte-for-byte across local worktree, Git HEAD
object, public branch Raw URL, and public commit Raw URL.

| File | Source | Bytes | SHA256 | LF | CR | U+2028 | U+2029 | NEL |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| `scripts/creative-v2-safety-gate.ts` | local | 2578 | `16724321f1750081fc78e1a72c3b1513aa9b424678295dc641c7d040739f1b0f` | 82 | 0 | 0 | 0 | 0 |
| `scripts/creative-v2-safety-gate.ts` | git HEAD | 2578 | `16724321f1750081fc78e1a72c3b1513aa9b424678295dc641c7d040739f1b0f` | 82 | 0 | 0 | 0 | 0 |
| `scripts/creative-v2-safety-gate.ts` | branch Raw | 2578 | `16724321f1750081fc78e1a72c3b1513aa9b424678295dc641c7d040739f1b0f` | 82 | 0 | 0 | 0 | 0 |
| `scripts/creative-v2-safety-gate.ts` | commit Raw | 2578 | `16724321f1750081fc78e1a72c3b1513aa9b424678295dc641c7d040739f1b0f` | 82 | 0 | 0 | 0 | 0 |
| `lib/creative-v2-no-write-enforcement.test.ts` | local | 5430 | `351624fea0e41c3e820a21c64e4d06979719ea63a08ce918bc99660737d1cb9b` | 156 | 0 | 0 | 0 | 0 |
| `lib/creative-v2-no-write-enforcement.test.ts` | git HEAD | 5430 | `351624fea0e41c3e820a21c64e4d06979719ea63a08ce918bc99660737d1cb9b` | 156 | 0 | 0 | 0 | 0 |
| `lib/creative-v2-no-write-enforcement.test.ts` | branch Raw | 5430 | `351624fea0e41c3e820a21c64e4d06979719ea63a08ce918bc99660737d1cb9b` | 156 | 0 | 0 | 0 | 0 |
| `lib/creative-v2-no-write-enforcement.test.ts` | commit Raw | 5430 | `351624fea0e41c3e820a21c64e4d06979719ea63a08ce918bc99660737d1cb9b` | 156 | 0 | 0 | 0 | 0 |
| `scripts/creative-v2-self-hosted-smoke.ts` | local | 4135 | `4c3c085e086a4825f50a1318577aaab028c96ad2225a861a96e0dd74cac24500` | 141 | 0 | 0 | 0 | 0 |
| `scripts/creative-v2-self-hosted-smoke.ts` | git HEAD | 4135 | `4c3c085e086a4825f50a1318577aaab028c96ad2225a861a96e0dd74cac24500` | 141 | 0 | 0 | 0 | 0 |
| `scripts/creative-v2-self-hosted-smoke.ts` | branch Raw | 4135 | `4c3c085e086a4825f50a1318577aaab028c96ad2225a861a96e0dd74cac24500` | 141 | 0 | 0 | 0 | 0 |
| `scripts/creative-v2-self-hosted-smoke.ts` | commit Raw | 4135 | `4c3c085e086a4825f50a1318577aaab028c96ad2225a861a96e0dd74cac24500` | 141 | 0 | 0 | 0 | 0 |
| `.github/workflows/ci.yml` | local | 10318 | `0c58f2585ee6d6fe50572bf9bad2926ea5fcd145b1916ae559743db3f3f6906c` | 336 | 0 | 0 | 0 | 0 |
| `.github/workflows/ci.yml` | git HEAD | 10318 | `0c58f2585ee6d6fe50572bf9bad2926ea5fcd145b1916ae559743db3f3f6906c` | 336 | 0 | 0 | 0 | 0 |
| `.github/workflows/ci.yml` | branch Raw | 10318 | `0c58f2585ee6d6fe50572bf9bad2926ea5fcd145b1916ae559743db3f3f6906c` | 336 | 0 | 0 | 0 | 0 |
| `.github/workflows/ci.yml` | commit Raw | 10318 | `0c58f2585ee6d6fe50572bf9bad2926ea5fcd145b1916ae559743db3f3f6906c` | 336 | 0 | 0 | 0 | 0 |

# Public URLs Checked

Branch Raw URL form:

```text
https://raw.githubusercontent.com/erhanrdn/OmniAds/refs/heads/wip/creative-decision-os-v2-integration-candidate-2026-04-27/<path>
```

Commit Raw URL form:

```text
https://raw.githubusercontent.com/erhanrdn/OmniAds/ac7220666b99d0b507ed58651ccd2374d014b275/<path>
```

Additional `curl | wc -l` checks returned:

```text
scripts/creative-v2-safety-gate.ts branch Raw: 82
lib/creative-v2-no-write-enforcement.test.ts branch Raw: 156
scripts/creative-v2-self-hosted-smoke.ts branch Raw: 141
.github/workflows/ci.yml branch Raw: 336

scripts/creative-v2-safety-gate.ts commit Raw: 82
lib/creative-v2-no-write-enforcement.test.ts commit Raw: 156
scripts/creative-v2-self-hosted-smoke.ts commit Raw: 141
.github/workflows/ci.yml commit Raw: 336
```

# Conclusion

Conclusion: other.

The committed files are not collapsed. Local worktree, Git HEAD object, public
branch Raw, and public commit Raw all have identical SHA256 values and high LF
counts at PR #82 HEAD `ac7220666b99d0b507ed58651ccd2374d014b275`.

Case A does not apply because public branch Raw was not low here.

Case B does not apply because Git HEAD objects are multi-line.

Case C does not apply because local worktree and Git HEAD objects match.

The collapsed public Raw result was not reproducible from this environment
against the current PR #82 head and the `refs/heads/...` Raw URLs above.
Possible remaining explanations are a stale client/cache result, a different
ref or commit, or another Raw URL shape outside the URLs verified here.

# Commit Status

Target-file rewrite commit made: NO.

New target-file fix commit SHA: N/A.

Diagnostic report commit: this file was added after the byte diagnosis.

# Readiness

Product-ready: NO.

Merge-ready to main: NO.

PR #82 ready for PR #78 branch merge consideration: NO.

PR #82 remains Draft.

No main push.
