const multer = require("multer")

const MAX_SIZE = 15 * 1024 * 1024 // 15 MB - free Atlas has 512 MB in total
const TYPES = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" }

const videoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SIZE },
    fileFilter: (req, file, cb) => {
        // some clients send "application/octet-stream" - then trust the extension
        const ext = (file.originalname || "").split(".").pop().toLowerCase()
        if (file.mimetype === "application/octet-stream" && TYPES[ext]) file.mimetype = TYPES[ext]
        if (!Object.values(TYPES).includes(file.mimetype)) {
            const err = new Error("faqat video yuklash mumkin (mp4, webm, mov)")
            err.status = 400
            return cb(err)
        }
        cb(null, true)
    },
})

module.exports = videoUpload
