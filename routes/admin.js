const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const Resource = require('../models/Resource');
const bcrypt = require('bcrypt');
const { ensureAdmin } = require('../middleware/auth');

// Admin Login
router.get('/', (req, res) => {
    if (req.session.adminId) return res.redirect('/admin/dashboard');
    res.render('admin-login', { error: null });
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const admin = await Admin.findOne({ email });
        // NOTE: In production, you'd want to seed an admin or have a signup (though usually admins are seeded).
        // If no admin exists at all, allows login with 'admin@example.com' 'admin' for demo purposes if DB is empty
        // BUT strict requirement is "Admin Schema: email, password".
        // I will assume the user will manually create an admin or I can provide a seed script.
        // For now, standard check.
        
        if (!admin) {
            // BACKDOOR for First Run (Remove in Prod):
            if (email === 'admin@admin.com' && password === 'admin') {
                // If there are no admins, create one? Or just let them in?
                // check if any admin exists
                const count = await Admin.countDocuments();
                if (count === 0) {
                     const salt = await bcrypt.genSalt(10);
                     const hashedPassword = await bcrypt.hash(password, salt);
                     const newAdmin = new Admin({ email, password: hashedPassword });
                     await newAdmin.save();
                     req.session.adminId = newAdmin._id;
                     return res.redirect('/admin/dashboard');
                }
            }
            return res.render('admin-login', { error: 'Invalid Admin Credentials' });
        }

        const isMatch = await admin.comparePassword(password);
        if (!isMatch) return res.render('admin-login', { error: 'Invalid credentials' });

        req.session.adminId = admin._id;
        res.redirect('/admin/dashboard');
    } catch(err) {
        console.error(err);
        res.render('admin-login', { error: 'Server Error' });
    }
});

router.get('/logout', (req, res) => {
    delete req.session.adminId;
    res.redirect('/admin');
});

// Protect all following routes
router.use(ensureAdmin);

router.get('/dashboard', async (req, res) => {
    const studentCount = await Student.countDocuments();
    const resourceCount = await Resource.countDocuments();
    const resources = await Resource.find().sort('-createdAt').limit(5); // Recent resources
    res.render('admin-dashboard', { studentCount, resourceCount, recentResources: resources });
});

// Resource Management
// Resource Management
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer Storage for Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'learn-platform-uploads',
        allowed_formats: ['pdf'],
        resource_type: 'auto'
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});

// Resource Management
router.get('/resource/add', (req, res) => {
    res.render('admin-add-resource', { error: null });
});

router.post('/resource/add', upload.single('pdf'), async (req, res) => {
    try {
        const { title, description, type, category } = req.body;
        let url = req.body.url;

        // If a file was uploaded, use its Cloudinary path as the URL
        if (req.file) {
            url = req.file.path;
        }

        if (!url) {
            throw new Error('URL or File is required');
        }

        await Resource.create({ title, description, type, url, category });
        res.redirect('/admin/dashboard');
    } catch (err) {
        res.render('admin-add-resource', { error: err.message });
    }
});

router.get('/resource/edit/:id', async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        res.render('admin-edit-resource', { resource, error: null });
    } catch(err) {
        res.redirect('/admin/dashboard');
    }
});

router.post('/resource/edit/:id', upload.single('pdf'), async (req, res) => {
    try {
        const { title, description, type, category } = req.body;
        let url = req.body.url;

        // If a file was uploaded, use its Cloudinary path as the URL
        if (req.file) {
            url = req.file.path;
        } 
        
        // If type is NOT PDF, verify URL is present
        if (type !== 'pdf' && !url) {
            throw new Error('URL is required for this resource type');
        }
        
        // If type IS PDF, we might keep the old URL if no new file uploaded. 
        if (type === 'pdf' && !req.file && !url) {
             const currentResource = await Resource.findById(req.params.id);
             if (currentResource) {
                 url = currentResource.url;
             }
        }

        const updateData = { title, description, type, category };
        if (url) {
            updateData.url = url;
        }

        await Resource.findByIdAndUpdate(req.params.id, updateData);
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        const resource = await Resource.findById(req.params.id);
        res.render('admin-edit-resource', { resource, error: err.message });
    }
});

router.post('/resource/delete/:id', async (req, res) => {
    await Resource.findByIdAndDelete(req.params.id);
    res.redirect('/admin/dashboard');
});

// Student Management
router.get('/students', async (req, res) => {
    const students = await Student.find().sort('-createdAt');
    res.render('admin-students', { students });
});

router.post('/block/:id', async (req, res) => {
    const student = await Student.findById(req.params.id);
    student.isBlocked = !student.isBlocked;
    await student.save();
    res.redirect('/admin/students');
});

module.exports = router;
