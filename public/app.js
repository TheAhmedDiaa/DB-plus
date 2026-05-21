const API = '';

// Utility Functions
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="material-icons-round" style="font-size:18px;">${type === 'success' ? 'check_circle' : 'error'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(60px)'; toast.style.transition = '0.3s ease'; }, 3500);
  setTimeout(() => toast.remove(), 3900);
}

async function apiFetch(path, options) {
  try {
    const res = await fetch(API + path, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

function setupSearch(inputId, tableBodyId, dataArray, renderFn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    const filtered = dataArray.filter(item => JSON.stringify(item).toLowerCase().includes(q));
    renderFn(filtered);
  });
}

// Modal Helpers
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Dashboard
async function initDashboard() {
  try {
    const [products, orders, customers, suppliers] = await Promise.all([
      apiFetch('/api/products'), apiFetch('/api/orders'),
      apiFetch('/api/customers'), apiFetch('/api/suppliers'),
    ]);
    animateCount('stat-products', products.length);
    animateCount('stat-orders', orders.length);
    animateCount('stat-customers', customers.length);
    animateCount('stat-suppliers', suppliers.length);

    const recent = orders.slice(0, 10);
    const tbody = document.getElementById('recent-orders-body');
    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No orders yet.</p></td></tr>';
      return;
    }
    tbody.innerHTML = recent.map(o => `
      <tr>
        <td style="color:var(--text-primary);font-weight:600">#${o.Id}</td>
        <td>${escapeHtml(o.Customer_Name)}</td>
        <td>${escapeHtml(o.Supplier_Name)}</td>
        <td>${escapeHtml(o.Employee_Name)}</td>
        <td style="color:var(--accent-secondary);font-weight:600">${formatCurrency(o.Total_Price)}</td>
        <td>${formatDate(o.Order_Date)}</td>
        <td><span class="badge badge-info">${escapeHtml(o.Status_Name) || '—'}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    document.getElementById('recent-orders-body').innerHTML =
      `<tr><td colspan="7" class="empty-state"><p>Could not load data. Is the server running?</p></td></tr>`;
  }
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 30));
  const interval = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(interval); }
    el.textContent = current;
  }, 30);
}

// Orders
let allOrders = [];
let productsCache = [];
let editingOrderId = null;

async function initOrders() {
  const dateInput = document.getElementById('order-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  try {
    const [customers, suppliers, employees, statuses, products] = await Promise.all([
      apiFetch('/api/customers'), apiFetch('/api/suppliers'),
      apiFetch('/api/employees'), apiFetch('/api/status'), apiFetch('/api/products'),
    ]);
    productsCache = products;

    populateSelect('order-customer', customers, c => `${c.First_Name} ${c.Last_Name}`);
    populateSelect('order-supplier', suppliers, s => `${s.First_Name} ${s.Last_Name}`);
    populateSelect('order-employee', employees, e => `${e.First_Name || e.first_name} ${e.Last_Name || e.Last_name}`);
    populateSelect('order-status', statuses, s => s.Status, 'Id');

    // Product rows with quantity controls
    const grid = document.getElementById('product-checkboxes');
    if (grid && products.length > 0) {
      grid.innerHTML = products.map(p => `
        <div class="product-row" data-product-id="${p.Id}" data-price="${p.Price || 0}">
          <div class="product-info">
            <span style="color:var(--text-primary)">${escapeHtml(p.Name)}</span>
            <span class="badge badge-purple">${escapeHtml(p.Category) || ''}</span>
          </div>
          <span class="product-price">${formatCurrency(p.Price)}</span>
          <div class="qty-control">
            <button type="button" onclick="changeQty(this, -1)">−</button>
            <input type="number" class="product-qty" value="0" min="0" max="${p.Quantity}" data-product-id="${p.Id}" onchange="recalcTotal()">
            <button type="button" onclick="changeQty(this, 1)">+</button>
          </div>
        </div>
      `).join('');
    } else if (grid) {
      grid.innerHTML = '<span style="color:var(--text-muted)">No products available.</span>';
    }
  } catch (err) {}

  await loadOrders();
  const form = document.getElementById('order-form');
  if (form) form.addEventListener('submit', handleOrderSubmit);
}

function changeQty(btn, delta) {
  const input = btn.parentElement.querySelector('input');
  let val = parseInt(input.value) || 0;
  const max = parseInt(input.max) || 9999;
  val = Math.max(0, Math.min(max, val + delta));
  input.value = val;
  recalcTotal();
}

function recalcTotal() {
  let total = 0;
  document.querySelectorAll('.product-qty').forEach(input => {
    const qty = parseInt(input.value) || 0;
    const row = input.closest('.product-row');
    const price = parseFloat(row.dataset.price) || 0;
    total += qty * price;
  });
  document.getElementById('order-total').value = total.toFixed(2);
  document.getElementById('order-total-display').value = formatCurrency(total);
}

function populateSelect(id, items, labelFn, valKey = 'Id') {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select —</option>' +
    items.map(i => `<option value="${i[valKey]}">${escapeHtml(labelFn(i))}</option>`).join('');
}

async function loadOrders() {
  try {
    allOrders = await apiFetch('/api/orders');
    renderOrders(allOrders);
    setupSearch('orders-search', 'orders-table-body', allOrders, renderOrders);
  } catch (err) {
    document.getElementById('orders-table-body').innerHTML =
      '<tr><td colspan="8" class="empty-state"><p>Failed to load orders.</p></td></tr>';
  }
}

function renderOrders(orders) {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;
  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><p>No orders found.</p></td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td style="color:var(--text-primary);font-weight:600">#${o.Id}</td>
      <td>${escapeHtml(o.Customer_Name)}</td>
      <td>${escapeHtml(o.Supplier_Name)}</td>
      <td>${escapeHtml(o.Employee_Name)}</td>
      <td style="color:var(--accent-secondary);font-weight:600">${formatCurrency(o.Total_Price)}</td>
      <td>${formatDate(o.Order_Date)}</td>
      <td><span class="badge badge-info">${escapeHtml(o.Status_Name) || '—'}</span></td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-secondary btn-sm" onclick="editOrder(${o.Id})" title="Edit Order"><span class="material-icons-round">edit</span></button>
          <button class="btn btn-danger btn-sm" onclick="deleteOrder(${o.Id})" title="Delete Order"><span class="material-icons-round">delete</span></button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function handleOrderSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-order-btn');
  btn.disabled = true;
  const isEditing = !!editingOrderId;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;margin:0;border-width:2px;"></div> ' + (isEditing ? 'Updating...' : 'Creating...');

  // Gather product IDs with qty > 0
  const product_ids = [];
  document.querySelectorAll('.product-qty').forEach(input => {
    const qty = parseInt(input.value) || 0;
    if (qty > 0) product_ids.push(parseInt(input.dataset.productId));
  });

  const body = {
    customer_id: parseInt(document.getElementById('order-customer').value),
    supplier_id: parseInt(document.getElementById('order-supplier').value),
    emp_id: parseInt(document.getElementById('order-employee').value),
    status_id: parseInt(document.getElementById('order-status').value),
    total_price: parseFloat(document.getElementById('order-total').value),
    order_date: document.getElementById('order-date').value,
    product_ids: product_ids.length > 0 ? product_ids : undefined,
  };

  try {
    const method = isEditing ? 'PUT' : 'POST';
    const path = isEditing ? '/api/orders/' + editingOrderId : '/api/orders';
    await apiFetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    showToast(isEditing ? 'Order updated successfully!' : 'Order created successfully!');
    if (isEditing) {
      cancelEdit();
    } else {
      resetOrderForm();
    }
    await loadOrders();
  } catch (err) { /* toast already shown */ }

  btn.disabled = false;
  if (!editingOrderId) {
    btn.innerHTML = '<span class="material-icons-round" id="submit-btn-icon">add</span> <span id="submit-btn-text">Create Order</span>';
  } else {
    btn.innerHTML = '<span class="material-icons-round" id="submit-btn-icon">check</span> <span id="submit-btn-text">Update Order</span>';
  }
}

async function editOrder(id) {
  try {
    const order = await apiFetch('/api/orders/' + id);
    editingOrderId = id;

    // Update UI text
    document.getElementById('order-form-title').textContent = 'Edit Order #' + id;
    document.getElementById('submit-btn-text').textContent = 'Update Order';
    document.getElementById('submit-btn-icon').className = 'material-icons-round';
    document.getElementById('submit-btn-icon').textContent = 'check';
    document.getElementById('cancel-edit-btn').style.display = 'inline-block';

    // Populate form
    document.getElementById('order-customer').value = order.Customer_Id;
    document.getElementById('order-supplier').value = order.Supplier_Id;
    document.getElementById('order-employee').value = order.Emp_Id;
    document.getElementById('order-status').value = order.Status_Id;

    const d = new Date(order.Order_Date);
    const dateStr = d.toISOString().split('T')[0];
    document.getElementById('order-date').value = dateStr;

    // Reset quantities
    document.querySelectorAll('.product-qty').forEach(i => i.value = 0);

    if (order.product_ids && order.product_ids.length > 0) {
      order.product_ids.forEach(pid => {
        const input = document.querySelector('.product-qty[data-product-id="' + pid + '"]');
        if (input) input.value = 1;
      });
    }

    // Set total price
    document.getElementById('order-total').value = parseFloat(order.Total_Price).toFixed(2);
    document.getElementById('order-total-display').value = formatCurrency(order.Total_Price);

    // Scroll to form
    document.getElementById('order-form-card').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showToast('Failed to load order details', 'error');
  }
}

function cancelEdit() {
  editingOrderId = null;
  document.getElementById('order-form-title').textContent = 'New Order';
  document.getElementById('submit-btn-text').textContent = 'Create Order';
  document.getElementById('submit-btn-icon').className = 'material-icons-round';
  document.getElementById('submit-btn-icon').textContent = 'add';
  document.getElementById('cancel-edit-btn').style.display = 'none';
  resetOrderForm();
}

function resetOrderForm() {
  document.getElementById('order-form').reset();
  document.getElementById('order-date').value = new Date().toISOString().split('T')[0];
  document.querySelectorAll('.product-qty').forEach(i => i.value = 0);
  document.getElementById('order-total').value = '0';
  document.getElementById('order-total-display').value = '$0.00';
}

async function deleteOrder(id) {
  if (!confirm(`Delete order #${id}?`)) return;
  try {
    await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
    showToast('Order deleted.');
    await loadOrders();
  } catch (err) {}
}

// Add Customer
async function handleAddCustomer(e) {
  e.preventDefault();
  const body = {
    first_name: document.getElementById('cust-fname').value,
    last_name: document.getElementById('cust-lname').value,
    date_of_birth: document.getElementById('cust-dob').value || null,
    phone: document.getElementById('cust-phone').value || null,
    address: document.getElementById('cust-address').value || null,
  };
  try {
    const result = await apiFetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    showToast('Customer added!');
    closeModal('customer-modal');
    document.getElementById('customer-form').reset();
    // Refresh dropdown
    const customers = await apiFetch('/api/customers');
    populateSelect('order-customer', customers, c => `${c.First_Name} ${c.Last_Name}`);
    // Auto-select the new one
    document.getElementById('order-customer').value = result.id;
  } catch (err) { /* toast already shown */ }
}

// Add Supplier (from modal) 
async function handleAddSupplier(e) {
  e.preventDefault();
  const body = {
    first_name: document.getElementById('sup-fname').value,
    last_name: document.getElementById('sup-lname').value,
    date_of_birth: document.getElementById('sup-dob').value || null,
    email: document.getElementById('sup-email').value || null,
    phone: document.getElementById('sup-phone').value || null,
    address: document.getElementById('sup-address').value || null,
  };
  try {
    const result = await apiFetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    showToast('Supplier added!');
    closeModal('supplier-modal');
    document.getElementById('supplier-form').reset();
    const suppliers = await apiFetch('/api/suppliers');
    populateSelect('order-supplier', suppliers, s => `${s.First_Name} ${s.Last_Name}`);
    document.getElementById('order-supplier').value = result.id;
  } catch (err) { /* toast already shown */ }
}

// Products
async function initProducts() {
  try {
    const products = await apiFetch('/api/products');
    renderProducts(products);
    setupSearch('products-search', 'products-table-body', products, renderProducts);
  } catch (err) {
    document.getElementById('products-table-body').innerHTML =
      '<tr><td colspan="7" class="empty-state"><p>Failed to load products.</p></td></tr>';
  }
}

function renderProducts(products) {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;
  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No products found.</p></td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => {
    const qtyClass = p.Quantity <= 0 ? 'badge-danger' : p.Quantity < 10 ? 'badge-warning' : 'badge-success';
    return `
      <tr>
        <td style="color:var(--text-primary);font-weight:600">#${p.Id}</td>
        <td style="color:var(--text-primary)">${escapeHtml(p.Name)}</td>
        <td><span class="badge badge-purple">${escapeHtml(p.Category) || '—'}</span></td>
        <td style="color:var(--accent-secondary);font-weight:600">${formatCurrency(p.Price)}</td>
        <td><span class="badge ${qtyClass}">${p.Quantity}</span></td>
        <td>${formatDate(p.Date_of_Manufacture)}</td>
        <td>${formatDate(p.Date_of_Expiration)}</td>
      </tr>`;
  }).join('');
}

// Warehouse
async function initWarehouse() {
  const grid = document.getElementById('warehouse-grid');
  try {
    const warehouses = await apiFetch('/api/warehouse');
    if (warehouses.length === 0) {
      grid.innerHTML = '<div class="empty-state"><span class="material-icons-round">warehouse</span><p>No warehouses found.</p></div>';
      return;
    }
    grid.innerHTML = warehouses.map(w => `
      <div class="warehouse-card">
        <h4><span class="material-icons-round" style="font-size:16px;margin-right:8px;color:var(--accent);">warehouse</span>${escapeHtml(w.Name)}</h4>
        <div class="wh-location"><span class="material-icons-round" style="font-size:13px;margin-right:4px;">location_on</span>${escapeHtml(w.Location) || 'No location'}</div>
        ${w.Products.length > 0
        ? w.Products.map(p => `
              <div class="wh-product">
                <span>${escapeHtml(p.Name)}</span>
                <span class="badge ${p.Quantity <= 0 ? 'badge-danger' : p.Quantity < 10 ? 'badge-warning' : 'badge-success'}">${p.Quantity}</span>
              </div>`).join('')
        : '<div class="wh-product" style="color:var(--text-muted);justify-content:center;">No products assigned</div>'
      }
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = '<div class="empty-state"><p>Failed to load warehouses.</p></div>';
  }
}

// Customers
async function initCustomers() {
  try {
    const customers = await apiFetch('/api/customers');
    renderCustomers(customers);
    setupSearch('customers-search', 'customers-table-body', customers, renderCustomers);
  } catch (err) {
    document.getElementById('customers-table-body').innerHTML =
      '<tr><td colspan="5" class="empty-state"><p>Failed to load customers.</p></td></tr>';
  }
}

function renderCustomers(customers) {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;
  if (customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No customers found.</p></td></tr>';
    return;
  }
  tbody.innerHTML = customers.map(c => `
    <tr>
      <td style="color:var(--text-primary);font-weight:600">#${c.Id}</td>
      <td style="color:var(--text-primary)">${escapeHtml(c.First_Name)} ${escapeHtml(c.Last_Name)}</td>
      <td>${formatDate(c.Date_of_Birth)}</td>
      <td>${c.Phones && c.Phones.length > 0 ? c.Phones.map(p => escapeHtml(String(p))).join(', ') : '—'}</td>
      <td>${c.Addresses && c.Addresses.length > 0 ? c.Addresses.map(a => escapeHtml(a)).join(', ') : '—'}</td>
    </tr>
  `).join('');
}

// Suppliers
async function initSuppliers() {
  try {
    const suppliers = await apiFetch('/api/suppliers');
    renderSuppliers(suppliers);
    setupSearch('suppliers-search', 'suppliers-table-body', suppliers, renderSuppliers);
  } catch (err) {
    document.getElementById('suppliers-table-body').innerHTML =
      '<tr><td colspan="6" class="empty-state"><p>Failed to load suppliers.</p></td></tr>';
  }
}

function renderSuppliers(suppliers) {
  const tbody = document.getElementById('suppliers-table-body');
  if (!tbody) return;
  if (suppliers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No suppliers found.</p></td></tr>';
    return;
  }
  tbody.innerHTML = suppliers.map(s => `
    <tr>
      <td style="color:var(--text-primary);font-weight:600">#${s.Id}</td>
      <td style="color:var(--text-primary)">${escapeHtml(s.First_Name)} ${escapeHtml(s.Last_Name)}</td>
      <td>${formatDate(s.Date_of_Birth)}</td>
      <td>${escapeHtml(s.Email) || '—'}</td>
      <td>${s.Phones && s.Phones.length > 0 ? s.Phones.map(p => escapeHtml(String(p))).join(', ') : '—'}</td>
      <td>${s.Addresses && s.Addresses.length > 0 ? s.Addresses.map(a => escapeHtml(a)).join(', ') : '—'}</td>
    </tr>
  `).join('');
}

// Employees
let allEmployees = [];
let editingEmpId = null;

async function initEmployees() {
  try {
    const [employees, warehouses] = await Promise.all([
      apiFetch('/api/employees'),
      apiFetch('/api/warehouse')
    ]);
    allEmployees = employees;

    populateSelect('emp-warehouse', warehouses, w => w.Name, 'Id');

    renderEmployees(allEmployees);
    setupSearch('employees-search', 'employees-table-body', allEmployees, renderEmployees);

    const form = document.getElementById('employee-form');
    if (form) form.addEventListener('submit', handleEmployeeSubmit);
  } catch (err) {
    const tbody = document.getElementById('employees-table-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>Failed to load employees.</p></td></tr>';
  }
}

function renderEmployees(emps) {
  const tbody = document.getElementById('employees-table-body');
  if (!tbody) return;
  if (emps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No employees found.</p></td></tr>';
    return;
  }
  tbody.innerHTML = emps.map(e => `
    <tr>
      <td style="color:var(--text-primary);font-weight:600">#${e.Id}</td>
      <td style="color:var(--text-primary)">${escapeHtml(e.First_Name)} ${escapeHtml(e.Last_Name)}</td>
      <td><span class="badge badge-purple">${escapeHtml(e.Warehouse_Name) || 'None'}</span></td>
      <td>${escapeHtml(e.Email) || '—'}</td>
      <td>${e.Phones && e.Phones.length > 0 ? e.Phones.map(p => escapeHtml(String(p))).join(', ') : '—'}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-secondary btn-sm" onclick="editEmployee(${e.Id})" title="Edit Employee"><span class="material-icons-round">edit</span></button>
          <button class="btn btn-danger btn-sm" onclick="deleteEmployee(${e.Id})" title="Delete Employee"><span class="material-icons-round">delete</span></button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function handleEmployeeSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-emp-btn');
  btn.disabled = true;
  const isEditing = !!editingEmpId;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;margin:0;border-width:2px;"></div> ' + (isEditing ? 'Updating...' : 'Adding...');

  const body = {
    first_name: document.getElementById('emp-fname').value,
    last_name: document.getElementById('emp-lname').value,
    date_of_birth: document.getElementById('emp-dob').value || null,
    email: document.getElementById('emp-email').value || null,
    phone: document.getElementById('emp-phone').value || null,
    address: document.getElementById('emp-address').value || null,
    warehouse_id: document.getElementById('emp-warehouse').value ? parseInt(document.getElementById('emp-warehouse').value) : null,
  };

  try {
    const method = isEditing ? 'PUT' : 'POST';
    const path = isEditing ? '/api/employees/' + editingEmpId : '/api/employees';
    await apiFetch(path, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    showToast(isEditing ? 'Employee updated successfully!' : 'Employee added successfully!');
    if (isEditing) {
      cancelEmployeeEdit();
    } else {
      document.getElementById('employee-form').reset();
    }
    // Refresh list
    allEmployees = await apiFetch('/api/employees');
    renderEmployees(allEmployees);
  } catch (err) { /* toast already shown */ }

  btn.disabled = false;
  if (!editingEmpId) {
    btn.innerHTML = '<span class="material-icons-round" id="submit-emp-icon">add</span> <span id="submit-emp-text">Add Employee</span>';
  } else {
    btn.innerHTML = '<span class="material-icons-round" id="submit-emp-icon">check</span> <span id="submit-emp-text">Update Employee</span>';
  }
}

async function editEmployee(id) {
  try {
    const emp = await apiFetch('/api/employees/' + id);
    editingEmpId = id;

    document.getElementById('employee-form-title').textContent = 'Edit Employee #' + id;
    document.getElementById('submit-emp-text').textContent = 'Update Employee';
    document.getElementById('submit-emp-icon').className = 'material-icons-round';
    document.getElementById('submit-emp-icon').textContent = 'check';
    document.getElementById('cancel-emp-edit-btn').style.display = 'inline-block';

    document.getElementById('emp-fname').value = emp.First_Name || '';
    document.getElementById('emp-lname').value = emp.Last_Name || '';
    if (emp.Date_of_Birth) {
      document.getElementById('emp-dob').value = new Date(emp.Date_of_Birth).toISOString().split('T')[0];
    } else {
      document.getElementById('emp-dob').value = '';
    }
    document.getElementById('emp-email').value = emp.Email || '';
    document.getElementById('emp-phone').value = (emp.Phones && emp.Phones.length > 0) ? emp.Phones[0] : '';
    document.getElementById('emp-address').value = emp.Address || '';
    document.getElementById('emp-warehouse').value = emp.Warehouse_Id || '';

    document.getElementById('employee-form-card').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showToast('Failed to load employee details', 'error');
  }
}

function cancelEmployeeEdit() {
  editingEmpId = null;
  document.getElementById('employee-form-title').textContent = 'Add New Employee';
  document.getElementById('submit-emp-text').textContent = 'Add Employee';
  document.getElementById('submit-emp-icon').className = 'material-icons-round';
  document.getElementById('submit-emp-icon').textContent = 'add';
  document.getElementById('cancel-emp-edit-btn').style.display = 'none';
  document.getElementById('employee-form').reset();
}

async function deleteEmployee(id) {
  if (!confirm('Delete employee #' + id + '?')) return;
  try {
    await apiFetch('/api/employees/' + id, { method: 'DELETE' });
    showToast('Employee deleted.');
    allEmployees = await apiFetch('/api/employees');
    renderEmployees(allEmployees);
  } catch (err) { /* toast already shown */ }
}
