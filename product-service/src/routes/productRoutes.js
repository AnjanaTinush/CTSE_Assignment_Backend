const express = require('express');
const { createProduct, getProducts, getProductById, reserveProduct } = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

router.post('/', protect, authorize('ADMIN'), createProduct);
router.get('/', getProducts);
router.get('/:id', getProductById);
router.patch('/:id/reserve', protect, reserveProduct);

module.exports = router;
