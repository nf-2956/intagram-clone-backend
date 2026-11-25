const storyModel = require("../model/storyModel")
const postModel = require("../model/postModel")
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

// POST /stories  (multipart/form-data: image file)
const createStory = async (req, res) => {
    const image = await saveImage(req.file, req.userId)
    const story = await storyModel.create({ author: req.userId, type: "image", image })
    await story.populate("author", USER_FIELDS)
    res.status(201).json({ message: "istoriya qo'yildi", story: storyOut(story, req.userId) })
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
    res.json({ message: "istoriya o'chirildi" })
}

module.exports = { createStory, repostToStory, getStoriesFeed, getUserStories, viewStory, getViewers, deleteStory }
