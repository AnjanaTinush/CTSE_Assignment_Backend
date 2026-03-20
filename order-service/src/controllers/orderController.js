const Order = require('../models/Order');
const axios = require('axios');
const Joi = require('joi');

const productServiceClient = axios.create({ timeout: 5000 });
const authServiceClient = axios.create({ timeout: 5000 });
const deliveryServiceClient = axios.create({ timeout: 5000 });

const CANCELLED_STATUSES = new Set(['CANCELLED_BY_USER', 'CANCELLED_BY_ADMIN', 'CANCELLED_BY_DELIVERY']);

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

const isCancelledStatus = (status) => CANCELLED_STATUSES.has(status);

const isTerminalStatus = (status) => status === 'COMPLETED' || isCancelledStatus(status);

const createOrderSchema = Joi.object({
    items: Joi.array().items(
        Joi.object({
            productId: Joi.string().required(),
            quantity: Joi.number().integer().min(1).required()
        })
    ).min(1).required(),
    deliveryLocation: Joi.object({
        address: Joi.string().trim().min(4).max(500).required(),
        latitude: Joi.number().min(-90).max(90).required(),
        longitude: Joi.number().min(-180).max(180).required()
    }).required(),
    loyaltyPointsToUse: Joi.number().integer().min(0).default(0),
    customerContactNumber: Joi.string().trim().pattern(/^\+?\d{7,15}$/).optional(),
    customerName: Joi.string().trim().min(2).max(100).optional()
});

const updatePendingOrderSchema = Joi.object({
    items: Joi.array().items(
        Joi.object({
            productId: Joi.string().required(),
            quantity: Joi.number().integer().min(1).required()
        })
    ).min(1).optional(),
    deliveryLocation: Joi.object({
        address: Joi.string().trim().min(4).max(500).required(),
        latitude: Joi.number().min(-90).max(90).required(),
        longitude: Joi.number().min(-180).max(180).required()
    }).optional()
}).or('items', 'deliveryLocation');

const cancelOrderSchema = Joi.object({
    reason: Joi.string().trim().max(300).optional()
});

const updateStatusSchema = Joi.object({
    status: Joi.string().valid(
        'ASSIGNED',
        'OUT_FOR_DELIVERY',
        'COMPLETED',
        'CANCELLED_BY_ADMIN',
        'CANCELLED_BY_DELIVERY'
    ).required(),
    deliveryUserId: Joi.string().optional(),
    deliveryUserName: Joi.string().optional(),
    deliveryId: Joi.string().optional(),
    cancellationReason: Joi.string().trim().max(300).optional()
});

const assignDeliverySchema = Joi.object({
    deliveryUserId: Joi.string().required(),
    deliveryUserName: Joi.string().trim().min(2).max(100).optional(),
    deliveryId: Joi.string().optional()
});

const getUserInternal = async (userId) => {
    const { data } = await authServiceClient.get(
        `${process.env.AUTH_SERVICE_URL}/users/internal/${userId}`,
        { headers: internalHeaders() }
    );

    return data;
};

const lookupOrCreateCustomer = async (contactNumber, customerName) => {
    const { data } = await authServiceClient.post(
        `${process.env.AUTH_SERVICE_URL}/users/internal/customers/lookup-or-create`,
        {
            contactNumber,
            name: customerName
        },
        { headers: internalHeaders() }
    );

    return data.user;
};

const adjustLoyaltyInternal = async (userId, delta, reason) => {
    const { data } = await authServiceClient.post(
        `${process.env.AUTH_SERVICE_URL}/users/internal/loyalty/adjust`,
        { userId, delta, reason },
        { headers: internalHeaders() }
    );

    return data;
};

const reserveProductsForItems = async (items, authHeader) => {
    const preparedItems = [];
    const reservedItems = [];
    let subtotal = 0;

    for (const item of items) {
        const productRes = await productServiceClient.get(`${process.env.PRODUCT_SERVICE_URL}/products/${item.productId}`);
        const product = productRes.data;

        if (product.stock < item.quantity) {
            const error = new Error(`Insufficient stock for product ${product.name}`);
            error.status = 400;
            throw error;
        }

        await productServiceClient.patch(
            `${process.env.PRODUCT_SERVICE_URL}/products/${item.productId}/reserve`,
            { quantity: item.quantity },
            { headers: { Authorization: authHeader } }
        );

        reservedItems.push({ productId: item.productId, quantity: item.quantity });
        preparedItems.push({
            productId: item.productId,
            name: product.name,
            quantity: item.quantity,
            price: product.price
        });
        subtotal += product.price * item.quantity;
    }

    return { preparedItems, reservedItems, subtotal };
};

