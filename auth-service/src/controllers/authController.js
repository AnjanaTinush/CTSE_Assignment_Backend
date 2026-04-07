const jwt = require('jsonwebtoken');
const axios = require('axios');
const Joi = require('joi');
const User = require('../models/User');

const orderServiceClient = axios.create({ timeout: 5000 });
const CONTACT_REGEX = /^\+?\d{7,15}$/;

const normalizeContactNumber = (value) => User.normalizeContactNumber(value);
const buildLoyaltyCardNumber = (contactNumber) => `LC-${String(contactNumber).replace('+', '')}`;

const registerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    contactNumber: Joi.string().trim().pattern(CONTACT_REGEX).required(),
    password: Joi.string().min(6).max(128).required()
});

const loginSchema = Joi.object({
    contactNumber: Joi.string().trim().pattern(CONTACT_REGEX).required(),
    password: Joi.string().min(6).max(128).required()
});

const createManagedUserSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    contactNumber: Joi.string().trim().pattern(CONTACT_REGEX).required(),
    password: Joi.string().min(6).max(128).optional(),
    role: Joi.string().valid('ADMIN', 'USER', 'DELIVERY').required()
});

const lookupOrCreateCustomerSchema = Joi.object({
    contactNumber: Joi.string().trim().pattern(CONTACT_REGEX).required(),
    name: Joi.string().trim().min(2).max(100).optional()
});

const adminLoyaltyAdjustmentSchema = Joi.object({
    operation: Joi.string().valid('ADD', 'DEDUCT').required(),
    points: Joi.number().integer().min(1).required(),
    reason: Joi.string().trim().max(200).optional()
});

const getUsersQuerySchema = Joi.object({
    role: Joi.string().valid('ADMIN', 'USER', 'DELIVERY').optional(),
    contactNumber: Joi.string().trim().pattern(CONTACT_REGEX).optional(),
    search: Joi.string().trim().max(100).optional()
});

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const internalLoyaltyAdjustmentSchema = Joi.object({
    userId: Joi.string().required(),
    delta: Joi.number().integer().invalid(0).required(),
    reason: Joi.string().trim().max(200).optional()
});

const generateToken = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });

const serializeUser = (userDoc) => ({
    _id: userDoc._id,
    name: userDoc.name,
    contactNumber: userDoc.contactNumber,
    role: userDoc.role,
    loyaltyPoints: userDoc.loyaltyPoints,
    loyaltyCardNumber: userDoc.loyaltyCardNumber,
    isActive: userDoc.isActive,
    createdAt: userDoc.createdAt,
    updatedAt: userDoc.updatedAt
});

const ensureLoyaltyCard = async (user) => {
    if (user.role !== 'USER' || user.loyaltyCardNumber) {
        return user;
    }

    user.loyaltyCardNumber = buildLoyaltyCardNumber(user.contactNumber);
    await user.save();
    return user;
};

const isInternalRequest = (req) => {
    const token = req.headers['x-service-token'];
    return Boolean(process.env.INTERNAL_SERVICE_TOKEN) && token === process.env.INTERNAL_SERVICE_TOKEN;
};

