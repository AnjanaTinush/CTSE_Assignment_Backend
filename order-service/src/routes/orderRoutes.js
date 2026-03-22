const express = require('express');
const {
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
} = require('../controllers/orderController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.post('/', protect, authorize('USER', 'ADMIN'), createOrder);
router.get('/', protect, authorize('ADMIN'), getOrders);
router.get('/my', protect, authorize('USER', 'ADMIN'), getMyOrders);
router.get('/by-user/:userId', protect, getOrdersByUser);
router.get('/:id/tracking', protect, getOrderTracking);
router.get('/:id', protect, getOrderById);
router.patch('/:id', protect, authorize('USER'), updatePendingOrder);
router.patch('/:id/cancel', protect, authorize('USER', 'ADMIN', 'DELIVERY'), cancelOrder);
router.patch('/:id/assign-delivery', protect, authorize('ADMIN'), assignDelivery);
router.patch('/:id/status', protect, authorize('ADMIN', 'DELIVERY'), updateOrderStatus);
router.delete('/:id', protect, authorize('ADMIN'), deleteOrderPermanently);

module.exports = router;
