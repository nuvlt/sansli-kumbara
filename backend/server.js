// server.js - Express Backend API
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// ============================================
// DATABASE INITIALIZATION
// ============================================

const initDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS platforms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        api_key VARCHAR(255) UNIQUE NOT NULL,
        domain VARCHAR(255) NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        platform_id INTEGER REFERENCES platforms(id),
        external_user_id VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL,
        balance DECIMAL(10, 2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(platform_id, external_user_id)
      );

      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        prize_pool DECIMAL(10, 2) DEFAULT 0,
        next_game_reserve DECIMAL(10, 2) DEFAULT 0,
        total_tickets INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        winner_user_id INTEGER REFERENCES users(id),
        winner_prize DECIMAL(10, 2),
        ended_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS deposits (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id),
        user_id INTEGER REFERENCES users(id),
        amount DECIMAL(10, 2) NOT NULL,
        tickets INTEGER NOT NULL,
        to_pool DECIMAL(10, 2) NOT NULL,
        to_reserve DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id),
        user_id INTEGER REFERENCES users(id),
        ticket_start INTEGER NOT NULL,
        ticket_end INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_game ON tickets(game_id);
      CREATE INDEX IF NOT EXISTS idx_deposits_game ON deposits(game_id);
    `);
    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  } finally {
    client.release();
  }
};

// ============================================
// MIDDLEWARE
// ============================================

// Platform API Key Authentication
const authenticatePlatform = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM platforms WHERE api_key = $1 AND active = true',
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    req.platform = result.rows[0];
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// User Authentication
const authenticateUser = async (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const getCurrentGame = async () => {
  const result = await pool.query(
    'SELECT * FROM games WHERE status = $1 ORDER BY created_at DESC LIMIT 1',
    ['active']
  );

  if (result.rows.length === 0) {
    return await createNewGame();
  }

  const game = result.rows[0];
  
  // Check if game ended
  if (new Date() >= new Date(game.end_time)) {
    return await endGame(game.id);
  }

  return game;
};

const createNewGame = async () => {
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + (3 * 24 * 60 * 60 * 1000)); // 3 days

  // Get reserve from previous game
  const prevGameResult = await pool.query(
    'SELECT next_game_reserve FROM games WHERE status = $1 ORDER BY created_at DESC LIMIT 1',
    ['ended']
  );

  const initialPool = prevGameResult.rows.length > 0 
    ? parseFloat(prevGameResult.rows[0].next_game_reserve) 
    : 0;

  const result = await pool.query(
    `INSERT INTO games (start_time, end_time, prize_pool, status) 
     VALUES ($1, $2, $3, 'active') 
     RETURNING *`,
    [startTime, endTime, initialPool]
  );

  console.log('✅ New game created:', result.rows[0].id);
  return result.rows[0];
};

const endGame = async (gameId) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Get game data
    const gameResult = await client.query(
      'SELECT * FROM games WHERE id = $1',
      [gameId]
    );
    const game = gameResult.rows[0];

    if (game.total_tickets === 0) {
      // No participants, just create new game
      await client.query(
        'UPDATE games SET status = $1, ended_at = $2 WHERE id = $3',
        ['ended', new Date(), gameId]
      );
      await client.query('COMMIT');
      return await createNewGame();
    }

    // Pick random winning ticket
    const winningTicketNumber = Math.floor(Math.random() * game.total_tickets);

    // Find winner
    const ticketResult = await client.query(
      `SELECT user_id FROM tickets 
       WHERE game_id = $1 AND ticket_start <= $2 AND ticket_end > $2
       LIMIT 1`,
      [gameId, winningTicketNumber]
    );

    if (ticketResult.rows.length === 0) {
      throw new Error('Winner not found');
    }

    const winnerId = ticketResult.rows[0].user_id;
    const winnerPrize = parseFloat(game.prize_pool);

    // Update winner's balance
    await client.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [winnerPrize, winnerId]
    );

    // Update game
    await client.query(
      `UPDATE games 
       SET status = $1, winner_user_id = $2, winner_prize = $3, ended_at = $4 
       WHERE id = $5`,
      ['ended', winnerId, winnerPrize, new Date(), gameId]
    );

    await client.query('COMMIT');
    
    console.log('✅ Game ended. Winner:', winnerId, 'Prize:', winnerPrize);

    // Create new game
    return await createNewGame();

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ End game error:', error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// API ROUTES
// ============================================

// Platform Management
app.post('/api/platform/register', async (req, res) => {
  const { name, domain, adminSecret } = req.body;

  // Simple admin authentication
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Invalid admin secret' });
  }

  try {
    const apiKey = 'pk_' + Math.random().toString(36).substr(2, 32);
    
    const result = await pool.query(
      'INSERT INTO platforms (name, api_key, domain) VALUES ($1, $2, $3) RETURNING *',
      [name, apiKey, domain]
    );

    res.json({
      success: true,
      platform: result.rows[0]
    });
  } catch (error) {
    console.error('Platform register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User Authentication
app.post('/api/auth/login', authenticatePlatform, async (req, res) => {
  const { externalUserId, username, balance } = req.body;

  try {
    // Check if user exists
    let result = await pool.query(
      'SELECT * FROM users WHERE platform_id = $1 AND external_user_id = $2',
      [req.platform.id, externalUserId]
    );

    let user;
    if (result.rows.length === 0) {
      // Create new user
      result = await pool.query(
        'INSERT INTO users (platform_id, external_user_id, username, balance) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.platform.id, externalUserId, username, balance || 0]
      );
      user = result.rows[0];
    } else {
      user = result.rows[0];
      // Update balance if provided
      if (balance !== undefined) {
        await pool.query(
          'UPDATE users SET balance = $1 WHERE id = $2',
          [balance, user.id]
        );
        user.balance = balance;
      }
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, platformId: req.platform.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        balance: parseFloat(user.balance)
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get Current Game State
app.get('/api/game/current', authenticateUser, async (req, res) => {
  try {
    const game = await getCurrentGame();

    // Get user's tickets for this game
    const ticketsResult = await pool.query(
      'SELECT COUNT(*) as count FROM tickets WHERE game_id = $1 AND user_id = $2',
      [game.id, req.user.id]
    );

    const userTicketsResult = await pool.query(
      'SELECT SUM(ticket_end - ticket_start) as total FROM tickets WHERE game_id = $1 AND user_id = $2',
      [game.id, req.user.id]
    );

    const myTickets = userTicketsResult.rows[0].total || 0;

    // Get participant count
    const participantsResult = await pool.query(
      'SELECT COUNT(DISTINCT user_id) as count FROM tickets WHERE game_id = $1',
      [game.id]
    );

    res.json({
      success: true,
      game: {
        id: game.id,
        startTime: game.start_time,
        endTime: game.end_time,
        prizePool: parseFloat(game.prize_pool),
        totalTickets: game.total_tickets,
        participants: parseInt(participantsResult.rows[0].count),
        myTickets: parseInt(myTickets),
        status: game.status
      },
      userBalance: parseFloat(req.user.balance)
    });
  } catch (error) {
    console.error('Get game error:', error);
    res.status(500).json({ error: 'Failed to get game state' });
  }
});

// Make Deposit
app.post('/api/game/deposit', authenticateUser, async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (parseFloat(req.user.balance) < amount) {
    return res.status(400).json({ error: 'Insufficient balance' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const game = await getCurrentGame();

    // Calculate amounts
    const tickets = Math.floor(amount * 100);
    const toPool = amount * 0.60;
    const toReserve = amount * 0.05;

    // Deduct from user balance
    await client.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [amount, req.user.id]
    );

    // Update game
    const ticketStart = game.total_tickets;
    const ticketEnd = ticketStart + tickets;

    await client.query(
      `UPDATE games 
       SET prize_pool = prize_pool + $1, 
           next_game_reserve = next_game_reserve + $2,
           total_tickets = total_tickets + $3
       WHERE id = $4`,
      [toPool, toReserve, tickets, game.id]
    );

    // Record deposit
    await client.query(
      'INSERT INTO deposits (game_id, user_id, amount, tickets, to_pool, to_reserve) VALUES ($1, $2, $3, $4, $5, $6)',
      [game.id, req.user.id, amount, tickets, toPool, toReserve]
    );

    // Record tickets
    await client.query(
      'INSERT INTO tickets (game_id, user_id, ticket_start, ticket_end) VALUES ($1, $2, $3, $4)',
      [game.id, req.user.id, ticketStart, ticketEnd]
    );

    await client.query('COMMIT');

    // Get updated balance
    const balanceResult = await client.query(
      'SELECT balance FROM users WHERE id = $1',
      [req.user.id]
    );

    res.json({
      success: true,
      deposit: {
        amount,
        tickets,
        toPool,
        toReserve
      },
      newBalance: parseFloat(balanceResult.rows[0].balance)
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Deposit failed' });
  } finally {
    client.release();
  }
});

// Get Game History
app.get('/api/game/history', authenticateUser, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*, u.username as winner_username
       FROM games g
       LEFT JOIN users u ON g.winner_user_id = u.id
       WHERE g.status = 'ended'
       ORDER BY g.ended_at DESC
       LIMIT 10`
    );

    const history = result.rows.map(row => ({
      gameId: row.id,
      winner: row.winner_username,
      prize: parseFloat(row.winner_prize),
      totalTickets: row.total_tickets,
      endTime: row.ended_at
    }));

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// Get User Stats
app.get('/api/user/stats', authenticateUser, async (req, res) => {
  try {
    const depositsResult = await pool.query(
      'SELECT COUNT(*) as total_deposits, SUM(amount) as total_spent FROM deposits WHERE user_id = $1',
      [req.user.id]
    );

    const winsResult = await pool.query(
      'SELECT COUNT(*) as total_wins, SUM(winner_prize) as total_won FROM games WHERE winner_user_id = $1',
      [req.user.id]
    );

    res.json({
      success: true,
      stats: {
        totalDeposits: parseInt(depositsResult.rows[0].total_deposits) || 0,
        totalSpent: parseFloat(depositsResult.rows[0].total_spent) || 0,
        totalWins: parseInt(winsResult.rows[0].total_wins) || 0,
        totalWon: parseFloat(winsResult.rows[0].total_won) || 0
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ============================================
// CRON JOB - Check for game end
// ============================================

setInterval(async () => {
  try {
    const game = await getCurrentGame();
    // getCurrentGame already handles game ending
  } catch (error) {
    console.error('Cron error:', error);
  }
}, 60000); // Check every minute

// ============================================
// START SERVER
// ============================================

const startServer = async () => {
  await initDatabase();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
};

startServer();
