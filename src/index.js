require("dotenv").config();
const express = require("express")
const cors = require("cors")
const ConnectDb = require("./config/db")
const errorHandler = require("./middleware/errorHandler")
const PORT = process.env.PORT || 8000
const app = express()

if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
    console.log(".env da MONGO_URI va JWT_SECRET bo'lishi shart (.env.example ga qarang)");
    process.exit(1);
}

app.use(express.json())
app.use(cors())

ConnectDb()

app.use("/user", require("./router/userRouter"))
app.use("/posts", require("./router/postRouter"))
app.use("/stories", require("./router/storyRouter"))
app.use("/notifications", require("./router/notificationRouter"))
app.use("/images", require("./router/imageRouter"))

app.use((req, res) => res.status(404).json({ message: "bunday yo'l yo'q" }))
app.use(errorHandler)

app.listen(PORT , ()=>{
    console.log(`http://localhost:${PORT}`);
})
