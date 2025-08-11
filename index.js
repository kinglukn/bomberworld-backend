var express = require('express');
var cors = require('cors');
var app = express();

// Configure CORS for your domain - UPDATE THESE DOMAINS!
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8080',
      'http://localhost:8000',
      'https://darkthronegame.com',  // CHANGE THIS to your actual domain
      'https://www.darkthronegame.com',  // CHANGE THIS to your actual domain
      'https://bomberworld-backend.onrender.com',  // Your backend URL
      // Add any other domains you want to allow
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Origin not allowed by CORS:', origin);
      callback(null, true); // Set to false in production for security
    }
  },
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Health check endpoint for Render
app.get('/health', function(req, res) {
  res.status(200).send('OK');
});

// API endpoint to check server status
app.get('/api/status', function(req, res){
  res.json({ 
    status: 'online', 
    rooms: rooms.length,
    players: players.length,
    timestamp: Date.now()
  });
});

var port = process.env.PORT || 3000;

// Welcome page for direct browser access
app.get('/', function(req, res){
  res.send(`
    <html>
      <head><title>Bomberworld Game Server</title></head>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>🎮 Bomberworld Game Server</h1>
        <p>This is the backend server for Bomberworld multiplayer game.</p>
        <p>Status: <strong style="color: green;">Online</strong></p>
        <p>Rooms Active: <strong>${rooms.length}</strong></p>
        <p>Players Connected: <strong>${players.length}</strong></p>
        <hr>
        <p>To play the game, please visit the game client.</p>
      </body>
    </html>
  `);
});

var http = require('http');
var server = http.Server(app);

// Socket.io configuration with CORS
var io = require('socket.io')(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

server.listen(port, function() {
  console.log('=================================');
  console.log('Bomberworld Server Started');
  console.log('Port: ' + port);
  console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
  console.log('=================================');
});

// Import game modules
var SocketEventHandler = require('./SocketEventHandler');
var rooms = [];
var players = [];

// Make rooms and players available globally for status endpoint
global.rooms = rooms;
global.players = players;

var s_handler = new SocketEventHandler(io);

io.on('connection', function(client) {
  console.log('[CONNECT] Player connected:', client.id);
  
  s_handler.onClientConnect(client);

  client.on("disconnect", function() {
    console.log('[DISCONNECT] Player disconnected:', this.id);
    s_handler.onClientDisconnect.call(this);
  });

  client.on("room request", function(data) {
    s_handler.onRoomRequest.call(this, data);
  });

  client.on("chat message", function(data) {
    s_handler.onChatMessage.call(this, data);
  });

  client.on("player available", function() {
    s_handler.onPlayerAvailable.call(this);
  });
  
  client.on("player unavailable", function() {
    s_handler.onPlayerUnavailable.call(this);
  });
  
  client.on("player spawn", function(data) {
    s_handler.onPlayerSpawn.call(this, data);
  });
  
  client.on("player move", function(data) {
    s_handler.onPlayerMove.call(this, data);
  });
  
  client.on("player death", function(data) {
    s_handler.onPlayerDeath.call(this, data);
  });
  
  client.on("player collect powerup", function(data) {
    s_handler.onPlayerCollectPowerup.call(this, data);
  });
  
  client.on("player lost invincibility", function(data) {
    s_handler.onPlayerLostInvicibility.call(this, data);
  });
  
  client.on("player plant bomb", function(data) {
    s_handler.onPlayerPlantBomb.call(this, data);
  });
  
  client.on("bomb explode", function(data) {
    s_handler.onBombExplode.call(this, data);
  });
  
  client.on("powerup blink", function(data) {
    s_handler.onPowerupBlink.call(this, data);
  });
  
  client.on("powerup disappear", function(data) {
    s_handler.onPowerupDisappear.call(this, data);
  });

  client.on("map reset", function() {
    s_handler.onMapReset.call(this);
  });
  
  // Simplified web login - you may want to remove or update this
  client.on("web login", function(user_info) {
    console.log("Web login attempt:", user_info.name);
    // For now, just approve all logins
    client.emit('login result', JSON.stringify({
      status: 1,
      name: user_info.name,
      message: 'Login successful'
    }));
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
