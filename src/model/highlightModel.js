const mongoose = require("mongoose")

// "Highlights" on the profile: a named group of the owner's stories (kept after 24 hours)
const highlightModel = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "InstaUser", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 24 },
    storyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "InstaStory" }],
}, { timestamps: true })

module.exports = mongoose.model("InstaHighlight", highlightModel)
