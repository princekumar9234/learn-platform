const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const Resource = require('../models/Resource');
const Category = require('../models/Category');
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
    try {
        const studentCount = await Student.countDocuments();
        const resourceCount = await Resource.countDocuments();
        
        // Sync categories from resources
        const distinctCategoriesInResources = await Resource.distinct('category');
        for (const catName of distinctCategoriesInResources) {
            const exists = await Category.findOne({ name: catName });
            if (!exists) await Category.create({ name: catName });
        }
        const categoryCount = await Category.countDocuments();
        
        const resources = await Resource.find().sort('-createdAt').limit(5);
        res.render('admin-dashboard', { studentCount, resourceCount, categoryCount, recentResources: resources });
    } catch (err) {
        console.error('ADMIN_DASHBOARD_ERROR:', err);
        res.status(500).send('Server Error. Please try again.');
    }
});

// All Resources Page
router.get('/resources', async (req, res) => {
    try {
        const resources = await Resource.find().sort('-createdAt');
        res.render('admin-resources', { resources });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/dashboard');
    }
});

// Resource Management
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
// Configure Cloudinary only if keys exist
if (process.env.CLOUDINARY_CLOUD_NAME) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
}

// Determine Storage Engine
let storage;
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    // Cloudinary Storage
    storage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'learn-platform-uploads',
            resource_type: 'auto',
            chunk_size: 6000000,       // 6MB chunks — reliable for 50MB files
            timeout: 300000,           // 5 min timeout for Cloudinary upload
            public_id: (req, file) => 'pdf-' + Date.now() + '-' + file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_')
        }
    });
} else {
    // Fallback: Disk Storage
    storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, 'public/uploads/');
        },
        filename: function (req, file, cb) {
            cb(null, 'pdf-' + Date.now() + path.extname(file.originalname));
        }
    });
}

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed! Please select a .pdf file.'), false);
        }
    }
});

