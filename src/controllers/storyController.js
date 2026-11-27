const storyModel = require("../model/storyModel")
const postModel = require("../model/postModel")
const highlightModel = require("../model/highlightModel")
const imageModel = require("../model/imageModel")
const userModel = require("../model/userModel")
const { httpError, saveImage, deleteImage, isSame, notify, USER_FIELDS, shortUser } = require("../utils/helpers")

const storyOut = (story, meId) => ({
    _id: story._id,
    type: story.type,
    image: story.image,
    // for reposts: whose post is advertised (frontend shows "@username" link)
    post: story.post ? { _id: story.post._id, author: shortUser(story.post.author) } : null,
    viewed: story.viewers.some((id) => isSame(id, meId)),
    // only the owner sees how many people viewed
    viewersCount: isSame(story.author._id, meId) ? story.viewers.length : undefined,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
})

const highlightOut = (h) => ({ _id: h._id, name: h.name, storyIds: h.storyIds, createdAt: h.createdAt })

// Adds stories to an existing highlight, or creates a new one by name
const addToHighlight = async ({ ownerId, highlightId, name, storyIds }) => {
    if (highlightId) {
        const highlight = await highlightModel.findOneAndUpdate(
            { _id: highlightId, owner: ownerId },
            { $addToSet: { storyIds: { $each: storyIds } } },
            { returnDocument: "after" },
        )
        if (!highlight) throw httpError(404, "highlight topilmadi")
        return highlight
    }
    const clean = (name || "").trim()
    if (!clean) throw httpError(400, "highlight nomini yozing")
    if (clean.length > 24) throw httpError(400, "highlight nomi 24 belgidan oshmasin")
    return highlightModel.create({ owner: ownerId, name: clean, storyIds })
}

// POST /stories  (multipart/form-data: image file, optional highlightId OR highlightName)
const createStory = async (req, res) => {
    const { highlightId, highlightName } = req.body
    const image = await saveImage(req.file, req.userId)
    const story = await storyModel.create({ author: req.userId, type: "image", image })
    await story.populate("author", USER_FIELDS)

    let highlight = null
    if (highlightId || highlightName) {
        highlight = await addToHighlight({ ownerId: req.userId, highlightId, name: highlightName, storyIds: [story._id] })
    }

    res.status(201).json({
        message: "istoriya qo'yildi",
        story: storyOut(story, req.userId),
        highlight: highlight && highlightOut(highlight),
    })
}

// POST /stories/repost/:postId  - share someone's post to your story
const repostToStory = async (req, res) => {
    const post = await postModel.findById(req.params.postId).populate("author", USER_FIELDS)
    if (!post) throw httpError(404, "post topilmadi")

    const story = await storyModel.create({ author: req.userId, type: "repost", image: post.image, post: post._id })
    await story.populate([{ path: "author", select: USER_FIELDS }, { path: "post", populate: { path: "author", select: USER_FIELDS } }])
    await notify({ recipient: post.author._id, sender: req.userId, type: "repost", post: post._id })

    res.status(201).json({ message: "post istoriyaga qo'yildi", story: storyOut(story, req.userId) })
}

// GET /stories  - active stories grouped by user (story bar)
const getStoriesFeed = async (req, res) => {
    const stories = await storyModel
        .find({ expiresAt: { $gt: new Date() } })
        .sort({ createdAt: 1 })
        .populate("author", USER_FIELDS)
        .populate({ path: "post", populate: { path: "author", select: USER_FIELDS } })

    const groups = new Map()
    for (const story of stories) {
        const key = String(story.author._id)
        if (!groups.has(key)) groups.set(key, { user: shortUser(story.author), stories: [] })
        groups.get(key).stories.push(storyOut(story, req.userId))
    }

    const result = [...groups.values()].map((g) => ({ ...g, allViewed: g.stories.every((s) => s.viewed) }))
    // own stories first, then unseen, then seen
    result.sort((a, b) => {
        if (isSame(a.user._id, req.userId)) return -1
        if (isSame(b.user._id, req.userId)) return 1
        return Number(a.allViewed) - Number(b.allViewed)
    })

    res.json({ groups: result })
}

// GET /stories/user/:userId  - one user's active stories
const getUserStories = async (req, res) => {
    const stories = await storyModel
        .find({ author: req.params.userId, expiresAt: { $gt: new Date() } })
        .sort({ createdAt: 1 })
        .populate("author", USER_FIELDS)
        .populate({ path: "post", populate: { path: "author", select: USER_FIELDS } })
    res.json({ stories: stories.map((s) => storyOut(s, req.userId)) })
}

// POST /stories/:id/view  - mark as viewed
const viewStory = async (req, res) => {
    const story = await storyModel.findByIdAndUpdate(req.params.id, { $addToSet: { viewers: req.userId } })
    if (!story) throw httpError(404, "istoriya topilmadi")
    res.json({ viewed: true })
}

