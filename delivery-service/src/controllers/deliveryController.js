const Delivery = require('../models/Delivery');
const axios = require('axios');

const createDelivery = async (req, res) => {
    try {
        const { orderId, address, estimatedDelivery } = req.body;

        // 1. Validate Order exists
        let order;
        try {
            const orderRes = await axios.get(`${process.env.ORDER_SERVICE_URL}/orders/${orderId}`, {
                headers: { Authorization: req.headers.authorization }
            });
            order = orderRes.data;
        } catch (err) {
            return res.status(404).json({ message: 'Order not found or inaccessible' });
        }

        // 2. Create the delivery record
        const delivery = await Delivery.create({
            orderId,
            driverId: req.user.id, // Usually a driver is logged in creating this, or ADMIN assigned
            address,
            estimatedDelivery: estimatedDelivery || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // Default 2 days
        });

        // 3. Update Order status to SHIPPED and link delivery ID via inter-service call
        await axios.patch(`${process.env.ORDER_SERVICE_URL}/orders/${orderId}/status`,
            { status: 'SHIPPED', deliveryId: delivery._id },
            { headers: { Authorization: req.headers.authorization } }
        );

        res.status(201).json(delivery);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getDeliveries = async (req, res) => {
    try {
        const deliveries = await Delivery.find({});
        res.json(deliveries);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getDeliveryById = async (req, res) => {
    try {
        const delivery = await Delivery.findById(req.params.id);
        if (!delivery) return res.status(404).json({ message: 'Delivery not found' });
        res.json(delivery);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateDeliveryStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const delivery = await Delivery.findById(req.params.id);

        if (!delivery) return res.status(404).json({ message: 'Delivery not found' });

        delivery.status = status;
        await delivery.save();

        // Sync status with order service if it's DELIVERED
        if (status === 'DELIVERED') {
            await axios.patch(`${process.env.ORDER_SERVICE_URL}/orders/${delivery.orderId}/status`,
                { status: 'DELIVERED' },
                { headers: { Authorization: req.headers.authorization } }
            );
        }

        res.json(delivery);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createDelivery, getDeliveries, getDeliveryById, updateDeliveryStatus };
