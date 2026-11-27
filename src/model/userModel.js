const mongoose = require("mongoose")

const userModel = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        select: false // never returned unless asked with .select("+password")
    },
    fullName: { type: String, default: "" },
    bio: { type: String, default: "", maxlength: 150 },
    avatar: { type: String, default: "" },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "InstaUser" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "InstaUser" }],
    // short profile note, visible for 24 hours
    note: {
        text: { type: String, default: "", maxlength: 60 },
        expiresAt: { type: Date, default: null },
    },
}, { timestamps: true })

module.exports = mongoose.model("InstaUser", userModel)
