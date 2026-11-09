# 🏛️ Nexus — High-Impact Agency Operations CRM & Pipeline Engine

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-16_App_Router-black.svg?logo=next.js)
![NestJS](https://img.shields.io/badge/NestJS-10.0-E0234E.svg?logo=nestjs)
![Prisma](https://img.shields.io/badge/Prisma-PostgreSQL-2D3748.svg?logo=prisma)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC.svg?logo=tailwind-css)
![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-f69220.svg?logo=pnpm)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

**Modern, responsive CRM and operational control system engineered for design agencies, development studios, and client-facing consultancies.**

[System Architecture](#-system-architecture) • [Database ERD](#-database-erd) • [Pipeline Sequence](#-agency-deal-to-invoice-lifecycle) • [Quick Start](#-quick-start)

</div>

---

## ⚡ Overview

**Nexus** consolidates lead qualification, sales pipelines, client milestone tracking, and invoicing into a unified, high-performance operational cockpit. Built with a modular NestJS core and a responsive Next.js frontend, Nexus delivers sub-100ms dashboard interactions and full financial transparency.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph UI["🖥️ Frontend App (Next.js 16 + React 19)"]
        Kanban["Deal Pipeline Kanban Board"]
        ClientHub["Client & Contact Directory"]
        Invoicing["Invoice Builder & Payment Ledger"]
        Analytics["Revenue & Conversion Telemetry"]
        
        Kanban & ClientHub & Invoicing & Analytics
    end

    subgraph Gateway["⚡ API Core (NestJS Modular Architecture)"]
        AuthMid["JWT Auth & Role Guards (Admin / Manager / Client)"]
        PipelineService["Sales Pipeline & Lead Scoring Service"]
        ProjectService["Client Project & Milestone Tracker"]
        BillingService["Invoicing & Escrow Gateway"]
        WebhookHandler["Resend / Stripe / KHQR Webhook Hub"]
        
        UI <--> AuthMid
        AuthMid --> PipelineService & ProjectService & BillingService
        BillingService <--> WebhookHandler
    end

    subgraph Storage["💾 Persistence Layer"]
        Postgres[(PostgreSQL Relational DB)]
        PrismaORM["Prisma 6 Client"]
        RedisCache[(Redis Cache & Session Store)]
        
        Gateway <--> PrismaORM <--> Postgres
        Gateway <--> RedisCache
    end
```

---

## 📊 Database ERD

```mermaid
erDiagram
    AGENCIES ||--o{ USERS : employs
    AGENCIES ||--o{ CLIENTS : manages
    CLIENTS ||--o{ DEALS : has
    CLIENTS ||--o{ PROJECTS : commissions
    PROJECTS ||--o{ INVOICES : bills
    USERS ||--o{ DEALS : assigned_to

    AGENCIES {
        string id PK "cuid"
        string name
        string domain
        string currency
        datetime createdAt
    }

    USERS {
        string id PK "cuid"
        string email UK
        string passwordHash
        string fullName
        string role "ADMIN | MANAGER | STAFF"
        datetime createdAt
    }

    CLIENTS {
        string id PK "cuid"
        string agencyId FK
        string companyName
        string contactName
        string email
        string phone
        string status "PROSPECT | ACTIVE | ARCHIVED"
    }

    DEALS {
        string id PK "cuid"
        string clientId FK
        string assignedToId FK
        string title
        decimal value
        string stage "DISCOVERY | PROPOSAL | NEGOTIATION | WON | LOST"
        int probability
    }

    PROJECTS {
        string id PK "cuid"
        string clientId FK
        string name
        decimal budget
        string status "PLANNING | IN_PROGRESS | DELIVERED"
        date deadline
    }

    INVOICES {
        string id PK "cuid"
        string projectId FK
        string invoiceNumber UK
        decimal amount
        string status "DRAFT | SENT | PAID | OVERDUE"
        date dueDate
    }
```

---

## 🔄 Agency Deal to Invoice Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Lead as 💼 Prospective Client
    actor Manager as 👔 Account Manager
    participant App as 🖥️ Nexus Web
    participant API as ⚡ NestJS Gateway
    participant DB as 💾 PostgreSQL
    participant Email as 📨 Resend Notification Hub

    Lead->>App: Submits Project Request via Inbound Form
    App->>API: POST /api/leads
    API->>DB: Insert Deal (stage: DISCOVERY)
    API-->>Manager: 🔔 Push Notification: New Inbound Lead

    Manager->>App: Drags Deal across Kanban to WON
    App->>API: PATCH /api/deals/:id { stage: "WON" }
    API->>DB: Convert Deal -> Active Project
    
    Manager->>App: Generate Milestone Invoice ($10,000)
    App->>API: POST /api/invoices { projectId, amount: 10000 }
    API->>DB: Insert Invoice (status: SENT)
    API->>Email: Dispatch Invoice PDF to Client
    
    Lead->>API: Completes Payment via Stripe / Bank Transfer
    API->>DB: Update Invoice status: PAID
    API-->>App: Broadcast Real-Time Revenue Update
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Set DATABASE_URL, JWT_SECRET, RESEND_API_KEY
```

### 3. Migrate Database & Start Server
```bash
pnpm prisma db push
pnpm run dev
```

Visit `http://localhost:3000` to launch Nexus.

---

## 📄 License
MIT License © **[Ros Rendo](https://github.com/RosRendo)**
