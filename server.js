require("dotenv").config();
const cookie = require('cookie');
const cookieParser = require('cookie-parser');
const express = require("express");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const app = express();
const http = require("http").Server(app);
// async  function wattah(){
//         const hash =  await bcrypt.hash("admin", 10);
//         console.log(hash)
//  }

// wattah();

require("./db/connection");
const dbs = require("./db/register");
const auth = require("./middleware/auth");

app.set("view engine", "ejs");
// const notifier = require('node-notifier');
// const { version } = require("os");
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 5MB limit
});

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// Routes
app.get("", (req, res) => {
    res.render("index");
});

app.get("/login", (req, res) => {
    if (req.cookies.jwt) {
      return res.redirect("/dashboard"); // Redirect if user is already logged in
    }
    res.render("login");
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.get("/dashboard", auth, async (req, res) => {
    // console.log(`this is the token recieved from the cookie: ${req.cookies.jwt}`);
    res.render("dashboard", {username: req.user.name});
});

app.get("/creatorUpload", auth, async (req, res) => {
    // console.log(`this is the token recieved from the cookie: ${req.cookies.jwt}`);
    res.render("creatorUpload",{username: req.user.name});
});

app.get("/product", auth, async (req, res) => {
    // console.log(`this is the token recieved from the cookie: ${req.cookies.jwt}`);
    res.render("product");
});

app.get("/checkout", auth, async (req, res) => {
    // console.log(`this is the token recieved from the cookie: ${req.cookies.jwt}`);
    res.render("checkout",{username: req.user.name});
});
app.get('/creatorDashboard', auth, (req, res)=>{
    res.render('creatorDashboard',{username: req.user.name})
})

app.get("/categories", auth, async (req, res) => {
    // console.log(`this is the token recieved from the cookie: ${req.cookies.jwt}`);
    res.render("categories");
});
app.get("/creators", auth, async (req, res) => {
    // console.log(`this is the token recieved from the cookie: ${req.cookies.jwt}`);
    res.render("creators");
});
app.get("/about",auth,  async (req, res) => {
    // console.log(`this is the token recieved from the cookie: ${req.cookies.jwt}`);
    res.render("about");
});

// Add this near your other routes (before the http.listen call)
// GET endpoint to fetch presets (for marketplace)
app.post('/api/presets/get', auth, async (req, res) => {
    try {
        // You can add query parameters for filtering
        const { category, limit, sort } = req.query;
        
        const query = {};
        if (category) query.category = category;
        
        const sortOption = sort === 'newest' ? { createdAt: -1 } : {};
        const limitValue = limit ? parseInt(limit) : 10;
        
        const presets = await dbs.Preset.find(query)
            .populate('creator', 'name email') // Populate creator info
            .sort(sortOption)
            .limit(limitValue);
            
        res.json(presets);
    } catch (error) {
        console.error('Error fetching presets:', error);
        res.status(500).json({ error: 'Failed to fetch presets' });
    }
});

// Keep your existing POST /api/presets for creating new presets
// Keep your existing PUT /api/presets/:id for updating presets
// Keep your existing GET /api/presets/:id for getting single preset

// Preset API Endpoints
app.post('/api/presets', auth , upload.fields([
    { name: 'previewImages', maxCount: 5 },
    { name: 'presetFiles', maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, description, category, price, compatibility, tags } = req.body;

        // Get file paths
        const previewImages = req.files['previewImages']?.map(file => `/uploads/${file.filename}`) || [];
        const presetFiles = req.files['presetFiles']?.map(file => `/uploads/${file.filename}`) || [];

        const newPreset = new dbs.Preset({
            title,
            description,
            category,
            price: parseFloat(price),
            previewImages,
            presetFile: presetFiles[0], // Just take the first file
            compatibility,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            creator: req.user?._id // You'll need to implement auth middleware
        });

        await newPreset.save();
        res.status(201).json(newPreset);
    } catch (error) {
        console.error('Error creating preset:', error);
        res.status(500).json({ error: 'Failed to create preset' });
    }
});

app.put('/api/presets/:id', auth , upload.fields([
    { name: 'previewImages', maxCount: 5 },
    { name: 'presetFiles', maxCount: 1 }
]), async (req, res) => {
    try {
        const presetId = req.params.id;
        const { title, description, category, price, compatibility, tags } = req.body;

        const updateData = {
            title,
            description,
            category,
            price: parseFloat(price),
            compatibility,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
            updatedAt: new Date()
        };

        // Update files if new ones were uploaded
        if (req.files['previewImages']) {
            updateData.previewImages = req.files['previewImages'].map(file => `/uploads/${file.filename}`);
        }

        if (req.files['presetFiles']) {
            updateData.presetFile = `/uploads/${req.files['presetFiles'][0].filename}`;
        }

        const updatedPreset = await dbs.Preset.findByIdAndUpdate(presetId, updateData, { new: true });

        if (!updatedPreset) {
            return res.status(404).json({ error: 'Preset not found' });
        }

        res.json(updatedPreset);
    } catch (error) {
        console.error('Error updating preset:', error);
        res.status(500).json({ error: 'Failed to update preset' });
    }
});

app.get('/api/presets/:id', auth, async (req, res) => {
    try {
        const preset = await dbs.Preset.findById(req.params.id);

        if (!preset) {
            return res.status(404).json({ error: 'Preset not found' });
        }

        res.json(preset);
    } catch (error) {
        console.error('Error fetching preset:', error);
        res.status(500).json({ error: 'Failed to fetch preset' });
    }
});

// Existing authentication routes
app.post("/register", async (req, res) => {
    try {
        if (req.body.password === req.body.confirmPassword) {
            const registerUsers = new dbs.regs({
                name: req.body.username,
                email: req.body.email,
                password: req.body.password,
                confirmPassword: req.body.confirmPassword,
            })

            const token = await registerUsers.generateAuthToken();

            res.cookie("jwt", token, {
                expires: new Date(Date.now() + 60*60*1000),
                httpOnly: true,
                secure: process.env.NODE_ENV === "production" // Set to true if using HTTPS
            });
            console.log(cookie);
            registerUsers.save().then(() => {
                console.log("User registered successfully");
                res.status(201).redirect(`../dashboard`);
            }).catch((err) => {
                res.send("emails should be unique");
            })
        }
        else {
            res.send("Password are not matching");
        }
    }
    catch (err) {
        console.log(err);
    }
});

app.post("/login" , async (req, res) => {
    try {
        const password = req.body.password;
        const user = await dbs.regs.findOne({ email: req.body.email });

        const ismatch = await bcrypt.compare( password, user.password);

        if (ismatch) {

            const token = await user.generateAuthToken();

                res.cookie("jwt", token, {
                    expires: new Date(Date.now() + 60*60*1000),
                    httpOnly: true,     
                    secure: process.env.NODE_ENV === "production" // Set to true if using HTTPS
                });

            if (user.email === "admin@gmail.com") {
                res.status(201).redirect(`creatorDashboard`);
            }
            else {
                res.status(201).redirect(`dashboard`);
            }
        }
        else {
            //   res.send(notifier.notify("Invalid email or password"));
        }
    } catch (err) {
        // notifier.notify("an error occurred while logging in");
    }
});
app.post("/getFile", auth , async (req, res) => {
    try {
        console.log(req.body);
        const formattedProductId = req.body.productid.toLowerCase().replaceAll('-', ' ');
        console.log(formattedProductId)
        const users = await dbs.Preset.find({title: formattedProductId});
        res.json(users);
        console.log(users)
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.get('/logout', auth, async (req, res) => {
    try {
        // Clear the JWT cookie
    res.clearCookie("jwt", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // or true if using HTTPS
    path: "/"
});
        req.user.tokens = req.user.tokens.filter((token) => {
            return token.token !== req.cookies.jwt; // Remove the current token
        });
        await req.user.save();
        res.redirect("/login");
    } catch (error) {
        console.error("Error during logout:", error);
    }
});

http.listen(3000, () => {
    console.log("running on port 3000");
});