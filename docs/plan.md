# Build plan

The full interactive plan (architecture diagram, preset preview, roadmap checklist) is the
BoutiquePOS Build Plan artifact: https://claude.ai/artifact/439PcCQkcmrApiv4utrGei
(private to the owner until shared). This file keeps the decisions and phases in the repo.

## Decisions

| Topic | Decision |
| --- | --- |
| Product | Generic white-label POS for boutiques and related shops. Tabeli-Kiddies is reference only. |
| Name | "BoutiquePOS" is a working name. |
| Hosting | One Supabase project, many isolated businesses (row-level security). |
| Licensing | Plan + expiry; 7-day grace; then read-only. The platform developer can suspend. Devices must check in every 7 days. |
| Presets at launch | Fashion boutique, Kids & baby, Shoes & bags, Cosmetics & beauty. |
| Settings levels | Platform (developer console) → Business (Manager edits only tabs the developer allows) → Device. |
| Desktop | Windows first, Tauri v2. |
| Money and time | Minor units per business currency; business time zone (default Africa/Lagos). |

Open: final product name, pilot shop's printer model and paper width (needed by Phase 8), how licence fees are collected (manual in v1).

## Phases

| Phase | Outcome |
| --- | --- |
| P0 Foundations | Repo, Supabase project, baseline schema with RLS, CI. A fresh database builds from migrations and CI is green. |
| P1 Platform and licensing | Developer console, plans, licences, signed licence token, create business and invite owner; suspension blocks sales on the server. |
| P2 Brands and presets | Settings schema and history, theme from one brand colour, terminology, channels and payment methods, presets applied on creation, device settings. |
| P3 Catalogue and stock | Option sets, products, variants, barcodes and labels, stock movements, batches and expiry. |
| P4 Selling | Offline outbox, till screen, checkout, receipt series, `apply_events`. |
| P5 Sync hardening | Incremental pull by `seq`, Realtime nudge, review inbox, PWA install. |
| P6 Cash and staff | Staff PIN sign-in, page access, drawer sessions, audit log. |
| P7 Reports, returns, customers | Dashboard, exports, returns and exchanges, customer history. |
| P8 Windows app | Tauri shell, ESC/POS printing, drawer kick, signed updates. |
| P9 Pilot and launch | Onboarding checklist, CSV import, two-week pilot, user guide. |
