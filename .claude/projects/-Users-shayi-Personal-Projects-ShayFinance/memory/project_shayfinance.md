---
name: ShayFinance Project Overview
description: Private personal finance dashboard - Next.js, israeli-bank-scrapers-core, PostgreSQL, RTL Hebrew UI
type: project
---

Personal finance dashboard that auto-fetches and categorizes transactions from Israeli banks.

**Stack:** Next.js (App Router) + TypeScript, Tailwind + Shadcn UI, PostgreSQL (Docker), israeli-bank-scrapers-core
**Banks:** Bank Discount, Max, Cal
**Key constraints:**
- Cal and Max must use "Internet Username" (User ID), NOT National ID
- MFA (SMS/Push) flows must be handled securely
- All credentials in .env only, never logged
- RTL Hebrew UI, light theme only, Lucide icons, no emoji
- Local/Docker deployment only

**Why:** Shay wants a private, secure way to aggregate and categorize personal finances across multiple Israeli banks.

**How to apply:** All architecture decisions should prioritize security and privacy. UI work must be RTL-first.
