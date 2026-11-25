const imageModel = require("../model/imageModel")

// GET /images/:id  - public, so it works in <img src="...">
const getImage = async (req, res) => {
    const image = await imageModel.findById(req.params.id)
    if (!image) return res.status(404).json({ message: "rasm topilmadi" })

    res.set("Content-Type", image.contentType)
    res.set("Cache-Control", "public, max-age=31536000, immutable")
    res.send(image.data)
}

module.exports = { getImage }
