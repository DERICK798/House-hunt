
const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// REGISTER TENANT OR LANDLORD
exports.register = async (req, res) => {
    try {
        const { full_name, email, phone, password, role } = req.body;

        if (!full_name || !email || !password || !role) {
            return res.status(400).json({
                message: 'Full name, email, password and role are required'
            });
        }

        if (!['tenant', 'landlord'].includes(role)) {
            return res.status(400).json({
                message: 'Role must be tenant or landlord'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: 'Password must be at least 8 characters'
            });
        }

        const [existing] = await db.query(
            'SELECT id FROM users WHERE email = ?',
            [email.trim().toLowerCase()]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                message: 'Email is already registered'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.query(
            `INSERT INTO users (full_name, email, phone, password, role)
             VALUES (?, ?, ?, ?, ?)`,
            [
                full_name.trim(),
                email.trim().toLowerCase(),
                phone || null,
                hashedPassword,
                role
            ]
        );

        res.status(201).json({
            message: 'Registration successful',
            user: {
                id: result.insertId,
                full_name: full_name.trim(),
                email: email.trim().toLowerCase(),
                role
            }
        });
    } catch (error) {
        console.error('Register error:', error.message);
        res.status(500).json({ message: 'Registration failed' });
    }
};


// LOGIN TENANT OR LANDLORD
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: 'Email and password are required'
            });
        }

        const [users] = await db.query(
            `SELECT id, full_name, email, password, role
             FROM users WHERE email = ?`,
            [email.trim().toLowerCase()]
        );

        if (users.length === 0) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }

        const user = users[0];
        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ message: 'Login failed' });
    }
};


// ADMIN LOGIN — admins table is separate
exports.adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: 'Email and password are required'
            });
        }

        const [admins] = await db.query(
            `SELECT id, full_name, email, password
             FROM admins WHERE email = ?`,
            [email.trim().toLowerCase()]
        );

        if (admins.length === 0) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }

        const admin = admins[0];
        const passwordMatch = await bcrypt.compare(
            password,
            admin.password
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: 'Invalid email or password'
            });
        }

        const token = jwt.sign(
            { id: admin.id, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Admin login successful',
            token,
            user: {
                id: admin.id,
                full_name: admin.full_name,
                email: admin.email,
                role: 'admin'
            }
        });
    } catch (error) {
        console.error('Admin login error:', error.message);
        res.status(500).json({ message: 'Admin login failed' });
    }
};
