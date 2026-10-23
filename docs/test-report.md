# Test Report

Run with `npm test` (Node built-in test runner + supertest, against a temporary in-memory MongoDB). Result at time of writing: **22 passed, 0 failed**. Added cases: API needs a token, wrong password / operator-injection login rejected, tampered token rejected, security headers, future donation date rejected, non-string status rejected.

| Area | Case | Expected | Result |
|---|---|---|---|
| Donors | Create / read / update / delete | 201 / 200 / 200 / 200, then 404 | Pass |
| Donors | Age 10, bad blood group, 3-digit phone, empty name | 400 | Pass |
| Donors | Duplicate phone | 409 | Pass |
| Donors | Search by blood group and name; regex characters in search are literal | Correct matches, `.*` matches nothing | Pass |
| Donors | Malformed id / unknown id | 400 / 404 | Pass |
| Donors | Delete donor that has donations | 409 | Pass |
| Donations | Stock unchanged until screening passes, then +units once; repeat screening | 200, stock +2, then 409 and no change | Pass |
| Donations | Failed screening | No stock change | Pass |
| Donations | Ineligible donor / unknown donor / invalid screening value | 409 / 404 / 400 | Pass |
| Requests | Create, approve, reject | Stock unchanged | Pass |
| Requests | Fulfil | Stock reduced exactly once; repeat fulfil 409 | Pass |
| Requests | Fulfil with insufficient stock | 409, stock unchanged, request stays approved | Pass |
| Requests | Three simultaneous fulfil calls | Exactly one succeeds, stock reduced once | Pass |
| Requests | pending -> fulfilled, unknown status, 0 units | 409 / 409 / 400 | Pass |
| Inventory | All 8 groups listed, status Low/Good | Correct | Pass |
| Dashboard | Totals from aggregation | Correct | Pass |
| API | Malformed JSON body | 400 | Pass |

Manual smoke test: server started with `USE_MEMORY_DB=true`; `/api/health`, `/api/dashboard`, `/api/inventory` and `/` all responded (seed data: 12 donors, 54 units).
Browser UI was not exercised in an automated browser; add screenshots of each page here for submission.