const releaseReservedItems = async (items, authHeader) => {
    for (const item of items) {
        await productServiceClient.patch(
            `${process.env.PRODUCT_SERVICE_URL}/products/${item.productId}/release`,
            { quantity: item.quantity },
            { headers: { Authorization: authHeader } }
        );
    }
};

const rollbackLoyalty = async (userId, deltas) => {
    for (const delta of [...deltas].reverse()) {
        try {
            await adjustLoyaltyInternal(userId, -delta, 'ROLLBACK_AFTER_FAILURE');
        } catch (error) {
            console.error(`Loyalty rollback failed for user ${userId}`, error.message);
        }
    }
};

const applyCancellationEffects = async (order, status, reason, authHeader) => {
    await releaseReservedItems(order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })), authHeader);

    order.status = status;
    order.cancellationReason = reason || order.cancellationReason;
    order.cancelledAt = new Date();
    await order.save();

    const loyaltyDelta = (order.loyaltyPointsUsed || 0) - (order.pointsAwarded || 0);
    if (loyaltyDelta !== 0) {
        await adjustLoyaltyInternal(order.userId, loyaltyDelta, `ORDER_${status}`);
    }
};

const resolveCustomerProfileForOrder = async (req, payload) => {
    if (req.user.role !== 'ADMIN') {
        return getUserInternal(req.user.id);
    }

    if (!payload.customerContactNumber) {
        const error = new Error('customerContactNumber is required when ADMIN creates an order');
        error.status = 400;
        throw error;
    }

    return lookupOrCreateCustomer(payload.customerContactNumber, payload.customerName);
};

const applyLoyaltyForOrderCreate = async (customerId, loyaltyDiscount, loyaltyDeltas) => {
    if (loyaltyDiscount > 0) {
        await adjustLoyaltyInternal(customerId, -loyaltyDiscount, 'ORDER_REDEEM_POINTS');
        loyaltyDeltas.push(-loyaltyDiscount);
    }

    await adjustLoyaltyInternal(customerId, 1, 'ORDER_REWARD_POINT');
    loyaltyDeltas.push(1);
};

const rollbackReservedProducts = async (reservedItems, authHeader) => {
    for (const reservedItem of reservedItems) {
        try {
            await releaseReservedItems([reservedItem], authHeader);
        } catch (rollbackError) {
            console.error('Rollback failed for reserved product', reservedItem.productId, rollbackError.message);
        }
    }
};

const createOrder = async (req, res) => {
    const reservedItems = [];
    const loyaltyDeltas = [];
    let createdOrder = null;
    let loyaltyUserId = req.user.id;

    try {
        const { error, value } = createOrderSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const customerProfile = await resolveCustomerProfileForOrder(req, value);

        loyaltyUserId = customerProfile._id;

        const pointsToUse = Math.max(0, value.loyaltyPointsToUse || 0);
        if (pointsToUse > customerProfile.loyaltyPoints) {
            return res.status(400).json({ message: 'Requested loyalty points exceed available balance' });
        }

        const reserveResult = await reserveProductsForItems(value.items, req.headers.authorization);
        reservedItems.push(...reserveResult.reservedItems);

        const loyaltyDiscount = Math.min(pointsToUse, reserveResult.subtotal);
        const totalAmount = reserveResult.subtotal - loyaltyDiscount;

        await applyLoyaltyForOrderCreate(customerProfile._id, loyaltyDiscount, loyaltyDeltas);

        createdOrder = await Order.create({
            userId: customerProfile._id,
            userContactNumber: customerProfile.contactNumber,
            items: reserveResult.preparedItems,
            subtotal: reserveResult.subtotal,
            loyaltyPointsUsed: loyaltyDiscount,
            loyaltyDiscount,
            totalAmount,
            pointsAwarded: 1,
            paymentMethod: 'CASH_ON_DELIVERY',
            deliveryLocation: value.deliveryLocation
        });

        return res.status(201).json(createdOrder);
    } catch (error) {
        if (createdOrder) {
            await Order.findByIdAndDelete(createdOrder._id).catch(() => null);
        }

        await rollbackLoyalty(createdOrder?.userId || loyaltyUserId, loyaltyDeltas);
        await rollbackReservedProducts(reservedItems, req.headers.authorization);

        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }

        const formatted = formatError(error, 'Order creation failed');
        return res.status(formatted.status).json({ message: formatted.message });
    }
};

