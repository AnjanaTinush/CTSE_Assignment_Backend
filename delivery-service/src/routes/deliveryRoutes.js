const express = require('express');
const {
    createDelivery,
    getDeliveries,
    getMyTodayDeliveries,
    getDeliveryById,
    getDeliveryByOrderId,
    updateDeliveryStatus
} = require('../controllers/deliveryController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.post('/assign', protect, authorize('ADMIN'), createDelivery);
router.post('/', protect, authorize('ADMIN'), createDelivery);
router.get('/', protect, authorize('ADMIN'), getDeliveries);
router.get('/my/today', protect, authorize('DELIVERY'), getMyTodayDeliveries);
router.get('/order/:orderId', protect, authorize('USER', 'ADMIN', 'DELIVERY'), getDeliveryByOrderId);
router.get('/:id', protect, authorize('ADMIN', 'DELIVERY'), getDeliveryById);
router.patch('/:id/status', protect, authorize('ADMIN', 'DELIVERY'), updateDeliveryStatus);

module.exports = router;
