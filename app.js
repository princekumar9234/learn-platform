const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const methodOverride = require('method-override');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure Uploads Directory Exists (For Disk Mode)
const fs = require('fs');
const uploadDir = path.join(__dirname, 'public/uploads');
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

// Session Config
app.use(session({
    secret: process.env.SESSION_SECRET || 'devsecretkey',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global Variables for Views
app.use((req, res, next) => {
    res.locals.user = req.session.studentId || null;
    res.locals.admin = req.session.adminId || null;
    next();
});

// DEBUG ROUTE - REMOVE IN PRODUCTION
app.get('/config-check', (req, res) => {
    const isConfigured = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
    res.send(`
        <body style="font-family: sans-serif; padding: 2rem;">
        <h1>Cloudinary Configuration Check</h1>
        <div style="background: #f1f5f9; padding: 1.5rem; border-radius: 0.5rem; border: 1px solid #cbd5e1;">
            <p><strong>CLOUDINARY_CLOUD_NAME:</strong> ${process.env.CLOUDINARY_CLOUD_NAME ? '<span style="color:green">✅ SET</span>' : '<span style="color:red">❌ MISSING</span>'}</p>
            <p><strong>CLOUDINARY_API_KEY:</strong> ${process.env.CLOUDINARY_API_KEY ? '<span style="color:green">✅ SET</span>' : '<span style="color:red">❌ MISSING</span>'}</p>
            <p><strong>CLOUDINARY_API_SECRET:</strong> ${process.env.CLOUDINARY_API_SECRET ? '<span style="color:green">✅ SET</span>' : '<span style="color:red">❌ MISSING</span>'}</p>
        </div>
        <br>
        <h2>Status: ${isConfigured 
            ? '<span style="color:green">ACTIVE (Safe)</span>' 
            : '<span style="color:red">INACTIVE (Disk Mode - Unsafe)</span>'}
        </h2>
        <p>${isConfigured ? 'Files will be saved to Cloudinary.' : 'You must add the MISSING variables in Render Dashboard > Environment.'}</p>
        </body>
    `);
});

// Routes
app.use('/admin', require('./routes/admin'));
app.use('/', require('./routes/index'));

// Handle Missing Uploads (Friendly 404)
app.get('/uploads/:filename', (req, res) => {
    res.status(404).render('404-upload');
});

// Database Connection & Server Start
// Database Connection & Server Start
const dbUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/learn-platform';
console.log(`Attempting to connect to database... (URI source: ${process.env.MONGO_URI ? 'ENV' : 'Fallback Local'})`);

const Admin = require('./models/Admin');
const bcrypt = require('bcrypt');

async function seedDefaultAdmin() {
    try {
        const adminCount = await Admin.countDocuments();
        if (adminCount === 0) {
            console.log('No admin found. Seeding default admin...');
            const hashedPassword = await bcrypt.hash('2008', 10);
            await Admin.create({
                email: 'princechouhan9939@gmail.com',
                password: hashedPassword
            });
            console.log('Default Admin Created: princechouhan9939@gmail.com / 2008');
        } else {
            console.log('Admin already exists.');
        }
    } catch (err) {
        console.error('Error seeding admin:', err);
    }
}

mongoose.connect(dbUri)
    .then(async () => {
        console.log('MongoDB Connected');
        await seedDefaultAdmin(); // Run seed check on startup
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err);
        if (err.message && err.message.includes('ECONNREFUSED')) {
            console.error('\n!!! DEPLOYMENT TIP !!!');
            console.error('It looks like your app is trying to connect to a local database (127.0.0.1) but failed.');
            console.error('If you are running on Render (or any cloud provider), you MUST set the MONGO_URI environment variable.');
            console.error('Render does not provide a local MongoDB. You need a cloud database like MongoDB Atlas.\n');
        }
        process.exit(1);
    });
