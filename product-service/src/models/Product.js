const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, default: 0, min: 0 },
    sellerId: { type: String, required: true },
    category: { type: String, required: true, trim: true },
    status: { type: String, enum: ['IN-STORE', 'OUT-STORE'], default: 'IN-STORE' },
    imageUrl: { type: String }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

productSchema.virtual('availabilityStatus').get(function () {
    return this.stock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK';
});

productSchema.index({ name: 1 });
productSchema.index({ category: 1 });

module.exports = mongoose.model('Product', productSchema);
