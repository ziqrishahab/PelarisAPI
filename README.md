# Backend API - Pelaris.id

REST API Server untuk Pelaris.id Omnichannel POS System

---

## Daftar Isi

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Setup Development](#setup-development)
- [Database](#database)
- [API Documentation](#api-documentation)
- [Architecture](#architecture)
- [Testing](#testing)

---

## Overview

Backend API dibangun dengan Hono framework yang sangat lightweight dan fast. Menggunakan PostgreSQL untuk database dengan Prisma ORM, Redis untuk caching, dan Socket.io untuk real-time synchronization.

Key Features:
- RESTful API dengan JSON response
- JWT Authentication + RBAC (Role-Based Access Control)
- Multi-tenant architecture dengan tenant isolation
- Real-time sync via WebSocket (Socket.io)
- Database connection pooling (max 10 connections)
- Redis caching untuk performance (optional, fallback to in-memory)
- Auto backup database harian (00:00 WIB)
- Comprehensive error logging (Winston)
- Rate limiting dan CSRF protection
- Password reset dengan token expiry
- API Documentation: Swagger/OpenAPI 3.0 di /api/docs
- Error Monitoring: Sentry integration

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 22.x | Runtime environment |
| Hono | 4.11 | Web framework (lightweight, fast) |
| TypeScript | 5.9 | Type-safe development |
| Prisma | 6.19 | ORM dan database migrations |
| PostgreSQL | 16 | Primary database |
| Redis | 7 | Caching layer (optional) |
| Socket.io | 4.8 | Real-time WebSocket |
| bcryptjs | Latest | Password hashing |
| jsonwebtoken | Latest | JWT authentication |
| Winston | Latest | Logging |
| Sentry | Latest | Error monitoring |
| ExcelJS | Latest | Excel import/export |
| Zod | 4.3 | Schema validation |
| Vitest | 4.0 | Unit testing |

---

## Setup Development

### 1. Prerequisites

- Node.js 22.x atau lebih baru
- PostgreSQL 16
- Redis 7 (optional untuk development, wajib untuk production)

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Copy file .env.example menjadi .env:

```bash
cp .env.example .env
```

Edit .env dengan konfigurasi Anda:

```env
# Server
NODE_ENV=development
PORT=5100
FRONTEND_URL=http://localhost:3100

# Database (with connection pooling)
DATABASE_URL=postgresql://postgres:password@localhost:5432/pelaris?schema=public&connection_limit=10&pool_timeout=10&statement_cache_size=500

# JWT
JWT_SECRET=your-super-secret-key-min-32-characters
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Redis (optional untuk development)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Sentry Error Monitoring
SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_ENABLED=true

# File Upload
MAX_FILE_SIZE=10485760  # 10MB
UPLOAD_DIR=./uploads

# Backup
BACKUP_DIR=./backups
BACKUP_RETENTION_DAYS=7

# Security
CSRF_SECRET=your-csrf-secret-key-32-chars
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info  # debug | info | warn | error
```

### 4. Database Setup

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed database (optional - untuk development)
npx prisma db seed
```

### 5. Run Development Server

```bash
npm run dev
```

Server akan running di: http://localhost:5100

---

## Database

### Schema Overview

```
Tenant (toko/bisnis)
  |-- Users (owner, manager, kasir)
  |-- Cabangs (cabang toko)
  |-- Categories
  |-- Products
  |   +-- ProductVariants
  |       +-- StokVariants (per cabang)
  |-- Transactions
  |   +-- TransactionItems
  |-- Returns
  |-- StockAdjustments
  |-- PasswordResets
  +-- Settings
```

Multi-Tenant Isolation:
- Semua data di-scope berdasarkan tenantId
- User hanya bisa akses data tenant mereka
- JWT token include tenantId untuk automatic scoping

Multi-Cabang Access:
- User dengan hasMultiCabangAccess = true bisa akses semua cabang
- User regular hanya bisa akses cabangId mereka
- Owner selalu punya multi-cabang access

### Migrations

```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (DANGER - development only)
npx prisma migrate reset
```

### Database Backup

Automatic backup berjalan setiap hari jam 00:00 WIB.

Manual backup:

```bash
npm run db:backup
```

Restore from backup:

```bash
npm run db:restore backup_filename.sql
```

---

## API Documentation

### Swagger UI

Interactive API Documentation: http://localhost:5100/api/docs

Swagger UI menyediakan:
- Complete API reference dengan schema
- Try-it-out functionality untuk test endpoint
- Request/Response examples
- Authentication testing
- Model definitions

### Base URL

Development: http://localhost:5100/api
Production: https://api.pelaris.id/api

### Authentication

Semua endpoint (kecuali login/register) memerlukan JWT token di header:

```http
Authorization: Bearer <jwt_token>
```

atau menggunakan HttpOnly Cookie (automatic dari browser).

### Quick Reference

#### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login user |
| POST | /api/auth/register | Register new user |
| POST | /api/auth/forgot-password | Request password reset |
| POST | /api/auth/reset-password | Reset password with token |
| GET | /api/auth/me | Get user profile |
| POST | /api/auth/logout | Logout user |
| GET/POST | /api/auth/users | Manage users (Owner/Manager) |

#### Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products | List products (pagination) |
| GET | /api/products/:id | Get product detail |
| POST | /api/products | Create product |
| PUT | /api/products/:id | Update product |
| DELETE | /api/products/:id | Delete product (soft delete) |
| POST | /api/products/bulk-delete | Bulk delete |
| POST | /api/products/import | Import from Excel |
| GET | /api/products/export | Export to Excel |
| GET | /api/products/template | Download template |
| GET | /api/products/search/sku/:sku | Search by barcode |

#### Transactions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/transactions | List transactions |
| GET | /api/transactions/:id | Get detail |
| POST | /api/transactions | Create transaction |
| GET | /api/transactions/reports/* | Sales reports |

#### Stock Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/stock/alerts | Low stock alerts |
| GET | /api/stock/movements | Stock movement history |
| POST | /api/stock/adjust | Adjust stock |
| POST | /api/stock/transfer | Transfer between branches |

#### Returns

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/returns | List returns |
| GET | /api/returns/:id | Get return detail |
| POST | /api/returns | Create return request |
| PUT | /api/returns/:id/approve | Approve return |
| PUT | /api/returns/:id/reject | Reject return |

#### Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/categories | List categories |
| POST | /api/categories | Create category |
| PUT | /api/categories/:id | Update category |
| DELETE | /api/categories/:id | Delete category |
| POST | /api/categories/bulk-delete | Bulk delete (max 50) |

#### Cabangs (Branches)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/cabang | List cabangs |
| GET | /api/cabang/:id | Get cabang detail |
| POST | /api/cabang | Create cabang |
| PUT | /api/cabang/:id | Update cabang |
| DELETE | /api/cabang/:id | Delete cabang |

#### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/settings | Get all settings |
| PUT | /api/settings | Update settings |

#### Backup and Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/backup | Manual backup database |
| GET | /api/backup/list | List backups |
| POST | /api/backup/restore | Restore from backup |
| POST | /api/sync/trigger | Trigger sync ke mobile |

### Response Format

Success Response:

```json
{
  "data": { ... },
  "message": "Success message"
}
```

Error Response:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

Pagination Response:

```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 234,
    "totalPages": 5
  }
}
```

---

## Architecture

### Folder Structure

```
backend/
|-- src/
|   |-- index.ts              # Entry point
|   |-- config/
|   |   +-- index.ts          # Configuration
|   |-- lib/
|   |   |-- prisma.ts         # Prisma client + pooling
|   |   |-- redis.ts          # Redis client
|   |   |-- cache.ts          # Cache utilities
|   |   |-- jwt.ts            # JWT utilities
|   |   |-- logger.ts         # Winston logger
|   |   |-- sentry.ts         # Error tracking
|   |   |-- excel.ts          # Excel helpers
|   |   +-- validators.ts     # Zod schemas
|   |-- middleware/
|   |   |-- auth.ts           # Authentication
|   |   |-- rate-limit.ts     # Rate limiting
|   |   |-- security.ts       # CSRF, CORS, etc
|   |   |-- file-upload.ts    # File upload handling
|   |   +-- timeout.ts        # Request timeout
|   |-- routes/
|   |   |-- auth.ts
|   |   |-- products.ts
|   |   |-- transactions.ts
|   |   |-- stock.ts
|   |   |-- returns.ts
|   |   |-- categories.ts
|   |   |-- cabang.ts
|   |   |-- settings.ts
|   |   |-- backup.ts
|   |   +-- sync.ts
|   +-- test/                 # Unit tests
|-- prisma/
|   |-- schema.prisma         # Database schema
|   |-- migrations/           # Migration files
|   |-- seed.cjs              # Seed data
|   +-- seed-products.js      # Product seed data
|-- uploads/                  # File uploads
|-- backups/                  # Database backups
|-- logs/                     # Application logs
+-- dist/                     # Compiled output
```

### Connection Pooling

Prisma configured dengan connection pooling:

```typescript
{
  connection_limit: 10,      // Max 10 connections
  pool_timeout: 10,          // 10 seconds wait
  statement_cache_size: 500  // Cache 500 prepared statements
}
```

### Caching Strategy

Redis digunakan untuk:
- Product list cache (TTL: 5 minutes)
- Category cache (TTL: 10 minutes)
- Settings cache (TTL: 1 hour)

Cache auto-invalidate saat data berubah via Socket.io events.

### Real-time Sync

WebSocket events:
- stock:updated - Stock changed
- product:created - New product
- product:updated - Product modified
- product:deleted - Product removed
- category:updated - Category changed
- sync:trigger - Manual sync request

---

## Testing

### Run Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Test Structure

```
src/test/
|-- api.test.ts              # API endpoint tests
|-- auth.integration.test.ts # Auth flow tests
|-- stock.integration.test.ts # Stock management tests
|-- returns.integration.test.ts # Returns flow tests
+-- validators.test.ts       # Validation tests
```

---

## Scripts

```bash
# Development
npm run dev                  # Run dev server with watch mode
npm run build                # Build for production
npm start                    # Run production server

# Database
npm run db:push              # Push schema changes (dev only)
npm run db:migrate           # Run migrations
npm run db:seed              # Seed database
npm run db:backup            # Manual backup
npm run db:restore           # Restore from backup

# Testing
npm test                     # Run all tests
npm run test:run             # Run once without watch
npm run test:coverage        # Generate coverage report

# Code Quality
npm run typecheck            # TypeScript type checking
```

---

## Production Deployment

Lihat DEPLOYMENT.md di root project untuk panduan lengkap deployment dengan Docker dan CI/CD.

Quick deployment:

```bash
# Build Docker image
docker build -t pelaris-backend -f Dockerfile .

# Run container
docker run -d \
  -p 5100:5100 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/backups:/app/backups \
  pelaris-backend
```

---

## Troubleshooting

### Error: EADDRINUSE

Port 5100 sudah dipakai.

Solusi:
```bash
# Windows
netstat -ano | findstr :5100
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:5100 | xargs kill -9
```

### Error: Prisma Client not generated

Solusi:
```bash
npx prisma generate
npm run build
```

### Error: Database connection failed

Solusi:
1. Cek PostgreSQL running: pg_isready
2. Verify DATABASE_URL di .env
3. Test connection: psql $DATABASE_URL

### Redis connection warning

Redis optional. Jika tidak ada, caching akan di-skip.

Install Redis:
```bash
# Windows: Use WSL or Docker
docker run -d -p 6379:6379 redis:7-alpine

# Ubuntu
sudo apt install redis-server
sudo systemctl start redis
```

---

## Support

- Internal Documentation: Lihat README di root project
- API Issues: Buat issue di project tracker
- Emergency: Contact DevOps team

---

Last Updated: February 2026
