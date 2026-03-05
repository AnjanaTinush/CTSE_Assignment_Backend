const Order = require('../models/Order');
const axios = require('axios');
const Joi = require('joi');

const productServiceClient = axios.create({ timeout: 5000 });

const createOrderSchema = Joi.object({
    items: Joi.array().items(
        Joi.object({
            productId: Joi.string().required(),
            quantity: Joi.number().integer().min(1).required()
        })
    ).min(1).required()
});

const updateStatusSchema = Joi.object({
    status: Joi.string().valid('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED').required(),
    deliveryId: Joi.string().optional()
});

const createOrder = async (req, res) => {
    const reservedItems = [];

    try {
        const { error, value } = createOrderSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const items = value.items.map((item) => ({ ...item }));
        let totalAmount = 0;

        for (const item of items) {
            const productRes = await productServiceClient.get(`${process.env.PRODUCT_SERVICE_URL}/products/${item.productId}`);
            const product = productRes.data;

            if (product.stock < item.quantity) {
                const insufficientStockError = new Error(`Insufficient stock for product ${product.name}`);
                insufficientStockError.status = 400;
                throw insufficientStockError;
            }

            await productServiceClient.patch(
                `${process.env.PRODUCT_SERVICE_URL}/products/${item.productId}/reserve`,
                { quantity: item.quantity },
                { headers: { Authorization: req.headers.authorization } }
            );

            reservedItems.push({ productId: item.productId, quantity: item.quantity });
            item.price = product.price;
            totalAmount += product.price * item.quantity;
        }

        const order = await Order.create({
            userId: req.user.id,
            items,
            totalAmount
        });

        return res.status(201).json(order);
    } catch (error) {
        for (const reservedItem of reservedItems) {
            try {
                await productServiceClient.patch(
                    `${process.env.PRODUCT_SERVICE_URL}/products/${reservedItem.productId}/release`,
                    { quantity: reservedItem.quantity },
                    { headers: { Authorization: req.headers.authorization } }
                );
            } catch (rollbackError) {
                console.error('Rollback failed for reserved product', reservedItem.productId, rollbackError.message);
            }
        }

        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }

        if (error.response) {
            return res.status(error.response.status).json({
                message: error.response.data?.message || 'Downstream service request failed'
            });
        }

        return res.status(500).json({ message: error.message });
    }
};

const getOrders = async (req, res) => {
    try {
        const orders = await Order.find({});
        return res.json(orders);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const isPrivileged = ['ADMIN', 'DELIVERY'].includes(req.user.role);
        const isOwner = order.userId === req.user.id;

        if (!isPrivileged && !isOwner) {
            return res.status(403).json({ message: 'Not authorized to view this order' });
        }

        return res.json(order);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getOrdersByUser = async (req, res) => {
    try {
        const isAdmin = req.user.role === 'ADMIN';
        const isOwner = req.user.id === req.params.userId;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ message: 'Not authorized to view these orders' });
        }

        const orders = await Order.find({ userId: req.params.userId });
        return res.json(orders);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { error, value } = updateStatusSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        order.status = value.status;
        if (value.deliveryId) {
            order.deliveryId = value.deliveryId;
        }

        await order.save();
        return res.json(order);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = { createOrder, getOrders, getOrderById, getOrdersByUser, updateOrderStatus };
