# Carbon Outreach

AI-powered B2B outreach agent for fashion brands in India. Discover fashion brand owners across Instagram, Facebook, and LinkedIn using hashtags — then send them AI-personalized DMs and cold emails at scale, with full manual approval control.

## Key Features

- **Hashtag-based discovery** — Find Indian fashion brands by searching relevant hashtags
- **Lead review & batch approval** — See all discovered leads, filter/deselect, then approve in one click
- **AI personalization (Claude)** — Your message template filled in per brand using their real profile data
- **Message preview** — Review personalized messages before anything is sent
- **Manual reply control** — Agent never auto-replies. All replies handled by you.
- **Email outreach** — Brands with websites get a personalized cold email too
- **Inbox tracking** — All conversations in one place

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Tailwind CSS + shadcn/ui |
| Backend | Python FastAPI |
| AI | Claude API (claude-sonnet-4-6) |
| Automation | Playwright (browser-based DM sending) |
| Database | PostgreSQL + SQLAlchemy |
| Queue | Redis + Celery |
| Email | SMTP / SendGrid |

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL (or Docker)
- Redis (or Docker)

### 1. Clone and setup

```bash
git clone <repo>
cd carbon-outreach
```

### 2. Frontend

```bash
cd client
npm install
npm run dev
# Runs on http://localhost:3000
```

### 3. Backend

```bash
cd server
python -m venv venv
venv\Scripts\activate       # Windows
# source venv/bin/activate  # Mac/Linux

pip install -r requirements.txt

cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

uvicorn app.main:app --reload --port 8000
# Runs on http://localhost:8000
```

### 4. (Optional) Start with Docker

```bash
docker-compose up
```

## Environment Variables

Copy `server/.env.example` to `server/.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | For AI message personalization |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis for Celery queue |
| `SENDGRID_API_KEY` | No | For email outreach |
| `SMTP_*` | No | SMTP alternative for emails |

## Workflow

```
1. Create Campaign → set hashtags, platforms, daily limit, message template
2. Discover → agent finds fashion brands in India matching your hashtags
3. Review → see full list with profile details, filter/deselect unwanted leads
4. Preview → see AI-personalized messages for 5 sample brands
5. Approve & Send → one click to launch — messages sent with human-like delays
6. Inbox → replies appear here; you reply manually
```

## Outreach Safety Notes

- Instagram flags accounts sending 200+ DMs/day — keep daily limit ≤ 100
- Random delays (30–120s) between messages are enforced automatically
- Playwright automation requires a logged-in browser session per platform
- Official Instagram/LinkedIn DM APIs do **not** support cold outreach — browser automation is the only viable path

## Roadmap

- [ ] Playwright scraper implementation (Instagram, Facebook, LinkedIn)
- [ ] Multi-account rotation for higher daily volumes
- [ ] Website email extractor (httpx + BeautifulSoup)
- [ ] Campaign analytics with conversion tracking
- [ ] WhatsApp Business API integration
- [ ] Celery worker for production outreach queue
