require("dotenv").config();
const express = require("express")
const cors = require("cors")
const ConnectDb = require("./config/db")
const PORT = 8000
const app = express()

app.use(express.json())
app.use(cors("*"))

ConnectDb()

const userRouter = require("./router/userRouter")

app.use("/user" , userRouter)

app.listen(PORT , ()=>{
    console.log(`http://localhost:${PORT}`);
})