const registerUser = async (req, res) => {
    try {
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const normalizedContactNumber = normalizeContactNumber(value.contactNumber);
        const userExists = await User.findOne({ contactNumber: normalizedContactNumber });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists for this contact number' });
        }

        const user = await User.create({
            name: value.name,
            contactNumber: normalizedContactNumber,
            password: value.password,
            role: 'USER',
            loyaltyCardNumber: buildLoyaltyCardNumber(normalizedContactNumber)
        });

        return res.status(201).json({
            ...serializeUser(user),
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

        const normalizedContactNumber = normalizeContactNumber(value.contactNumber);
        const user = await User.findOne({ contactNumber: normalizedContactNumber });

        if (!user || !(await user.matchPassword(value.password))) {
            return res.status(401).json({ message: 'Invalid contact number or password' });
        }

        if (!user.isActive) {
            return res.status(403).json({ message: 'User account is inactive' });
        }

        await ensureLoyaltyCard(user);

        return res.json({
            ...serializeUser(user),
            token: generateToken(user._id, user.role)
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getMe = async (req, res) => {
    const user = await ensureLoyaltyCard(req.user);
    return res.json(serializeUser(user));
};

const getUsers = async (req, res) => {
    try {
        const { value, error } = getUsersQuerySchema.validate(req.query, { stripUnknown: true });
        if (error) {
            return res.status(400).json({ message: error.message });
        }

        const query = {};

        if (value.role) {
            query.role = value.role;
        }

        if (value.contactNumber) {
            query.contactNumber = normalizeContactNumber(value.contactNumber);
        }

        if (value.search) {
            query.name = { $regex: escapeRegex(value.search), $options: 'i' };
        }

        const users = await User.find(query).select('-password').sort({ createdAt: -1 });
        return res.json(users);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getUserById = async (req, res) => {
    try {
        const isAdmin = req.user.role === 'ADMIN';
        const isSelf = req.user._id.toString() === req.params.id;

        if (!isAdmin && !isSelf) {
            return res.status(403).json({ message: 'Not authorized to view this profile' });
        }

        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.json(user);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getUserByContact = async (req, res) => {
    try {
        const contactNumber = normalizeContactNumber(req.params.contactNumber);
        const user = await User.findOne({ contactNumber }).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.json(user);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getUserPublicProfile = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('_id name role contactNumber loyaltyCardNumber loyaltyPoints');
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
        const { data } = await orderServiceClient.get(
            `${process.env.ORDER_SERVICE_URL}/orders/my`,
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

const createManagedUser = async (req, res) => {
    try {
        const { error, value } = createManagedUserSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const contactNumber = normalizeContactNumber(value.contactNumber);
        const exists = await User.findOne({ contactNumber });
        if (exists) {
            return res.status(400).json({ message: 'User already exists for this contact number' });
        }

        const user = await User.create({
            name: value.name,
            contactNumber,
            password: value.password || contactNumber,
            role: value.role,
            loyaltyCardNumber: value.role === 'USER' ? buildLoyaltyCardNumber(contactNumber) : undefined
        });

        return res.status(201).json(serializeUser(user));
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const lookupOrCreateCustomer = async (req, res) => {
    try {
        const { error, value } = lookupOrCreateCustomerSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const contactNumber = normalizeContactNumber(value.contactNumber);
        let user = await User.findOne({ contactNumber, role: 'USER' });

        if (user) {
            await ensureLoyaltyCard(user);
            return res.json({ message: 'Customer account exists', user: serializeUser(user) });
        }

        user = await User.create({
            name: value.name || `Customer ${contactNumber}`,
            contactNumber,
            password: contactNumber,
            role: 'USER',
            loyaltyCardNumber: buildLoyaltyCardNumber(contactNumber)
        });

        return res.status(201).json({ message: 'Customer account created', user: serializeUser(user) });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const adjustLoyaltyByAdmin = async (req, res) => {
    try {
        const { error, value } = adminLoyaltyAdjustmentSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.role !== 'USER') {
            return res.status(400).json({ message: 'Loyalty points can be adjusted only for USER role accounts' });
        }

        const delta = value.operation === 'ADD' ? value.points : -value.points;
        if (user.loyaltyPoints + delta < 0) {
            return res.status(400).json({ message: 'Insufficient loyalty points' });
        }

        user.loyaltyPoints += delta;
        await ensureLoyaltyCard(user);
        await user.save();

        return res.json({
            message: 'Loyalty points updated',
            delta,
            reason: value.reason || null,
            user: serializeUser(user)
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const adjustLoyaltyInternal = async (req, res) => {
    try {
        if (!isInternalRequest(req)) {
            return res.status(403).json({ message: 'Forbidden: invalid service token' });
        }

        const { error, value } = internalLoyaltyAdjustmentSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const user = await User.findById(value.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.role !== 'USER') {
            return res.status(400).json({ message: 'Loyalty points can be adjusted only for USER role accounts' });
        }

        const nextPoints = user.loyaltyPoints + value.delta;
        if (nextPoints < 0) {
            return res.status(400).json({ message: 'Insufficient loyalty points' });
        }

        user.loyaltyPoints = nextPoints;
        await ensureLoyaltyCard(user);
        await user.save();

        return res.json({
            message: 'Loyalty updated',
            delta: value.delta,
            reason: value.reason || null,
            user: serializeUser(user)
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getUserInternal = async (req, res) => {
    try {
        if (!isInternalRequest(req)) {
            return res.status(403).json({ message: 'Forbidden: invalid service token' });
        }

        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.json(user);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const lookupOrCreateCustomerInternal = async (req, res) => {
    try {
        if (!isInternalRequest(req)) {
            return res.status(403).json({ message: 'Forbidden: invalid service token' });
        }

        const { error, value } = lookupOrCreateCustomerSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const contactNumber = normalizeContactNumber(value.contactNumber);
        let user = await User.findOne({ contactNumber, role: 'USER' });

        if (user) {
            await ensureLoyaltyCard(user);
            return res.json({ user: serializeUser(user) });
        }

        user = await User.create({
            name: value.name || `Customer ${contactNumber}`,
            contactNumber,
            password: contactNumber,
            role: 'USER',
            loyaltyCardNumber: buildLoyaltyCardNumber(contactNumber)
        });

        return res.json({ user: serializeUser(user) });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
    getUsers,
    getUserById,
    getUserByContact,
    getUserPublicProfile,
    getUserOrders,
    createManagedUser,
    lookupOrCreateCustomer,
    adjustLoyaltyByAdmin,
    adjustLoyaltyInternal,
    getUserInternal,
    lookupOrCreateCustomerInternal
};
