const express = require('express');
const {
    createOrder,
    getOrders,
    getOrderById,
    getOrdersByUser,
    updateOrderStatus
} = require('../controllers/orderController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.post('/', protect, authorize('USER'), createOrder);
router.get('/', protect, authorize('ADMIN'), getOrders);
router.get('/by-user/:userId', protect, getOrdersByUser);
router.get('/:id', protect, getOrderById);
router.patch('/:id/status', protect, authorize('ADMIN', 'DELIVERY'), updateOrderStatus);

module.exports = router;
