const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');

// GET /api/employees — list all employees
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT e.Id, e.First_Name, e.Last_Name, e.Date_of_Birth,
             e.Email, e.Address, e.Warehouse_Id,
             w.Name AS Warehouse_Name,
             ep.Phone
      FROM Employee e
      LEFT JOIN Warehouse w       ON e.Warehouse_Id = w.Id
      LEFT JOIN Employee_Phones ep ON e.Id = ep.Emp_Id
      ORDER BY e.Id DESC
    `);

    // Group by employee
    const grouped = {};
    result.recordset.forEach(row => {
      if (!grouped[row.Id]) {
        grouped[row.Id] = {
          Id: row.Id,
          First_Name: row.First_Name,
          Last_Name: row.Last_Name,
          Date_of_Birth: row.Date_of_Birth,
          Email: row.Email,
          Address: row.Address,
          Warehouse_Id: row.Warehouse_Id,
          Warehouse_Name: row.Warehouse_Name,
          Phones: []
        };
      }
      if (row.Phone && !grouped[row.Id].Phones.includes(row.Phone))
        grouped[row.Id].Phones.push(row.Phone);
    });
    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/employees/:id — get a single employee
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT e.Id, e.First_Name, e.Last_Name, e.Date_of_Birth,
               e.Email, e.Address, e.Warehouse_Id, ep.Phone
        FROM Employee e
        LEFT JOIN Employee_Phones ep ON e.Id = ep.Emp_Id
        WHERE e.Id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = result.recordset[0];
    const phones = result.recordset.map(r => r.Phone).filter(p => p);

    res.json({
      Id: emp.Id,
      First_Name: emp.First_Name,
      Last_Name: emp.Last_Name,
      Date_of_Birth: emp.Date_of_Birth,
      Email: emp.Email,
      Address: emp.Address,
      Warehouse_Id: emp.Warehouse_Id,
      Phones: [...new Set(phones)]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees — create a new employee
router.post('/', async (req, res) => {
  const { first_name, last_name, date_of_birth, email, address, phone, warehouse_id } = req.body;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }
  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input('fn', sql.NVarChar, first_name)
        .input('ln', sql.NVarChar, last_name)
        .input('dob', sql.Date, date_of_birth || null)
        .input('email', sql.NVarChar, email || null)
        .input('addr', sql.NVarChar, address || null)
        .input('wid', sql.Int, warehouse_id || null)
        .query(`
          INSERT INTO Employee (First_Name, Last_Name, Date_of_Birth, Email, Address, Warehouse_Id) 
          OUTPUT INSERTED.Id 
          VALUES (@fn, @ln, @dob, @email, @addr, @wid)
        `);
      const newId = result.recordset[0].Id;

      if (phone) {
        await new sql.Request(transaction)
          .input('eid', sql.Int, newId)
          .input('phone', sql.NVarChar, phone)
          .query('INSERT INTO Employee_Phones (Emp_Id, Phone) VALUES (@eid, @phone)');
      }

      await transaction.commit();
      res.json({ success: true, message: 'Employee created!', id: newId });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/employees/:id — update an employee
router.put('/:id', async (req, res) => {
  const { first_name, last_name, date_of_birth, email, address, phone, warehouse_id } = req.body;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }
  try {
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction)
        .input('id', sql.Int, req.params.id)
        .input('fn', sql.NVarChar, first_name)
        .input('ln', sql.NVarChar, last_name)
        .input('dob', sql.Date, date_of_birth || null)
        .input('email', sql.NVarChar, email || null)
        .input('addr', sql.NVarChar, address || null)
        .input('wid', sql.Int, warehouse_id || null)
        .query(`
          UPDATE Employee 
          SET First_Name = @fn, Last_Name = @ln, Date_of_Birth = @dob, 
              Email = @email, Address = @addr, Warehouse_Id = @wid
          WHERE Id = @id
        `);

      // Update phones (replace all with the new one for simplicity)
      await new sql.Request(transaction)
        .input('eid', sql.Int, req.params.id)
        .query('DELETE FROM Employee_Phones WHERE Emp_Id = @eid');

      if (phone) {
        await new sql.Request(transaction)
          .input('eid', sql.Int, req.params.id)
          .input('phone', sql.NVarChar, phone)
          .query('INSERT INTO Employee_Phones (Emp_Id, Phone) VALUES (@eid, @phone)');
      }

      await transaction.commit();
      res.json({ success: true, message: 'Employee updated!' });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employees/:id — delete an employee
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    // Delete phones first due to FK constraints
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Employee_Phones WHERE Emp_Id = @id');
    // Then delete employee
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM Employee WHERE Id = @id');
    res.json({ success: true, message: 'Employee deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
