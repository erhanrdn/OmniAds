# Creative Segmentation Calibration Lab - Live Meta Connectivity Recovery

Last updated: 2026-04-23 by Codex

## Result

Live Meta connectivity was real and recoverable in the checked runtime.

## What Was Wrong

The prior local recovery attempt pointed the helper at the production database but did not include the runtime secret needed to decrypt encrypted Meta integration tokens.

That created a false local diagnosis:

- raw DB rows showed connected Meta integrations
- `getIntegration()` could not read the encrypted tokens in that shell
- the helper then behaved as if current Meta connectivity did not exist

This was an environment mismatch, not a product-truth absence of live Meta businesses.

## Corrected Verification

Using a production-equivalent runtime env, the helper confirmed:

- 8 historical snapshot candidates
- 8 DB-eligible Meta-connected candidates
- 7 runtime-eligible live-readable candidates
- 1 runtime-skipped candidate

Runtime skip classification:

- `meta_token_checkpointed`: 1

## Sanitized Candidate Trace

- `candidate-01`
  connected row present, credential row present, assigned Meta account present, but live Graph reads failed with OAuth checkpoint/token rejection; correctly excluded from calibration
- `candidate-02`
  connected, assigned, live rows available; included
- `candidate-03`
  connected, assigned, live rows available; included
- `candidate-04`
  connected, assigned, live rows available; included
- `candidate-05` through `candidate-08`
  remained runtime-eligible but were outside the current sample cap

## Helper Changes

- Added runtime preflight for missing token decryption env
- Added live Meta readability screening before sampling
- Added sanitized runtime skip reasons so broken credentials do not masquerade as zero-row eligible businesses

## Outcome

The live Meta calibration cohort is recovered.

The Data Accuracy Gate passes after skipping the token-broken candidate and sampling the next healthy business.
