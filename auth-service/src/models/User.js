const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const normalizeContactNumber = (value) => {
    if (!value) {
        return value;
    }

    return String(value).replaceAll(/[\s-]/g, '');
};

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    contactNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        set: normalizeContactNumber
    },
    password: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'USER', 'DELIVERY'], default: 'USER' },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    loyaltyCardNumber: { type: String, unique: true, sparse: true },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

userSchema.statics.normalizeContactNumber = normalizeContactNumber;

userSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
