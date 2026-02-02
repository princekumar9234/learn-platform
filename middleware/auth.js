const Student = require('../models/Student');

module.exports = {
    ensureStudent: (req, res, next) => {
        if (req.session.studentId) {
            return next();
        }
        req.session.error = 'Please login first';
        res.redirect('/login');
    },

    ensureAdmin: (req, res, next) => {
        if (req.session.adminId) {
            return next();
        }
        req.session.error = 'Admin access required';
        res.redirect('/admin');
    },

    checkBlocked: async (req, res, next) => {
        if (req.session.studentId) {
            try {
                const student = await Student.findById(req.session.studentId);
                if (student && student.isBlocked) {
                    req.session.destroy();
                    return res.render('login', { error: 'Your account has been blocked by admin.' });
                }
            } catch (err) {
                console.error(err);
            }
        }
        next();
    }
};
