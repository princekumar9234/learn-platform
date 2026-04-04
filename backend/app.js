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
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ===================== SERVER CRASH PREVENTION =====================
// Prevent server from crashing on unhandled errors (critical for Render hosting)
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception (server kept running):', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Promise Rejection (server kept running):', reason);
});

// Ensure Uploads Directory Exists (For Disk Mode)
const fs = require('fs');
const uploadDir = path.join(__dirname, '../frontend/public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Check Environment Variables
const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;

console.log('--------------------------------------------------------------------------------');
console.log('Checking Environment & Configuration...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Using Cloudinary:', useCloudinary ? 'YES' : 'NO');
console.log('--------------------------------------------------------------------------------');

if (!useCloudinary) {
    console.warn('WARNING: Cloudinary credentials missing. Files will be deleted on Render restart.');
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

// View Engine (Used for some backend renders or fallbacks)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend/views'));

// Global Variables for Views
app.use((req, res, next) => {
    res.locals.user = req.session.studentId || null;
    res.locals.admin = req.session.adminId || null;
    next();
});

// API Routes (Prefixed with /api)
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/index'));

// React SPA Fallback: Serve index.html for any route that doesn't match an API route
// This MUST be after defining all API routes
app.get('*', (req, res, next) => {
    // If the request is for an API or static file that doesn't exist, don't serve index.html
    if (req.path.startsWith('/api') || req.path.includes('.')) {
        return next();
    }
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'), (err) => {
        if (err) {
            // Fallback to local index if dist is missing (useful for some dev setups)
            res.status(404).send("Frontend build not found. Please run 'npm run build' in the frontend directory.");
        }
    });
});

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
