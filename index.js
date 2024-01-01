const express = require('express');
const mysql = require('mysql2/promise');
const MongoClient = require('mongodb').MongoClient;
const mongoDAO = require('./MongoDAO');

const app = express();
const PORT = process.env.PORT || 3000;

let coll;

MongoClient.connect('mongodb://127.0.0.1:27017')
  .then((client) => {
    const db = client.db('proj2023MongoDB');
    coll = db.collection('Managers');
  })
  .catch((error) => {
    console.log(error.message);
  });

const pool = mysql.createPool({
  connectionLimit: 10,
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'proj2023',
});

app.use(express.urlencoded({ extended: true }));

const renderHTML = (title, content) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; color: #333; }
        header { background: #333; color: #fff; padding: 10px 20px; text-align: center; }
        section { padding: 20px; }
        div { background: #fff; margin: 10px 0; padding: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
        a { color: #06c; text-decoration: none; }
        a:hover { text-decoration: underline; }
        form { background: #fff; padding: 20px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); }
        label { display: block; margin-bottom: 10px; }
        input[type="text"], input[type="number"] { width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { background: #28a745; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #218838; }
      </style>
    </head>
    <body>
      <header>
        <h1>${title}</h1>
      </header>
      <section>
        ${content}
      </section>
    </body>
    </html>
  `;
};

// Home Page
app.get('/', (req, res) => {
  const content = `
    <ul>
      <li><a href="/stores">Stores</a></li>
      <li><a href="/products">Products</a></li>
      <li><a href="/Managers">Managers</a></li>
    </ul>
  `;
  res.send(renderHTML('Home', content));
});

// Stores Page
app.get('/stores', async (req, res) => {
  try {
    const [stores] = await pool.query('SELECT * FROM store');
    let content = stores.map(store => `
      <div>
        <p>ID: ${store.sid}, Location: ${store.location}, Manager ID: ${store.mgrid}</p>
        <a href="/stores/edit/${store.sid}">Edit</a>
      </div>
    `).join('');
    content += '<a href="/stores/add">Add Store</a>';
    res.send(renderHTML('Stores', content));
  } catch (error) {
    console.error(error);
    res.status(500).send(renderHTML('Error', 'Internal Server Error'));
  }
});

// Edit Store - Display Form
app.get('/stores/edit/:sid', async (req, res) => {
  const { sid } = req.params;
  try {
    const [stores] = await pool.query('SELECT * FROM store WHERE sid = ?', [sid]);
    if (stores.length === 0) {
      return res.status(404).send(renderHTML('Error', 'Store not found'));
    }
    const store = stores[0];
    const content = `
      <form action="/stores/edit/${store.sid}" method="post">
        <label>Location: <input type="text" name="location" value="${store.location}" required></label>
        <label>Manager ID: <input type="text" name="mgrid" value="${store.mgrid}" required></label>
        <button type="submit">Update Store</button>
      </form>
    `;
    res.send(renderHTML('Edit Store', content));
  } catch (error) {
    console.error(error);
    res.status(500).send(renderHTML('Error', 'Internal Server Error'));
  }
});

// Edit Store - Handle Form Submission
app.post('/stores/edit/:sid', async (req, res) => {
  const { sid } = req.params;
  const { location, mgrid } = req.body;
  try {
    await pool.query('UPDATE store SET location = ?, mgrid = ? WHERE sid = ?', [location, mgrid, sid]);
    res.redirect('/stores');
  } catch (error) {
    console.error(error);
    res.status(500).send(renderHTML('Error', 'Internal Server Error'));
  }
});

// Products Page with JOINed data
app.get('/products', async (req, res) => {
  try {
    const sql = `
      SELECT p.pid, p.productdesc, ps.sid, s.location, ps.Price
      FROM product p
      JOIN product_store ps ON p.pid = ps.pid
      JOIN store s ON ps.sid = s.sid;
    `;
    const [products] = await pool.query(sql);
    let content = `
      <table>
        <thead>
          <tr>
            <th>Product ID</th>
            <th>Description</th>
            <th>Store ID</th>
            <th>Location</th>
            <th>Price</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${products.map(product => `
            <tr>
              <td>${product.pid}</td>
              <td>${product.productdesc}</td>
              <td>${product.sid}</td>
              <td>${product.location}</td>
              <td>${product.Price.toFixed(2)}</td>
              <td><a href="/products/delete/${product.pid}">Delete</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <a href="/">Return to home page</a>
    `;
    res.send(renderHTML('Products', content));
  } catch (error) {
    console.error(error);
    res.status(500).send(renderHTML('Error', 'Internal Server Error'));
  }
});


// Delete Product
app.get('/products/delete/:pid', async (req, res) => {
  const { pid } = req.params;
  try {
    // Check if the product is sold in any store before deleting
    const [storeRows] = await pool.query('SELECT * FROM product_store WHERE pid = ?', [pid]);
    if (storeRows.length > 0) {
      // Product is in a store and cannot be deleted
      return res.send(renderHTML('Error', `<p>Product ${pid} is currently in stores and cannot be deleted</p>`));
    }

    // If the product is not in any store, proceed with deletion
    await pool.query('DELETE FROM product WHERE pid = ?', [pid]);
    res.redirect('/products');
  } catch (error) {
    console.error(error);
    res.status(500).send(renderHTML('Error', `<p>Failed to delete product ${pid}: ${error.message}</p>`));
  }
});


// Managers Page
app.get('/Managers', async (req, res) => {
  try {
    const managers = await mongoDAO.findAll();
    let content = managers.map(manager => `
      <div>
        <p>ID: ${manager._id}, Name: ${manager.name}, Salary: ${manager.salary}</p>
      </div>
    `).join('');
    content += '<a href="/Managers/add">Add Manager</a>';
    res.send(renderHTML('Managers', content));
  } catch (error) {
    console.error(error);
    res.status(500).send(renderHTML('Error', 'Internal Server Error'));
  }
});

// Add Manager - Display Form
app.get('/Managers/add', (req, res) => {
  const content = `
    <form action="/Managers/add" method="post">
      <label>ID: <input type="text" name="id" required></label>
      <label>Name: <input type="text" name="name" required></label>
      <label>Salary: <input type="number" name="salary" required></label>
      <button type="submit">Add Manager</button>
    </form>
    <p><a href="/Managers">Back to Managers</a></p>
    <p><a href="/">Return to Homepage</a></p>
  `;
  res.send(renderHTML('Add Manager', content));
});


// Add Manager - Handle Form Submission
app.post('/Managers/add', async (req, res) => {
  const { id, name, salary } = req.body;
  try {
    await coll.insertOne({ _id: id, name, salary });
    res.redirect('/Managers');
  } catch (error) {
    console.error(error);
    res.status(500).send(renderHTML('Error', 'Internal Server Error'));
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
