const mongoose = require('mongoose');
mongoose.connect("mongodb+srv://madhavdhavala0:madhav1234@cluster0.65omcke.mongodb.net/myProject", {}
).then(() => {
    console.log("Connection Successful");
}).catch((err) => {     
    console.log(err);
});