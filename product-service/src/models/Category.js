const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 2,
            maxlength: 100,
        },
        description: {
            type: String,
            trim: true,
            maxlength: 500,
            default: '',
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
