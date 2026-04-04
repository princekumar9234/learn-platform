const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const methodOverride = require('method-override');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.json({ limit: '100mb' }));
app.use(methodOverride('_method'));
app.use(methodOverride('_method'));
// Serve static files from the React app
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend/dist')));
} else {
    app.use(express.static(path.join(__dirname, '../frontend/public')));
}

// ===================== SERVER CRASH PREVENTION =====================
// Prevent server from crashing on unhandled errors (critical for Render hosting)
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception (server kept running):', err.message);
    // Do NOT call process.exit() - keep server alive
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Promise Rejection (server kept running):', reason);
    // Do NOT call process.exit() - keep server alive
});

// Ensure Uploads Directory Exists (For Disk Mode)
const fs = require('fs');
const uploadDir = path.join(__dirname, '../frontend/public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Check Environment Variables
// Check Environment Variables
// Check Environment Variables
const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;

console.log('--------------------------------------------------------------------------------');
console.log('Checking Cloudinary Configuration...');
console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Missing');
console.log('API Key:', process.env.CLOUDINARY_API_KEY ? 'Set' : 'Missing');
console.log('API Secret:', process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Missing');
console.log('Using Cloudinary:', useCloudinary ? 'YES' : 'NO');
console.log('--------------------------------------------------------------------------------');

if (!useCloudinary) {
    console.warn('================================================================================');
    console.warn('                           WARNING: DISK STORAGE MODE                           ');
    console.warn('================================================================================');
    console.warn('Cloudinary credentials are missing. Falling back to local disk storage.');
    console.warn('NOTE: Files uploaded in this mode will be DELETED when the server restarts on Render.');
    console.warn('To fix permanency, add CLOUDINARY credentials to your Environment Variables.');
    console.warn('================================================================================\n');
}

// Make this available to routes
app.locals.useCloudinary = useCloudinary;
if (!process.env.MONGO_URI) {
    console.warn('WARNING: MONGO_URI is missing. Using local database (will not work on Render).');
}
const localDbUri = 'mongodb://127.0.0.1:27017/learn-platform';
const useRemoteDb = (process.env.NODE_ENV === 'production' || process.env.USE_REMOTE_DB === 'true') && !!process.env.MONGO_URI;
const dbUri = useRemoteDb ? process.env.MONGO_URI : localDbUri;

// Session Config
const MongoStore = require('connect-mongo');

// Trust Proxy for Render/Heroku (Must be before session config)
app.set('trust proxy', 1);

// Session Config with MongoDB Store
app.use(session({
    secret: process.env.SESSION_SECRET || 'devsecretkey',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: dbUri,
        ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/views'));

// Global Variables for Views
app.use((req, res, next) => {
    res.locals.user = req.session.studentId || null;
    res.locals.admin = req.session.adminId || null;
    next();
});

// DEBUG ROUTE - REMOVE IN PRODUCTION
app.get('/config-check', (req, res) => {
    const isCloudinarySet = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
    const isMongoAtlas = process.env.MONGO_URI && process.env.MONGO_URI.includes('mongodb+srv');
    
    const dbState = mongoose.connection.readyState; // 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
    const dbStatus = dbState === 1 ? '<span style="color:green">✅ CONNECTED</span>' : '<span style="color:red">❌ DISCONNECTED</span>';

    res.send(`
        <body style="font-family: sans-serif; padding: 2rem;">
        <h1>System Configuration Check</h1>
        
        <div style="background: #f1f5f9; padding: 1.5rem; border-radius: 0.5rem; border: 1px solid #cbd5e1; margin-bottom: 2rem;">
            <h3>1. Cloudinary (PDF Storage)</h3>
            <p><strong>Cloud Name:</strong> ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ Missing'}</p>
            <p><strong>Status:</strong> ${isCloudinarySet ? '<span style="color:green">ACTIVE (Permanent Files)</span>' : '<span style="color:red">INACTIVE (Files will delete on restart)</span>'}</p>
        </div>

        <div style="background: #e2e8f0; padding: 1.5rem; border-radius: 0.5rem; border: 1px solid #cbd5e1;">
            <h3>2. MongoDB (Login/Data Storage)</h3>
            <p><strong>Connection Status:</strong> ${dbStatus}</p>
            <p><strong>Database Type:</strong> ${isMongoAtlas ? '<span style="color:green">✅ CLOUD (Permanent Data)</span>' : '<span style="color:red">⚠️ LOCAL/DISK (Data deletes on restart)</span>'}</p>
            <p style="font-size: 0.9rem;">(If Database Type is LOCAL, your Admin account will be deleted every time Render restarts.)</p>
        </div>

        <br>
        <a href="/MONGODB_SETUP.md" target="_blank" style="color: blue;">read how to fix MongoDB</a>
        </body>
    `);
});

// Routes
app.use('/admin', require('./routes/admin'));
app.use('/', require('./routes/index'));

// React SPA Fallback: Serve index.html for any route that doesn't match an API route
if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
        // Skip API routes if you had any starting with /api
        // if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    });
}

// Handle Missing Uploads (Friendly 404)
app.get('/uploads/:filename', (req, res) => {
    res.status(404).render('404-upload');
});

// ===================== GLOBAL ERROR HANDLER =====================
// Catches any unhandled errors from routes and prevents server crash
// Must be defined AFTER all routes
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('🔥 Global Error Handler:', err.message);

    // Handle file too large (Multer)
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).send(`
            <div style="font-family:sans-serif;padding:2rem;max-width:600px;margin:0 auto;text-align:center">
                <h2 style="color:#ef4444">📁 File Too Large</h2>
                <p>PDF size limit <strong>50MB</strong> se zyada hai. Choti file use karein.</p>
                <a href="javascript:history.back()" style="display:inline-block;margin-top:1rem;padding:0.6rem 1.4rem;background:#6366f1;color:white;border-radius:8px;text-decoration:none">← Go Back</a>
            </div>
        `);
    }

    // Handle request entity too large (Express body-parser)
    if (err.status === 413 || err.type === 'entity.too.large') {
        return res.status(413).send(`
            <div style="font-family:sans-serif;padding:2rem;max-width:600px;margin:0 auto;text-align:center">
                <h2 style="color:#ef4444">📁 Upload Too Large</h2>
                <p>File 50MB se zyada hai. Choti file use karein.</p>
                <a href="javascript:history.back()" style="display:inline-block;margin-top:1rem;padding:0.6rem 1.4rem;background:#6366f1;color:white;border-radius:8px;text-decoration:none">← Go Back</a>
            </div>
        `);
    }

    // Generic server error - render error or send JSON
    if (res.headersSent) return next(err);
    res.status(500).send(`
        <div style="font-family:sans-serif;padding:2rem;max-width:600px;margin:0 auto;text-align:center">
            <h2 style="color:#ef4444">⚠️ Server Error</h2>
            <p>${err.message || 'Kuch gadbad ho gayi. Please dobara try karein.'}</p>
            <a href="javascript:history.back()" style="display:inline-block;margin-top:1rem;padding:0.6rem 1.4rem;background:#6366f1;color:white;border-radius:8px;text-decoration:none">← Go Back</a>
        </div>
    `);
});

