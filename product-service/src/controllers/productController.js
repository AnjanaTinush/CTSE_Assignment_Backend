const Product = require('../models/Product');
const axios = require('axios');

const createProduct = async (req, res) => {
    try {
        const { name, description, price, stock, category } = req.body;
        const product = await Product.create({
            name, description, price, stock, category, sellerId: req.user.id
        });
        res.status(201).json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getProducts = async (req, res) => {
    try {
        const products = await Product.find({});
        // Inter-service call to get seller info for each product
        const enrichedProducts = await Promise.all(products.map(async (product) => {
            try {
                const { data } = await axios.get(`${process.env.AUTH_SERVICE_URL}/users/${product.sellerId}/public`);
                return { ...product.toObject(), seller: data };
            } catch (err) {
                // Fallback if auth service is down or user not found
                return { ...product.toObject(), seller: { _id: product.sellerId, name: 'Unknown Seller' } };
            }
        }));
        res.json(enrichedProducts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const reserveProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        // Simple reservation logic
        if (product.stock > 0) {
            product.stock -= 1;
            await product.save();
            res.json({ message: 'Product reserved successfully', product });
        } else {
            res.status(400).json({ message: 'Product out of stock' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { createProduct, getProducts, getProductById, reserveProduct };
