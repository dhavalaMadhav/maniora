const mongoose = require('mongoose');
const jwt = require("jsonwebtoken");
const bcrypt= require("bcryptjs");
// Your existing user schema
const registerSchema = new mongoose.Schema({
    name: { type: String },
    email: { type: String },
    password: { type: String },
    confirmPassword: { type: String },
        tokens: [
        {
            token: { type: String, required: true }
        }
    ]
});
registerSchema.methods.generateAuthToken = async function() {
    const token = jwt.sign({ _id: this._id.toString()}, process.env.SECRET_KEY);
    this.tokens = this.tokens.concat({ token: token }); 
    await this.save();
    console.log(`token generated: ${token}`);
    return token;
}
registerSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
        this.confirmPassword = await bcrypt.hash(this.password, 10);;
    }
    next();
});
// Add this new preset schema
const presetSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    previewImages: [String],
    presetFile: { type: String, required: true },
    compatibility: { type: String, required: true },
    tags: [String],
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'regs' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date }
});

const regs = mongoose.model('regs', registerSchema);
const Preset = mongoose.model('Preset', presetSchema);

module.exports = { regs, Preset };