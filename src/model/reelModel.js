const mongoose = require("mongoose")

// Short video. The file itself lives in GridFS (bucket "reels"), served by GET /reels/:id/video
const reelModel = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: "InstaUser", required: true, index: true },
    video: { type: mongoose.Schema.Types.ObjectId, required: true }, // GridFS file id
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    caption: { type: String, default: "", trim: true, maxlength: 2200 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "InstaUser" }],
    saves: [{ type: mongoose.Schema.Types.ObjectId, ref: "InstaUser" }],
    reposts: [{ type: mongoose.Schema.Types.ObjectId, ref: "InstaUser" }],
    commentsCount: { type: Number, default: 0 },
}, { timestamps: true })

module.exports = mongoose.model("InstaReel", reelModel)
