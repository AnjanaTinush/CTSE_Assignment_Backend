const express = require('express');
const { createDelivery, getDeliveries, getDeliveryById, updateDeliveryStatus } = require('../controllers/deliveryController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.post('/', protect, authorize('ADMIN', 'DELIVERY'), createDelivery);
router.get('/', protect, authorize('ADMIN'), getDeliveries);
router.get('/:id', protect, getDeliveryById);
router.patch('/:id/status', protect, authorize('ADMIN', 'DELIVERY'), updateDeliveryStatus);

module.exports = router;
