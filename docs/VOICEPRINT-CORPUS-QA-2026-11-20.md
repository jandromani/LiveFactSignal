# Voiceprint corpus QA — 20 November 2026

## Scope
12 public-debate participants; each has **10** CAM++ acoustic reference vectors stored in Neon.
This is **reference enrollment**, not fine-tuning a neural model.
No raw audio, raw voice embeddings, GitHub credentials or database secrets are stored in this public repository.

**Pinned model:** `sherpaw-campplus-zh-en-advanced@5fc23543`
**Model artifact SHA-256:** `aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2`
**Vector size:** 192 floats.

## Accepted reference inventory (direct Neon query)

| Speaker | Accepted references | Distinct source URLs |
|---|---:|---:|
| Maribel Vaquero | 10 | 4 |
| Oskar Matute | 10 | 6 |
| Gabriel Rufián | 10 | 9 |
| Emilio Delgado | 10 | 4 |
| Míriam Nogueras | 10 | 6 |
| Ester Muñoz | 10 | 5 |
| Patxi López | 10 | 5 |
| Pepa Millán | 10 | 5 |
| Ada Colau | 10 | 5 |
| Alberto Núñez Feijóo | 10 | 5 |
| Pedro Sánchez | 10 | 6 |
| Santiago Abascal | 10 | 10 |
| **Total** | **120** | **70 per-person distinct URLs** |

**Source hosts (stored origin for each reference):** 63 direct MP4s from `static.congreso.es`; 16 official `app.congreso.es` pages; 33 direct `video4.europapress.net` files; 2 `www.europapress.tv` pages; 4 Wikimedia Commons files; 2 `ppcantabria.org` references.

## Acceptance policy
- The publisher's exact intervention row or public-news speaker attribution must identify the person (never assume that the whole event contains only that speaker).
- The audio extractor rejects silence, clipping and insufficient speech duration.
- CAM++ similarity is compared across all twelve participant reference libraries; low-margin samples are rejected.
- Near-duplicates from the same URL and nearby timestamps are rejected; no profile can exceed 10 accepted references through the authenticated import API.
- A narrowly scoped two-reference consensus exists for official Pepa Millán congressional clips. It is **not** a global reduction of the similarity thresholds.
- The samples are provisionally source-labelled; identity is not journalist-certified and multi-speaker speech can still fool the extraction gate.

## Internal acoustic consistency test
Evaluated all 120 stored references. For each test vector, **excluded all other references from the same source URL**. Applied the live recognizer's top-two reference averaging, minimum `0.74` score, minimum `0.65` second same-speaker score and `0.14` margin.

| Result | Number |
|---|---:|
| Correct speaker, provisional acoustic match | 113 |
| Inconclusive / unknown | 7 |
| Incorrect speaker selected | 0 |

By speaker (correct / unknown): Ada Colau 10/0; Feijóo 8/2; Emilio Delgado 10/0; Ester Muñoz 10/0; Gabriel Rufián 10/0; Maribel Vaquero 10/0; Míriam Nogueras 10/0; Oskar Matute 9/1; Patxi López 7/3; Pedro Sánchez 9/1; Pepa Millán 10/0; Santiago Abascal 10/0.

**Caveat:** This is a consistency test using source-labelled enrollment samples. It is **not** an out-of-sample estimate of live debate performance and should never be reported as “94.2% real-world accuracy”. The training selection process already rejects some difficult cases, which can inflate this diagnostic.

## Production propagation verified
- Active Sánchez–Feijóo capture: 10 + 10 references in `voice_profiles` and 20 returned by production `/api/voice?action=list`.
- Four-candidate debate: 10 each (40), confirmed both in Neon and through the production voice API.
- Eight-spokesperson debate: 10 each (80), confirmed in Neon.
- Trigger-based enrollment will add these public-source references to new eligible debate sessions.

## Next acceptance test
Use a *new* recording not reused for enrollment. Include clean speaking turns, rapid handovers, moderator speech and overlap. Evaluate precision/recall **per speaker**, the unknown rate, diarization error rate, the temporal assignment of claims to speaker spans, and cases requiring review. Never auto-attribute an unknown voice merely to raise a counter.

## Reproducibility and privacy
- Source manifest: `scripts/voiceprints/sources.json`.
- Publisher-row index: `scripts/voiceprints/speaker-index.json`.
- Runner: `scripts/voiceprints/batch.py`; workflow: `.github/workflows/voiceprints-batch.yml`.
- Signed OIDC import route: `api/voice-import-action.js`.
- Enrollment QA outputs are GitHub Actions artifacts containing metrics and logs, **not** raw audio or embeddings.
- Raw speaker embeddings remain inside Neon; operator access and appropriate data-retention procedures are required.
