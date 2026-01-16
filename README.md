# Pelaris.id Backend

[![Hono](https://img.shields.io/badge/Hono-4.11-E36002?logo=hono)](https://hono.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-4169e1?logo=postgresql)](https://postgresql.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-010101?logo=socket.io)](https://socket.io/)

REST API untuk Pelaris.id - Omnichannel POS System.

**Repository:** [https://github.com/rejaldev/Pelaris.id-api](https://github.com/rejaldev/Pelaris.id-api)

## Features

- **Multi-Tenant Architecture** - Complete tenant isolation (products, categories, users, cabangs)
- **Multi-Cabang Access Control** - Configurable access for ADMIN/MANAGER (all cabangs or specific cabang)
- Multi-cabang stock management
- Real-time sync dengan Socket.io
- Excel import/export produk (base64 encoded)
- Stock alerts per variant
- Split payment transactions
- Returns & Exchanges management
- Cash transaction tracking
- Auto backup dengan scheduler (daily at 00:00 WIB)
- Backup retention policy (7 days)
- Database restore with transaction rollback
- Winston logger untuk semua error handling
- JWT authentication dengan RBAC (includes tenantId)
- CSRF protection dengan token validation
- Smart rate limiting (only counts failed login attempts)
- Audit logging untuk critical actions

## Quick Start

```bash
# Install
npm install

# Setup database
cp .env.example .env
npx prisma generate
npx prisma migrate dev

# Seed data (optional)
npx prisma db seed

# Development
npm run dev
```

Server: http://localhost:5100

Multi-Tenant Architecture
--------------------------

- **Tenant Model**: All data is scoped by `tenantId` (users, cabangs, products, categories, transactions, etc.)
- **JWT Token**: Includes `tenantId` in payload for automatic tenant scoping
- **Product & Category Isolation**: Products and categories are per-tenant (not global)
- **User Management**: Only OWNER can create/manage users within their tenant
- **Register Flow**: Public registration creates a new tenant automatically

Multi-Cabang Access Control
---------------------------

- **OWNER**: Always has access to all cabangs (`hasMultiCabangAccess = true`, enforced)
- **ADMIN/MANAGER**: Configurable by Owner:
  - Single cabang: `hasMultiCabangAccess = false`, `cabangId` set
  - All cabangs: `hasMultiCabangAccess = true`, `cabangId = null`
- **KASIR**: Always tied to single cabang (`hasMultiCabangAccess = false`, enforced)
- Only OWNER can set `hasMultiCabangAccess` via user management endpoints

Database and migration notes
----------------------------

- The project uses Prisma for schema migrations. If you change `prisma/schema.prisma`, create a migration with:

```bash
npx prisma migrate dev --name <name>
```

- To reset the local database (this will destroy data):

```bash
npx prisma migrate reset --force
npx prisma db seed
```

- If you encounter authentication errors with Prisma (P1000), verify `DATABASE_URL` in `.env` and ensure the PostgreSQL server is running and reachable. On local Windows installs the service is typically `postgresql-x64-18` and data files are under `C:\Program Files\PostgreSQL\18`.

Start the server for production
-----------------------------

```bash
# build
npm run build

# start
npm start
```

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Hono | 4.11 | Web Framework |
| Prisma | 6.19 | Database ORM |
| PostgreSQL | 18 | Database |
| Socket.io | 4.8 | Real-time |
| XLSX | 0.18 | Excel processing |
| JWT | 9.0 | Authentication || Winston | 3.19 | Logging |
| node-cron | 3.0 | Backup scheduler || Vitest | 4.x | Unit testing |

## Project Structure

```
src/
├── index.ts           # Entry point
├── routes/
│   ├── auth.ts        # Authentication
│   ├── products.ts    # Products & import/export
│   ├── stock.ts       # Stock adjustments
│   ├── transactions.ts # POS transactions
│   ├── returns.ts     # Returns management
│   ├── cabang.ts      # Branch management
│   ├── backup.ts      # Backup & restore
│   └── ...
├── middleware/
│   └── auth.ts        # JWT & RBAC
└── lib/
    ├── prisma.ts      # Database client
    ├── socket.ts      # WebSocket setup
    └── jwt.ts         # Token utils

prisma/
├── schema.prisma      # Database schema
├── migrations/        # Migration history
└── seed.cjs           # Seed data
```

## API Endpoints

| Prefix | Description |
|--------|-------------|
| `/api/auth` | Authentication & users |
| `/api/products` | Products, categories, import/export |
| `/api/stock` | Stock adjustments & alerts |
| `/api/stock-transfers` | Inter-branch transfers |
| `/api/transactions` | POS transactions |
| `/api/returns` | Returns & refunds |
| `/api/cabang` | Branch management |
| `/api/settings` | System settings (printer, etc) |
| `/api/backup` | Backup & restore |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `product:created` | Server → Client | New product added |
| `product:updated` | Server → Client | Product modified |
| `product:deleted` | Server → Client | Product removed |
| `stock:updated` | Server → Client | Stock changed |
| `refresh:needed` | Server → Client | Full refresh required |

## Testing

```bash
# Run all tests
npm test

# Run specific test
npm test -- --run lib/jwt.test.ts
```

## Build & Deploy

```bash
# Build
npm run build

# Production
npm start

# PM2
pm2 start ecosystem.config.js
```

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/Pelaris.id
JWT_SECRET=your-secret-key
PORT=5100
```

## Database Commands

```bash
# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name <name>

# Reset database
npx prisma migrate reset

# View database
npx prisma studio
```

## Changelog

### 2026-01-15
**Multi-Tenant & Multi-Cabang Access:**
- Implemented complete multi-tenant architecture with Tenant model
- Added `hasMultiCabangAccess` field to User model for flexible access control
- Products and Categories now tenant-scoped (per-tenant isolation)
- JWT tokens now include `tenantId` for automatic scoping
- All routes enforce tenant isolation (products, categories, users, cabangs)
- Added CSRF protection with token validation
- Fixed CORS subdomain validation logic
- Added AuditLog model for tracking critical actions
- Added ExchangeItem and CashTransaction models for returns/exchanges
- Updated auth routes to support multi-cabang access configuration
- Only OWNER can manage users and set multi-cabang access

### 2026-01-09
- Complete console.log cleanup (59 instances replaced with Winston logger)
- Added backup route tests (10 tests for authentication)
- Implemented restore backup endpoint with transaction rollback
- Added list/download/delete backup endpoints
- Implemented auto backup scheduler with node-cron
- Daily auto backup at 00:00 WIB with 7-day retention
- Fixed login rate limiter (only counts failed attempts)
- Fixed export data download in backup settings
- Recreated channels.ts with proper logging

### 2026-01-07
- Added JWT tests
- Improved error handling

### 2026-01-05
- Added stock alerts per variant
- Improved Excel import validation