const getOrders = async (req, res) => {
    try {
        const query = {};

        if (req.query.status) {
            query.status = req.query.status;
        }

        if (req.query.deliveryUserId) {
            query['deliveryAssignment.deliveryUserId'] = req.query.deliveryUserId;
        }

        if (req.query.contactNumber) {
            query.userContactNumber = req.query.contactNumber;
        }

        const orders = await Order.find(query).sort({ createdAt: -1 });
        return res.json(orders);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
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

        const isPrivileged = req.user.role === 'ADMIN';
        const isOwner = order.userId === req.user.id;
        const isAssignedDelivery = req.user.role === 'DELIVERY'
            && order.deliveryAssignment?.deliveryUserId
            && order.deliveryAssignment.deliveryUserId === req.user.id;

        if (!isPrivileged && !isOwner && !isAssignedDelivery) {
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

const updatePendingOrder = async (req, res) => {
    try {
        const { error, value } = updatePendingOrderSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const isOwner = order.userId === req.user.id;
        if (!isOwner || req.user.role !== 'USER') {
            return res.status(403).json({ message: 'Only the owner can edit pending orders' });
        }

        if (order.status !== 'PENDING') {
            return res.status(400).json({ message: 'Only pending orders can be edited' });
        }

        if (value.items) {
            const previousItems = order.items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
            await releaseReservedItems(previousItems, req.headers.authorization);

            try {
                const reserveResult = await reserveProductsForItems(value.items, req.headers.authorization);
                order.items = reserveResult.preparedItems;
                order.subtotal = reserveResult.subtotal;

                const nextDiscount = Math.min(order.loyaltyPointsUsed, reserveResult.subtotal);
                const refund = order.loyaltyDiscount - nextDiscount;
                order.loyaltyPointsUsed = nextDiscount;
                order.loyaltyDiscount = nextDiscount;
                order.totalAmount = reserveResult.subtotal - nextDiscount;

                await order.save();

                if (refund > 0) {
                    await adjustLoyaltyInternal(order.userId, refund, 'ORDER_EDIT_POINTS_REFUND');
                }

                if (value.deliveryLocation) {
                    order.deliveryLocation = value.deliveryLocation;
                    await order.save();
                }

                return res.json(order);
            } catch (reserveError) {
                try {
                    await reserveProductsForItems(previousItems, req.headers.authorization);
                } catch (rollbackError) {
                    console.error(`Rollback failed for pending order edit ${order._id}`, rollbackError.message);
                }

                const formatted = formatError(reserveError, 'Unable to update order items');
                return res.status(formatted.status).json({ message: formatted.message });
            }
        }

        order.deliveryLocation = value.deliveryLocation;
        await order.save();
        return res.json(order);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const cancelOrder = async (req, res) => {
    try {
        const { error, value } = cancelOrderSchema.validate(req.body || {});
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (isTerminalStatus(order.status)) {
            return res.status(400).json({ message: 'Completed or cancelled orders cannot be cancelled again' });
        }

        if (req.user.role === 'USER') {
            if (order.userId !== req.user.id) {
                return res.status(403).json({ message: 'Not authorized to cancel this order' });
            }

            if (order.status !== 'PENDING') {
                return res.status(400).json({ message: 'Users can cancel only pending orders' });
            }

            await applyCancellationEffects(order, 'CANCELLED_BY_USER', value.reason, req.headers.authorization);
            return res.json(order);
        }

        if (req.user.role === 'ADMIN') {
            await applyCancellationEffects(order, 'CANCELLED_BY_ADMIN', value.reason, req.headers.authorization);
            return res.json(order);
        }

        if (req.user.role === 'DELIVERY') {
            if (order.deliveryAssignment?.deliveryUserId !== req.user.id) {
                return res.status(403).json({ message: 'Not authorized to cancel this order' });
            }

            await applyCancellationEffects(order, 'CANCELLED_BY_DELIVERY', value.reason, req.headers.authorization);
            return res.json(order);
        }

        return res.status(403).json({ message: 'Not authorized to cancel this order' });
    } catch (error) {
        const formatted = formatError(error, 'Failed to cancel order');
        return res.status(formatted.status).json({ message: formatted.message });
    }
};

const assignDelivery = async (req, res) => {
    try {
        const { error, value } = assignDeliverySchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (isTerminalStatus(order.status)) {
            return res.status(400).json({ message: 'Cannot assign delivery for completed or cancelled orders' });
        }

        order.deliveryAssignment = {
            deliveryUserId: value.deliveryUserId,
            deliveryUserName: value.deliveryUserName,
            deliveryId: value.deliveryId,
            assignedAt: new Date()
        };
        order.status = 'ASSIGNED';

        await order.save();
        return res.json(order);
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

        if (isTerminalStatus(order.status)) {
            return res.status(400).json({ message: 'Completed or cancelled orders cannot be updated' });
        }

        if (req.user.role === 'DELIVERY') {
            if (!['COMPLETED', 'CANCELLED_BY_DELIVERY'].includes(value.status)) {
                return res.status(403).json({ message: 'Delivery users can set only COMPLETED or CANCELLED_BY_DELIVERY' });
            }

            if (order.deliveryAssignment?.deliveryUserId && order.deliveryAssignment.deliveryUserId !== req.user.id) {
                return res.status(403).json({ message: 'This order is assigned to a different delivery user' });
            }
        }

        if (isCancelledStatus(value.status)) {
            await applyCancellationEffects(
                order,
                value.status,
                value.cancellationReason,
                req.headers.authorization
            );
            return res.json(order);
        }

        order.status = value.status;

        if (value.status === 'COMPLETED') {
            order.completedAt = new Date();
        }

        if (value.deliveryUserId || value.deliveryUserName || value.deliveryId) {
            order.deliveryAssignment = {
                ...order.deliveryAssignment,
                deliveryUserId: value.deliveryUserId || order.deliveryAssignment?.deliveryUserId,
                deliveryUserName: value.deliveryUserName || order.deliveryAssignment?.deliveryUserName,
                deliveryId: value.deliveryId || order.deliveryAssignment?.deliveryId,
                assignedAt: order.deliveryAssignment?.assignedAt || new Date()
            };
        }

        await order.save();
        return res.json(order);
    } catch (error) {
        const formatted = formatError(error, 'Failed to update order status');
        return res.status(formatted.status).json({ message: formatted.message });
    }
};

const deleteOrderPermanently = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (!isTerminalStatus(order.status)) {
            await releaseReservedItems(order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })), req.headers.authorization);
            const loyaltyDelta = (order.loyaltyPointsUsed || 0) - (order.pointsAwarded || 0);
            if (loyaltyDelta !== 0) {
                await adjustLoyaltyInternal(order.userId, loyaltyDelta, 'ORDER_DELETED_BY_ADMIN');
            }
        }

        await Order.deleteOne({ _id: order._id });
        return res.json({ message: 'Order deleted permanently' });
    } catch (error) {
        const formatted = formatError(error, 'Failed to delete order');
        return res.status(formatted.status).json({ message: formatted.message });
    }
};

