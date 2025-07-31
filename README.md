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

### Prerequisites
1. Push this code to a GitHub repository
2. Create a Render account at https://render.com

### Render Setup Instructions

1. **Create New Web Service**:
   - Go to Render Dashboard
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure Build Settings**:
   - **Name**: cazar-ops-hub
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Publish Directory**: `dist`

3. **Environment Variables**:
   Add the following environment variables in Render:
   ```
   NODE_VERSION=18
   ```

4. **Advanced Settings**:
   - **Auto-Deploy**: Yes (for automatic deployments on git push)
   - **Health Check Path**: /

### API Integration (Future)

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
```

## Future Enhancements

- Coaching automation module
- Incentive tracking against Amazon scorecards
- Anomaly detection for payroll outliers
- Netradyne safety feed integration
- Real-time notifications system

## Support

For questions or issues, please contact the Cazar NYC development team.
