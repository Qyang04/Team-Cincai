# SME Finance Ops Copilot

> [!IMPORTANT]
> **🚀 [View the Project Presentation on Canva](https://canva.link/5490yir8jsymb0s)**
> 
> **📂 [Backup Documentation & Video (Google Drive)](https://drive.google.com/drive/folders/1LVr58U6C5wv-CDQNNJRFhnQQYLTkrFwO?usp=sharing)**

Greenfield implementation scaffold for a finance-operations workflow platform powered by **Qwen AI**.

## 🚀 Getting Started

Follow these steps to get the project running locally.

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **Docker & Docker Desktop** (for PostgreSQL and Redis)
- **Alibaba Cloud API Key** (for Qwen AI)

### 2. Setup Environment
1. Clone the repository.
2. Copy `.env.example` to `.env` in the root directory:
   ```powershell
   cp .env.example .env
   ```
3. Update `.env` with your **Qwen API Key** and settings:
   ```bash
   ZAI_API_KEY=your_key_here
   ZAI_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
   ZAI_MODEL_PRIMARY=qwen3.5-plus
   ```

### 3. Install & Start Services
Run these commands in order:

1. **Install dependencies:**
   ```powershell
   npm install
   ```
2. **Start Docker services (Database & Redis):**
   ```powershell
   docker-compose up -d
   ```
3. **Generate Prisma Client:**
   ```powershell
   npx prisma generate --schema apps/api/prisma/schema.prisma
   ```
4. **Push Database Schema:**
   ```powershell
   npx prisma db push --schema apps/api/prisma/schema.prisma
   ```

### 4. Run the Application
You need to start both the API and the Web App.

**Start the NestJS API:**
```powershell
npm run dev:api
```

**Start the Next.js Web App (in a new terminal):**
```powershell
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🏗️ Workspace Layout
- `apps/web`: Next.js frontend (Requester, Approver, Finance-Review, Admin UI)
- `apps/api`: NestJS backend (Workflow engine, AI orchestration, Policy engine)
- `packages/shared`: Shared domain types, Zod schemas, and constants

## 🛠️ Stack
- **Web:** Next.js 15, Tailwind CSS, Lucide Icons
- **API:** NestJS, OpenAI SDK (connected to Qwen)
- **Database:** PostgreSQL (via Prisma)
- **Messaging:** Redis + BullMQ
- **Auth/Storage:** Supabase (with Mock Fallback)
