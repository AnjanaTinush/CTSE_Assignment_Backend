const Delivery = require('../models/Delivery');
const axios = require('axios');
const Joi = require('joi');

const orderServiceClient = axios.create({ timeout: 5000 });
const authServiceClient = axios.create({ timeout: 5000 });

const internalHeaders = () => ({
    'x-service-token': process.env.INTERNAL_SERVICE_TOKEN || ''
});

const formatError = (error, defaultMessage) => {
    if (error.response) {
        return {
            status: error.response.status,
            message: error.response.data?.message || defaultMessage
        };
    }
    return {
        status: 500,
        message: error.message || defaultMessage
    };
};

const createDeliverySchema = Joi.object({
    orderId:               Joi.string().required(),
    deliveryUserId:        Joi.string().required(),
    deliveryUserName:      Joi.string().trim().min(2).max(100).optional(),
    notes:                 Joi.string().trim().max(300).optional(),
    priority:              Joi.string().valid('NORMAL', 'HIGH', 'URGENT').default('NORMAL'),
    estimatedDeliveryTime: Joi.date().iso().optional()
});

const updateDeliverySchema = Joi.object({
    status:        Joi.string().valid('PICKED_UP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED_BY_DELIVERY').required(),
    notes:         Joi.string().trim().max(300).optional(),
    failureReason: Joi.string().trim().max(500).optional()
});

const getDeliveriesQuerySchema = Joi.object({
    status:         Joi.string().valid('ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED_BY_DELIVERY').optional(),
    deliveryUserId: Joi.string().trim().optional(),
    priority:       Joi.string().valid('NORMAL', 'HIGH', 'URGENT').optional()
});

const isTerminalStatus = (status) => ['COMPLETED', 'CANCELLED_BY_DELIVERY'].includes(status);

const syncOrder = async (orderId, authHeader, body) => {
    await orderServiceClient.patch(
        `${process.env.ORDER_SERVICE_URL}/orders/${orderId}/status`,
        body,
        { headers: { Authorization: authHeader } }
    );
};

const ensureDeliveryUser = async (deliveryUserId) => {
    const { data } = await authServiceClient.get(
        `${process.env.AUTH_SERVICE_URL}/users/internal/${deliveryUserId}`,
        { headers: internalHeaders() }
    );

    if (data.role !== 'DELIVERY') {
        const roleError = new Error('Selected user is not a DELIVERY role account');
        roleError.status = 400;
        throw roleError;
    }

    return data;
};

const createDelivery = async (req, res) => {
    try {
        const { error, value } = createDeliverySchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const orderResponse = await orderServiceClient.get(
            `${process.env.ORDER_SERVICE_URL}/orders/${value.orderId}`,
            { headers: { Authorization: req.headers.authorization } }
        );
        const order = orderResponse.data;

        if (isTerminalStatus(order.status)) {
            return res.status(400).json({ message: 'Cannot assign delivery to completed or cancelled orders' });
        }

        const deliveryUser = await ensureDeliveryUser(value.deliveryUserId);

        const delivery = await Delivery.findOneAndUpdate(
            { orderId: value.orderId },
            {
                orderId:               value.orderId,
                deliveryUserId:        value.deliveryUserId,
                deliveryUserName:      value.deliveryUserName || deliveryUser.name,
                assignedByAdminId:     req.user.id,
                customerId:            order.userId,
                customerContactNumber: order.userContactNumber,
                deliveryLocation:      order.deliveryLocation,
                priority:              value.priority || 'NORMAL',
                estimatedDeliveryTime: value.estimatedDeliveryTime || null,
                status:                'ASSIGNED',
                notes:                 value.notes,
                failureReason:         null,
                assignedAt:            new Date(),
                pickedUpAt:            null,
                completedAt:           null,
                cancelledAt:           null
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        await syncOrder(value.orderId, req.headers.authorization, {
            status:           'ASSIGNED',
            deliveryUserId:   value.deliveryUserId,
            deliveryUserName: value.deliveryUserName || deliveryUser.name,
            deliveryId:       delivery._id
        });

        return res.status(201).json(delivery);
    } catch (error) {
        const formatted = formatError(error, 'Failed to assign delivery');
        return res.status(formatted.status).json({ message: formatted.message });
    }
};

const getDeliveries = async (req, res) => {
    try {
        const { error, value } = getDeliveriesQuerySchema.validate(req.query, { stripUnknown: true });
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const query = {};

        if (value.status) {
            query.status = value.status;
        }

        if (value.deliveryUserId) {
            query.deliveryUserId = value.deliveryUserId;
        }

        if (value.priority) {
            query.priority = value.priority;
        }

        const deliveries = await Delivery.find(query).sort({ assignedAt: -1 });
        return res.json(deliveries);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getMyTodayDeliveries = async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const deliveries = await Delivery.find({
            deliveryUserId: req.user.id,
            assignedAt: { $gte: startOfDay, $lt: endOfDay }
        }).sort({ priority: -1, assignedAt: -1 });

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

        if (req.user.role === 'DELIVERY' && delivery.deliveryUserId !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to view this delivery' });
        }

        return res.json(delivery);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getDeliveryByOrderId = async (req, res) => {
    try {
        const delivery = await Delivery.findOne({ orderId: req.params.orderId });
        if (!delivery) {
            return res.status(404).json({ message: 'Delivery not found for this order' });
        }

        if (req.user.role === 'DELIVERY' && delivery.deliveryUserId !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to view this delivery' });
        }

        if (req.user.role === 'USER') {
            await orderServiceClient.get(
                `${process.env.ORDER_SERVICE_URL}/orders/${req.params.orderId}`,
                { headers: { Authorization: req.headers.authorization } }
            );
        }

        return res.json(delivery);
    } catch (error) {
        const formatted = formatError(error, 'Failed to fetch delivery by order');
        return res.status(formatted.status).json({ message: formatted.message });
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

        if (isTerminalStatus(delivery.status)) {
            return res.status(400).json({ message: 'Completed or cancelled deliveries cannot be updated' });
        }

        if (req.user.role === 'DELIVERY') {
            if (!['PICKED_UP', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED_BY_DELIVERY'].includes(value.status)) {
                return res.status(403).json({ message: 'Invalid status transition for delivery role' });
            }

            if (delivery.deliveryUserId !== req.user.id) {
                return res.status(403).json({ message: 'Not authorized to update this delivery' });
            }
        }

        delivery.status = value.status;
        if (value.notes) delivery.notes = value.notes;

        if (value.status === 'PICKED_UP') {
            delivery.pickedUpAt = new Date();
        }

        if (value.status === 'COMPLETED') {
            delivery.completedAt = new Date();
        }

        if (value.status === 'CANCELLED_BY_DELIVERY') {
            delivery.cancelledAt = new Date();
            if (value.failureReason) delivery.failureReason = value.failureReason;
        }

        await delivery.save();

        await syncOrder(delivery.orderId, req.headers.authorization, {
            status:             value.status,
            cancellationReason: value.status === 'CANCELLED_BY_DELIVERY' ? (value.failureReason || value.notes) : undefined,
            deliveryUserId:     delivery.deliveryUserId,
            deliveryUserName:   delivery.deliveryUserName,
            deliveryId:         delivery._id
        });

        return res.json(delivery);
    } catch (error) {
        const formatted = formatError(error, 'Failed to update delivery status');
        return res.status(formatted.status).json({ message: formatted.message });
    }
};

module.exports = {
    createDelivery,
    getDeliveries,
    getMyTodayDeliveries,
    getDeliveryById,
    getDeliveryByOrderId,
    updateDeliveryStatus
};