// Helper: Run multer upload as a Promise to catch errors properly
function runUpload(req, res) {
    return new Promise((resolve, reject) => {
        upload.single('pdf')(req, res, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

// Helper: Set a response timeout to prevent server hanging on large uploads
// Returns a cleanup function to cancel the timeout if upload finishes in time
function setUploadTimeout(res, timeoutMs = 300000) {
    const timer = setTimeout(() => {
        console.error('⏰ Upload route timeout after', timeoutMs / 1000, 'seconds');
        if (!res.headersSent) {
            res.status(503).send(`
                <div style="font-family:sans-serif;padding:2rem;max-width:600px;margin:0 auto;text-align:center">
                    <h2 style="color:#f59e0b">⏳ Upload Timeout</h2>
                    <p>File upload mein bahut zyada time lag raha hai. Please dobara try karein ya choti file use karein.</p>
                    <a href="javascript:history.back()" style="display:inline-block;margin-top:1rem;padding:0.6rem 1.4rem;background:#6366f1;color:white;border-radius:8px;text-decoration:none">← Go Back</a>
                </div>
            `);
        }
    }, timeoutMs);
    // Return cancel function
    return () => clearTimeout(timer);
}

// Resource Management
router.get('/resource/add', (req, res) => {
    res.render('admin-add-resource', { error: null });
});

router.post('/resource/add', async (req, res) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
         return res.send(`
            <div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; text-align: center;">
                <h1 style="color: #ef4444;">🛑 Upload Configuration Error</h1>
                <p>The server is trying to use <strong>Disk Storage</strong> because Cloudinary keys are missing.</p>
                <p>To solve this, you MUST go to <strong>Render Dashboard &gt; Environment</strong> and add:</p>
                <ul style="text-align: left; background: #eee; padding: 1rem; border-radius: 8px;">
                    <li>CLOUDINARY_CLOUD_NAME</li>
                    <li>CLOUDINARY_API_KEY</li>
                    <li>CLOUDINARY_API_SECRET</li>
                </ul>
                <p>Once added, the server will restart and this error will disappear.</p>
                <a href="/admin/dashboard" style="display:inline-block; padding:10px 20px; background:#000; color:#fff; text-decoration:none; border-radius:5px;">Go Back</a>
            </div>
         `);
    }

    // Set 5-minute timeout guard — server won't hang forever on large uploads
    const cancelTimeout = setUploadTimeout(res, 300000);

    try {
        // Run multer upload safely (catches file type errors, size errors, Cloudinary errors)
        await runUpload(req, res);
        cancelTimeout(); // Upload done — cancel timeout guard

        const { title, description, type, category } = req.body;
        let url = req.body.url;

        // If a file was uploaded, decide URL based on storage type
        if (req.file) {
            if (req.file.path && req.file.path.startsWith('http')) {
                url = req.file.path;
            } else if (req.file.secure_url) {
                url = req.file.secure_url;
            } else {
                url = '/uploads/' + req.file.filename;
            }
        }

        if (!url) {
            throw new Error('URL ya PDF File zaroori hai! Kripya ek URL enter karein ya PDF file upload karein.');
        }

        await Resource.create({ title, description, type, url, category });
        if (!res.headersSent) res.redirect('/admin/dashboard');
    } catch (err) {
        cancelTimeout();
        const userMessage = getUploadErrorMessage(err);
        if (!res.headersSent) {
            res.render('admin-add-resource', { error: userMessage });
        }
    }
});

// ============================================================
// Shared error message builder for upload errors
// ============================================================
function getUploadErrorMessage(err) {
    // Log FULL error for debugging (visible in Render logs)
    console.error('UPLOAD_ERROR_FULL:', {
        code: err.code,
        message: err.message,
        http_code: err.http_code,
        name: err.name
    });

    const msg = (err.message || '').toLowerCase();
    const code = (err.code || '');
    const httpCode = err.http_code || err.statusCode || 0;

    // Multer: file too large (exceeds our own limit)
    if (code === 'LIMIT_FILE_SIZE') {
        return '❌ PDF file 50MB se zyada hai. Choti file use karein.';
    }

    // Cloudinary: file too large for your plan
    // Cloudinary free plan = 10MB for raw files, returns http_code 400
    if (httpCode === 400 || msg.includes('file too large') || msg.includes('file size') ||
        msg.includes('exceeds') || msg.includes('payload too large') ||
        (msg.includes('large') && msg.includes('upload'))) {
        return '⚠️ Cloudinary Free Plan sirf 10MB tak ke PDF allow karta hai. Apna Cloudinary plan upgrade karein ya 10MB se choti PDF use karein.';
    }

    // Timeout
    if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('socket hang')) {
        return '⏳ Upload timeout ho gaya. Dobara try karein ya choti file use karein.';
    }

    // Generic Cloudinary error
    if (msg.includes('cloudinary') || msg.includes('cloud')) {
        return '☁️ Cloudinary upload fail hua. Thodi der baad dobara try karein.';
    }

    return err.message || 'Upload fail hua. Please dobara try karein.';
}

router.get('/resource/edit/:id', async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id);
        res.render('admin-edit-resource', { resource, error: null });
    } catch(err) {
        res.redirect('/admin/dashboard');
    }
});

router.post('/resource/edit/:id', async (req, res) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
         return res.send(`
            <div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; text-align: center;">
                <h1 style="color: #ef4444;">🛑 Upload Configuration Error</h1>
                <p>The server is trying to use <strong>Disk Storage</strong> because Cloudinary keys are missing.</p>
                <p>To solve this, you MUST go to <strong>Render Dashboard &gt; Environment</strong> and add:</p>
                <ul style="text-align: left; background: #eee; padding: 1rem; border-radius: 8px;">
                    <li>CLOUDINARY_CLOUD_NAME</li>
                    <li>CLOUDINARY_API_KEY</li>
                    <li>CLOUDINARY_API_SECRET</li>
                </ul>
                <p>Once added, the server will restart and this error will disappear.</p>
                <a href="/admin/dashboard" style="display:inline-block; padding:10px 20px; background:#000; color:#fff; text-decoration:none; border-radius:5px;">Go Back</a>
            </div>
         `);
    }

    try {
        // Run multer upload safely
        await runUpload(req, res);

        const { title, description, type, category } = req.body;
        let url = req.body.url;

        // If a file was uploaded, decide URL based on storage type
        if (req.file) {
            if (req.file.path && req.file.path.startsWith('http')) {
                url = req.file.path;
            } else if (req.file.secure_url) {
                url = req.file.secure_url;
            } else {
                url = '/uploads/' + req.file.filename;
            }
        } 
        
        // If type is NOT PDF, verify URL is present
        if (type !== 'pdf' && !url) {
            throw new Error('URL is required for this resource type');
        }
        
        // If type IS PDF, keep old URL if no new file uploaded
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
        if (!res.headersSent) res.redirect('/admin/dashboard');
    } catch (err) {
        const userMessage = getUploadErrorMessage(err);
        try {
            const resource = await Resource.findById(req.params.id);
            if (!res.headersSent) res.render('admin-edit-resource', { resource, error: userMessage });
        } catch (dbErr) {
            if (!res.headersSent) res.redirect('/admin/dashboard');
        }
    }
});

