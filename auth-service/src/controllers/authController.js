const jwt = require('jsonwebtoken');
const axios = require('axios');
const Joi = require('joi');
const User = require('../models/User');

const orderServiceClient = axios.create({ timeout: 5000 });

const registerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: Joi.string().trim().email().required(),
    password: Joi.string().min(8).max(128).required()
});

const loginSchema = Joi.object({
    email: Joi.string().trim().email().required(),
    password: Joi.string().min(8).max(128).required()
});

const generateToken = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });

const registerUser = async (req, res) => {
    try {
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const { name, email, password } = value;
        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const user = await User.create({ name, email, password, role: 'USER' });
        return res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id, user.role)
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const loginUser = async (req, res) => {
    try {
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const { email, password } = value;
        const user = await User.findOne({ email });

        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        return res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id, user.role)
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getMe = async (req, res) => res.json(req.user);

const getUserPublicProfile = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('_id name');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        return res.json(user);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getUserOrders = async (req, res) => {
    try {
        const userId = req.user._id;
        const { data } = await orderServiceClient.get(
            `${process.env.ORDER_SERVICE_URL}/orders/by-user/${userId}`,
            { headers: { Authorization: req.headers.authorization } }
        );

        return res.json(data);
    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json({
                message: error.response.data?.message || 'Failed to fetch orders from Order Service'
            });
        }

        return res.status(502).json({
            message: 'Error fetching orders from Order Service',
            details: error.message
        });
    }
};

module.exports = { registerUser, loginUser, getMe, getUserPublicProfile, getUserOrders };
