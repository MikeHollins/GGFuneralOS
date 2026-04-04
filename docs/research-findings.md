# GGFuneralOS Research Findings — April 2026

## Key Discoveries That Change Our Architecture

### 1. Intake Agent: SMS + Secure Web Portal (not pure SMS)
**Finding:** Healthcare industry (Klara, Phreesia) solved this — SMS for notifications/nudges, but sensitive data (SSN, insurance, photos, documents) goes through a secure web link sent via text. MMS can only handle 500KB, useless for videos/PDFs.
**Action:** Intake Agent sends conversational texts but links to a mobile-friendly web portal for:
- SSN, DOB, insurance info (encrypted)
- Photo/video/PDF uploads (unlimited size)
- Document signing (DocuSign or built-in e-sign)
- Payment later on

### 2. Payment Should Be a Separate Agent
**Finding:** Every industry (healthcare, legal, auto) separates intake from payment. Different skills, different timing, different emotional context. Payment happens AFTER the in-person meeting, not during initial intake.
**Action:** Payment Agent handles: Stripe/Apple Pay/Google Pay, insurance assignment tracking, CFS payment plans, invoicing. Triggered after arrangement conference. Connected to same case record.

### 3. Afterword (NFDA 2025 Innovation Winner) Is Our Closest Competitor
**Finding:** Afterword's "Grace" AI does photo-to-case-file, pre-loads family history before meetings, auto-generates documents. Won the 2025 NFDA Innovation Award. But they charge $349-549/mo. We can beat them on price and customization.
**Key differentiator for us:** Max as the mobile interface (text-based, no app needed) + fully open/customizable.

### 4. kcgoldengate.com Analysis — Critical Gaps
**Platform:** Duda CMS + Tukios for obituaries
**Has:** 8 service packages ($845 - $11,500), 42 pages, 1000+ obituary pages, pre-planning form
**Missing:**
- No Schema.org structured data (major SEO miss)
- Placeholder text still on homepage ("Write your caption here")
- No blog/content marketing
- No live chat
- No Instagram presence
- No Google Maps on contact page
- No hours of operation displayed
- Pre-planning form has no calculator or downloadable guide
- Pricing pages render via JS (invisible to Google crawlers)

**Their packages** (critical for intake agent to reference):
| Package | Price | Description |
|---------|-------|-------------|
| The Direct | $845 | Basic cremation, no viewing |
| The Memorial | $1,995 | Memorial service, no body present |
| The Noble | $4,500 | Cremation + embalming + 1-hr visitation |
| The Formal | $4,750 | Traditional funeral + graveside |
| The Prestige | $5,950 | Enhanced funeral + casket up to $1,100 |
| The Gold | $6,995 | 2-hr visitation + family car + casket up to $1,500 |
| The Imperial | $8,500 | DVD tribute + standing floral |
| The Royal | $11,500 | Horse & carriage, Sprinter van, dove release |

### 5. Death Certificate in Missouri — No API, Browser-Only
**Finding:** MoEVR has no public API. All platforms (Passare, SRS, Halcyon) either use pre-filled worksheets or browser automation. Can't directly integrate.
**Action:** Generate a perfect MoEVR-ready worksheet from case data. Pre-fill every field so the director just copies into the browser. Track completion status.

### 6. E-Signatures Legal in MO for All Funeral Docs
**Finding:** Missouri UETA gives e-signatures full legal validity including cremation authorization. DocuSign is the most legally defensible platform. No major funeral software has native DocuSign API integration.
**Action:** Integrate DocuSign API for all documents. This alone is a differentiator.

### 7. Insurance Assignment Is the #1 Revenue Cycle Problem
**Finding:** 30-60 day average collection. Different insurers have different forms. CFS can advance funds (3-5% discount). Most homes track on spreadsheets.
**Action:** Insurance tracking dashboard, auto-populated claim forms per insurer, follow-up automation at Day 14/30/45/60.

### 8. Program Templates Need Cultural Depth
**Finding:** Top Etsy sellers move 10K-50K+ funeral program templates. Homegoing programs (8-page booklets) are a huge market. Cultural-specific templates (Hispanic, Polynesian, Jewish, Military) are in high demand.
**Must ship with:** Classic, Homegoing Glory (8-page), Military, Watercolor Floral, Modern Minimal, Celebration of Life, Nature/Landscape, Religious/Faith, Photo Collage, Child/Infant, Hispanic/Guadalupe, plus 2-3 more.

### 9. No Funeral Software Has a Real Kanban Board
**Finding:** Every funeral home has a physical whiteboard. Halcyon digitized it but it's basic. MortemCare has progress indicators. Nobody has true drag-and-drop Kanban. This is a genuine differentiation opportunity.

### 10. 75% of Funeral Software Logins Are Mobile
**Finding:** Gather reports 75%+ mobile logins. Directors are never at their desk. Our dashboard MUST be mobile-first, not responsive-as-afterthought.

## Revised Agent Architecture

```
FAMILY-FACING:
├── Intake Agent (SMS + web portal)
│   ├── Conversational info gathering
│   ├── Secure portal for SSN/photos/docs
│   ├── Meeting scheduling (Calendly-style)
│   ├── Package recommendations (links, no prices in SMS)
│   └── Handoff to arrangement conference
│
├── Payment Agent (post-arrangement only)
│   ├── Apple Pay / Google Pay / Stripe
│   ├── CFS payment plans
│   ├── Insurance assignment tracking
│   ├── Invoicing + receipts
│   └── Collections follow-up
│
STAFF-FACING:
├── Design Agent
│   ├── 15+ program templates (cultural-aware)
│   ├── AI obituary drafting
│   ├── Social media post generation
│   └── Tribute video generation (future)
│
├── Compliance Agent
│   ├── MoEVR worksheet generator (pre-filled)
│   ├── Deadline tracker (DC 5-day, med cert 72hr)
│   ├── FTC GPL compliance checker
│   ├── DocuSign integration for all documents
│   └── Permit tracking
│
├── Webmaster Agent
│   ├── Auto-publish obituaries to website + social
│   ├── SEO optimization (Schema.org, meta tags)
│   ├── Google Business Profile auto-posting
│   ├── Auto Google review requests (7-14 days post)
│   └── Daily content calendar (Mon-Fri themes)
│
└── Orchestrator
    ├── 8-phase state machine
    ├── Auto-trigger agents on phase transitions
    ├── Task generation with deadlines
    ├── Staff notifications (push + SMS)
    └── Automation triggers between agents
```
