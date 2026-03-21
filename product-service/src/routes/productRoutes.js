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



const {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
} = require('../controllers/categoryController');

const { protect, authorize } = require('../middlewares/auth');


const router = express.Router();

router.use((req, res, next) => {
    console.log(`[ProductRouter] Incoming: ${req.method} ${req.url}`);
    next();
});




/* =========================
   CATEGORY ROUTES FIRST ✅
========================= */
router.get('/categories', getCategories);
router.post('/categories', protect, authorize('ADMIN'), createCategory);
router.patch('/categories/:id', protect, authorize('ADMIN'), updateCategory);
router.delete('/categories/:id', protect, authorize('ADMIN'), deleteCategory);

/* =========================
   PRODUCT ROUTES
========================= */
router.post('/', protect, authorize('ADMIN'), createProduct);
router.get('/', getProducts);


/* 🚨 KEEP ID ROUTES LAST */
router.get('/:id', getProductById);
router.patch('/:id', protect, authorize('ADMIN'), updateProduct);
router.delete('/:id', protect, authorize('ADMIN'), deleteProduct);
router.patch('/:id/reserve', protect, authorize('USER', 'ADMIN', 'DELIVERY'), reserveProduct);
router.patch('/:id/release', protect, authorize('USER', 'ADMIN', 'DELIVERY'), releaseProduct);

module.exports = router;