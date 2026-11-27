const mongoose = require("mongoose")

const reelCommentModel = new mongoose.Schema({
    reel: { type: mongoose.Schema.Types.ObjectId, ref: "InstaReel", required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "InstaUser", required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
}, { timestamps: true })

module.exports = mongoose.model("InstaReelComment", reelCommentModel)
