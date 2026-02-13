const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Resource = require('../models/Resource');
const Category = require('../models/Category');
const bcrypt = require('bcrypt');
const https = require('https');
const { ensureStudent, checkBlocked } = require('../middleware/auth');

// Force Inline PDF Proxy Route
router.get('/view-pdf/:id', ensureStudent, async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        if (!resource || resource.type !== 'pdf') {
            return res.status(404).send('PDF not found');
        }

        https.get(resource.url, (stream) => {
            if (stream.statusCode !== 200) {
                return res.status(stream.statusCode).send('Error fetching PDF from storage');
            }
            // Force browser to treat it as a PDF and show inline
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline');
            stream.pipe(res);
        }).on('error', (err) => {
            console.error('PDF Proxy Error:', err);
            res.status(500).send('Error loading PDF');
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Public Routes
router.get('/', (req, res) => {
    res.render('landing', { student: req.session.studentId });
});

router.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

router.post('/signup', async (req, res) => {
    try {
        console.log('Signup params:', req.body);
        const { name, email, password, secretPin } = req.body;
        const existing = await Student.findOne({ email });
        if (existing) {
            console.log('Signup fail: Exists');
            return res.render('signup', { error: 'Email already exists' });
        }
        const student = new Student({ name, email, password, secretPin });
        await student.save();
        console.log('Signup Success:', student._id);
        req.session.studentId = student._id;
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Signup Error:', err);
        res.render('signup', { error: 'Error: ' + err.message });
    }
});

// Forgot Password Routes
router.get('/forgot-password', (req, res) => {
    res.render('forgot-password', { error: null, success: null });
});

router.post('/forgot-password', async (req, res) => {
    try {
        const { email, secretPin } = req.body;
        const student = await Student.findOne({ email });
        
        if (!student) {
            return res.render('forgot-password', { error: 'User not found', success: null });
        }
        
        if (student.secretPin !== secretPin) {
            return res.render('forgot-password', { error: 'Incorrect Secret PIN', success: null });
        }
        
        // If matched, render the reset page with email and PIN passed (hidden inputs) for verification in next step
        res.render('reset-password', { email, secretPin, error: null });
    } catch (err) {
        console.error('Forgot PW Error:', err);
        res.render('forgot-password', { error: 'Something went wrong', success: null });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { email, secretPin, password } = req.body;
        const student = await Student.findOne({ email, secretPin });
        
        if (!student) {
            return res.redirect('/forgot-password');
        }
        
        // Use pre-save hook for hashing by just assigning the plain password
        student.password = password;
        await student.save();
        
        res.render('login', { error: null, success: 'Password reset successfully! Please login.' });
    } catch (err) {
        console.error('Reset PW Error:', err);
        res.render('forgot-password', { error: 'Error resetting password', success: null });
    }
});

router.get('/login', (req, res) => {
    res.render('login', { error: null, success: req.query.success || null }); 
});

router.post('/login', async (req, res) => {
    try {
        console.log('Login Attempt:', req.body.email); // Debug
        const { email, password } = req.body;
        const student = await Student.findOne({ email });
        
        if (!student) {
            console.log('Login Failed: User not found'); // Debug
            return res.render('login', { error: 'Invalid credentials' });
        }
        
        if (student.isBlocked) {
            console.log('Login Failed: Blocked'); // Debug
            return res.render('login', { error: 'Your account is blocked' });
        }

        const isMatch = await student.comparePassword(password);
        if (!isMatch) {
            console.log('Login Failed: Wrong password'); // Debug
            return res.render('login', { error: 'Invalid credentials' });
        }

        req.session.studentId = student._id;
        console.log('Login Success:', student.email); // Debug
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Login Error:', err); // Debug
        res.render('login', { error: 'Something went wrong' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// Protected Student Routes
router.use(ensureStudent);
router.use(checkBlocked);

router.get('/dashboard', async (req, res) => {
    const student = await Student.findById(req.session.studentId);
    // Get all distinct categories that have at least one resource
    const distinctCategories = await Resource.distinct('category');
    
    // Default set of categories to always show (optional, but good for empty state)
    const defaultCategories = ['HTML', 'CSS', 'Javascript', 'Node.js', 'MongoDB', 'Projects'];
    
    // Merge and unique
    const catNames = [...new Set([...defaultCategories, ...distinctCategories])];
    
    // Fetch protection info for these categories
    const categoryInfo = await Category.find({ name: { $in: catNames } });
    const protectedCategories = categoryInfo.filter(c => c.password).map(c => c.name);
    const unlockedCategories = req.session.unlockedCategories || [];
    
    res.render('dashboard', { 
        student, 
        categories: catNames, 
        protectedCategories,
        unlockedCategories
    });
});

router.get('/category/:name', async (req, res) => {
    const categoryName = req.params.name;
    const category = await Category.findOne({ name: categoryName });
    const student = await Student.findById(req.session.studentId);

    // If category has a password and it's not in the user's unlocked list
    if (category && category.password) {
        const unlocked = req.session.unlockedCategories || [];
        if (!unlocked.includes(categoryName)) {
            return res.render('category-lock', { category: categoryName, error: null, student });
        }
    }

    const resources = await Resource.find({ category: categoryName }).sort('-createdAt');
    res.render('category', { category: categoryName, resources, student });
});

router.post('/category/:name/unlock', async (req, res) => {
    const categoryName = req.params.name;
    const { password } = req.body;
    const student = await Student.findById(req.session.studentId);
    
    const category = await Category.findOne({ name: categoryName });
    
    if (category && category.password === password) {
        if (!req.session.unlockedCategories) {
            req.session.unlockedCategories = [];
        }
        if (!req.session.unlockedCategories.includes(categoryName)) {
            req.session.unlockedCategories.push(categoryName);
        }
        return res.redirect(`/category/${categoryName}`);
    } else {
        return res.render('category-lock', { category: categoryName, error: 'Incorrect Password', student });
    }
});

module.exports = router;
