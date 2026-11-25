const mongoose = require("mongoose")
const dns = require("dns")

// ISP DNS (nano.uz) Node.js dan SRV so'rovlarini bloklayapti — Google DNS ga o'tamiz
dns.setServers(["8.8.8.8", "8.8.4.4"])

const ConnectDb = async () => {
    try{
       await mongoose.connect("mongodb+srv://javlonaxrorov2010_db_user:ET0YDuybJSHZrOGx@cluster0.nqkfdma.mongodb.net/") 
       console.log('MongoDB ishladi');
    } catch (e){
        console.log(e.message);
        process.exit(1);
    }
}

module.exports = ConnectDb

