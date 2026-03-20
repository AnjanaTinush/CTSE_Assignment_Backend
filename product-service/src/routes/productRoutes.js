const express = require('express');
const {
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    reserveProduct,
    releaseProduct
} = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.post('/', protect, authorize('ADMIN'), createProduct);
router.get('/', getProducts);
router.get('/:id', getProductById);
router.patch('/:id', protect, authorize('ADMIN'), updateProduct);
router.delete('/:id', protect, authorize('ADMIN'), deleteProduct);
router.patch('/:id/reserve', protect, authorize('USER', 'ADMIN', 'DELIVERY'), reserveProduct);
router.patch('/:id/release', protect, authorize('USER', 'ADMIN', 'DELIVERY'), releaseProduct);

module.exports = router;
