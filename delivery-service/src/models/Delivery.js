const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema({
    orderId: { type: String, required: true },
    driverId: { type: String, required: true },
    status: { type: String, enum: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'], default: 'ASSIGNED' },
    address: { type: String, required: true },
    estimatedDelivery: { type: Date }
}, {
    timestamps: true
});

module.exports = mongoose.model('Delivery', deliverySchema);
