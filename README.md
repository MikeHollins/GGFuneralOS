# GGFuneralOS

Funeral home operating system for KC Golden Gate Funeral Home. Automates case management, obituary/program generation, compliance tracking, social media, and family communication — all accessible via a central dashboard or by texting Max.

## Architecture

```
5 Agents → Orchestrator → Central Database → Dashboard
                                              ↕
                                         Max (via text)
```

| Agent | Role |
|-------|------|
| **Intake Agent** | SMS-based family information collection (sympathetic, professional tone) |
| **Design Agent** | Auto-generates obituaries, bifold programs, social media posts |
| **Compliance Agent** | Tracks MO death cert deadlines, permits, FTC GPL compliance |
| **Webmaster Agent** | Publishes obituaries to website + social media with CTAs |
| **Orchestrator** | State machine managing 8 case phases with 60+ auto-generated tasks |

## Quick Start

```bash
git clone https://github.com/MikeHollins/GGFuneralOS.git
cd GGFuneralOS
cp .env.example .env
# Fill in your API keys (see Setup Guide below)
npm install
npm run db:push   # Create database tables
npm run dev       # Start development server
```

Server runs at `http://localhost:4000`

---

## API Keys & Credentials Setup Guide

### 1. Neon PostgreSQL (required)

**What:** Free serverless Postgres database for all case data.

1. Go to [neon.tech](https://neon.tech) → Sign up (free)
2. Click **"New Project"** → Name it `ggfuneralos`
3. Select region **US East 2** (closest to KC)
4. Once created, click **"Connection Details"** in the dashboard
5. Copy the **connection string** — it looks like: `postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require`
6. Paste into `.env` as `DATABASE_URL`

```
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 2. Twilio (required for Intake Agent SMS)

**What:** Sends/receives SMS messages with families.

1. Go to [twilio.com](https://www.twilio.com) → Sign up (free trial gives $15 credit)
2. Once logged in, your **Account SID** and **Auth Token** are on the main dashboard
3. Click **"Get a trial phone number"** → Twilio assigns you a number
4. Copy all three values into `.env`:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890
```

5. To receive incoming SMS: Go to **Phone Numbers** → Your number → **Messaging** → Set webhook URL to `https://your-server.com/api/intake/webhook`

### 3. Google AI API Key (required for obituary generation)

**What:** Powers AI obituary drafting and text processing.

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **"Get API Key"** → **"Create API Key"**
3. Copy the key (starts with `AIza...`)
4. Paste into `.env`:

```
GOOGLE_AI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. Facebook Page Token (optional — for social media posting)

**What:** Auto-posts memorial and marketing content to the funeral home's Facebook page.

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**
2. Choose **"Business"** type → Name it `GGFuneralOS`
3. Add the **Pages** product
4. Go to **Tools** → **Graph API Explorer**
5. Select your app → Click **"Get User Access Token"**
6. Check permissions: `pages_manage_posts`, `pages_read_engagement`
7. Click **"Generate Access Token"** → Authorize
8. Exchange for a **long-lived page token**: Tools → Access Token Debugger → Extend
9. Paste into `.env`:

```
FACEBOOK_PAGE_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 5. Instagram Access Token (optional)

**What:** Auto-posts memorial content to Instagram.

1. Instagram posting requires a **Facebook Page** connected to an **Instagram Professional Account**
2. Follow steps 1-6 from Facebook above
3. Add permission: `instagram_basic`, `instagram_content_publish`
4. The same extended token works for both FB and IG

```
INSTAGRAM_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 6. Twitter/X API (optional)

**What:** Auto-posts memorial and marketing content to Twitter/X.

1. Go to [developer.x.com](https://developer.x.com) → Sign up for **Free** tier
2. Create a **Project** → Create an **App** inside it
3. Go to **Keys and Tokens** → Generate **API Key** and **API Secret**
4. Generate **Access Token and Secret** (with Read and Write permissions)
5. Paste into `.env`:

```
TWITTER_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITTER_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 7. LinkedIn Access Token (optional)

**What:** Auto-posts professional content to LinkedIn company page.

1. Go to [linkedin.com/developers](https://www.linkedin.com/developers/) → **Create App**
2. Verify your company page connection
3. Request **Marketing Developer Platform** access (required for posting)
4. Under **Auth** → Copy the **Access Token**
5. Paste into `.env`:

```
LINKEDIN_ACCESS_TOKEN=AQVxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 8. Server & Funeral Home Config

```
PORT=4000
API_SECRET=generate-a-random-string-here

FUNERAL_HOME_NAME=KC Golden Gate Funeral Home
FUNERAL_HOME_PHONE=(816) XXX-XXXX
FUNERAL_HOME_ADDRESS=1234 Main St, Kansas City, MO 64101
FUNERAL_HOME_WEBSITE=https://kcgoldengate.com
```

---

## API Endpoints

### Cases
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cases` | List cases (filter by `?phase=ACTIVE`) |
| GET | `/api/cases/:id` | Get full case with contacts, tasks, timeline |
| POST | `/api/cases` | Create new case |
| PATCH | `/api/cases/:id` | Update case fields |
| POST | `/api/cases/:id/advance-phase` | Move case to next phase |
| DELETE | `/api/cases/:id` | Delete case |

### Max Bridge
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/max/new-case` | Create case from first call info |
| GET | `/api/max/active` | Get active cases summary |
| PATCH | `/api/max/update-case` | Update case by number or last name |
| POST | `/api/max/advance` | Advance case phase |
| GET | `/api/max/overdue` | Get overdue tasks |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/board` | Kanban board data (cases grouped by phase) |
| GET | `/api/dashboard/metrics` | KPIs and stats |
| GET | `/api/dashboard/calendar` | Service/event calendar |
| GET | `/api/dashboard/summary` | Quick summary for Max |

### Documents
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/documents/program/:caseId` | Generate funeral program PDF |
| POST | `/api/documents/obituary/:caseId` | Generate obituary draft |

---

## Missouri Compliance Notes

- **Death certificate filing**: 5 days from death (RSMo 193.145)
- **Medical certification**: 72 hours from death
- **Electronic system**: MoEVR (Missouri Electronic Vital Records)
- **Cremation**: Requires signed authorization from legal next of kin
- **FTC Funeral Rule**: GPL must be presented before discussing prices

---

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **API**: Express
- **Database**: PostgreSQL (Neon serverless)
- **PDF**: PDFKit (funeral programs, documents)
- **SMS**: Twilio (intake agent)
- **AI**: Google Gemini (obituary generation)

## License

Private — KC Golden Gate Funeral Home
