const express = require('express');
const {
    registerUser,
    loginUser,
    getMe,
    getUsers,
    getUserById,
    getUserByContact,
    getUserPublicProfile,
    getUserOrders,
    createManagedUser,
    lookupOrCreateCustomer,
    adjustLoyaltyByAdmin,
    adjustLoyaltyInternal,
    getUserInternal,
    lookupOrCreateCustomerInternal
} = require('../controllers/authController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.post('/auth/register', registerUser);
router.post('/auth/login', loginUser);
router.get('/auth/me', protect, getMe);
router.get('/auth/me/orders', protect, getUserOrders);

router.get('/users/:id/public', getUserPublicProfile);
router.get('/users/internal/:id', getUserInternal);
router.post('/users/internal/customers/lookup-or-create', lookupOrCreateCustomerInternal);
router.post('/users/internal/loyalty/adjust', adjustLoyaltyInternal);

router.get('/users', protect, authorize('ADMIN'), getUsers);
router.post('/users', protect, authorize('ADMIN'), createManagedUser);
router.post('/users/customers/lookup-or-create', protect, authorize('ADMIN'), lookupOrCreateCustomer);
router.get('/users/by-contact/:contactNumber', protect, authorize('ADMIN'), getUserByContact);
router.get('/users/:id', protect, getUserById);
router.patch('/users/:id/loyalty', protect, authorize('ADMIN'), adjustLoyaltyByAdmin);

module.exports = router;
