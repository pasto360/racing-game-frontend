const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.set('trust proxy', 1);
app.use(helmet());

// CORS FIX: Permetti esplicitamente Vercel
app.use(cors({
    origin: function(origin, callback) {
        const allowedOrigins = [
            'https://racing-game-frontend-sigma.vercel.app',
            'https://racing-game-frontend.vercel.app',
            'http://localhost:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500'
        ];
        
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token mancante' });
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token non valido' });
        req.user = user;
        next();
    });
}

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const passwordHash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email', 
            [username, email, passwordHash]
        );
        const token = jwt.sign({ id: result.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: result.rows[0] });
    } catch (error) {
        console.error('Errore registrazione:', error);
        if (error.code === '23505') {
            res.status(400).json({ error: 'Username o email già esistenti' });
        } else {
            res.status(500).json({ error: 'Errore server' });
        }
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Credenziali non valide' });
        }
        
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        
        if (!valid) {
            return res.status(401).json({ error: 'Credenziali non valide' });
        }
        
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ 
            token, 
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('Errore login:', error);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.get('/api/auth/status', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) as count FROM users');
        const userCount = parseInt(result.rows[0].count);
        
        res.json({
            registrationOpen: true,
            userCount: userCount
        });
    } catch (error) {
        console.error('Errore status:', error);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.get('/api/game/load', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT game_state FROM game_saves WHERE user_id = $1', [req.user.id]);
        
        if (result.rows.length === 0) {
            return res.json({ gameState: null });
        }
        
        res.json({ gameState: result.rows[0].game_state });
    } catch (error) {
        console.error('Errore caricamento:', error);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.post('/api/game/save', authenticateToken, async (req, res) => {
    try {
        const { gameState } = req.body;
        
        await pool.query(`
            INSERT INTO game_saves (user_id, game_state, last_save) 
            VALUES ($1, $2, NOW()) 
            ON CONFLICT (user_id) 
            DO UPDATE SET game_state = $2, last_save = NOW()
        `, [req.user.id, gameState]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Errore salvataggio:', error);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.get('/api/leaderboard/weekly', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.username,
                gs.game_state->>'weeklyScore' as score,
                gs.last_save
            FROM game_saves gs
            JOIN users u ON u.id = gs.user_id
            WHERE gs.game_state->>'weeklyScore' IS NOT NULL
            AND gs.last_save >= NOW() - INTERVAL '7 days'
            ORDER BY (gs.game_state->>'weeklyScore')::integer DESC
            LIMIT 50
        `);
        
        res.json({ leaderboard: result.rows });
    } catch (error) {
        console.error('Errore leaderboard weekly:', error);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.get('/api/leaderboard/alltime', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.username,
                (gs.game_state->'resources'->>'reputation')::integer as reputation,
                gs.last_save
            FROM game_saves gs
            JOIN users u ON u.id = gs.user_id
            WHERE gs.game_state->'resources'->>'reputation' IS NOT NULL
            ORDER BY (gs.game_state->'resources'->>'reputation')::integer DESC
            LIMIT 100
        `);
        
        res.json({ leaderboard: result.rows });
    } catch (error) {
        console.error('Errore leaderboard alltime:', error);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.json({ 
        message: 'Garage Racing Manager API',
        version: '1.0',
        endpoints: {
            auth: ['/api/auth/register', '/api/auth/login', '/api/auth/status'],
            game: ['/api/game/load', '/api/game/save'],
            leaderboard: ['/api/leaderboard/weekly', '/api/leaderboard/alltime']
        }
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`✅ Server in ascolto sulla porta ${PORT}`);
    console.log(`🌍 CORS abilitato per Vercel`);
});
