require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const app = express();

// MongoDB connection using Atlas URI from environment variable
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Database connected'))
    .catch((err) => console.error('Database connection error:', err));

// Set up EJS as the view engine
app.set('view engine', 'ejs');

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set up session with secret key from environment variable
app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Product Model
const Product = mongoose.model('Product', {
  name: String,
  price: Number,
  inStock: { type: Boolean, default: true },
  image: String
});

// Routes
app.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    res.render('index', { products });
  } catch (err) {
    res.status(500).send('Error: ' + err);
  }
});

app.get('/admin', async (req, res) => {
  if (!req.session.isAdmin) {
    return res.redirect('/login'); // Redirect if not logged in as admin
  }
  
  try {
    const products = await Product.find();
    res.render('admin', { products });
  } catch (err) {
    res.status(500).send('Error: ' + err);
  }
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Check credentials (use environment variables for security)
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.redirect('/login');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('Error logging out');
    }
    res.redirect('/login');
  });
});

// Logout Route (POST)
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('Error logging out');
    }
    res.redirect('/login');
  });
});


app.post('/admin/add', upload.single('image'), async (req, res) => {
  const { name, price } = req.body;
  const inStock = req.body.inStock === 'on';
  const image = req.file ? `/uploads/${req.file.filename}` : '';

  try {
    const product = new Product({ name, price, inStock, image });
    await product.save();
    res.redirect('/admin');
  } catch (err) {
    res.status(500).send('Error: ' + err);
  }
});

// Edit Product route (GET)
app.get('/admin/edit/:id', async (req, res) => {
  const productId = req.params.id;
  try {
    const product = await Product.findById(productId);
    res.render('edit-product', { product });
  } catch (err) {
    res.status(500).send('Error: ' + err);
  }
});

// Edit Product route (POST)
app.post('/admin/edit/:id', upload.single('image'), async (req, res) => {
  const productId = req.params.id;
  const { name, price, inStock } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    // Find the product and update its details
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        name,
        price,
        inStock: inStock === 'on',
        image: image || undefined, // Only update image if it's provided
      },
      { new: true } // Return the updated product
    );

    // Redirect to admin panel after updating
    res.redirect('/admin');
  } catch (err) {
    res.status(500).send('Error: ' + err);
  }
});


app.post('/admin/delete/:id', async (req, res) => {
  const productId = req.params.id;

  try {
    const product = await Product.findByIdAndDelete(productId);
    if (product && product.image) {
      // Delete the image from the uploads folder
      const fs = require('fs');
      const filePath = path.join(__dirname, 'public', product.image);
      fs.unlinkSync(filePath);
    }
    res.redirect('/admin');
  } catch (err) {
    res.status(500).send('Error: ' + err);
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
