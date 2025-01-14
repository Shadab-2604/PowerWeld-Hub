require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const session = require('express-session');
const app = express();

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary Storage Configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'powerweld-hub',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [
      { width: 800, height: 800, crop: 'limit' },
      { quality: 'auto:good' }
    ],
    public_id: (req, file) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      return `product-${uniqueSuffix}`;
    }
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Database connected'))
  .catch((err) => console.error('Database connection error:', err));

// Product Model
const Product = mongoose.model('Product', {
  name: { type: String, required: true },
  price: { type: Number, required: true },
  inStock: { type: Boolean, default: true },
  image: { type: String, required: true },
  cloudinaryId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SECRET_KEY,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Auth Middleware
const requireAuth = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Routes
app.get('/', async (req, res) => {
  try {
    const products = await Product.find().sort('-createdAt');
    res.render('index', { products });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).render('error', { error: 'Failed to load products' });
  }
});

app.get('/admin', requireAuth, async (req, res) => {
  try {
    const products = await Product.find().sort('-createdAt');
    res.render('admin', { products });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).render('error', { error: 'Failed to load admin dashboard' });
  }
});

app.post('/admin/add', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new Error('Image is required');
    }

    const product = new Product({
      name: req.body.name,
      price: req.body.price,
      inStock: req.body.inStock === 'on',
      image: req.file.path,
      cloudinaryId: req.file.filename
    });

    await product.save();
    res.redirect('/admin');
  } catch (err) {
    next(err); // Pass the error to the error handling middleware
  }
});

// Add this route to handle GET requests for editing a product
app.get('/admin/edit/:id', requireAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).render('error', { error: 'Product not found' });
    }
    res.render('edit-product', { product });
  } catch (err) {
    console.error('Error fetching product for edit:', err);
    res.status(500).render('error', { error: 'Failed to load product for editing' });
  }
});

// Update the POST route for editing a product
app.post('/admin/edit/:id', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (req.file) {
      // Delete old image from Cloudinary
      await cloudinary.uploader.destroy(product.cloudinaryId);
      product.image = req.file.path;
      product.cloudinaryId = req.file.filename;
    }

    product.name = req.body.name;
    product.price = req.body.price;
    product.inStock = req.body.inStock === 'on';

    await product.save();

    // Check if it's an AJAX request
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.json({ success: true, message: 'Product updated successfully' });
    }
    
    res.redirect('/admin');
  } catch (err) {
    console.error('Error updating product:', err);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({ success: false, message: 'Error updating product' });
    }
    res.status(500).render('error', { error: 'Error updating product' });
  }
});

app.post('/admin/delete/:id', requireAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).send('Product not found');
    }

    // Delete image from Cloudinary
    await cloudinary.uploader.destroy(product.cloudinaryId);
    await Product.findByIdAndDelete(req.params.id);
    
    res.redirect('/admin');
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).send('Error deleting product');
  }
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === process.env.ADMIN_USERNAME && 
      password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.redirect('/login');
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error logging out:', err);
    }
    res.redirect('/login');
  });
});

app.get('/contact', (req, res) => {
  res.render('contact');
});


app.get('/product/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).render('error', { error: 'Product not found' });
    }

    res.render('product-details', {
      product,
      compatibleMachines: [
        '/images/machine1.jpg',
        '/images/machine2.jpg',
        '/images/machine3.jpg',
        '/images/machine4.jpg',
        '/images/machine6.jpg',
        '/images/machine7.jpg',
        '/images/machine8.jpg',
        '/images/machine9.jpg',
        '/images/machine10.jpg',
        '/images/machine11.jpg',
        '/images/machine12.jpg',
        '/images/machine13.jpg',
        '/images/machine14.jpg',
        '/images/machine15.jpg'
      ] // Add static machine images
    });
  } catch (err) {
    console.error('Error fetching product details:', err);
    res.status(500).render('error', { error: 'Failed to load product details' });
  }
});



// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { error: err.message || 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});