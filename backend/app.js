const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const authRoutes = require('./routes/auth');
const setupVoiceAgentServer = require('./voiceAgent');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

app.use('/api', authRoutes);

const server = http.createServer(app);
setupVoiceAgentServer(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
