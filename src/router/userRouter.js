const express = require("express")
const router = express.Router()

const { login, register , getAllusers } = require("../controllers/userController")

router.post("/login" , login)
router.post("/register" , register)
router.get("/users" , getAllusers)

module.exports = router