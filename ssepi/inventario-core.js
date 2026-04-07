// inventario-core.js - Núcleo de Inventario Maestro
const InventarioManager = (function() {
    // ============================================================
    // 1. ESTADO PRIVADO
    // ============================================================
    let productos = [];
    let categoriaActual = 'refaccion';
    let busqueda = '';
    let vistaActual = 'grid';
    
    let chartInstance = null;
    let unsubscribe = null;

    // ============================================================
    // 2. VALIDACIÓN
    // ============================================================
    function __x() {
        return !!(window.auth && window.auth.currentUser && window.auth.currentUser.email === 'norbertomoro4@gmail.com');
    }

    // ============================================================
    // 3. INICIALIZACIÓN
    // ============================================================
    function init() {
        if (!__x()) {
            window.location.href = 'ssepi_website.html';
            return;
        }

        _initUI();
        _initEventListeners();
        _startFirebaseListeners();
        _startClock();
    }

    function _initUI() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
            document.getElementById('themeBtn').innerHTML = '<i class="fas fa-sun"></i>';
        }

        document.getElementById('loadingState').style.display = 'flex';
    }

    function _startClock() {
        setInterval(() => {
            const clock = document.getElementById('clock');
            if (clock) clock.innerText = new Date().toLocaleTimeString();
        }, 1000);
    }

    function _initEventListeners() {
        // Toggle menú
        document.getElementById('toggleMenu').addEventListener('click', _toggleMenu);
        document.getElementById('themeBtn').addEventListener('click', _toggleTheme);

        // Categorías
        document.querySelectorAll('.cat-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                categoriaActual = this.dataset.cat;
                _filtrarYRenderizar();
                _actualizarCategoriaImport();
            });
        });

        // Búsqueda
        document.getElementById('searchInput').addEventListener('input', function(e) {
            busqueda = e.target.value.toLowerCase();
            _filtrarYRenderizar();
        });

        // Vistas
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                vistaActual = this.dataset.view;
                _cambiarVista(vistaActual);
            });
        });

        // Botones principales
        document.getElementById('newProductBtn').addEventListener('click', _abrirModalNuevo);
        document.getElementById('importExcelBtn').addEventListener('click', _abrirModalImportacion);
        document.getElementById('initDataBtn').addEventListener('click', _cargarDatosIniciales);

        // Modal de producto
        document.getElementById('modalClose').addEventListener('click', _cerrarModal);
        document.getElementById('cancelBtn').addEventListener('click', _cerrarModal);
        document.getElementById('saveProductBtn').addEventListener('click', _guardarProducto);
        document.getElementById('deleteProductBtn').addEventListener('click', _eliminarProducto);
        
        // Controles de stock
        document.getElementById('increaseStock').addEventListener('click', () => _ajustarStock(1));
        document.getElementById('decreaseStock').addEventListener('click', () => _ajustarStock(-1));
        document.getElementById('stockInput').addEventListener('input', _actualizarStockDisplay);

        // Modal de importación
        document.getElementById('importModalClose').addEventListener('click', _cerrarModalImportacion);
        document.getElementById('cancelImportBtn').addEventListener('click', _cerrarModalImportacion);
        document.getElementById('selectFileBtn').addEventListener('click', () => document.getElementById('excelFile').click());
        document.getElementById('excelFile').addEventListener('change', _manejarArchivoExcel);
        document.getElementById('processImportBtn').addEventListener('click', _procesarImportacion);

        // Input oculto para importación directa
        document.getElementById('fileInput').addEventListener('change', _manejarArchivoDirecto);

        // Cerrar modal al hacer clic fuera
        document.getElementById('productModal').addEventListener('click', function(e) {
            if (e.target === this) _cerrarModal();
        });
        document.getElementById('importModal').addEventListener('click', function(e) {
            if (e.target === this) _cerrarModalImportacion();
        });
    }

    function _toggleMenu() {
        document.body.classList.toggle('sidebar-closed');
    }

    function _toggleTheme() {
        const body = document.body;
        const btn = document.getElementById('themeBtn');
        if (body.classList.contains('dark-theme')) {
            body.classList.remove('dark-theme');
            localStorage.setItem('theme', 'light');
            btn.innerHTML = '<i class="fas fa-moon"></i>';
        } else {
            body.classList.add('dark-theme');
            localStorage.setItem('theme', 'dark');
            btn.innerHTML = '<i class="fas fa-sun"></i>';
        }
        if (chartInstance) _renderChart();
    }

    // ============================================================
    // 4. FIREBASE
    // ============================================================
    function _startFirebaseListeners() {
        if (!window.db) {
            console.error('Firestore no disponible');
            document.getElementById('firebaseStatus').innerHTML = '⚠️ Desconectado';
            return;
        }

        unsubscribe = window.db.collection('inventario')
            .orderBy('sku', 'asc')
            .onSnapshot(snapshot => {
                productos = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                document.getElementById('loadingState').style.display = 'none';
                _filtrarYRenderizar();
                _actualizarKPIs();
                _actualizarFirebaseStatus();
            }, error => {
                console.error('Error en snapshot:', error);
                document.getElementById('firebaseStatus').innerHTML = '⚠️ Error de conexión';
            });
    }

    function _actualizarFirebaseStatus() {
        const el = document.getElementById('firebaseStatus');
        if (el) {
            el.innerHTML = `<span class="status-indicator" style="background:#4caf50;"></span> Conectado • ${productos.length} productos`;
        }
    }

    // ============================================================
    // 5. FILTRADO Y RENDERIZADO
    // ============================================================
    function _filtrarYRenderizar() {
        let filtrados = productos.filter(p => p.categoria === categoriaActual);

        if (busqueda) {
            filtrados = filtrados.filter(p => 
                (p.sku && p.sku.toLowerCase().includes(busqueda)) ||
                (p.nombre && p.nombre.toLowerCase().includes(busqueda)) ||
                (p.ubicacion && p.ubicacion.toLowerCase().includes(busqueda))
            );
        }

        document.getElementById('totalCount').textContent = productos.length;
        document.getElementById('filteredCount').textContent = filtrados.length;

        if (filtrados.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
            document.getElementById('productsGrid').innerHTML = '';
        } else {
            document.getElementById('emptyState').style.display = 'none';
            _renderizarGrid(filtrados);
            _renderizarTabla(filtrados);
        }

        document.getElementById('initDataBtn').style.display = productos.length === 0 ? 'flex' : 'none';
    }

    function _renderizarGrid(productos) {
        const container = document.getElementById('productsGrid');
        container.innerHTML = productos.map(p => _crearCard(p)).join('');
        
        container.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', () => _abrirModalEdicion(card.dataset.id));
        });
    }

    function _crearCard(p) {
        let stockClass = 'stock-empty';
        if (p.stock > (p.minimo || 0)) stockClass = 'stock-high';
        else if (p.stock > 0) stockClass = 'stock-medium';
        else if (p.stock === 0) stockClass = 'stock-low';

        let badgeClass = '';
        let badgeText = '';
        switch(p.categoria) {
            case 'refaccion':
                badgeClass = 'badge-refaccion';
                badgeText = 'Refacción';
                break;
            case 'almacenable':
                badgeClass = 'badge-almacenable';
                badgeText = 'Almacenable';
                break;
            case 'consumible':
                badgeClass = 'badge-consumible';
                badgeText = 'Consumible';
                break;
            case 'servicio':
                badgeClass = 'badge-servicio';
                badgeText = 'Servicio';
                break;
        }

        return `
            <div class="product-card" data-id="${p.id}">
                <div class="card-header">
                    <span class="card-sku">${p.sku || 'S/N'}</span>
                    <span class="stock-indicator ${stockClass}"></span>
                </div>
                <div class="card-name">${p.nombre || 'Sin nombre'}</div>
                <div class="card-info">
                    <div class="info-row">
                        <span class="info-label">Ubicación:</span>
                        <span class="info-value">${p.ubicacion || '—'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Categoría:</span>
                        <span class="info-value"><span class="category-badge ${badgeClass}">${badgeText}</span></span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Stock mínimo:</span>
                        <span class="info-value">${p.minimo || 0}</span>
                    </div>
                </div>
                <div class="card-footer">
                    <div class="stock-display">${p.stock || 0} <span>unidades</span></div>
                    <div class="card-cost">$${(p.costo || 0).toFixed(2)}</div>
                </div>
            </div>
        `;
    }

    function _renderizarTabla(productos) {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = productos.map(p => `
            <tr onclick="InventarioManager._abrirModalEdicion('${p.id}')">
                <td><strong>${p.sku || '—'}</strong></td>
                <td>${p.nombre || '—'}</td>
                <td>${p.categoria || '—'}</td>
                <td>${p.ubicacion || '—'}</td>
                <td>${p.stock || 0}</td>
                <td>${p.minimo || 0}</td>
                <td>$${(p.costo || 0).toFixed(2)}</td>
                <td>$${(p.precio_venta || 0).toFixed(2)}</td>
            </tr>
        `).join('');
    }

    function _cambiarVista(vista) {
        document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
        document.getElementById(vista + 'View').classList.add('active');
        
        if (vista === 'chart') _renderChart();
    }

    function _renderChart() {
        const ctx = document.getElementById('inventoryChart').getContext('2d');
        if (chartInstance) chartInstance.destroy();

        // Agrupar por categoría
        const categorias = ['refaccion', 'almacenable', 'consumible', 'servicio'];
        const nombres = ['Refacciones', 'Almacenables', 'Consumibles', 'Servicios'];
        const valores = categorias.map(cat => 
            productos.filter(p => p.categoria === cat).reduce((sum, p) => sum + ((p.costo || 0) * (p.stock || 0)), 0)
        );

        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: nombres,
                datasets: [{
                    data: valores,
                    backgroundColor: ['#0277bd', '#2e7d32', '#ef6c00', '#7b1fa2'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // ============================================================
    // 6. KPIs
    // ============================================================
    async function _actualizarKPIs() {
        // Valor total
        const valorTotal = productos.reduce((sum, p) => sum + ((p.costo || 0) * (p.stock || 0)), 0);
        document.getElementById('kpiValorTotal').innerHTML = '$' + valorTotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        // Total productos
        document.getElementById('kpiProductos').innerText = productos.length;

        // Bajo stock
        const bajoStock = productos.filter(p => p.stock > 0 && p.stock <= (p.minimo || 0)).length;
        document.getElementById('kpiBajoStock').innerText = bajoStock;

        // Movimientos del mes
        await _cargarMovimientosMes();
    }

    async function _cargarMovimientosMes() {
        if (!window.db) return;

        const now = new Date();
        const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
        const finMes = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        try {
            const snap = await window.db.collection('movimientos_inventario')
                .where('fecha', '>=', inicioMes.toISOString().split('T')[0])
                .where('fecha', '<=', finMes.toISOString().split('T')[0])
                .count()
                .get();
            
            document.getElementById('kpiMovimientos').innerText = snap.data().count || 0;
        } catch (e) {
            console.error(e);
            document.getElementById('kpiMovimientos').innerText = '0';
        }
    }

    // ============================================================
    // 7. CRUD DE PRODUCTOS
    // ============================================================
    function _abrirModalNuevo() {
        document.getElementById('modalTitle').innerText = 'Nuevo Producto';
        document.getElementById('productId').value = '';
        document.getElementById('productForm').reset();
        document.getElementById('productCategory').value = categoriaActual;
        document.getElementById('stockInput').value = 0;
        document.getElementById('deleteProductBtn').style.display = 'none';
        document.getElementById('skuError').style.display = 'none';
        _actualizarStockDisplay();
        document.getElementById('productModal').classList.add('active');
        document.getElementById('productSku').focus();
    }

    function _abrirModalEdicion(id) {
        const producto = productos.find(p => p.id === id);
        if (!producto) return;

        document.getElementById('modalTitle').innerText = 'Editar Producto';
        document.getElementById('productId').value = producto.id;
        document.getElementById('productSku').value = producto.sku || '';
        document.getElementById('productName').value = producto.nombre || '';
        document.getElementById('productCategory').value = producto.categoria || 'refaccion';
        document.getElementById('productLocation').value = producto.ubicacion || '';
        document.getElementById('productMinStock').value = producto.minimo || 0;
        document.getElementById('productCost').value = producto.costo || 0;
        document.getElementById('productPrice').value = producto.precio_venta || 0;
        document.getElementById('stockInput').value = producto.stock || 0;
        document.getElementById('deleteProductBtn').style.display = 'flex';
        document.getElementById('skuError').style.display = 'none';
        _actualizarStockDisplay();
        document.getElementById('productModal').classList.add('active');
    }

    function _cerrarModal() {
        document.getElementById('productModal').classList.remove('active');
    }

    function _ajustarStock(cambio) {
        const input = document.getElementById('stockInput');
        const valor = parseInt(input.value) || 0;
        input.value = Math.max(0, valor + cambio);
        _actualizarStockDisplay();
    }

    function _actualizarStockDisplay() {
        const stock = parseInt(document.getElementById('stockInput').value) || 0;
        document.getElementById('minStockInfo').innerHTML = `Stock mínimo: <span>${document.getElementById('productMinStock').value || 0}</span>`;
    }

    async function _guardarProducto() {
        if (!__x() || !window.db) {
            alert('No autorizado o sin conexión');
            return;
        }

        const sku = document.getElementById('productSku').value.trim();
        const nombre = document.getElementById('productName').value.trim();
        const categoria = document.getElementById('productCategory').value;
        const ubicacion = document.getElementById('productLocation').value.trim();
        const minimo = parseInt(document.getElementById('productMinStock').value) || 0;
        const costo = parseFloat(document.getElementById('productCost').value) || 0;
        const precioVenta = parseFloat(document.getElementById('productPrice').value) || 0;
        const nuevoStock = parseInt(document.getElementById('stockInput').value) || 0;

        if (!sku || !nombre) {
            _mostrarError('SKU y nombre son obligatorios');
            return;
        }

        // Validar SKU único
        const existe = productos.find(p => 
            p.sku.toLowerCase() === sku.toLowerCase() && 
            p.categoria === categoria && 
            p.id !== document.getElementById('productId').value
        );

        if (existe) {
            _mostrarError(`El SKU "${sku}" ya existe en esta categoría`);
            return;
        }

        const producto = {
            sku,
            nombre,
            categoria,
            ubicacion,
            minimo,
            costo,
            precio_venta: precioVenta,
            stock: nuevoStock,
            actualizado: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const id = document.getElementById('productId').value;
            let oldStock = 0;

            if (id) {
                const old = productos.find(p => p.id === id);
                oldStock = old ? old.stock : 0;
                await window.db.collection('inventario').doc(id).update(producto);
            } else {
                producto.creado = window.firebase.firestore.FieldValue.serverTimestamp();
                const ref = await window.db.collection('inventario').add(producto);
                document.getElementById('productId').value = ref.id;
            }

            // Registrar movimiento si cambió el stock
            if (id && nuevoStock !== oldStock) {
                await _registrarMovimiento(id, sku, oldStock, nuevoStock, 'ajuste', 'Edición manual');
            }

            _cerrarModal();
        } catch (error) {
            console.error(error);
            alert('Error al guardar: ' + error.message);
        }
    }

    function _mostrarError(msg) {
        const err = document.getElementById('skuError');
        err.textContent = msg;
        err.style.display = 'block';
        setTimeout(() => err.style.display = 'none', 3000);
    }

    async function _eliminarProducto() {
        const id = document.getElementById('productId').value;
        if (!id || !confirm('¿Eliminar permanentemente este producto?')) return;

        try {
            await window.db.collection('inventario').doc(id).delete();
            _cerrarModal();
        } catch (error) {
            console.error(error);
            alert('Error al eliminar: ' + error.message);
        }
    }

    // ============================================================
    // 8. MOVIMIENTOS
    // ============================================================
    async function _registrarMovimiento(productoId, sku, stockAnterior, stockNuevo, tipo, notas) {
        if (!window.db) return;

        const cantidad = Math.abs(stockNuevo - stockAnterior);
        const direccion = stockNuevo > stockAnterior ? 'entrada' : 'salida';

        const movimiento = {
            producto_id: productoId,
            sku,
            fecha: new Date().toISOString().split('T')[0],
            timestamp: window.firebase.firestore.FieldValue.serverTimestamp(),
            tipo,
            cantidad,
            direccion,
            stock_anterior: stockAnterior,
            stock_nuevo: stockNuevo,
            notas: notas || '',
            usuario: window.auth.currentUser?.email || 'sistema'
        };

        try {
            await window.db.collection('movimientos_inventario').add(movimiento);
        } catch (e) {
            console.error('Error registrando movimiento:', e);
        }
    }

    // ============================================================
    // 9. IMPORTACIÓN EXCEL
    // ============================================================
    let excelData = null;

    function _abrirModalImportacion() {
        document.getElementById('importModal').classList.add('active');
        document.querySelector('.import-progress').style.display = 'none';
        document.getElementById('processImportBtn').style.display = 'none';
        document.getElementById('excelFile').value = '';
        excelData = null;
    }

    function _cerrarModalImportacion() {
        document.getElementById('importModal').classList.remove('active');
    }

    function _manejarArchivoExcel(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const data = new Uint8Array(ev.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                // Filtrar filas vacías
                excelData = json.filter(fila => fila.some(celda => celda != null && celda !== ''));
                
                if (excelData.length > 1) {
                    // Posible encabezado
                    if (typeof excelData[0][0] === 'string' && 
                        excelData[0][0].toLowerCase().includes('sku')) {
                        excelData.shift();
                    }
                    
                    document.getElementById('processImportBtn').style.display = 'flex';
                    document.getElementById('processImportBtn').innerHTML = `📥 Procesar ${excelData.length} productos`;
                } else {
                    alert('El archivo no contiene datos válidos');
                }
            } catch (ex) {
                console.error(ex);
                alert('Error al leer el archivo');
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function _manejarArchivoDirecto(e) {
        // Para importación rápida desde el botón principal
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function(ev) {
            try {
                const data = new Uint8Array(ev.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                const filas = json.filter(f => f.some(c => c != null && c !== ''));
                if (filas.length > 1) {
                    if (typeof filas[0][0] === 'string' && 
                        filas[0][0].toLowerCase().includes('sku')) {
                        filas.shift();
                    }
                    
                    await _procesarFilas(filas, categoriaActual);
                }
            } catch (ex) {
                console.error(ex);
                alert('Error al leer el archivo');
            }
            document.getElementById('fileInput').value = '';
        };
        reader.readAsArrayBuffer(file);
    }

    async function _procesarImportacion() {
        if (!excelData || excelData.length === 0) return;

        const categoria = document.getElementById('importCategory').value;
        await _procesarFilas(excelData, categoria);
        _cerrarModalImportacion();
    }

    async function _procesarFilas(filas, categoria) {
        if (!__x() || !window.db) return;

        const progress = document.querySelector('.import-progress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        progress.style.display = 'block';
        document.getElementById('processImportBtn').style.display = 'none';

        let importados = 0;
        let omitidos = 0;
        let errores = [];

        for (let i = 0; i < filas.length; i++) {
            const fila = filas[i];
            const sku = fila[0] ? String(fila[0]).trim() : '';
            const nombre = fila[1] ? String(fila[1]).trim() : '';
            const stock = !isNaN(parseFloat(fila[2])) ? parseFloat(fila[2]) : 0;
            const ubicacion = fila[3] ? String(fila[3]).trim() : 'Sin ubicación';
            const costo = !isNaN(parseFloat(fila[4])) ? parseFloat(fila[4]) : 0;
            const precioVenta = !isNaN(parseFloat(fila[5])) ? parseFloat(fila[5]) : 0;

            if (!sku || !nombre) {
                omitidos++;
                continue;
            }

            try {
                const existe = productos.find(p => 
                    p.sku.toLowerCase() === sku.toLowerCase() && 
                    p.categoria === categoria
                );

                const now = window.firebase.firestore.FieldValue.serverTimestamp();

                if (existe) {
                    const oldStock = existe.stock || 0;
                    await window.db.collection('inventario').doc(existe.id).update({
                        stock,
                        ubicacion,
                        costo,
                        precio_venta: precioVenta,
                        actualizado: now
                    });
                    
                    if (stock !== oldStock) {
                        await _registrarMovimiento(existe.id, sku, oldStock, stock, 'importe', 'Actualización por importación');
                    }
                } else {
                    const ref = await window.db.collection('inventario').add({
                        sku,
                        nombre,
                        categoria,
                        ubicacion,
                        minimo: 0,
                        costo,
                        precio_venta: precioVenta,
                        stock,
                        creado: now,
                        actualizado: now
                    });
                    
                    await _registrarMovimiento(ref.id, sku, 0, stock, 'importe', 'Importación inicial');
                }
                
                importados++;
            } catch (err) {
                errores.push(`Fila ${i+1}: ${err.message}`);
            }

            const progreso = Math.round((i + 1) / filas.length * 100);
            progressFill.style.width = `${progreso}%`;
            progressText.textContent = `Procesando ${i+1} de ${filas.length}...`;
            await new Promise(r => setTimeout(r, 10));
        }

        alert(`✅ Importados: ${importados}\n⚠️ Omitidos: ${omitidos}\n❌ Errores: ${errores.length}`);
        progress.style.display = 'none';
    }

    function _actualizarCategoriaImport() {
        // Actualiza el selector de categoría en el modal de importación
        const select = document.getElementById('importCategory');
        if (select) select.value = categoriaActual;
    }

    // ============================================================
    // 10. DATOS INICIALES
    // ============================================================
    async function _cargarDatosIniciales() {
        if (!__x() || !window.db) return;

        const datosDemo = [
            { sku: 'LM339', nombre: 'Amplificador Comparador', categoria: 'refaccion', ubicacion: 'Estante A1', stock: 15, minimo: 5, costo: 45.50, precio_venta: 85.00 },
            { sku: 'SERV-001', nombre: 'Servicio de Reparación', categoria: 'servicio', ubicacion: 'Taller', stock: 999, minimo: 0, costo: 350.00, precio_venta: 650.00 },
            { sku: 'CONS-001', nombre: 'Soldadura 60/40', categoria: 'consumible', ubicacion: 'Cajón Q1', stock: 12, minimo: 3, costo: 85.00, precio_venta: 150.00 },
            { sku: 'ALM-001', nombre: 'Motor Siemens Reparado', categoria: 'almacenable', ubicacion: 'Rack 3', stock: 1, minimo: 0, costo: 12500.00, precio_venta: 18500.00 },
            { sku: 'CD4046BE', nombre: 'Circuito Sincronizador', categoria: 'refaccion', ubicacion: 'Estante A2', stock: 8, minimo: 2, costo: 120.75, precio_venta: 210.00 }
        ];

        try {
            const batch = window.db.batch();
            datosDemo.forEach(p => {
                const ref = window.db.collection('inventario').doc();
                batch.set(ref, {
                    ...p,
                    creado: window.firebase.firestore.FieldValue.serverTimestamp(),
                    actualizado: window.firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
            alert('✅ 5 productos de ejemplo cargados');
        } catch (e) {
            console.error(e);
            alert('Error cargando datos iniciales');
        }
    }

    // ============================================================
    // 11. LIMPIEZA
    // ============================================================
    function _cleanup() {
        if (unsubscribe) unsubscribe();
        if (chartInstance) chartInstance.destroy();
    }
    window.addEventListener('beforeunload', _cleanup);

    // ============================================================
    // 12. API PÚBLICA
    // ============================================================
    return {
        init,
        _abrirModalEdicion
    };
})();

// ============================================================
// INICIALIZACIÓN AUTOMÁTICA
// ============================================================
(function() {
    let checkAuth = setInterval(function() {
        if (window.auth) {
            clearInterval(checkAuth);
            window.auth.onAuthStateChanged(function(user) {
                if (user && user.email === 'norbertomoro4@gmail.com') {
                    window.InventarioManager = InventarioManager;
                    InventarioManager.init();
                } else {
                    window.location.href = 'ssepi_website.html';
                }
            });
        }
    }, 100);
})();