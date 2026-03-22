const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    productId: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }
}, { _id: false });

const deliveryLocationSchema = new mongoose.Schema({
    address: { type: String, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
}, { _id: false });

const deliveryAssignmentSchema = new mongoose.Schema({
    deliveryUserId: { type: String },
    deliveryUserName: { type: String },
    deliveryId: { type: String },
    assignedAt: { type: Date }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    userContactNumber: { type: String, required: true },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    loyaltyPointsUsed: { type: Number, default: 0, min: 0 },
    loyaltyDiscount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true },
    pointsAwarded: { type: Number, default: 1, min: 0 },
    paymentMethod: { type: String, enum: ['CASH_ON_DELIVERY'], default: 'CASH_ON_DELIVERY' },
    status: {
        type: String,
        enum: [
            'PENDING',
            'ASSIGNED',
            'OUT_FOR_DELIVERY',
            'COMPLETED',
            'CANCELLED_BY_USER',
            'CANCELLED_BY_ADMIN',
            'CANCELLED_BY_DELIVERY'
        ],
        default: 'PENDING'
    },
    deliveryAssignment: { type: deliveryAssignmentSchema, default: () => ({}) },
    deliveryLocation: { type: deliveryLocationSchema, required: true },
    cancellationReason: { type: String },
    cancelledAt: { type: Date },
    completedAt: { type: Date }
}, {
    timestamps: true
});

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
