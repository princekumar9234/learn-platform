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
app.use(express.static(path.join(__dirname, 'public')));

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

// Routes
app.use('/admin', require('./routes/admin'));
app.use('/', require('./routes/index'));

// Database Connection & Server Start
// Database Connection & Server Start
const dbUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/learn-platform';
console.log(`Attempting to connect to database... (URI source: ${process.env.MONGO_URI ? 'ENV' : 'Fallback Local'})`);

mongoose.connect(dbUri)
    .then(() => {
        console.log('MongoDB Connected');
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
