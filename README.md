## Compliance & HOS 60/7 Module

Bold sections in the UI match platform theme and typography.

Endpoints:

- `POST /api/compliance/uploads` (multipart `files`) — ingest weekly schedule/timecard CSVs like `example1.csv` and `example2.csv`. Idempotent via `uploads.sha256_digest`.
- `GET /api/compliance/hos/:driverId/now` — current HOS counters.
- `POST /api/compliance/dispatch/check` — pre-dispatch gating.
- `GET /api/compliance/staffing/rollup?from=YYYY-MM-DD&to=YYYY-MM-DD&mode=dsp|inclusive` — coverage and window status.
- `GET /api/compliance/alerts` — pending/active alerts.
- `POST /api/compliance/driver-attestation` — second-job minutes.
- `POST /api/compliance/seed-examples` — local helper to load `example1.csv` and `example2.csv` from repo.

New tables in `database/schema.sql`:

- `uploads`, `on_duty_segments`, `routes_day`, `hos_rollups_7d`, `staffing_rollups_7d`, `driver_attestations`.

Background jobs: `node-cron` placeholder @02:00.

# Cazar AI Ops Hub

An AI-powered operations management platform for Cazar NYC, focusing on timecard reconciliation and automated scheduling optimization.

## Features

- **AI-Driven Timecard Reconciliation**: Automatically detect and resolve discrepancies between ADP, DSP Workplace, and Amazon Logistics
- **Smart Scheduling Optimization**: AI-powered shift recommendations to optimize coverage and reduce overtime
- **Real-time Dashboard**: Comprehensive analytics with interactive charts and graphs
- **Mock Data System**: Realistic test data for demonstration purposes

## Tech Stack

- React + TypeScript
- Vite
- Recharts for data visualization
- Lucide React for icons
- React Router for navigation
- TanStack Query for data management

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Run development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## Deployment on Render

### Method 1: Blueprint Deployment (Recommended)

This method automatically creates both the web service and PostgreSQL database.

1. **Fork/Clone the Repository**
   - Ensure the code is in your GitHub account

2. **Deploy with Blueprint**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Select the `nbrain-team/Cazar` repository
   - Render will detect the `render.yaml` file
   - Click "Apply"

3. **What Gets Created**:
   - PostgreSQL database (cazar-db)
   - Web service (cazar-ops-hub)
   - All environment variables
   - Automatic deployments on git push

### Method 2: Manual Deployment

If you prefer to set up services manually:

1. **Create PostgreSQL Database**:
   - New → PostgreSQL
   - Name: `cazar-db`
   - Database: `cazar_ops_hub`
   - User: `cazar_admin`
   - Region: Same as your web service
   - Plan: Free (upgrade for production)

2. **Create Web Service**:
   - New → Web Service
   - Connect GitHub repository
   - **Root Directory**: `cazar-ops-hub`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`

3. **Environment Variables**:
   ```
   NODE_VERSION=18
   DATABASE_URL=[automatically set from database]
   NODE_ENV=production
   JWT_SECRET=[generate a random string]
   SESSION_SECRET=[generate a random string]
   ```

### Database Setup

After deployment, initialize the database:

1. **Access Database**:
   - Go to your database in Render
   - Click "Connect" → "PSQL Command"
   - Copy and run the command in your terminal

2. **Run Schema**:
   ```bash
   psql [connection-string] < database/schema.sql
   ```

3. **Create Admin User** (optional):
   ```sql
   INSERT INTO users (email, password_hash, name, role) 
   VALUES ('admin@cazar.com', '[hashed-password]', 'Admin User', 'admin');
   ```

### Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NODE_VERSION` | Node.js version (18) | Yes |
| `NODE_ENV` | Environment (production) | Yes |
| `JWT_SECRET` | Secret for JWT tokens | Yes |
| `SESSION_SECRET` | Secret for sessions | Yes |
| `AMAZON_API_KEY` | Amazon Logistics API key | No (future) |
| `ADP_API_KEY` | ADP API key | No (future) |
| `DSP_WORKPLACE_API_KEY` | DSP Workplace API key | No (future) |
| `USE_MOCK_DATA` | Force mock data (true/false) | No |

## API Integration (Future)

The platform is designed to integrate with:
- **Amazon Logistics API**: Route and performance data
- **ADP API**: Timecard and payroll information
- **DSP Workplace API**: Scheduling and attendance

Currently using mock data for demonstration. API credentials will be needed for production deployment.

## Default Login Credentials

- Email: `admin@cazar.com`
- Password: `password`

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/         # Page components
├── context/       # React context providers
├── services/      # API and data services
├── types/         # TypeScript type definitions
└── utils/         # Utility functions

database/
└── schema.sql     # PostgreSQL database schema
```

## Production Considerations

1. **Upgrade Plans**: 
   - Database: Starter ($7/month) for better performance
   - Web Service: Starter ($7/month) to prevent sleep

2. **Security**:
   - Change default passwords
   - Set strong JWT_SECRET and SESSION_SECRET
   - Enable SSL (automatic on Render)

3. **Monitoring**:
   - Set up health checks
   - Configure alerts in Render
   - Monitor database performance

## Future Enhancements

- Coaching automation module
- Incentive tracking against Amazon scorecards
- Anomaly detection for payroll outliers
- Netradyne safety feed integration
- Real-time notifications system

## Support

For questions or issues, please contact the Cazar NYC development team.
