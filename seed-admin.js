require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Admin = require('./models/Admin');

const dbUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/learn-platform';
mongoose.connect(dbUri)
    .then(async () => {
        console.log('Connected to MongoDB');
        
        // Check if admin exists
        const email = 'princechouhan9939@gmail.com';
        const password = '2008';
        
        // Remove ANY existing admin to avoid conflicts (optional, or just specific one)
        await Admin.deleteMany({}); // Let's clear all admins for a fresh start with new creds
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        await Admin.create({
            email,
            password: hashedPassword
        });
        
        console.log('Admin created successfully');
        console.log('Email: princechouhan9939@gmail.com');
        console.log('Password: 2008');
        
        process.exit();
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
