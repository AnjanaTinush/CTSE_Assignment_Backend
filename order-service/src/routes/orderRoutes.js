const express = require('express');
const { createOrder, getOrders, getOrderById, getOrdersByUser, updateOrderStatus } = require('../controllers/orderController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.post('/', protect, authorize('USER'), createOrder);
router.get('/', protect, authorize('ADMIN'), getOrders);
router.get('/:id', protect, getOrderById);
router.get('/by-user/:userId', getOrdersByUser); // Used by Auth Service internally to get User's orders
router.patch('/:id/status', protect, updateOrderStatus); // Delivery Service uses this to update Order status

module.exports = router;
