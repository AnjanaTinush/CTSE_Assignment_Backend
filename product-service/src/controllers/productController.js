const Product = require('../models/Product');
const axios = require('axios');
const Joi = require('joi');

const authServiceClient = axios.create({ timeout: 5000 });

const createProductSchema = Joi.object({
    name: Joi.string().trim().min(2).max(150).required(),
    description: Joi.string().trim().min(5).max(2000).required(),
    price: Joi.number().min(0).required(),
    stock: Joi.number().integer().min(0).required(),
    category: Joi.string().trim().min(2).max(100).required()
});

const quantitySchema = Joi.object({
    quantity: Joi.number().integer().min(1).default(1)
});

const createProduct = async (req, res) => {
    try {
        const { error, value } = createProductSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const product = await Product.create({
            ...value,
            sellerId: req.user.id
        });

        return res.status(201).json(product);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getProducts = async (req, res) => {
    try {
        const products = await Product.find({});
        const enrichedProducts = await Promise.all(products.map(async (product) => {
            try {
                const { data } = await authServiceClient.get(`${process.env.AUTH_SERVICE_URL}/users/${product.sellerId}/public`);
                return { ...product.toObject(), seller: data };
            } catch (err) {
                return { ...product.toObject(), seller: { _id: product.sellerId, name: 'Unknown Seller' } };
            }
        }));

        return res.json(enrichedProducts);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        return res.json(product);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const reserveProduct = async (req, res) => {
    try {
        const { error, value } = quantitySchema.validate(req.body || {});
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const { quantity } = value;

        const updatedProduct = await Product.findOneAndUpdate(
            { _id: req.params.id, stock: { $gte: quantity } },
            { $inc: { stock: -quantity } },
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(400).json({ message: 'Insufficient stock or invalid product' });
        }

        return res.json({
            message: 'Product reserved successfully',
            reservedQuantity: quantity,
            product: updatedProduct
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const releaseProduct = async (req, res) => {
    try {
        const { error, value } = quantitySchema.validate(req.body || {});
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const { quantity } = value;
        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            { $inc: { stock: quantity } },
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({ message: 'Product not found' });
        }

        return res.json({
            message: 'Product stock released successfully',
            releasedQuantity: quantity,
            product: updatedProduct
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = { createProduct, getProducts, getProductById, reserveProduct, releaseProduct };
