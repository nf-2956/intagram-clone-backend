const mongoose = require("mongoose")

const DAY = 24 * 60 * 60 * 1000

const storyModel = new mongoose.Schema({
    author: { type: mongoose.Schema.Types.ObjectId, ref: "InstaUser", required: true },
    // "image" - own photo, "repost" - someone else's post shared to story
    type: { type: String, enum: ["image", "repost"], required: true },
    image: { type: String, required: true }, // "/images/<id>" (for repost: the post's image)
    post: { type: mongoose.Schema.Types.ObjectId, ref: "InstaPost", default: null },
    viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: "InstaUser" }],
    // MongoDB removes the document automatically after this time (TTL index)
    expiresAt: { type: Date, default: () => new Date(Date.now() + DAY), index: { expires: 0 } },
}, { timestamps: true })

module.exports = mongoose.model("InstaStory", storyModel)
