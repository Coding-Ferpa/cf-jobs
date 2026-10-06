# ADR-0020 — Agnostic Broadcast Subsystem and WhatsApp Group Integration

- **Status:** accepted
- **Date:** 2026-08-22
- **Authors:** Coding Ferpa maintainers & engineering team

## Context

The CF Jobs platform includes job creation and review workflows within the administrative panel. To maximize the reach and visibility of newly published tech jobs across the community, it is essential to automatically broadcast postings to the channels where the community actively engages (WhatsApp, Telegram, Discord, etc.).

The primary integration required is the official **WhatsApp Business Cloud API (Meta Graph API)**, supporting group messaging (`recipient_type: "group"`), utilizing a single access token across two distinct environments: a Test Group (`WHATSAPP_GROUP_ID_TEST`) and an Official Production Group (`WHATSAPP_GROUP_ID_PROD`). In addition, Meta requires webhook validation and event handling to confirm message delivery and status updates.

The broadcast system must be channel-agnostic so that introducing future destinations (Telegram, Discord, Slack) requires no refactoring of the job creation UI or the core dispatch engine.

## Decision

1. **Modular, Channel-Agnostic Broadcast Architecture (`src/lib/broadcast/`):**
   - Defined a standardized contract (`BroadcastProvider`), paired with a dynamic catalog of available channels (`AVAILABLE_CHANNELS`), allowing new providers to be registered without modifying the admin form components.
   - Built a central dispatcher `dispatchJobBroadcast(job, channels, options)` that triggers notifications in parallel with resilient error handling and non-blocking failure isolation.

2. **Official WhatsApp Cloud API Provider:**
   - Implemented direct integration with Meta Graph API via the `POST /{phone_number_id}/messages` endpoint, leveraging native group messaging (`"recipient_type": "group"` and `"to": "<group_id>"`).
   - Added environment target selection (`test` vs `prod`), switching between `WHATSAPP_GROUP_ID_TEST` and `WHATSAPP_GROUP_ID_PROD` under the same `WHATSAPP_ACCESS_TOKEN`.
   - Enabled graceful degradation: if environment variables are not configured in `.env`, the provider bypasses execution cleanly without failing the job creation action.

3. **Admin Form Controls (`JobForm`):**
   - Added a "Divulgação e Notificações" (Broadcast & Notifications) section with a pre-selected toggle (`sendToWhatsApp: true` by default) that can be deselected by curators.
   - Provided an environment selector to easily route job dispatches to test or production groups.

4. **Meta Webhook Endpoint (`/api/webhooks/whatsapp`):**
   - `GET`: Implemented the Meta verification handshake (`hub.mode === 'subscribe'`, `hub.verify_token`, and returning `hub.challenge` with HTTP 200).
   - `POST`: Implemented payload processing for group message status updates (`sent`, `delivered`, `read`, `failed`).

## Consequences

- **Positive:**
  - Newly created jobs can be immediately broadcast to community WhatsApp groups without manual curation effort.
  - The architecture is decoupled: future channels (Telegram, Discord) are added simply by registering a new `BroadcastProvider`.
  - Highly resilient: missing `.env` credentials will not break job persistence or administrative workflows.
  - Full compliance with Meta Cloud API webhook specifications and verification protocols.

- **Trade-offs / Mitigated Risks:**
  - External API dispatches are non-blocking regarding Postgres transaction integrity.
  - All environment keys are documented in `.env.example` and strictly validated by `pnpm check:env`.

## Alternatives Considered

- **Hardcoding WhatsApp dispatch directly inside the Server Action without an abstraction layer** — Rejected because it tightly couples the action and form to a single third-party provider, making future roadmap expansion to Discord/Telegram difficult and error-prone.
- **Using scraping or unofficial automation libraries (e.g., Puppeteer / Baileys)** — Rejected due to Terms of Service violations, unreliability, and high risk of phone number bans. The official Meta Cloud API provides stability, security, and enterprise-grade uptime.
