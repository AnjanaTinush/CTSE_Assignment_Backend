const Order = require('../models/Order');
const axios = require('axios');

const createOrder = async (req, res) => {
    try {
        const { items } = req.body;
        let totalAmount = 0;

        // Validate and reserve each product via Product Service
        for (let item of items) {
            // 1. Get Product info
            const productRes = await axios.get(`${process.env.PRODUCT_SERVICE_URL}/products/${item.productId}`);
            const product = productRes.data;

            if (product.stock < item.quantity) {
                return res.status(400).json({ message: `Insufficient stock for product ${product.name}` });
            }

            // 2. Reserve stock
            await axios.patch(`${process.env.PRODUCT_SERVICE_URL}/products/${item.productId}/reserve`, {}, {
                headers: { Authorization: req.headers.authorization }
            });

            item.price = product.price;
            totalAmount += (product.price * item.quantity);
        }

        const order = await Order.create({
            userId: req.user.id,
            items,
            totalAmount
        });

        res.status(201).json(order);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getOrders = async (req, res) => {
    try {
        const orders = await Order.find({});
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json(order);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getOrdersByUser = async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.params.userId });
        res.json(orders);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { status, deliveryId } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) return res.status(404).json({ message: 'Order not found' });

        order.status = status || order.status;
        if (deliveryId) order.deliveryId = deliveryId;

        await order.save();
        res.json(order);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createOrder, getOrders, getOrderById, getOrdersByUser, updateOrderStatus };
