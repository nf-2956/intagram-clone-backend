const express = require("express")
const router = express.Router()
const auth = require("../middleware/auth")
const videoUpload = require("../middleware/videoUpload")
const c = require("../controllers/reelController")

// public, so it works in <video src="...">
router.get("/:id/video", c.streamVideo)

router.use(auth)

router.get("/", c.getReels)
router.post("/", videoUpload.single("video"), c.createReel)
router.get("/user/:username", c.getUserReels)
router.get("/:id", c.getReel)
router.delete("/:id", c.deleteReel)
router.post("/:id/like", c.toggleLike)
router.post("/:id/save", c.toggleSave)
router.post("/:id/repost", c.toggleRepost)
router.get("/:id/comments", c.getComments)
router.post("/:id/comments", c.addComment)
router.delete("/:id/comments/:commentId", c.deleteComment)

module.exports = router
