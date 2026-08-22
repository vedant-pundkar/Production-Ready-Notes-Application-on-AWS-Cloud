require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const multer = require("multer");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

const s3 = new S3Client({
  region: process.env.AWS_REGION
});

// Home Page
app.get("/", async (req, res) => {
  try {
    const [notes] = await db.query(
      "SELECT * FROM notes ORDER BY created_at DESC"
    );
    res.render("index", { notes });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database Error");
  }
});

// Upload Note
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { title, description } = req.body;

    let fileUrl = "";
    let fileName = "";

    if (req.file) {
      fileName = `${Date.now()}-${req.file.originalname}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: fileName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype
        })
      );

      fileUrl = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    }

    // 1. Insert into 'notes' table and retrieve the generated ID
    const [noteResult] = await db.query(
      "INSERT INTO notes(title, description, file_url, file_name) VALUES(?,?,?,?)",
      [title, description, fileUrl, fileName]
    );

    // 2. Insert into 's3_objects' table if a file was uploaded
    if (req.file) {
      const noteId = noteResult.insertId;

      await db.query(
        `INSERT INTO s3_objects 
        (note_id, object_name, object_key, bucket_name, object_url, content_type, file_size) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          noteId,
          req.file.originalname,
          fileName,
          process.env.S3_BUCKET,
          fileUrl,
          req.file.mimetype,
          req.file.size
        ]
      );
    }

    res.redirect("/");

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).send(err.message);
  }
});

// Create Tables If They Do Not Exist
async function initializeDatabase() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        file_url TEXT,
        file_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS s3_objects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        note_id INT,
        object_name VARCHAR(255) NOT NULL,
        object_key VARCHAR(500) NOT NULL,
        bucket_name VARCHAR(255) NOT NULL,
        object_url VARCHAR(1000),
        content_type VARCHAR(100),
        file_size BIGINT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      )
    `);

    console.log("Database Ready");

  } catch (err) {
    console.error("Database Initialization Error:", err);
  }
}

// Start Server
const PORT = process.env.PORT || 3000;

initializeDatabase().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
});
