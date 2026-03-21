const Category = require('../models/Category');
const Joi = require('joi');

const createCategorySchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    description: Joi.string().trim().max(500).allow('').optional(),
});

const updateCategorySchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    description: Joi.string().trim().max(500).allow('').optional(),
}).min(1);

const getCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort({ name: 1 });
        return res.json(categories);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const createCategory = async (req, res) => {
    try {
        const { error, value } = createCategorySchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const existing = await Category.findOne({ name: new RegExp(`^${value.name}$`, 'i') });
        if (existing) {
            return res.status(409).json({ message: 'Category already exists' });
        }

        const category = await Category.create(value);
        return res.status(201).json(category);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const updateCategory = async (req, res) => {
    try {
        const { error, value } = updateCategorySchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const category = await Category.findByIdAndUpdate(req.params.id, value, {
            new: true,
            runValidators: true,
        });

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        return res.json(category);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const category = await Category.findByIdAndDelete(req.params.id);
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        return res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
