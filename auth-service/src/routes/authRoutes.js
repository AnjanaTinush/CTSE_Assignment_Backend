const express = require('express');
const { registerUser, loginUser, getMe, getUserPublicProfile, getUserOrders } = require('../controllers/authController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.get('/:id/public', getUserPublicProfile); // For inter-service calls typically, no protect for now
router.get('/me/orders', protect, getUserOrders); // Demonstrates inter-service communication

module.exports = router;
