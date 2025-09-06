require("dotenv").config();
const cookie = require('cookie');
const cookieParser = require('cookie-parser');
const express = require("express");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { google } = require('googleapis');
const { Readable } = require('stream');

const app = express();
const http = require("http").Server(app);

// -- MongoDB connection and models
require("./db/connection");
const dbs = require("./db/register");
const auth = require("./middleware/auth");

app.set("view engine", "ejs");
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));

// --- Google Drive API setup ---
const authGoogle = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth: authGoogle });

// --- Multer memory storage for files ---
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const SHARED_DRIVE_FOLDER_ID = "1ec5sMWq-_XFD2ZYzEL9an5cyxRQiVecJ";

async function uploadFileToDrive(fileBuffer, originalName, mimeType) {
  try {
    const fileMetadata = {
      name: originalName,
      parents: [SHARED_DRIVE_FOLDER_ID],
      supportsAllDrives: true
    };

    const media = {
      mimeType: mimeType,
      body: Readable.from(fileBuffer),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
      supportsAllDrives: true,
    });

    return response.data;
  } catch (error) {
    console.error('Error uploading file to Google Drive:', error);
    throw error;
  }
}


// --- Routes ---

app.get("", (req, res) => {
  res.render("index");
});

app.get("/login", (req, res) => {
  if (req.cookies.jwt) {
    return res.redirect("/dashboard");
  }
  res.render("login");
});

app.get("/signup", (req, res) => {
  res.render("signup");
});

app.get("/dashboard", auth, async (req, res) => {
  res.render("dashboard", {username: req.user.name});
});

app.get("/creatorUpload", auth, async (req, res) => {
  res.render("creatorUpload", {username: req.user.name});
});

app.get("/product", auth, async (req, res) => {
  res.render("product");
});

app.get("/checkout", auth, async (req, res) => {
  res.render("checkout", {username: req.user.name});
});

app.get('/creatorDashboard', auth, (req, res) => {
  res.render('creatorDashboard', {username: req.user.name});
});

app.get("/categories", auth, async (req, res) => {
  res.render("categories");
});

app.get("/creators", auth, async (req, res) => {
  res.render("creators");
});

app.get("/about", auth, async (req, res) => {
  res.render("about");
});

app.post('/api/presets/get', auth, async (req, res) => {
  try {
    const { category, limit, sort } = req.query;
    const query = {};
    if (category) query.category = category;
    const sortOption = sort === 'newest' ? { createdAt: -1 } : {};
    const limitValue = limit ? parseInt(limit) : 10;

    const presets = await dbs.Preset.find(query)
      .populate('creator', 'name email')
      .sort(sortOption)
      .limit(limitValue);

    res.json(presets);
  } catch (error) {
    console.error('Error fetching presets:', error);
    res.status(500).json({ error: 'Failed to fetch presets' });
  }
});

app.post('/api/presets', auth, upload.fields([
  { name: 'previewImages', maxCount: 5 },
  { name: 'presetFiles', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, description, category, price, compatibility, tags } = req.body;

    let previewImages = [];
    if (req.files['previewImages']) {
      previewImages = await Promise.all(req.files['previewImages'].map(async (file) => {
        const driveFile = await uploadFileToDrive(file.buffer, file.originalname, file.mimetype);
        return {
          id: driveFile.id,
          name: file.originalname,
          webViewLink: driveFile.webViewLink || '',
          webContentLink: driveFile.webContentLink || '',
        };
      }));
    }

    let presetFile = null;
    if (req.files['presetFiles'] && req.files['presetFiles'].length > 0) {
      const file = req.files['presetFiles'][0];
      const driveFile = await uploadFileToDrive(file.buffer, file.originalname, file.mimetype);
      presetFile = {
        id: driveFile.id,
        name: file.originalname,
        webViewLink: driveFile.webViewLink || '',
        webContentLink: driveFile.webContentLink || '',
      };
    }

    const newPreset = new dbs.Preset({
      title,
      description,
      category,
      price: parseFloat(price),
      previewImages,
      presetFile,
      compatibility,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      creator: req.user?._id,
    });

    await newPreset.save();
    res.status(201).json(newPreset);
  } catch (error) {
    console.error('Error creating preset:', error);
    res.status(500).json({ error: 'Failed to create preset' });
  }
});

app.put('/api/presets/:id', auth, upload.fields([
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
      updatedAt: new Date(),
    };

    if (req.files['previewImages']) {
      updateData.previewImages = await Promise.all(req.files['previewImages'].map(async (file) => {
        const driveFile = await uploadFileToDrive(file.buffer, file.originalname, file.mimetype);
        return {
          id: driveFile.id,
          name: file.originalname,
          webViewLink: driveFile.webViewLink || '',
          webContentLink: driveFile.webContentLink || '',
        };
      }));
    }

    if (req.files['presetFiles']) {
      const file = req.files['presetFiles'][0];
      const driveFile = await uploadFileToDrive(file.buffer, file.originalname, file.mimetype);
      updateData.presetFile = {
        id: driveFile.id,
        name: file.originalname,
        webViewLink: driveFile.webViewLink || '',
        webContentLink: driveFile.webContentLink || '',
      };
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

app.post("/register", async (req, res) => {
  try {
    if (req.body.password === req.body.confirmPassword) {
      const registerUsers = new dbs.regs({
        name: req.body.username,
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
      });

      const token = await registerUsers.generateAuthToken();

      res.cookie("jwt", token, {
        expires: new Date(Date.now() + 60 * 60 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"
      });

      registerUsers.save().then(() => {
        console.log("User registered successfully");
        res.status(201).redirect(`../dashboard`);
      }).catch((err) => {
        res.send("emails should be unique");
      });
    } else {
      res.send("Password are not matching");
    }
  } catch (err) {
    console.log(err);
  }
});

app.post("/login", async (req, res) => {
  try {
    const password = req.body.password;
    const user = await dbs.regs.findOne({ email: req.body.email });

    const ismatch = await bcrypt.compare(password, user.password);

    if (ismatch) {
      const token = await user.generateAuthToken();

      res.cookie("jwt", token, {
        expires: new Date(Date.now() + 60 * 60 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"
      });

      if (user.email === "admin@gmail.com") {
        res.status(201).redirect(`creatorDashboard`);
      } else {
        res.status(201).redirect(`dashboard`);
      }
    } else {
      res.status(401).send("Invalid email or password");
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("An error occurred while logging in");
  }
});

app.post("/getFile", auth, async (req, res) => {
  try {
    const formattedProductId = req.body.productid.toLowerCase().replaceAll('-', ' ');
    const users = await dbs.Preset.find({ title: formattedProductId });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/logout', auth, async (req, res) => {
  try {
    res.clearCookie("jwt", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });
    req.user.tokens = req.user.tokens.filter((token) => token.token !== req.cookies.jwt);
    await req.user.save();
    res.redirect("/login");
  } catch (error) {
    console.error("Error during logout:", error);
  }
});

http.listen(3000, () => {
  console.log("running on port 3000");
});
