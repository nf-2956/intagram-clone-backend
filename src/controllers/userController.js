const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const userModel = require("../model/userModel")
const postModel = require("../model/postModel")
const { httpError, saveImage, deleteImage, isSame, notify, USER_FIELDS, postOut } = require("../utils/helpers")

const createToken = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" })

// Never send the password back to the client
const publicUser = (user) => {
    const { password, ...rest } = user.toObject()
    return rest
}

// POST /user/register  { username, email, password }
const register = async (req, res) => {
    const { username, email, password } = req.body
    if (!username || !email || !password) {
        return res.status(400).json({ message: "hamma malumotlarni toldir" })
    }
    if (password.length < 6) {
        return res.status(400).json({ message: "parol kamida 6 ta belgi bo'lsin" })
    }

    if (await userModel.findOne({ username: username.toLowerCase() })) {
        return res.status(400).json({ message: "bunday username ishlatilgan" })
    }
    if (await userModel.findOne({ email: email.toLowerCase() })) {
        return res.status(400).json({ message: "bunday email mavjud" })
    }

    const newUser = await userModel.create({
        username,
        email,
        password: await bcrypt.hash(password, 10),
    })

    res.status(201).json({ message: "user yaratildi", user: publicUser(newUser), token: createToken(newUser) })
}

// POST /user/login  { email, password }
const login = async (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
        return res.status(400).json({ message: "hamma maydonlarni toldir" })
    }

    const user = await userModel.findOne({ email: email.toLowerCase() }).select("+password")
    if (!user) {
        return res.status(404).json({ message: "bunday account yoq" })
    }

    // Old accounts were saved with a plain password: accept once and hash it
    const isHashed = user.password.startsWith("$2")
    const ok = isHashed ? await bcrypt.compare(password, user.password) : user.password === password
    if (!ok) {
        return res.status(404).json({ message: "bunday account yoq" })
    }
    if (!isHashed) {
        user.password = await bcrypt.hash(password, 10)
        await user.save()
    }

    res.status(200).json({ message: "bunday user topildi", user: publicUser(user), token: createToken(user) })
}

// GET /user/users
const getAllusers = async (req, res) => {
    const users = await userModel.find().select(USER_FIELDS)
    res.status(200).json({ message: "hamma userlar", users })
}

// GET /user/me
const getMe = async (req, res) => {
    const user = await userModel.findById(req.userId)
    if (!user) throw httpError(404, "user topilmadi")
    res.json({ user: publicUser(user) })
}

// PATCH /user/me  (multipart/form-data: fullName, bio, avatar file - all optional)
const updateMe = async (req, res) => {
    const user = await userModel.findById(req.userId)
    if (!user) throw httpError(404, "user topilmadi")

    const { fullName, bio } = req.body
    if (fullName !== undefined) user.fullName = fullName
    if (bio !== undefined) user.bio = bio
    if (req.file) {
        const old = user.avatar
        user.avatar = await saveImage(req.file, user._id)
        await deleteImage(old)
    }

    await user.save()
    res.json({ message: "profil yangilandi", user: publicUser(user) })
}

// PATCH /user/me/note  { text }  - empty text removes the note
const updateNote = async (req, res) => {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : ""
    if (text.length > 60) throw httpError(400, "zametka 60 belgidan oshmasin")

    const user = await userModel.findById(req.userId)
    if (!user) throw httpError(404, "user topilmadi")
    user.note = text
        ? { text, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
        : { text: "", expiresAt: null }
    await user.save()
    res.json({ message: text ? "zametka qo'yildi" : "zametka olib tashlandi", user: publicUser(user) })
}

// Note is shown only while it has not expired
const activeNote = (user) =>
    user.note?.text && user.note.expiresAt > new Date()
        ? { text: user.note.text, expiresAt: user.note.expiresAt }
        : null

// GET /user/search?q=ali
const searchUsers = async (req, res) => {
    const q = (req.query.q || "").trim()
    if (!q) return res.json({ users: [] })

    // Escape special regex characters so "a.b" is searched literally
    const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    const users = await userModel
        .find({ _id: { $ne: req.userId }, $or: [{ username: pattern }, { fullName: pattern }] })
        .select(`${USER_FIELDS} followers`)
        .limit(20)

    res.json({
        users: users.map((u) => ({
            _id: u._id,
            username: u.username,
            fullName: u.fullName,
            avatar: u.avatar,
            followersCount: u.followers.length,
            isFollowing: u.followers.some((id) => isSame(id, req.userId)),
        })),
    })
}

// GET /user/:username  - profile page header
const getProfile = async (req, res) => {
    const user = await userModel.findOne({ username: req.params.username.toLowerCase() })
    if (!user) throw httpError(404, "user topilmadi")

    const postsCount = await postModel.countDocuments({ author: user._id })
    res.json({
        user: {
            _id: user._id,
            username: user.username,
            fullName: user.fullName,
            bio: user.bio,
            avatar: user.avatar,
            postsCount,
            followersCount: user.followers.length,
            followingCount: user.following.length,
            isFollowing: user.followers.some((id) => isSame(id, req.userId)),
            isMe: isSame(user._id, req.userId),
            note: activeNote(user),
        },
    })
}

// GET /user/:username/posts  - profile grid
const getUserPosts = async (req, res) => {
    const user = await userModel.findOne({ username: req.params.username.toLowerCase() })
    if (!user) throw httpError(404, "user topilmadi")

    const posts = await postModel.find({ author: user._id }).sort({ createdAt: -1 }).populate("author", USER_FIELDS)
    res.json({ posts: posts.map((p) => postOut(p, req.userId)) })
}

// GET /user/:username/followers  and  /user/:username/following
const getFollowList = (field) => async (req, res) => {
    const user = await userModel
        .findOne({ username: req.params.username.toLowerCase() })
        .populate(field, USER_FIELDS)
    if (!user) throw httpError(404, "user topilmadi")
    res.json({ users: user[field] })
}

// POST /user/:id/follow  - follow / unfollow (toggle)
const toggleFollow = async (req, res) => {
    const targetId = req.params.id
    if (isSame(targetId, req.userId)) throw httpError(400, "o'zingizni kuzata olmaysiz")

    const target = await userModel.findById(targetId)
    if (!target) throw httpError(404, "user topilmadi")

    const isFollowing = target.followers.some((id) => isSame(id, req.userId))
    const op = isFollowing ? "$pull" : "$addToSet"
    await userModel.updateOne({ _id: targetId }, { [op]: { followers: req.userId } })
    await userModel.updateOne({ _id: req.userId }, { [op]: { following: targetId } })

    if (!isFollowing) await notify({ recipient: targetId, sender: req.userId, type: "follow" })

    res.json({
        isFollowing: !isFollowing,
        followersCount: target.followers.length + (isFollowing ? -1 : 1),
    })
}

module.exports = {
    register, login, getAllusers, getMe, updateMe, updateNote, searchUsers,
    getProfile, getUserPosts, getFollowList, toggleFollow,
}
