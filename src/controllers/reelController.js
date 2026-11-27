const mongoose = require("mongoose")
const reelModel = require("../model/reelModel")
const reelCommentModel = require("../model/reelCommentModel")
const userModel = require("../model/userModel")
const { httpError, isSame, shortUser } = require("../utils/helpers")

const AUTHOR_FIELDS = "username fullName avatar followers"

// Videos are stored in GridFS: collections "reels.files" and "reels.chunks"
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "reels" })

// Shape of a reel in every API response
const reelOut = (reel, meId) => ({
    _id: reel._id,
    videoUrl: `/reels/${reel._id}/video`,
    caption: reel.caption,
    author: shortUser(reel.author),
    // follow button next to the author's name
    isFollowingAuthor: Boolean(reel.author?.followers?.some((id) => isSame(id, meId))),
    isMine: isSame(reel.author?._id, meId),
    likesCount: reel.likes.length,
    isLiked: reel.likes.some((id) => isSame(id, meId)),
    savesCount: reel.saves.length,
    isSaved: reel.saves.some((id) => isSame(id, meId)),
    repostsCount: reel.reposts.length,
    isReposted: reel.reposts.some((id) => isSame(id, meId)),
    commentsCount: reel.commentsCount,
    createdAt: reel.createdAt,
})

// POST /reels  (multipart/form-data: video file, caption)
const createReel = async (req, res) => {
    if (!req.file) throw httpError(400, "video tanlanmagan (field nomi: video)")
    const caption = (req.body.caption || "").trim()
    if (caption.length > 2200) throw httpError(400, "izoh 2200 belgidan oshmasin")

    const upload = bucket().openUploadStream(req.file.originalname || "reel", {
        metadata: { owner: req.userId, contentType: req.file.mimetype },
    })
    await new Promise((resolve, reject) => {
        upload.once("finish", resolve)
        upload.once("error", reject)
        upload.end(req.file.buffer)
    })

    const reel = await reelModel.create({
        author: req.userId,
        video: upload.id,
        contentType: req.file.mimetype,
        size: req.file.size,
        caption,
    })
    await reel.populate("author", AUTHOR_FIELDS)
    res.status(201).json({ message: "reel joylandi", reel: reelOut(reel, req.userId) })
}

// GET /reels?page=1&limit=10  - newest first
const getReels = async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10))

    const [reels, total] = await Promise.all([
        reelModel.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("author", AUTHOR_FIELDS),
        reelModel.countDocuments(),
    ])
    res.json({ reels: reels.map((r) => reelOut(r, req.userId)), page, hasMore: page * limit < total })
}

// GET /reels/user/:username?type=own|saved|reposts  - profile tabs
const getUserReels = async (req, res) => {
    const user = await userModel.findOne({ username: req.params.username.toLowerCase() }).select("_id")
    if (!user) throw httpError(404, "user topilmadi")

    const type = req.query.type || "own"
    const filters = { own: { author: user._id }, saved: { saves: user._id }, reposts: { reposts: user._id } }
    if (!filters[type]) throw httpError(400, "type: own, saved yoki reposts")
    // saved reels are private
    if (type === "saved" && !isSame(user._id, req.userId)) throw httpError(403, "saqlanganlarni faqat egasi ko'radi")

    const reels = await reelModel.find(filters[type]).sort({ createdAt: -1 }).populate("author", AUTHOR_FIELDS)
    res.json({ reels: reels.map((r) => reelOut(r, req.userId)) })
}

// GET /reels/:id
const getReel = async (req, res) => {
    const reel = await reelModel.findById(req.params.id).populate("author", AUTHOR_FIELDS)
    if (!reel) throw httpError(404, "reel topilmadi")
    res.json({ reel: reelOut(reel, req.userId) })
}

// GET /reels/:id/video  - public (works in <video src>), supports Range for seeking
const streamVideo = async (req, res) => {
    const reel = await reelModel.findById(req.params.id).select("video contentType size")
    if (!reel) throw httpError(404, "reel topilmadi")

    const size = reel.size
    res.set("Content-Type", reel.contentType)
    res.set("Accept-Ranges", "bytes")
    res.set("Cache-Control", "public, max-age=31536000, immutable")

    let start = 0
    let end = size - 1
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "")
    if (range) {
        if (range[1]) {
            start = Number(range[1])
            if (range[2]) end = Math.min(Number(range[2]), size - 1)
        } else if (range[2]) {
            start = Math.max(0, size - Number(range[2])) // "bytes=-500" = last 500 bytes
        }
        if (start > end || start >= size) {
            res.set("Content-Range", `bytes */${size}`)
            return res.status(416).end()
        }
        res.status(206)
        res.set("Content-Range", `bytes ${start}-${end}/${size}`)
    }
    res.set("Content-Length", String(end - start + 1))

    const stream = bucket().openDownloadStream(reel.video, { start, end: end + 1 })
    stream.on("error", () => res.destroy())
    stream.pipe(res)
}

