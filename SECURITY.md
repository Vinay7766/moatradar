# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in **MoatRadar** (such as SSRF bypass, prompt-injection escalation, XSS in rendered deliverables, or credential leakage), please **do not** open a public issue with exploit details.

Instead, report it privately via GitHub Security Advisories (`Security` -> `Advisories` -> `New draft security advisory`) in this repository, including:

- Affected component or endpoint
- Steps to reproduce or minimal proof-of-concept
- Potential impact and any suggested remediation

We will acknowledge reports within 72 hours and work to release a fix before public disclosure.

## Built-In Security Controls

- **SSRF Protection**: Outbound HTML fetching in `backend/app/tools/security.py` blocks private, loopback, link-local, and non-HTTP(S) schemes before request dispatch and inspects DNS resolution.
- **Prompt Injection Defense**: Untrusted web and community content is sanitized and wrapped in explicit `<untrusted_evidence>` delimiters inside agent prompts.
- **Credential Isolation**: API keys remain strictly server-side in `.env`; `GET /api/providers` exposes only boolean readiness and discovered model identifiers.
