const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const multer = require('multer');
require('dotenv').config();
const { Pool } = require('pg');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 8080;
const CACHE_DIR = path.resolve(process.env.CACHE_DIR || './cache');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

const app = express();
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory API',
      version: '1.0.0',
    },
  },
  apis: ['./main.js'], 
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
const server = http.createServer(app); 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static(path.join(process.cwd(), 'public')));

const upload = multer({ storage: multer.memoryStorage() });

function photoFile(id) {
  return path.join(CACHE_DIR, `${id}.jpg`);
}

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new inventory item
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Item created
 */

app.post('/register', upload.single('photo'), async (req, res) => {
  try {
    const { inventory_name, description } = req.body;
    if (!inventory_name) return res.status(400).send("inventory_name is required");

    const result = await pool.query(
      "INSERT INTO inventory (name, description, photo) VALUES ($1,$2,$3) RETURNING id",
      [inventory_name, description || "", null]
    );

    const id = result.rows[0].id;
    let photoName = null;

    if (req.file) {
      photoName = `${id}.jpg`;
      fs.writeFileSync(photoFile(id), req.file.buffer);

      await pool.query("UPDATE inventory SET photo=$1 WHERE id=$2", [photoName, id]);
    }

    res.status(201).json({ id, name: inventory_name, description, photo: photoName });

  } catch (e) {
    res.status(500).send(e.message);
  }
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Get all inventory items
 *     responses:
 *       200:
 *         description: List of items
 */

app.get('/inventory', async (req, res) => {
  const result = await pool.query("SELECT * FROM inventory ORDER BY id");
  res.json(result.rows);
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Get item by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Item data
 *       404:
 *         description: Not found
 */

app.get('/inventory/:id', async (req, res) => {
  const id = Number(req.params.id);
  const result = await pool.query("SELECT * FROM inventory WHERE id=$1", [id]);

  if (result.rowCount === 0) return res.status(404).send("Not found");
  res.json(result.rows[0]);
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Update item info
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated item
 */

app.put('/inventory/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, description } = req.body;

  const result = await pool.query("SELECT * FROM inventory WHERE id=$1", [id]);
  if (result.rowCount === 0) return res.status(404).send("Not found");

  await pool.query(
    "UPDATE inventory SET name=$1, description=$2 WHERE id=$3",
    [name || result.rows[0].name, description || result.rows[0].description, id]
  );

  res.json({ id, name, description });
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Get item photo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: JPEG file
 *       404:
 *         description: Photo not found
 */

app.get('/inventory/:id/photo', (req, res) => {
  const id = Number(req.params.id);
  const file = photoFile(id);

  if (!fs.existsSync(file)) return res.status(404).send("Photo not found");

  res.setHeader('Content-Type', 'image/jpeg');
  res.sendFile(file);
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Upload or replace item photo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Photo updated
 */

app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
  const id = Number(req.params.id);
  const result = await pool.query("SELECT * FROM inventory WHERE id=$1", [id]);

  if (result.rowCount === 0) return res.status(404).send("Not found");
  if (!req.file) return res.status(400).send("No photo uploaded");

  fs.writeFileSync(photoFile(id), req.file.buffer);
  const photoName = `${id}.jpg`;

  await pool.query("UPDATE inventory SET photo=$1 WHERE id=$2", [photoName, id]);

  res.json({ id, photo: photoName });
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Delete item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Deleted
 */

app.delete('/inventory/:id', async (req, res) => {
  const id = Number(req.params.id);
  await pool.query("DELETE FROM inventory WHERE id=$1", [id]);

  const file = photoFile(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);

  res.send("Deleted");
});

/**
 * @swagger
 * /RegisterForm.html:
 *   get:
 *     summary: Web form for device registration
 *     responses:
 *       200:
 *         description: Returns an HTML form
 */

app.get('/RegisterForm.html', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'RegisterForm.html'));
});

/**
 * @swagger
 * /SearchForm.html:
 *   get:
 *     summary: Web form for device search
 *     responses:
 *       200:
 *         description: Returns an HTML form
 */

app.get('/SearchForm.html', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'SearchForm.html'));
});

/**
 * @swagger
 * /search:
 *   post:
 *     summary: Search device by ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Device ID
 *               includePhoto:
 *                 type: string
 *                 description: Add a link to a photo ("on")
 *     responses:
 *       200:
 *         description: Information about the item
 *       404:
 *         description: Item not found
 */

app.post('/search', express.urlencoded({ extended: true }), async (req, res) => {
  const id = Number(req.body.id);
  const includePhoto = req.body.includePhoto === "on";

  const result = await pool.query("SELECT * FROM inventory WHERE id=$1", [id]);
  if (result.rowCount === 0) return res.status(404).send("Not found");

  const item = result.rows[0];
  if (includePhoto && item.photo)
    item.photo_url = `/inventory/${id}/photo`;

  res.json(item);
});

app.use((req, res, next) => {
  const valid = ['GET', 'POST', 'PUT', 'DELETE'];
  if (!valid.includes(req.method)) return res.sendStatus(405);
  next();
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});
