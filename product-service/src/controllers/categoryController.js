const Category = require('../models/Category');
const mongoose = require('mongoose');

const getCategories = async (req, res) => {
    console.log('[CategoryController] getCategories hit');
    try {
        const categories = await Category.find().sort({ name: 1 });
        res.json(categories);
    } catch (error) {
        console.error('[CategoryController] Error:', error.message);
        res.status(500).json({ message: error.message });
    }
};

const createCategory = async (req, res) => {
    try {
        const category = await Category.create(req.body);
        res.status(201).json(category);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid category ID' });
        }

        const category = await Category.findByIdAndUpdate(id, req.body, { new: true });

        res.json(category);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid category ID' });
        }

        await Category.findByIdAndDelete(id);

        res.json({ message: 'Category deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};