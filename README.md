# AI Operations Brain Platform

A production-ready, multi-tenant AI-powered ERP automation platform.

## 🚀 Quick Start (Docker)

The fastest way to run the entire stack:

```bash
docker-compose up --build
```

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Admin Panel**: http://localhost:8000/admin (User: `admin`, Pass: `admin123`)

## 🛠️ Tech Stack

- **Backend**: Django, DRF, PostgreSQL (JSONB), Redis, Celery, Pandas.
- **Frontend**: React, Vite, Lucide Icons, Framer Motion, Vanilla CSS (Premium Design System).
- **AI**: Custom Decision Engine, Forecast Logic, LLM Mapping Layer.

## 📂 Core Modules

1. **Multi-Tenancy**: Data isolation for multiple organizations.
2. **Document Engine**: Create custom entity schemas on the fly.
3. **Smart Ingest**: Upload CSV/Excel and let AI map columns to business fields.
4. **AI COO**: Actionable decisions on inventory, production, and restock.
