const Product = require('../models/Product');
const mongoose = require('mongoose');

/* =========================
   CREATE PRODUCT
========================= */
const createProduct = async (req, res) => {
    try {
        const product = await Product.create(req.body);
        return res.status(201).json(product);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/* =========================
   GET ALL PRODUCTS
========================= */
const getProducts = async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        return res.json(products);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/* =========================
   GET PRODUCT BY ID (FIXED 🔥)
========================= */
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        // 🚨 VERY IMPORTANT FIX
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        return res.json(product);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/* =========================
   UPDATE PRODUCT
========================= */
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        const product = await Product.findByIdAndUpdate(
            id,
            req.body,
            { new: true, runValidators: true }
        );

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        return res.json(product);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/* =========================
   DELETE PRODUCT
========================= */
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        const product = await Product.findByIdAndDelete(id);

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        return res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/* =========================
   RESERVE PRODUCT
========================= */
const reserveProduct = async (req, res) => {
    try {
        return res.json({ message: 'Product reserved (mock)' });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/* =========================
   RELEASE PRODUCT
========================= */
const releaseProduct = async (req, res) => {
    try {
        return res.json({ message: 'Product released (mock)' });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = {
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    reserveProduct,
    releaseProduct
};