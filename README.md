# Bomberworld Backend

This is the backend server for Bomberworld multiplayer game.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run locally:
```bash
npm start
```

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## Deployment to Render

1. Push this folder to a GitHub repository
2. Connect the repository to Render.com
3. Deploy as a Web Service

## API Endpoints

- `GET /` - Welcome page
- `GET /health` - Health check
- `GET /api/status` - Server status
- WebSocket connections on same port
