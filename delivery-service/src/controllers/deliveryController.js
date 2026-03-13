const Delivery = require('../models/Delivery');
const axios = require('axios');
const Joi = require('joi');

const orderServiceClient = axios.create({ timeout: 5000 });

const createDeliverySchema = Joi.object({
    orderId: Joi.string().required(),
    address: Joi.string().trim().min(5).max(500).required(),
    estimatedDelivery: Joi.date().optional()
});

const updateDeliverySchema = Joi.object({
    status: Joi.string().valid('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED').required()
});

const createDelivery = async (req, res) => {
    try {
        const { error, value } = createDeliverySchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const { orderId, address, estimatedDelivery } = value;

        try {
            await orderServiceClient.get(`${process.env.ORDER_SERVICE_URL}/orders/${orderId}`, {
                headers: { Authorization: req.headers.authorization }
            });
        } catch (err) {
            return res.status(404).json({ message: 'Order not found or inaccessible' });
        }

        const delivery = await Delivery.create({
            orderId,
            driverId: req.user.id,
            address,
            estimatedDelivery: estimatedDelivery || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
        });

        await orderServiceClient.patch(
            `${process.env.ORDER_SERVICE_URL}/orders/${orderId}/status`,
            { status: 'SHIPPED', deliveryId: delivery._id },
            { headers: { Authorization: req.headers.authorization } }
        );

        return res.status(201).json(delivery);
    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json({
                message: error.response.data?.message || 'Failed to synchronize order status'
            });
        }

        return res.status(500).json({ message: error.message });
    }
};

const getDeliveries = async (req, res) => {
    try {
        const deliveries = await Delivery.find({});
        return res.json(deliveries);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getDeliveryById = async (req, res) => {
    try {
        const delivery = await Delivery.findById(req.params.id);
        if (!delivery) {
            return res.status(404).json({ message: 'Delivery not found' });
        }

        return res.json(delivery);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const updateDeliveryStatus = async (req, res) => {
    try {
        const { error, value } = updateDeliverySchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const delivery = await Delivery.findById(req.params.id);
        if (!delivery) {
            return res.status(404).json({ message: 'Delivery not found' });
        }

        delivery.status = value.status;
        await delivery.save();

        if (value.status === 'DELIVERED') {
            await orderServiceClient.patch(
                `${process.env.ORDER_SERVICE_URL}/orders/${delivery.orderId}/status`,
                { status: 'DELIVERED' },
                { headers: { Authorization: req.headers.authorization } }
            );
        }

        return res.json(delivery);
    } catch (error) {
        if (error.response) {
            return res.status(error.response.status).json({
                message: error.response.data?.message || 'Failed to synchronize order status'
            });
        }

        return res.status(500).json({ message: error.message });
    }
};

module.exports = { createDelivery, getDeliveries, getDeliveryById, updateDeliveryStatus };
