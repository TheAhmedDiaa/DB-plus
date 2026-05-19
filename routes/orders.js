const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');

// GET /api/orders — list all orders with joined names
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT o.Id, o.Customer_Id, o.Supplier_Id, o.Emp_Id, o.Status_Id,
             o.Total_Price, o.Order_Date,
             c.First_Name + ' ' + c.Last_Name   AS Customer_Name,
             s.First_Name + ' ' + s.Last_Name    AS Supplier_Name,
             e.First_Name + ' ' + e.Last_Name    AS Employee_Name,
             st.Status                            AS Status_Name
      FROM Orders o
      LEFT JOIN Customer c  ON o.Customer_Id = c.Id
      LEFT JOIN Supplier s  ON o.Supplier_Id = s.Id
      LEFT JOIN Employee e  ON o.Emp_Id      = e.Id
      LEFT JOIN Status   st ON o.Status_Id   = st.Id
      ORDER BY o.Id DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders — create a new order
router.post('/', async (req, res) => {
  const { customer_id, supplier_id, emp_id, status_id, total_price, order_date, product_ids } = req.body;

  // Validate required fields
  if (!customer_id || !supplier_id || !emp_id || !status_id || !total_price || !order_date) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Insert the order
      const orderResult = await new sql.Request(transaction)
        .input('cid', sql.Int, customer_id)
        .input('sid', sql.Int, supplier_id)
        .input('eid', sql.Int, emp_id)
        .input('stid', sql.Int, status_id)
        .input('total', sql.Decimal(10, 2), parseFloat(total_price))
        .input('date', sql.Date, order_date)
        .query(`
          INSERT INTO Orders (Customer_Id, Supplier_Id, Emp_Id, Status_Id, Total_Price, Order_Date)
          OUTPUT INSERTED.Id
          VALUES (@cid, @sid, @eid, @stid, @total, @date)
        `);

      const newOrderId = orderResult.recordset[0].Id;

      // Insert order-product links if provided
      if (product_ids && Array.isArray(product_ids) && product_ids.length > 0) {
        for (const pid of product_ids) {
          await new sql.Request(transaction)
            .input('oid', sql.Int, newOrderId)
            .input('pid', sql.Int, pid)
            .query('INSERT INTO Order_Products (Order_Id, Product_Id) VALUES (@oid, @pid)');
        }
      }

      await transaction.commit();
      res.json({ success: true, message: 'Order created!', orderId: newOrderId });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/orders/:id
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    // Delete order_products first (FK)
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Order_Products WHERE Order_Id = @id');
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Orders WHERE Id = @id');
    res.json({ success: true, message: 'Order deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/orders/:id — get single order with products
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    // Get order details
    const orderResult = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT o.Id, o.Customer_Id, o.Supplier_Id, o.Emp_Id, o.Status_Id,
               o.Total_Price, o.Order_Date
        FROM Orders o
        WHERE o.Id = @id
      `);

    if (orderResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.recordset[0];

    // Get associated products
    const productsResult = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT Product_Id FROM Order_Products WHERE Order_Id = @id');

    order.product_ids = productsResult.recordset.map(row => row.Product_Id);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/orders/:id — update an order
router.put('/:id', async (req, res) => {
  const { customer_id, supplier_id, emp_id, status_id, total_price, order_date, product_ids } = req.body;
  const orderId = req.params.id;

  if (!customer_id || !supplier_id || !emp_id || !status_id || !total_price || !order_date) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Update the order
      await new sql.Request(transaction)
        .input('id', sql.Int, orderId)
        .input('cid', sql.Int, customer_id)
        .input('sid', sql.Int, supplier_id)
        .input('eid', sql.Int, emp_id)
        .input('stid', sql.Int, status_id)
        .input('total', sql.Decimal(10, 2), parseFloat(total_price))
        .input('date', sql.Date, order_date)
        .query(`
          UPDATE Orders 
          SET Customer_Id = @cid, Supplier_Id = @sid, Emp_Id = @eid, 
              Status_Id = @stid, Total_Price = @total, Order_Date = @date
          WHERE Id = @id
        `);

      // Delete existing order-product links
      await new sql.Request(transaction)
        .input('oid', sql.Int, orderId)
        .query('DELETE FROM Order_Products WHERE Order_Id = @oid');

      // Insert new order-product links if provided
      if (product_ids && Array.isArray(product_ids) && product_ids.length > 0) {
        for (const pid of product_ids) {
          await new sql.Request(transaction)
            .input('oid', sql.Int, orderId)
            .input('pid', sql.Int, pid)
            .query('INSERT INTO Order_Products (Order_Id, Product_Id) VALUES (@oid, @pid)');
        }
      }

      await transaction.commit();
      res.json({ success: true, message: 'Order updated!' });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