// GET /stories/:id/viewers  - only the owner
const getViewers = async (req, res) => {
    const story = await storyModel.findById(req.params.id).populate("viewers", USER_FIELDS)
    if (!story) throw httpError(404, "istoriya topilmadi")
    if (!isSame(story.author, req.userId)) throw httpError(403, "faqat o'z istoriyangizni ko'ra olasiz")
    res.json({ viewers: story.viewers.map(shortUser) })
}

// DELETE /stories/:id  - only the author
const deleteStory = async (req, res) => {
    const story = await storyModel.findById(req.params.id)
    if (!story) throw httpError(404, "istoriya topilmadi")
    if (!isSame(story.author, req.userId)) throw httpError(403, "faqat o'z istoriyangizni o'chira olasiz")

    // a repost uses the post's image, so only delete own uploaded images
    if (story.type === "image") await deleteImage(story.image)
    await story.deleteOne()
    await highlightModel.updateMany({ owner: req.userId }, { $pull: { storyIds: story._id } })
    res.json({ message: "istoriya o'chirildi" })
}

// GET /stories/archive  - all own stories, also the ones older than 24 hours
const getArchive = async (req, res) => {
    const stories = await storyModel
        .find({ author: req.userId })
        .sort({ createdAt: -1 })
        .populate("author", USER_FIELDS)
        .populate({ path: "post", populate: { path: "author", select: USER_FIELDS } })
    res.json({ stories: stories.map((s) => storyOut(s, req.userId)) })
}

// GET /stories/archive/:id/image  - owner, or anyone if the story is in a highlight
const getArchiveImage = async (req, res) => {
    const story = await storyModel.findById(req.params.id)
    if (!story) throw httpError(404, "istoriya topilmadi")

    const isOwner = isSame(story.author, req.userId)
    const inHighlight = !isOwner && await highlightModel.exists({ owner: story.author, storyIds: story._id })
    if (!isOwner && !inHighlight) throw httpError(403, "bu istoriya arxivda, faqat egasi ko'ra oladi")

    const imageId = story.image.split("/images/")[1]
    const image = imageId && await imageModel.findById(imageId)
    if (!image) throw httpError(404, "rasm topilmadi")
    res.set("Content-Type", image.contentType)
    res.set("Cache-Control", "private, max-age=86400")
    res.send(image.data)
}

// GET /stories/highlights?username=ali  - own highlights, or another user's
const getHighlights = async (req, res) => {
    let ownerId = req.userId
    if (req.query.username) {
        const user = await userModel.findOne({ username: String(req.query.username).toLowerCase() }).select("_id")
        if (!user) throw httpError(404, "user topilmadi")
        ownerId = user._id
    }
    const highlights = await highlightModel.find({ owner: ownerId }).sort({ createdAt: 1 })
    res.json({ highlights: highlights.map(highlightOut) })
}

// Only own stories can go into a highlight
const ownStoryIds = async (ownerId, storyIds) => {
    if (!Array.isArray(storyIds) || storyIds.length === 0) throw httpError(400, "kamida bitta istoriya tanlang")
    if (storyIds.length > 100) throw httpError(400, "bir martada 100 tadan ko'p emas")
    const found = await storyModel.find({ _id: { $in: storyIds }, author: ownerId }).select("_id")
    if (found.length !== new Set(storyIds.map(String)).size) throw httpError(400, "faqat o'z istoriyalaringizni qo'sha olasiz")
    return found.map((s) => s._id)
}

// POST /stories/highlights  { name, storyIds }
const createHighlight = async (req, res) => {
    const storyIds = await ownStoryIds(req.userId, req.body.storyIds)
    const highlight = await addToHighlight({ ownerId: req.userId, name: req.body.name, storyIds })
    res.status(201).json({ message: "highlight yaratildi", highlight: highlightOut(highlight) })
}

// POST /stories/highlights/:id/stories  { storyIds }
const addHighlightStories = async (req, res) => {
    const storyIds = await ownStoryIds(req.userId, req.body.storyIds)
    const highlight = await addToHighlight({ ownerId: req.userId, highlightId: req.params.id, storyIds })
    res.json({ message: "highlight yangilandi", highlight: highlightOut(highlight) })
}

// DELETE /stories/highlights/:id  - stories themselves stay in the archive
const deleteHighlight = async (req, res) => {
    const highlight = await highlightModel.findOneAndDelete({ _id: req.params.id, owner: req.userId })
    if (!highlight) throw httpError(404, "highlight topilmadi")
    res.json({ message: "highlight o'chirildi" })
}

module.exports = {
    createStory, repostToStory, getStoriesFeed, getUserStories, viewStory, getViewers, deleteStory,
    getArchive, getArchiveImage, getHighlights, createHighlight, addHighlightStories, deleteHighlight,
}
