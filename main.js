const { program } = require('commander');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const multer = require('multer');
require('dotenv').config();

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 8080;
const CACHE_DIR = path.resolve(process.env.CACHE_DIR || './cache');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

const DB_FILE = path.join(CACHE_DIR, 'db.json');
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([], null, 2));

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

function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '[]');
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function nextId(db) {
  return db.length ? Math.max(...db.map(x => x.id)) + 1 : 1;
}

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

app.post('/register', upload.single('photo'), (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) return res.status(400).send("inventory_name is required");

  const db = readDB();
  const id = nextId(db);

  let photoName = null;
  if (req.file) {
    photoName = `${id}.jpg`;
    fs.writeFileSync(photoFile(id), req.file.buffer);
  }

  const item = { id, name: inventory_name, description: description || "", photo: photoName };
  db.push(item);
  writeDB(db);

  res.status(201).json(item);
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

app.get('/inventory', (req, res) => {
  const db = readDB();
  res.status(200).json(db);
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

app.get('/inventory/:id', (req, res) => {
  const id = Number(req.params.id);    
  if (isNaN(id)) return res.status(400).send("ID must be a number");
  const db = readDB();                    
  const item = db.find(x => x.id === id); 

  if (!item) return res.status(404).send("Not found"); 

  res.status(200).json(item); 
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

app.put('/inventory/:id', (req, res) => {
  const id = Number(req.params.id);      
  if (isNaN(id)) return res.status(400).send("ID must be a number");  
  const db = readDB();                     
  const item = db.find(x => x.id === id);  

  if (!item) return res.status(404).send("Not found"); 

  if (req.body.name) item.name = req.body.name;
  if (req.body.description) item.description = req.body.description;

  writeDB(db); 

  res.status(200).json(item);
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
  if (isNaN(id)) return res.status(400).send("ID must be a number");       
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

app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
  const id = Number(req.params.id);      
  if (isNaN(id)) return res.status(400).send("ID must be a number"); 
  const db = readDB();                    
  const item = db.find(x => x.id === id); 

  if (!item) return res.status(404).send("Not found");        
  if (!req.file) return res.status(400).send("No photo uploaded"); 

  fs.writeFileSync(photoFile(id), req.file.buffer);
  item.photo = `${id}.jpg`;

  writeDB(db); 

  res.status(200).json(item); 
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

app.delete('/inventory/:id', (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).send("ID must be a number");
  let db = readDB();
  const index = db.findIndex(x => x.id === id);

  if (index === -1) return res.status(404).send("Not found");

  const file = photoFile(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);

  db.splice(index, 1); 
  writeDB(db);

  res.status(200).send("Deleted");
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

app.post('/search', express.urlencoded({ extended: true }), (req, res) => {
  const id = Number(req.body.id);
  const includePhoto = req.body.includePhoto === "on";
  const db = readDB();
  const item = db.find(x => x.id === id);
  if (!item) return res.status(404).send("Not found");

  const result = {
    id: item.id,
    name: item.name,
    description: item.description,
    photo: item.photo
  };

  if (includePhoto && item.photo) {
    result.photo_url = `/inventory/${id}/photo`;
  }

  res.json(result);
});

app.use((req, res, next) => {
  const valid = ['GET', 'POST', 'PUT', 'DELETE'];
  if (!valid.includes(req.method)) return res.sendStatus(405);
  next();
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});
