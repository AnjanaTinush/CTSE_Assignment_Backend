const Product = require('../models/Product');
const axios = require('axios');
const Joi = require('joi');

const authServiceClient = axios.create({ timeout: 5000 });

const createProductSchema = Joi.object({
    name: Joi.string().trim().min(2).max(150).required(),
    description: Joi.string().trim().min(5).max(2000).required(),
    price: Joi.number().min(0).required(),
    stock: Joi.number().integer().min(0).required(),
    category: Joi.string().trim().min(2).max(100).required(),
    imageUrl: Joi.string().uri().optional()
});

const updateProductSchema = Joi.object({
    name: Joi.string().trim().min(2).max(150).optional(),
    description: Joi.string().trim().min(5).max(2000).optional(),
    price: Joi.number().min(0).optional(),
    stock: Joi.number().integer().min(0).optional(),
    category: Joi.string().trim().min(2).max(100).optional(),
    imageUrl: Joi.string().uri().allow('', null).optional()
}).min(1);

const filterSchema = Joi.object({
    search: Joi.string().trim().optional(),
    category: Joi.string().trim().optional(),
    inStock: Joi.string().valid('true', 'false').optional()
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
        const { error, value } = filterSchema.validate(req.query || {});
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const query = {};
        if (value.category) {
            query.category = value.category;
        }

        if (value.inStock === 'true') {
            query.stock = { $gt: 0 };
        }

        if (value.inStock === 'false') {
            query.stock = { $lte: 0 };
        }

        if (value.search) {
            query.name = { $regex: value.search, $options: 'i' };
        }

        const products = await Product.find(query).sort({ createdAt: -1 });
        const enrichedProducts = await Promise.all(products.map(async (product) => {
            try {
                const { data } = await authServiceClient.get(`${process.env.AUTH_SERVICE_URL}/users/${product.sellerId}/public`);
                return { ...product.toObject(), seller: data };
            } catch (err) {
                console.warn(`Failed to enrich seller profile for product ${product._id}:`, err.message);
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

const updateProduct = async (req, res) => {
    try {
        const { error, value } = updateProductSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const payload = { ...value };
        if (payload.imageUrl === '' || payload.imageUrl === null) {
            payload.imageUrl = undefined;
        }

        const product = await Product.findByIdAndUpdate(req.params.id, payload, {
            new: true,
            runValidators: true
        });

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        return res.json(product);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        await Product.deleteOne({ _id: req.params.id });
        return res.json({ message: 'Product deleted successfully' });
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

module.exports = {
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    reserveProduct,
    releaseProduct
};
