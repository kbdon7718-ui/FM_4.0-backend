# Fleet Management Backend - Deployment Guide

## Prerequisites
- Node.js >= 18.0.0
- Supabase account with PostgreSQL database
- Environment variables configured

## Environment Variables

Create a `.env` file in the root directory:

```env
# Server
PORT=5002
HOST=0.0.0.0
NODE_ENV=production

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Frontend
FRONTEND_URL=https://your-frontend-domain.vercel.app
```

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Production Build

```bash
npm start
```

## Deployment (Vercel)

1. Push to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy!

### Environment Variables in Vercel
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL`
- `NODE_ENV=production`

## API Endpoints

### Health Check
- `GET /health` - Server status
- `GET /` - API info

### Fuel Management
- `GET /api/vehicles` - List vehicles
- `POST /api/fuel` - Record fuel entry
- `GET /api/fuel/recent` - Recent fuel entries
- `GET /api/analysis` - Fuel analysis

### Maintenance
- `GET /api/maintenance/vehicles` - Vehicles
- `POST /api/maintenance` - Create maintenance record
- `GET /api/maintenance/alerts` - Maintenance alerts

### Live Tracking
- `GET /api/supervisor/live-tracking` - Supervisor view
- `GET /api/owner/live-tracking` - Owner view
- `GET /api/gps-logs` - GPS history

### Geofencing
- `POST /api/geofences` - Create geofence
- `POST /api/gps/update` - GPS update with geofence check
- `GET /api/companies` - Company data

### Driver & Route Management
- `GET /api/assign-driver/vehicles` - Vehicles for assignment
- `POST /api/assign-driver` - Assign driver
- `GET /api/company-routes` - List routes
- `POST /api/company-routes` - Create route

### Owner Dashboard
- `GET /api/owner/dashboard` - Dashboard summary

## Error Handling

All errors return JSON format:
```json
{
  "error": "Error name",
  "message": "Error message",
  "timestamp": "2025-01-02T12:00:00.000Z"
}
```

## CORS Configuration

The backend is configured for these origins:
- `http://localhost:3000` (dev)
- `http://localhost:5173` (Vite dev)
- `https://fm-4-0.vercel.app`
- `https://fm4-0-ui.vercel.app`
- `$FRONTEND_URL` (environment variable)

Add more origins in `src/app.js` if needed.

## Monitoring

- All requests are logged with method and path
- Global error handlers catch unhandled exceptions
- Graceful shutdown on SIGTERM

## Database Migrations

Ensure all required tables exist in Supabase:
- `vehicles`
- `fuel_entries`
- `maintenance_records`
- `driver_assignments`
- `geofences`
- `geofence_logs`
- `gps_logs`
- `company_routes`
- `owners`
- `live_vehicle_positions`

## Support

For issues, check:
1. Environment variables are set correctly
2. Supabase connection is working
3. Frontend CORS origin is whitelisted
4. Server is running on correct PORT