// Database Connection & Server Start
// Database Connection & Server Start
console.log(`Attempting to connect to database... (URI source: ${useRemoteDb ? 'ENV' : 'Local'})`);

const Admin = require('./Admin');
const bcrypt = require('bcryptjs');

async function seedDefaultAdmin() {
    try {
        const email = 'princechouhan9939@gmail.com';
        const plainPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'PRINCE@18';
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // Ensure this specific admin can always login (password mismatch issue common)
        await Admin.findOneAndUpdate(
            { email },
            { password: hashedPassword },
            { upsert: true, new: false }
        );

        console.log('Default Admin ensured:', email, '/', plainPassword);
    } catch (err) {
        console.error('Error seeding admin:', err);
    }
}

async function startServer() {
    try {
        await mongoose.connect(dbUri);
        console.log('MongoDB Connected');
    } catch (err) {
        const envUriFailed = process.env.MONGO_URI && dbUri !== localDbUri;
        if (!envUriFailed) {
            console.error('MongoDB Connection Error:', err);
            process.exit(1);
        }

        console.error('MongoDB Connection Error (ENV URI):', err.message);
        console.warn('Retrying with local MongoDB fallback...');

        try {
            await mongoose.connect(localDbUri);
            console.log('MongoDB Connected (Local Fallback)');
        } catch (fallbackErr) {
            console.error('MongoDB Connection Error (Local Fallback):', fallbackErr.message);
            process.exit(1);
        }
    }

    await seedDefaultAdmin(); // Run seed check on startup
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

startServer();
