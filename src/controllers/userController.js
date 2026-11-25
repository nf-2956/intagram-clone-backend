const userModel = require("../model/userModel")

const register = async (req, res) => {
    try {
        const { username, email, password, avatar } = req.body
        if (!username || !email || !password) {
            return res.status(400).json({ message: "hamma malumotlarni toldir" })
        }

        const userFindname = await userModel.find({ username })

        if (userFindname) {
            return res.status(400).json({ message: "bunday username ishlatilgan" })
        }

        const userFindemail = await userModel.find({ email })

        if (userFindemail) {
            return res.status(400).json({ message: "bunday email mavjud" })
        }

        const newUser = new userModel({
            username,
            email,
            password,
            avatar
        })

        await newUser.save()
        res.status(201).json({ message: "user yaratildi", user: newUser })
    } catch (e) {
        console.log(`server failed`);
    }
}

const login = async (req, res) => {
    try {
        const { email, password } = req.body
        if (!email || !password) {
            return res.status(400).json({message : "hamma maydonlarni toldir"})
        }

        const findUser = await userModel.findOne({email})

        if (!findUser || findUser.password != password) {
            return res.status(404).json({message : "bunday account yoq"})
        }

        res.status(200).json({message: "bunday user topildi" , user : findUser})
    } catch (e) {
        console.log('server failed' , e.message);
    }
}

const getAllusers = async (req , res) => {
    const users = await userModel.find()
    res.status(200).json({message :" hamma userlar" , users : users})
}

module.exports = {register , login , getAllusers}