// Toggles the user in likes / saves / reposts
const toggle = (field, keys) => async (req, res) => {
    const reel = await reelModel.findById(req.params.id).select(field)
    if (!reel) throw httpError(404, "reel topilmadi")

    const active = reel[field].some((id) => isSame(id, req.userId))
    await reelModel.updateOne({ _id: reel._id }, { [active ? "$pull" : "$addToSet"]: { [field]: req.userId } })
    const count = reel[field].length + (active ? -1 : 1)
    res.json({ [keys.flag]: !active, [keys.count]: count, message: active ? keys.off : keys.on })
}

// POST /reels/:id/like | /save | /repost
const toggleLike = toggle("likes", { flag: "isLiked", count: "likesCount", on: "yoqdi", off: "like olib tashlandi" })
const toggleSave = toggle("saves", { flag: "isSaved", count: "savesCount", on: "saqlandi", off: "saqlanganlardan olindi" })
const toggleRepost = toggle("reposts", {
    flag: "isReposted", count: "repostsCount", on: "profilingizga repost qilindi", off: "repost olib tashlandi",
})

const commentOut = (c) => ({ _id: c._id, text: c.text, author: shortUser(c.author), createdAt: c.createdAt })

// GET /reels/:id/comments
const getComments = async (req, res) => {
    const comments = await reelCommentModel
        .find({ reel: req.params.id })
        .sort({ createdAt: -1 })
        .populate("author", "username fullName avatar")
    res.json({ comments: comments.map(commentOut) })
}

// POST /reels/:id/comments  { text }
const addComment = async (req, res) => {
    const text = (req.body.text || "").trim()
    if (!text) throw httpError(400, "izoh bo'sh bo'lmasin")
    if (text.length > 1000) throw httpError(400, "izoh 1000 belgidan oshmasin")

    const reel = await reelModel.findByIdAndUpdate(req.params.id, { $inc: { commentsCount: 1 } }, { returnDocument: "after" })
    if (!reel) throw httpError(404, "reel topilmadi")

    const comment = await reelCommentModel.create({ reel: reel._id, author: req.userId, text })
    await comment.populate("author", "username fullName avatar")
    res.status(201).json({ comment: commentOut(comment), commentsCount: reel.commentsCount })
}

// DELETE /reels/:id/comments/:commentId  - comment author or reel author
const deleteComment = async (req, res) => {
    const comment = await reelCommentModel.findOne({ _id: req.params.commentId, reel: req.params.id })
    if (!comment) throw httpError(404, "izoh topilmadi")
    const reel = await reelModel.findById(req.params.id).select("author")
    if (!isSame(comment.author, req.userId) && !isSame(reel?.author, req.userId)) {
        throw httpError(403, "bu izohni o'chira olmaysiz")
    }
    await comment.deleteOne()
    const updated = await reelModel.findByIdAndUpdate(req.params.id, { $inc: { commentsCount: -1 } }, { returnDocument: "after" })
    res.json({ message: "izoh o'chirildi", commentsCount: updated?.commentsCount ?? 0 })
}

// DELETE /reels/:id  - only the author; removes the video file and comments
const deleteReel = async (req, res) => {
    const reel = await reelModel.findById(req.params.id)
    if (!reel) throw httpError(404, "reel topilmadi")
    if (!isSame(reel.author, req.userId)) throw httpError(403, "faqat o'z reelingizni o'chira olasiz")

    await bucket().delete(reel.video).catch(() => {})
    await reelCommentModel.deleteMany({ reel: reel._id })
    await reel.deleteOne()
    res.json({ message: "reel o'chirildi" })
}

module.exports = {
    createReel, getReels, getUserReels, getReel, streamVideo,
    toggleLike, toggleSave, toggleRepost, getComments, addComment, deleteComment, deleteReel,
}
