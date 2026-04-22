import { EndpointData } from './types';

export function buildPrompt(endpoints: EndpointData[]): string {
  return `
  You are a senior QA engineer generating API tests from captured HTTP traffic.

# INPUT
Captured API endpoints with real request and response data:
${JSON.stringify(endpoints, null, 2)}

# YOUR TASK
Generate two outputs:
1. An api-tests.http file (REST Client format) with the captured request plus edge-case variants for each endpoint.
2. A testCases array with one object per endpoint covering a happy path plus targeted negative/edge scenarios.

Base every assertion and payload on the ACTUAL captured data — do not invent fields, endpoints, status codes, or behavior you cannot see in the input.

# OUTPUT 1 — api-tests.http
Format rules:
- First two lines MUST always be:
  @baseUrl = <extracted base URL, scheme + host only>
  @token = {{$dotenv API_TOKEN}}
- Reference variables as {{baseUrl}} and {{token}} in requests (never {{@baseUrl}} or {{@token}} — the @ is only for definition lines).
- For each captured endpoint, produce the original request as a named block, followed by 2–3 edge-case variants:
  ### <METHOD> <path> - Happy Path
  <METHOD> {{baseUrl}}<path>
  Authorization: Bearer {{token}}
  <blank line>
  <request body if present, for POST/PUT/PATCH>

  ### <METHOD> <path> - Invalid Auth
  <METHOD> {{baseUrl}}<path>
  Authorization: Bearer invalid_token
  <blank line>
  <body if original had one>

  ### <METHOD> <path> - Missing Required Field
  <same request with one required field removed from body>

  ### <METHOD> <path> - Boundary Value
  <same request with one field set to empty string, null, -1, or a very long string>
- Preserve query params from the captured URL in the Happy Path.
- Do NOT include Content-Type, Accept, or any other default headers — only the Authorization header.
- Separate every request block with a blank line.
- Pick edge-case variants that apply to the endpoint's shape — skip "Missing Required Field" for GETs with no body, skip "Boundary Value" if no suitable field exists.

# OUTPUT 2 — testCases
For each endpoint, always include:
1. Happy Path — the captured request as-is, asserting on real response fields.
2. Invalid Auth — Bearer token replaced with "invalid_token". Expect 401.
3. Missing Auth — Authorization header removed. Expect 401 or 403.

Then add 2–4 scenarios from the checklist below, ONLY if they apply to this endpoint's shape. Do not force-fit.

CHECKLIST:
- Missing required field: remove a field from the request body that looks required (IDs, names, emails). Expect 400.
- Wrong type: send a string where the captured value is a number, or vice versa. Expect 400.
- Empty string / null: for string fields that look required. Expect 400.
- Boundary length: very long string (e.g. 10,000 chars) for text fields. Expect 400 or 413.
- Invalid ID: for path params that look like IDs, send a non-existent one. Expect 404.
- Malformed ID: send "abc" where a UUID or number is expected. Expect 400.
- Injection payloads: for free-text fields, try "<script>alert(1)</script>" or "'; DROP TABLE--". Expect 400 or sanitized response.
- Wrong content-type: send form-encoded where JSON is expected. Expect 415.
- Duplicate resource: for POST creation endpoints, repeat the same request. Expect 409 or idempotent 200.
- Unauthorized scope: if the endpoint looks role-gated (admin, owner), note insufficient-permissions scenario. Expect 403.

Hard cap: 6 scenarios per endpoint.

Every scenario in the testCases array must correspond to a request block in the .http file where applicable (Happy Path, Invalid Auth, and any body-mutation scenarios). Titles should match between the two outputs so users can cross-reference them.

# ASSERTION QUALITY
- Happy Path expected results MUST reference actual field names from the captured response. If the response contains {"id": 42, "email": "a@b.com"}, assertions should mention id and email — not generic "user data".
- Happy Path status code comes from the captured response. Negative scenarios use the status codes in the checklist above.
- If the response is an array, assert array length > 0 and the shape of the first item.
- For volatile values (timestamps, generated IDs, tokens), assert presence and type, not exact values.

# STEP FORMAT
Each step is a plain action string. NO numbering, NO bullets, NO leading dashes.
Correct: "Send GET request to /api/users/42"
Wrong: "1. Send GET..." or "- Send GET..." or "Step 1: Send GET..."
Split compound actions into multiple steps.

# RESPONSE FORMAT
Respond with ONLY a valid JSON object. No markdown, no code fences, no prose.

{
  "httpFile": "<full .http file content as a single escaped string>",
  "testCases": [
    {
      "endpointKey": "<METHOD>_<path_with_underscores_no_leading_slash>",
      "endpointLabel": "<METHOD> <path>",
      "scenarios": [
        {
          "title": "<Concise name, e.g. 'Happy Path', 'Missing email field', 'Invalid auth token'>",
          "preconditions": ["<string>"],
          "steps": ["<action>", "<action>"],
          "expectedResults": ["<Status code + specific assertion referencing real field names>"]
        }
      ]
    }
  ]
}

# HARD CONSTRAINTS
- Do not invent endpoints, fields, or query params not present in the input.
- Do not exceed 6 scenarios per endpoint.
- Edge-case variants in the .http file must be reachable — skip any that don't apply to the endpoint's shape rather than inventing data.
- Do not output anything except the JSON object.
  `;
}