router.post('/resource/delete/:id', async (req, res) => {
    try {
        await Resource.findByIdAndDelete(req.params.id);
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error('DELETE_ERROR:', err);
        res.redirect('/admin/dashboard');
    }
});

// Student Management
router.get('/students', async (req, res) => {
    try {
        const students = await Student.find().sort('-createdAt');
        res.render('admin-students', { students });
    } catch (err) {
        console.error('STUDENTS_ERROR:', err);
        res.redirect('/admin/dashboard');
    }
});

// Block / Unblock Student  ← CRITICAL: This route was MISSING
router.post('/block/:id', async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.redirect('/admin/students');
        student.isBlocked = !student.isBlocked; // Toggle
        await student.save();
        res.redirect('/admin/students');
    } catch (err) {
        console.error('BLOCK_STUDENT_ERROR:', err);
        res.redirect('/admin/students');
    }
});

// Category Management
router.get('/categories', async (req, res) => {
    try {
        // First sync categories from resources just in case
        const distinctCategoriesInResources = await Resource.distinct('category');
        for (const catName of distinctCategoriesInResources) {
            const exists = await Category.findOne({ name: catName });
            if (!exists) {
                await Category.create({ name: catName });
            }
        }
        
        const categories = await Category.find().sort('name');
        const success = req.query.success || null;
        res.render('admin-categories', { categories, error: null, success });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/dashboard');
    }
});

router.post('/categories/update-password', async (req, res) => {
    try {
        const { categoryId, password } = req.body;
        // Find by id and update password. If password is empty string, set it to null
        const updateData = { password: password === '' ? null : password };
        await Category.findByIdAndUpdate(categoryId, updateData);
        res.redirect('/admin/categories');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/categories');
    }
});

// Category Rename / Merge
// Renames a category AND updates all resources under old name → new name
// If new name already exists as a category, it merges them (deletes old)
router.post('/categories/rename', async (req, res) => {
    try {
        const { categoryId, newName } = req.body;
        const trimmedName = newName ? newName.trim() : '';

        if (!trimmedName) {
            return res.redirect('/admin/categories?error=Name+cannot+be+empty');
        }

        // Get the old category
        const oldCat = await Category.findById(categoryId);
        if (!oldCat) {
            return res.redirect('/admin/categories');
        }

        const oldName = oldCat.name;

        if (oldName === trimmedName) {
            return res.redirect('/admin/categories'); // No change
        }

        // Update ALL resources from old category name → new name
        await Resource.updateMany({ category: oldName }, { category: trimmedName });

        // Check if a category with the NEW name already exists
        const existingNewCat = await Category.findOne({ name: trimmedName });

        if (existingNewCat) {
            // Merge: old category gets deleted, new category already exists
            // Transfer password from old to new only if new doesn't have one
            if (oldCat.password && !existingNewCat.password) {
                await Category.findByIdAndUpdate(existingNewCat._id, { password: oldCat.password });
            }
            await Category.findByIdAndDelete(categoryId); // Delete duplicate
        } else {
            // Simply rename
            await Category.findByIdAndUpdate(categoryId, { name: trimmedName });
        }

        res.redirect('/admin/categories?success=Category+renamed+successfully');
    } catch (err) {
        console.error('CATEGORY_RENAME_ERROR:', err);
        res.redirect('/admin/categories');
    }
});

module.exports = router;

