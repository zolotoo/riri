# RiRi AI — Local Development Guide

## Prerequisites
- **Node.js**: 20.x or higher
- **Vercel CLI**: `npm install -g vercel`
- **Make**: (optional)

## Setup Instructions

1. **Install dependencies:**
   ```bash
   make install
   ```

2. **Configure Environment:**
   ```bash
   cp .env.local.example .env.local
   # Fill in the keys in .env.local
   ```

3. **Verify Configuration:**
   ```bash
   make check-env
   ```

4. **Start Development Server:**
   ```bash
   make dev
   ```
   - **Frontend/API**: http://localhost:3000

## Notes
- `vercel dev` handles both frontend (Vite) and backend (api/).
- Hot reload is supported for both.
- First run will prompt for `vercel link`.