const getOrderTracking = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const isAdmin = req.user.role === 'ADMIN';
        const isOwner = req.user.id === order.userId;
        const isAssignedDelivery = req.user.role === 'DELIVERY'
            && order.deliveryAssignment?.deliveryUserId
            && order.deliveryAssignment.deliveryUserId === req.user.id;

        if (!isAdmin && !isOwner && !isAssignedDelivery) {
            return res.status(403).json({ message: 'Not authorized to view order tracking' });
        }

        let delivery = null;
        try {
            const { data } = await deliveryServiceClient.get(
                `${process.env.DELIVERY_SERVICE_URL}/deliveries/order/${order._id}`,
                {
                    headers: {
                        Authorization: req.headers.authorization,
                        ...internalHeaders()
                    }
                }
            );

            delivery = data;
        } catch (error) {
            console.warn(`Delivery tracking lookup failed for order ${order._id}:`, error.message);
            delivery = null;
        }

        return res.json({
            orderId: order._id,
            orderStatus: order.status,
            deliveryAssignment: order.deliveryAssignment,
            deliveryLocation: order.deliveryLocation,
            delivery
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createOrder,
    getOrders,
    getMyOrders,
    getOrderById,
    getOrdersByUser,
    getOrderTracking,
    updatePendingOrder,
    cancelOrder,
    assignDelivery,
    updateOrderStatus,
    deleteOrderPermanently
};
