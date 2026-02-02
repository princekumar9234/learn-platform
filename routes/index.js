const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Resource = require('../models/Resource');
const bcrypt = require('bcrypt');
const { ensureStudent, checkBlocked } = require('../middleware/auth');

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
        const { name, email, password } = req.body;
        const existing = await Student.findOne({ email });
        if (existing) {
            console.log('Signup fail: Exists');
            return res.render('signup', { error: 'Email already exists' });
        }
        const student = new Student({ name, email, password });
        await student.save();
        console.log('Signup Success:', student._id);
        req.session.studentId = student._id;
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Signup Error:', err);
        res.render('signup', { error: 'Error: ' + err.message });
    }
});

router.get('/login', (req, res) => {
    res.render('login', { error: null }); 
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
    const allCategories = [...new Set([...defaultCategories, ...distinctCategories])];
    
    res.render('dashboard', { student, categories: allCategories });
});

router.get('/category/:name', async (req, res) => {
    const categoryName = req.params.name;
    const resources = await Resource.find({ category: categoryName }).sort('-createdAt');
    const student = await Student.findById(req.session.studentId);
    res.render('category', { category: categoryName, resources, student });
});

module.exports = router;
