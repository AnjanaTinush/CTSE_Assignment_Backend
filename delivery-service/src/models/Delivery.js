const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
    address: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
}, { _id: false });

const deliverySchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    deliveryUserId: { type: String, required: true },
    deliveryUserName: { type: String },
    assignedByAdminId: { type: String },
    customerId: { type: String },
    customerContactNumber: { type: String },
    status: {
        type: String,
        enum: ['ASSIGNED', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED_BY_DELIVERY'],
        default: 'ASSIGNED'
    },
    deliveryLocation: { type: locationSchema, required: true },
    notes: { type: String },
    assignedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    cancelledAt: { type: Date }
}, {
    timestamps: true
});

deliverySchema.index({ deliveryUserId: 1, assignedAt: -1 });
deliverySchema.index({ status: 1, assignedAt: -1 });

module.exports = mongoose.model('Delivery', deliverySchema);
